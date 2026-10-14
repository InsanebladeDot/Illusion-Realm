const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { IPC_CHANNELS } = require("./ipcChannels");
const { parseInitialLocale } = require("./initialLocale");

/**
 * 渲染进程唯一的桥接层。
 * 所有通道名引用 ipcChannels.js 的常量（与 packages/shared/src/ipc-channels.ts 保持一致，
 * 由 scripts/verify-electron-modules.js 断言）。
 *
 * invoke 类方法一律返回 IpcResult（{ success: true, data } / { success: false, error, code? }），
 * 由渲染进程的封装层（apps/next/src/utils/*）决定回退或抛错。
 *
 * @type {import("@illusion-realm/shared").ElectronAPI}
 */
const api = {
  isElectron: true,
  hasCustomTitleBar: process.argv.includes("--illusion-custom-titlebar"),
  onWindowChromeVisibility: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} visible */
    const listener = (_event, visible) => { if (typeof visible === "boolean") callback(visible); };
    ipcRenderer.on(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, listener);
  },
  selectFolder: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER, defaultPath),
  scanModels: (dirPath, type) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODELS_SCAN, dirPath, type),
  modelDownloadTarget: (location) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_TARGET, location),
  startModelDownload: (request) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_START, request),
  cancelModelDownload: (id) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_CANCEL, id),
  retryModelDownload: (id) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_RETRY, id),
  removeModelDownload: (id) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_REMOVE, id),
  listModelDownloads: () => ipcRenderer.invoke(IPC_CHANNELS.MODELS_DOWNLOAD_LIST),
  changeModelLogo: (folderPath) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_CHANGE_LOGO, folderPath),
  localModelCategoryTarget: (folderPath) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_CATEGORY_TARGET, folderPath),
  moveModelCategory: (request) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_MOVE_CATEGORY, request),
  operateLocalModels: (request) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_BATCH, request),
  civitaiKeyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CIVITAI_KEY_STATUS),
  civitaiKeySet: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.CIVITAI_KEY_SET, apiKey),
  civitaiKeyClear: () => ipcRenderer.invoke(IPC_CHANNELS.CIVITAI_KEY_CLEAR),
  onModelDownloadProgress: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {import("@illusion-realm/shared").ModelDownloadTask} task */
    const listener = (_event, task) => callback(task);
    ipcRenderer.on(IPC_CHANNELS.MODELS_DOWNLOAD_PROGRESS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MODELS_DOWNLOAD_PROGRESS, listener);
  },
  readLocalImage: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_READ_IMAGE_DATA_URL, filePath),
  listImageFiles: (dirPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_LIST_IMAGE_FILES, dirPath),
  comfyGenerate: (prompt, serverAddress) =>
    ipcRenderer.invoke(IPC_CHANNELS.COMFY_GENERATE, prompt, serverAddress),
  comfyUploadImage: (serverAddress, payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.COMFY_UPLOAD_IMAGE, serverAddress, payload),
  comfyListModels: (serverAddress) =>
    ipcRenderer.invoke(IPC_CHANNELS.COMFY_LIST_MODELS, serverAddress),
  getDefaultOutputPath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PATHS_GET_DEFAULT_OUTPUT),
  saveGeneratedImages: (outputPath, files) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_SAVE_GENERATED_IMAGES, outputPath, files),
  saveImageAs: (outputPath, filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_SAVE_IMAGE_AS, outputPath, filePath),
  openPathInExplorer: (targetPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, targetPath),
  listGeneratedImages: (outputPath, folderDirPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_LIST_GENERATED_IMAGES,
      outputPath,
      folderDirPath ?? null
    ),
  createHistoryFolder: (outputPath, folderName, parentDirPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_CREATE_HISTORY_FOLDER,
      outputPath,
      folderName,
      parentDirPath ?? null
    ),
  previewDeleteHistoryFolder: (outputPath, folderDirPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_PREVIEW_DELETE_HISTORY_FOLDER,
      outputPath,
      folderDirPath
    ),
  deleteHistoryFolder: (outputPath, folderDirPath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_DELETE_HISTORY_FOLDER,
      outputPath,
      folderDirPath
    ),
  deleteGeneratedImages: (outputPath, filePaths) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_DELETE_GENERATED_IMAGES,
      outputPath,
      filePaths
    ),
  renameGeneratedImage: (outputPath, filePath, newFileName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_RENAME_GENERATED_IMAGE,
      outputPath,
      filePath,
      newFileName
    ),
  moveImagesToFolder: (outputPath, targetFolderDirPath, filePaths) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.FILES_MOVE_IMAGES_TO_FOLDER,
      outputPath,
      targetFolderDirPath,
      filePaths
    ),
  listOutputFolders: (outputPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILES_LIST_OUTPUT_FOLDERS, outputPath),
  readUserData: () => ipcRenderer.invoke(IPC_CHANNELS.USER_DATA_READ),
  writeUserData: (data) => ipcRenderer.invoke(IPC_CHANNELS.USER_DATA_WRITE, data),
  getDefaultUserDataPath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_DATA_GET_DEFAULT_PATH),
  readChangelogMarkdown: () => ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_READ),

  // 视频工具箱（ffmpeg）
  videoFfmpegStatus: (manualFfmpegPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIDEO_FFMPEG_STATUS, manualFfmpegPath),
  videoSelectFfmpeg: () => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_SELECT_FFMPEG),
  videoPickFile: () => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PICK_FILE),
  videoPickOutputFolder: (title) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PICK_OUTPUT_FOLDER, title),
  videoPickOutput: (defaultName, kind) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PICK_OUTPUT, defaultName, kind),
  videoProbe: (payload) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PROBE, payload),
  videoRun: (payload) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_RUN, payload),
  videoCancel: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_CANCEL, jobId),

  // 3D 视角（three.js）角色模型
  view3dPickModel: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIEW3D_PICK_MODEL, defaultPath),
  view3dReadModelFile: (filePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIEW3D_READ_MODEL_FILE, filePath),
  /** 拖拽文件时取回真实路径（Electron 新版已移除 File.path） */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },

  /** 窗口级无边框全屏（3D 视窗 DOM 全屏不可用时的回退） */
  setFullScreen: (flag) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_FULL_SCREEN, flag),

  /** 深色 / 浅色 / 跟随系统（转发到 nativeTheme.themeSource） */
  setThemeSource: (source) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_SET_THEME_SOURCE, source),

  // 角色库（animadex）
  animadexSearch: (params) => ipcRenderer.invoke(IPC_CHANNELS.ANIMADEX_SEARCH, params),

  // Agent（Python sidecar）：run 立刻返回 runId，结果走事件流
  runAgent: (options) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN, options),
  cancelAgent: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, runId),
  /** 密钥状态：只有「有没有 / 从哪来 / 怎么存的 / 尾 4 位」，原值留在主进程 */
  agentSecretStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_STATUS),
  agentSetSecret: (apiKey) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_SET, apiKey),
  agentClearSecret: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_CLEAR),
  transformPrompt: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_TRANSFORM, request),
  promptSecretStatus: (connection) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_STATUS, connection),
  promptSetSecret: (connection, key) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_SET, connection, key),
  promptClearSecret: (connection) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_CLEAR, connection),
  onAgentEvent: (callback) => {
    /**
     * @param {Electron.IpcRendererEvent} _event
     * @param {import("@illusion-realm/shared").AgentEventMessage} payload
     */
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, listener);
  },
  /**
   * 宿主工具调用：主进程转过来，渲染层执行后必须调 `agentHostResult` 回执。
   * 执行端在 `apps/next/src/utils/agentHostTools.ts`（那里才有工作流组装与落盘能力）。
   */
  onAgentHostCall: (callback) => {
    /**
     * @param {Electron.IpcRendererEvent} _event
     * @param {import("@illusion-realm/shared").AgentHostCall} payload
     */
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.AGENT_HOST_CALL, listener);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.AGENT_HOST_CALL, listener);
  },
  /** 回执宿主工具结果（invoke 只是为了拿到「主进程收到了吗」，渲染层不关心错误码） */
  agentHostResult: (result) =>
    ipcRenderer.invoke(IPC_CHANNELS.AGENT_HOST_RESULT, result),

  onVideoProgress: (callback) => {
    /**
     * @param {Electron.IpcRendererEvent} _event
     * @param {import("@illusion-realm/shared").VideoProgressEvent} payload
     */
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.VIDEO_PROGRESS_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.VIDEO_PROGRESS_EVENT, listener);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

