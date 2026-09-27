const {
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  copyFileSync,
} = require("fs");
const { extname, join, resolve, sep, relative: _relative, basename, dirname } = require("path");
const { resolveOutputPath, ensureDirectory } = require("./outputPaths");

/**
 * 返回类型优先从 shared 派生（仅类型层 import，运行期不 require）：
 * 主进程产物与渲染进程消费的是同一份类型，字段漂移会立刻编译失败。
 *
 * @typedef {import("@illusion-realm/shared").GeneratedImageFile} GeneratedImageFile
 * @typedef {import("@illusion-realm/shared").OutputFolderEntry} OutputFolderEntry
 *
 * @typedef {object} CreatedHistoryFolder
 * @property {string} dirPath
 * @property {string} name
 * @property {string | null} parentDirPath
 * @property {number} depth
 *
 * @typedef {object} FolderDeletePreview
 * @property {number} imageCount
 * @property {number} sidecarCount
 * @property {number} subfolderCount
 *
 * @typedef {object} HistoryFolderDeleteResult
 * @property {number} deletedImageCount
 * @property {number} deletedSidecarCount
 * @property {number} deletedSubfolderCount
 *
 * @typedef {object} GeneratedImagesDeleteResult
 * @property {number} deletedImageCount
 * @property {number} deletedSidecarCount
 * @property {number} skippedCount
 */

/** @type {Set<string>} */
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
]);

const MAX_FOLDER_DEPTH = 3;

/**
 * 是否为受支持的图片文件
 * @param {string} fileName
 * @returns {boolean}
 */
function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.has(extname(fileName).toLowerCase());
}

/**
 * 清洗用户输入的文件夹名（去掉路径分隔符与非法字符）
 * @param {string} name
 * @returns {string} 清洗后的名称；可能为空字符串（调用方需判空）
 */
function sanitizeFolderName(name) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/**
 * 旧版本会在图片旁边写一份 `<name>.json` 旁车文件保存生成参数。
 * 现在生成参数只存在于图片自身的 Meta（PNG tEXt 里的 ComfyUI 工作流）里，
 * 这个路径仅用于把历史遗留的旁车文件一起搬走 / 删掉，避免留下孤儿文件。
 *
 * @param {string} imagePath
 * @returns {string}
 */
function legacySidecarPathForImage(imagePath) {
  const ext = extname(imagePath);
  return `${imagePath.slice(0, -ext.length)}.json`;
}

const sidecarPathForImage = legacySidecarPathForImage;

/**
 * 列出目录下的图片文件（按修改时间倒序）
 * @param {string} dirPath
 * @returns {GeneratedImageFile[]}
 */
