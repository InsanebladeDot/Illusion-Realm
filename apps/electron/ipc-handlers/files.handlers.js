const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog } = require("electron");

const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { readImageDataUrl } = require("../services/imageData");
const {
  listGeneratedImages,
  listOutputFolders,
  createHistoryFolder,
  moveImagesToFolder,
  previewDeleteHistoryFolder,
  deleteHistoryFolder,
  deleteGeneratedImages,
  resolveExistingGeneratedImagePath,
  saveImageToFile,
  renameGeneratedImage,
} = require("../generatedImages");
const { resolveOutputPath, ensureDirectory } = require("../outputPaths");

/** @type {Set<string>} */
const LISTABLE_IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif",
]);

/**
 * 校验必填字符串
 * @param {unknown} value
 * @param {string} label 用于错误文案的字段名
 * @returns {string | null} 错误文案；null 表示通过
 */
function requireString(value, label) {
  return typeof value === "string" && value.length > 0 ? null : `${label} 必须是非空字符串`;
}

/**
 * 校验**可空**字符串：允许 `undefined` / `null` / 空串 / 纯空白（= 用默认值），
 * 但类型不对（数字 / 对象 / 数组）仍然拒绝。
 *
 * 为什么 `outputPath` 必须用它：`outputPaths.resolveOutputPath()` 的契约就是
 * 「用户未指定时回落到默认路径」，它显式处理空串。此前这里的校验器却要求非空 ——
 * 于是**回落在 IPC 边界成了死代码**，症状有两个且看起来毫不相干：
 *   ① 生成保存失败，报 `customOutputPath 必须是非空字符串`（设置页显示着默认路径，值却是空串）；
 *   ② 创建页永远列不出默认目录（`Illumina Realm Output`）里的图。
 * 修在契约这一处，而不是让每个调用点各自先解析一遍 —— 后者漏一个就再犯一次。
 *
 * @param {unknown} value
 * @param {string} label 用于错误文案的字段名
 * @returns {string | null} 错误文案；null 表示通过
 */