/**
 * 启动时的语言快照（同步可读，**不是 Promise**）。
 *
 * 为什么单独暴露、而不是塞进 electronAPI：
 *   `electronAPI` 的方法全是 invoke（异步 + IpcResult），而这份值必须在
 *   **渲染层模块求值期**就能读到 —— AppShell 要用它做惰性初始化
 *   （`useState(() => resolveLocale(...))`），effect 会晚一帧，那一帧足够闪一次默认语言。
 *
 * 为什么是**原始值**：这里刻意不做合法性判断（不 import 允许集、不调用 resolveLocale）。
 *   判决权完全留在渲染层。理由有两层：
 *     1. main/preload 若也维护一份「有哪些语言」的清单，就会与渲染层形成**两套允许集**，
 *        将来渲染层加第三门语言而这里忘了同步，症状是「用户选了新语言却回退中文」，
 *        且只在正式窗口复现（harness 窗口不走 main 注入，测不出来）；
 *     2. 判决在渲染层做，`resolveLocale` 的 `reason`（missing / stored / invalid）才真实 ——
 *        若在这里先清洗成合法值，正式窗口上 `missing` 与 `invalid` 两格永远测不到，
 *        日志也分不出「用户选了 en」与「文档坏了回退 zh-CN」。
 *
 * **必须判空后再 expose**：`contextBridge.exposeInMainWorld` 会拒绝非可序列化的值，
 *   传 `undefined` 直接抛异常 —— 而实测该异常会让**整个页面加载失败**（ERR_FAILED），
 *   不是「桥接少一项」那么轻。这个坑是用「带 preload / 不带 preload」的同页面对照抓出来的：
 *   不带 → LOAD OK，带 → LOAD FAILED，且 `preload-error` 事件**不触发**（所以别指望它报警）。
 *   不 expose 时 `window.initialLocale === undefined`，与 `parseInitialLocale` 的
 *   「无匹配 = undefined = missing」语义一致，渲染层的 resolveLocale 照样正确落 zh-CN。
 */
const initialLocale = parseInitialLocale(process.argv);
if (initialLocale !== undefined) {
  contextBridge.exposeInMainWorld("initialLocale", initialLocale);
}