function listImagesInDirectory(dirPath) {
  if (!dirPath || !existsSync(dirPath)) return [];

  /** @type {import("fs").Dirent[]} */
  let entries = [];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => {
      const filePath = join(dirPath, entry.name);
      let modifiedAt = 0;
      try {
        modifiedAt = statSync(filePath).mtimeMs;
      } catch {
        modifiedAt = 0;
      }
      return {
        filePath,
        fileName: entry.name,
        modifiedAt,
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * targetPath 是否位于 rootPath 之内（含自身）；Windows 下大小写不敏感
 * @param {string} rootPath
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathUnderRoot(rootPath, targetPath) {
  const root = resolve(rootPath);
  const target = resolve(targetPath);
  if (process.platform === "win32") {
    const rootLower = root.toLowerCase();
    const targetLower = target.toLowerCase();
    return (
      targetLower === rootLower ||
      targetLower.startsWith(`${rootLower}${sep}`)
    );
  }
  return target === root || target.startsWith(`${root}${sep}`);
}

/**
 * 目录相对根的嵌套层数（根为 0）；不在根内返回 -1
 * @param {string} rootPath
 * @param {string} dirPath
 * @returns {number}
 */
function getFolderDepth(rootPath, dirPath) {
  const root = resolve(rootPath);
  const target = resolve(dirPath);
  if (!isPathUnderRoot(root, target)) return -1;
  if (target === root) return 0;
  const relative = _relative(root, target);
  return relative.split(sep).filter(Boolean).length;
}

/**
 * 递归收集图片（深度受 maxDepth 限制）
 * @param {string} dirPath
 * @param {number} maxDepth
 * @param {number} [currentDepth]
 * @returns {GeneratedImageFile[]}
 */
function listImagesRecursive(dirPath, maxDepth, currentDepth = 1) {
  const images = listImagesInDirectory(dirPath);
  if (currentDepth >= maxDepth) return images;

  /** @type {GeneratedImageFile[]} */
  let nestedImages = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      nestedImages = nestedImages.concat(
        listImagesRecursive(
          join(dirPath, entry.name),
          maxDepth,
          currentDepth + 1
        )
      );
    }
  } catch {
    // ignore
  }

  return [...images, ...nestedImages];
}

/**
 * 列出生成图：传 folderDirPath 时只列该目录，否则递归整棵输出目录树
 * @param {string | null | undefined} customOutputPath
 * @param {string | null} [folderDirPath]
 * @returns {GeneratedImageFile[]}
 */
function listGeneratedImages(customOutputPath, folderDirPath) {
  const root = ensureDirectory(resolveOutputPath(customOutputPath));

  if (folderDirPath) {
    const normalizedRoot = resolve(root);
    const normalizedTarget = resolve(folderDirPath);
    if (
      normalizedTarget !== normalizedRoot &&
      !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)
    ) {
      return [];
    }
    return listImagesInDirectory(normalizedTarget);
  }

  return listImagesRecursive(root, MAX_FOLDER_DEPTH).sort(
    (a, b) => b.modifiedAt - a.modifiedAt
  );
}

/**
 * 在目标目录内找一个不冲突的文件名：`a.png` → `a (1).png` → `a (2).png` …
 * @param {string} dirPath
 * @param {string} fileName
 * @returns {string} 可安全写入的完整路径
 */
function resolveUniquePath(dirPath, fileName) {
  const ext = extname(fileName);
  const base = basename(fileName, ext);
  let candidate = join(dirPath, fileName);
  let index = 1;

  while (existsSync(candidate)) {
    candidate = join(dirPath, `${base} (${index})${ext}`);
    index += 1;
  }

  return candidate;
}

/**
 * 清洗用户输入的图片名称：只保留文件名主体，去掉路径、非法字符与结尾的点/空格。
 * 扩展名由调用方按原图扩展名固定保留，避免改名把 PNG 变成无后缀文件。
 * @param {unknown} value
 * @returns {string} 可用名称；空串表示无效
 */
function sanitizeImageBaseName(value) {
  if (typeof value !== "string") return "";

  const raw = value.trim();
  if (!raw) return "";

  const withoutExtension = basename(raw, extname(raw));
  const cleaned = withoutExtension
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") return "";
  return cleaned.slice(0, 120);
}

/**
 * 解析并校验一张位于输出目录内的现有图片。
 * @param {string | null | undefined} customOutputPath
 * @param {string} filePath
 * @returns {string} 规范化后的图片路径
 */
function resolveExistingGeneratedImagePath(customOutputPath, filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("无效的图片路径");
  }

  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  const normalizedRoot = resolve(root);
  const normalizedFile = resolve(filePath);

  if (!isPathUnderRoot(normalizedRoot, normalizedFile)) {
    throw new Error("图片不在输出目录内");
  }
  if (
    !existsSync(normalizedFile) ||
    !statSync(normalizedFile).isFile() ||
    !isImageFile(basename(normalizedFile))
  ) {
    throw new Error("图片不存在");
  }

  return normalizedFile;
}

/**
 * 把输出目录内的一张图片复制到用户选定的位置。
 * @param {string | null | undefined} customOutputPath
 * @param {string} filePath
 * @param {string} targetFilePath
 * @returns {string} 实际写入的目标路径
 */