function requireOptionalString(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${label} 必须是字符串`;
  return null;
}

/**
 * 校验非空数组
 * @param {unknown} value
 * @param {string} label 用于错误文案的字段名
 * @returns {string | null} 错误文案；null 表示通过
 */
function requirePathArray(value, label) {
  return Array.isArray(value) && value.length > 0 ? null : `${label} 必须是非空数组`;
}

/**
 * 列出目录下的图片文件（按文件名排序）
 * @param {string} dirPath 目录绝对路径
 * @returns {Array<{ filePath: string, fileName: string }>}
 */
function listImageFilesInDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && LISTABLE_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => ({
      filePath: path.join(dirPath, entry.name),
      fileName: entry.name,
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
}

/**
 * 图片另存为：先校验来源图片确实在输出目录内，再弹出系统保存对话框。
 * 目标路径由用户选择，允许保存到输出目录之外。
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {string | null | undefined} customOutputPath
 * @param {string} filePath
 * @returns {Promise<string | null>}
 */
async function saveGeneratedImageAs(event, customOutputPath, filePath) {
  const sourcePath = resolveExistingGeneratedImagePath(
    customOutputPath,
    filePath
  );
  const extension = path.extname(sourcePath);
  const preferredExtension = extension.replace(/^\./, "") || "png";
  const filters = [
    {
      name: "图片",
      extensions: [
        ...new Set([
          preferredExtension,
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif",
          "bmp",
          "avif",
        ]),
      ],
    },
  ];
  const defaultPath = path.join(
    app.getPath("pictures"),
    path.basename(sourcePath)
  );
  const options = {
    title: "保存图片",
    defaultPath,
    filters,
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) return null;
  return saveImageToFile(customOutputPath, sourcePath, result.filePath);
}

/**
 * 生成图归档：写入、列举、文件夹增删改、移动到文件夹。
 * 生成参数只写在图片自身的 Meta 里（PNG tEXt 里的 ComfyUI 工作流），不再旁挂 .json。
 */
function registerFileHandlers() {
  registerHandle(
    IPC_CHANNELS.FILES_READ_IMAGE_DATA_URL,
    async (_event, filePath) => readImageDataUrl(filePath),
    (args) => requireString(args[0], "filePath")
  );

  registerHandle(
    IPC_CHANNELS.FILES_LIST_IMAGE_FILES,
    async (_event, dirPath) => listImageFilesInDirectory(dirPath),
    (args) => requireString(args[0], "dirPath")
  );

  registerHandle(
    IPC_CHANNELS.FILES_SAVE_GENERATED_IMAGES,
    async (_event, customOutputPath, files) => {
      if (files.length === 0) return [];

      const dirPath = ensureDirectory(resolveOutputPath(customOutputPath));
      const savedPaths = [];

      for (const file of files) {
        if (!file?.filename || !file?.dataBase64) continue;
        const targetPath = path.join(dirPath, path.basename(file.filename));
        fs.writeFileSync(targetPath, Buffer.from(file.dataBase64, "base64"));
        savedPaths.push(targetPath);
      }

      return savedPaths;
    },
    (args) => {
      const invalidPath = requireOptionalString(args[0], "customOutputPath");
      if (invalidPath) return invalidPath;
      if (!Array.isArray(args[1])) return "files 必须是数组";
      return null;
    }
  );

  registerHandle(
    IPC_CHANNELS.FILES_SAVE_IMAGE_AS,
    async (event, customOutputPath, filePath) =>
      saveGeneratedImageAs(event, customOutputPath, filePath),
    (args) => {
      const invalidPath = requireOptionalString(args[0], "customOutputPath");
      if (invalidPath) return invalidPath;
      return requireString(args[1], "filePath");
    }
  );

  registerHandle(
    IPC_CHANNELS.FILES_LIST_GENERATED_IMAGES,
    async (_event, customOutputPath, folderDirPath) =>
      listGeneratedImages(customOutputPath, folderDirPath ?? null),
    (args) => requireOptionalString(args[0], "customOutputPath")
  );

  registerHandle(
    IPC_CHANNELS.FILES_CREATE_HISTORY_FOLDER,
    async (_event, customOutputPath, folderName, parentDirPath) =>
      createHistoryFolder(customOutputPath, folderName, parentDirPath ?? null),
    (args) => {
      const invalidPath = requireOptionalString(args[0], "customOutputPath");
      if (invalidPath) return invalidPath;
      return requireString(args[1], "folderName");
    }
  );

  registerHandle(
    IPC_CHANNELS.FILES_PREVIEW_DELETE_HISTORY_FOLDER,
    async (_event, customOutputPath, folderDirPath) =>
      previewDeleteHistoryFolder(customOutputPath, folderDirPath),
    (args) => requireString(args[1], "folderDirPath")
  );

  registerHandle(
    IPC_CHANNELS.FILES_DELETE_HISTORY_FOLDER,
    async (_event, customOutputPath, folderDirPath) =>
      deleteHistoryFolder(customOutputPath, folderDirPath),
    (args) => requireString(args[1], "folderDirPath")
  );

  registerHandle(
    IPC_CHANNELS.FILES_DELETE_GENERATED_IMAGES,
    async (_event, customOutputPath, filePaths) =>
      deleteGeneratedImages(customOutputPath, filePaths),
    (args) => requirePathArray(args[1], "filePaths")
  );

  registerHandle(
    IPC_CHANNELS.FILES_RENAME_GENERATED_IMAGE,
    async (_event, customOutputPath, filePath, newFileName) =>
      renameGeneratedImage(customOutputPath, filePath, newFileName),
    (args) => {
      const invalidPath = requireOptionalString(args[0], "customOutputPath");
      if (invalidPath) return invalidPath;
      const invalidFile = requireString(args[1], "filePath");
      if (invalidFile) return invalidFile;
      return requireString(args[2], "newFileName");
    }
  );

  registerHandle(
    IPC_CHANNELS.FILES_MOVE_IMAGES_TO_FOLDER,
    async (_event, customOutputPath, targetFolderDirPath, filePaths) =>
      moveImagesToFolder(customOutputPath, targetFolderDirPath, filePaths),
    (args) => {
      const invalidTarget = requireString(args[1], "targetFolderDirPath");
      if (invalidTarget) return invalidTarget;
      return requirePathArray(args[2], "filePaths");
    }
  );

  registerHandle(
    IPC_CHANNELS.FILES_LIST_OUTPUT_FOLDERS,
    async (_event, customOutputPath) => listOutputFolders(customOutputPath),
    (args) => requireOptionalString(args[0], "customOutputPath")
  );
}

module.exports = { registerFileHandlers };