function saveImageToFile(customOutputPath, filePath, targetFilePath) {
  const sourcePath = resolveExistingGeneratedImagePath(
    customOutputPath,
    filePath
  );

  if (typeof targetFilePath !== "string" || !targetFilePath.trim()) {
    throw new Error("无效的保存路径");
  }

  const normalizedTarget = resolve(targetFilePath);
  if (normalizedTarget === sourcePath) {
    return sourcePath;
  }

  mkdirSync(dirname(normalizedTarget), { recursive: true });
  copyFileSync(sourcePath, normalizedTarget);
  return normalizedTarget;
}

/**
 * 在线改名：保留原扩展名与图片内嵌 Meta，只改变文件名主体。
 * @param {string | null | undefined} customOutputPath
 * @param {string} filePath
 * @param {string} newFileName
 * @returns {{ oldPath: string, filePath: string, fileName: string, modifiedAt: number }}
 */
function renameGeneratedImage(customOutputPath, filePath, newFileName) {
  const sourcePath = resolveExistingGeneratedImagePath(
    customOutputPath,
    filePath
  );
  const safeBaseName = sanitizeImageBaseName(newFileName);
  if (!safeBaseName) {
    throw new Error("无效的图片名称");
  }

  const extension = extname(sourcePath);
  const targetPath = join(dirname(sourcePath), `${safeBaseName}${extension}`);

  if (targetPath === sourcePath) {
    return {
      oldPath: sourcePath,
      filePath: sourcePath,
      fileName: basename(sourcePath),
      modifiedAt: statSync(sourcePath).mtimeMs,
    };
  }

  if (existsSync(targetPath)) {
    throw new Error("同名图片已存在");
  }

  renameSync(sourcePath, targetPath);

  const sidecarSource = sidecarPathForImage(sourcePath);
  if (existsSync(sidecarSource)) {
    const sidecarTarget = sidecarPathForImage(targetPath);
    if (sidecarSource !== sidecarTarget) {
      renameSync(sidecarSource, sidecarTarget);
    }
  }

  return {
    oldPath: sourcePath,
    filePath: targetPath,
    fileName: basename(targetPath),
    modifiedAt: statSync(targetPath).mtimeMs,
  };
}

/**
 * 把选中的图片移动到目标文件夹（连同历史遗留的 .json 旁车文件）
 * @param {string | null | undefined} customOutputPath
 * @param {string} targetFolderDirPath
 * @param {string[]} filePaths
 * @returns {string[]} 实际移动后的新路径
 */
function moveImagesToFolder(customOutputPath, targetFolderDirPath, filePaths) {
  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(targetFolderDirPath);

  if (!isPathUnderRoot(normalizedRoot, normalizedTarget)) {
    throw new Error("目标文件夹不在输出目录内");
  }

  if (
    !existsSync(normalizedTarget) ||
    !statSync(normalizedTarget).isDirectory()
  ) {
    throw new Error("目标文件夹不存在");
  }

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return [];
  }

  /** @type {string[]} */
  const movedPaths = [];

  for (const filePath of filePaths) {
    if (!filePath || typeof filePath !== "string") continue;

    const normalizedFile = resolve(filePath);
    if (!isPathUnderRoot(normalizedRoot, normalizedFile)) continue;
    if (!existsSync(normalizedFile) || !statSync(normalizedFile).isFile()) {
      continue;
    }
    if (!isImageFile(basename(normalizedFile))) continue;

    const parentDir = dirname(normalizedFile);
    if (parentDir === normalizedTarget) continue;

    const targetPath = resolveUniquePath(
      normalizedTarget,
      basename(normalizedFile)
    );
    renameSync(normalizedFile, targetPath);
    movedPaths.push(targetPath);

    const sidecarSource = sidecarPathForImage(normalizedFile);
    if (existsSync(sidecarSource)) {
      const sidecarTarget = sidecarPathForImage(targetPath);
      if (sidecarSource !== sidecarTarget) {
        renameSync(sidecarSource, sidecarTarget);
      }
    }
  }

  return movedPaths;
}

/**
 * 目录内**直接**包含的图片数（不递归、只数不 stat）。
 *
 * 口径刻意与 `listImagesInDirectory` 保持一致（同一个 `isImageFile` 判据）：
 * 文件夹行上显示的「N 张」必须等于点开该文件夹后看到的张数，否则这个数字就是在骗人。
 *
 * @param {string} dirPath
 * @returns {number}
 */
function countImagesInDirectory(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && isImageFile(entry.name)
    ).length;
  } catch {
    return 0;
  }
}

/**
 * 递归收集输出目录下的子文件夹（深度受 MAX_FOLDER_DEPTH 限制）
 * @param {string} root 输出根目录（用于判断顶层）
 * @param {string} currentDir
 * @param {number} depth
 * @param {OutputFolderEntry[]} results 累加器
 * @returns {void}
 */
function walkOutputFolders(root, currentDir, depth, results) {
  if (depth > MAX_FOLDER_DEPTH) return;

  /** @type {import("fs").Dirent[]} */
  let entries = [];
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = join(currentDir, entry.name);
    let modifiedAt = 0;
    try {
      modifiedAt = statSync(dirPath).mtimeMs;
    } catch {
      modifiedAt = 0;
    }

    results.push({
      dirPath,
      name: entry.name,
      parentDirPath: currentDir === root ? null : currentDir,
      depth,
      modifiedAt,
      imageCount: countImagesInDirectory(dirPath),
    });

    walkOutputFolders(root, dirPath, depth + 1, results);
  }
}

/**
 * 列出输出目录下的全部子文件夹（按深度、再按名称排序）
 * @param {string | null | undefined} customOutputPath
 * @returns {OutputFolderEntry[]}
 */
function listOutputFolders(customOutputPath) {
  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  /** @type {OutputFolderEntry[]} */
  const results = [];
  walkOutputFolders(root, root, 1, results);
  return results.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

/**
 * 在输出目录下新建历史文件夹
 * @param {string | null | undefined} customOutputPath
 * @param {string} folderName
 * @param {string | null} [parentDirPath]
 * @returns {CreatedHistoryFolder}
 */
function createHistoryFolder(
  customOutputPath,
  folderName,
  parentDirPath = null
) {
  const safeName = sanitizeFolderName(folderName);
  if (!safeName) {
    throw new Error("无效的文件夹名称");
  }

  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  const normalizedRoot = resolve(root);
  const parent = parentDirPath ? resolve(parentDirPath) : normalizedRoot;

  if (!isPathUnderRoot(normalizedRoot, parent)) {
    throw new Error("父文件夹不在输出目录内");
  }

  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new Error("父文件夹不存在");
  }

  const parentDepth = getFolderDepth(normalizedRoot, parent);
  if (parentDepth >= MAX_FOLDER_DEPTH) {
    throw new Error(`文件夹最多嵌套 ${MAX_FOLDER_DEPTH} 层`);
  }

  const dirPath = join(parent, safeName);
  if (existsSync(dirPath)) {
    throw new Error("同名文件夹已存在");
  }

  mkdirSync(dirPath, { recursive: false });
  return {
    dirPath,
    name: safeName,
    parentDirPath: parent === normalizedRoot ? null : parent,
    depth: parentDepth + 1,
  };
}

/**
 * 统计待删除文件夹里的文件数量（供删除前确认弹框使用）
 * @param {string} dirPath
 * @returns {FolderDeletePreview}
 */
function collectFolderDeletePreview(dirPath) {
  let imageCount = 0;
  let sidecarCount = 0;
  let subfolderCount = 0;

  /**
   * @param {string} current
   * @returns {void}
   */
  function walk(current) {
    /** @type {import("fs").Dirent[]} */
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        subfolderCount += 1;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !isImageFile(entry.name)) continue;

      imageCount += 1;
      if (existsSync(sidecarPathForImage(fullPath))) {
        sidecarCount += 1;
      }
    }
  }

  walk(dirPath);
  return { imageCount, sidecarCount, subfolderCount };
}

/**
 * 删除文件夹前的预览：统计将被删除的图片 / 旁车 / 子文件夹数量
 * @param {string | null | undefined} customOutputPath
 * @param {string} folderDirPath
 * @returns {FolderDeletePreview}
 */
function previewDeleteHistoryFolder(customOutputPath, folderDirPath) {
  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(folderDirPath);

  if (normalizedTarget === normalizedRoot) {
    throw new Error("不能删除输出根目录");
  }
  if (!isPathUnderRoot(normalizedRoot, normalizedTarget)) {
    throw new Error("文件夹不在输出目录内");
  }
  if (
    !existsSync(normalizedTarget) ||
    !statSync(normalizedTarget).isDirectory()
  ) {
    throw new Error("文件夹不存在");
  }

  return collectFolderDeletePreview(normalizedTarget);
}

/**
 * 递归删除历史文件夹，返回实际删除的数量
 * @param {string | null | undefined} customOutputPath
 * @param {string} folderDirPath
 * @returns {HistoryFolderDeleteResult}
 */
function deleteHistoryFolder(customOutputPath, folderDirPath) {
  const preview = previewDeleteHistoryFolder(customOutputPath, folderDirPath);
  const normalizedTarget = resolve(folderDirPath);

  try {
    rmSync(normalizedTarget, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "EBUSY" || code === "EPERM") {
      throw new Error("文件夹中的文件正在被占用，请关闭预览后重试");
    }
    const message =
      error instanceof Error ? error.message : "删除文件夹失败";
    throw new Error(message);
  }

  return {
    deletedImageCount: preview.imageCount,
    deletedSidecarCount: preview.sidecarCount,
    deletedSubfolderCount: preview.subfolderCount,
  };
}

/**
 * 删除选中的图片（连同历史遗留的 .json 旁车文件）
 * @param {string | null | undefined} customOutputPath
 * @param {string[]} filePaths
 * @returns {GeneratedImagesDeleteResult}
 */
function deleteGeneratedImages(customOutputPath, filePaths) {
  const root = ensureDirectory(resolveOutputPath(customOutputPath));
  const normalizedRoot = resolve(root);

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return {
      deletedImageCount: 0,
      deletedSidecarCount: 0,
      skippedCount: 0,
    };
  }

  let deletedImageCount = 0;
  let deletedSidecarCount = 0;
  let skippedCount = 0;

  for (const filePath of filePaths) {
    if (!filePath || typeof filePath !== "string") {
      skippedCount += 1;
      continue;
    }

    const normalizedFile = resolve(filePath);
    if (!isPathUnderRoot(normalizedRoot, normalizedFile)) {
      skippedCount += 1;
      continue;
    }
    if (
      !existsSync(normalizedFile) ||
      !statSync(normalizedFile).isFile()
    ) {
      skippedCount += 1;
      continue;
    }
    if (!isImageFile(basename(normalizedFile))) {
      skippedCount += 1;
      continue;
    }

    try {
      unlinkSync(normalizedFile);
      deletedImageCount += 1;

      const sidecar = sidecarPathForImage(normalizedFile);
      if (existsSync(sidecar)) {
        unlinkSync(sidecar);
        deletedSidecarCount += 1;
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code === "EBUSY" || code === "EPERM") {
        throw new Error("图片文件正在被占用，请关闭预览后重试");
      }
      skippedCount += 1;
    }
  }

  if (deletedImageCount === 0 && skippedCount > 0) {
    throw new Error("未能删除所选图片");
  }

  return { deletedImageCount, deletedSidecarCount, skippedCount };
}

module.exports = {
  listGeneratedImages,
  listOutputFolders,
  createHistoryFolder,
  resolveExistingGeneratedImagePath,
  saveImageToFile,
  renameGeneratedImage,
  moveImagesToFolder,
  previewDeleteHistoryFolder,
  deleteHistoryFolder,
  deleteGeneratedImages,
  legacySidecarPathForImage,
  sidecarPathForImage,
  isImageFile,
  MAX_FOLDER_DEPTH,
};
