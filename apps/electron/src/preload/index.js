/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * initial-locale：启动语言参数保持原样透传，不在主进程决定有效语言。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * initial-locale：读取和构造参数共用同一前缀，语言合法性仍由渲染层判断。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { IPC_CHANNELS } = require("../common/ipc-channels");
const { parseInitialLocale } = require("../common/initial-locale");

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
  // 桥接仅转发三个业务动作，不暴露 Node 文件操作或原始 ipcRenderer。
// 画布的三种调用仅转发业务载荷，不在隔离桥中复制或解包文件。
// 通道来自 common 副本，和 shared 的来源定义接受一致性检查。
// 不把 ipcRenderer 或任意 channel 参数暴露给网页。
// 导入素材只接请求对象，根目录不能从网页增加位置参数。
// 导出只接稳定文档，不接可执行回调或 shell 命令。
// 打开工程没有路径参数，减少未经系统选择直接读任意文件的能力。
// invoke 原样保留 IpcResult，不在 preload 提前吞掉失败。
// 用户取消仍是成功结果里的 null，不被桥接改成异常。
// 服务端校验是最后边界，桥接类型签名不能替代实际校验。
// 页面卸载不注册新常驻监听，这组请求没有 event 订阅资源。
// 文件内容由主进程流处理，不跨 contextBridge 搬整个视频。
// 现有 getPathForFile 仍是 File 身份转换的唯一入口。
// 这里没有引入 File.path 或把 Node require 暴露给 renderer。
// 生产窗口继续 contextIsolation，新增方法不改变隔离开关。
  canvasImportMedia: request => ipcRenderer.invoke(IPC_CHANNELS.CANVAS_IMPORT_MEDIA, request),
  canvasExportProject: document => ipcRenderer.invoke(IPC_CHANNELS.CANVAS_EXPORT_PROJECT, document),
  canvasOpenProject: () => ipcRenderer.invoke(IPC_CHANNELS.CANVAS_OPEN_PROJECT),
  isElectron: true,
  hasCustomTitleBar: process.argv.includes("--illusion-custom-titlebar"),
  // renderer 只能发送有限动作，目标窗口永远由主进程根据发送者选取。
  // API 不接受窗口编号，也不暴露 ipcRenderer 或 BrowserWindow 对象。
  // 主进程额外校验字面量，TypeScript 类型不能代替跨边界的运行时检查。
  controlWindow: (action) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CONTROL, action),
  // 最大化状态只接收布尔值，忽略不符合契约的原生通知。
  // listener 使用稳定引用，取消订阅不会移除其他组件的监听。
  // 窗口加载时另有 state 查询，避免把事件订阅误当作状态快照。
  // 每次订阅返回独立 disposer，React StrictMode 重挂载也能释放旧监听。
  onWindowMaximized: (callback) => {
    /**
     * @param {Electron.IpcRendererEvent} _event 事件对象不传给隔离世界。
     * @param {unknown} maximized 只把合法布尔状态交给页面。
     * 不传 Electron event，避免页面借事件获取未授权的原生能力。
     * 无效载荷不改状态，防止 icon 因 truthy 字符串误切换。
     */
    const listener = (_event, maximized) => { if (typeof maximized === "boolean") callback(maximized); };
    // ipcRenderer 只在 preload 内使用，页面仅看到 boolean 回调。
    // 取消订阅与注册使用同一个通道常量，避免跨版本通道拼写不一致。
    // removeListener 只释放本次监听，不干扰其他组件或窗口。
    ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_MAXIMIZED, listener);
  },
  onWindowChromeVisibility: (callback) => {
    /** @param {Electron.IpcRendererEvent} _event @param {unknown} visible */
    const listener = (_event, visible) => { if (typeof visible === "boolean") callback(visible); };
    ipcRenderer.on(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_CHROME_VISIBILITY, listener);
  },
  selectFolder: (defaultPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER, defaultPath),
  readLocalModelMetadata: (filePaths) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_READ_METADATA, filePaths),
  // 只暴露单文件补全，不提供哈希任意文件或自由访问网络的能力。
  // 路径、并发和落盘权限都由主进程服务复核。
  // Promise 返回 IpcResult，渲染层必须解包并验证 schema。
  recoverLocalModelMetadata: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.MODELS_RECOVER_METADATA, filePath),
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
  comfyGenerate: (prompt, serverAddress, requestId) =>
    ipcRenderer.invoke(IPC_CHANNELS.COMFY_GENERATE, prompt, serverAddress, requestId),
  comfyCancel: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.COMFY_CANCEL, requestId),
  // 只桥接固定的释放内存动作，渲染层无法借此调用任意 HTTP 接口。
  // 地址原样交给主进程校验，preload 不擅自补路径或吞掉失败结果。
  // Promise 保留 IpcResult 包装，由渲染 API 使用统一助手解包。
  // 不引入事件订阅，因此按钮卸载时没有额外 listener 要清理。
  // 不加载主进程服务，保持 contextBridge 两侧的职责边界。
  comfyFreeMemory: (serverAddress) =>
    ipcRenderer.invoke(IPC_CHANNELS.COMFY_FREE_MEMORY, serverAddress),
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
  // 保持业务级最小桥接：只转发波形请求与对应取消，不能执行自定义FFmpeg命令。
  // IpcResult原样返回，渲染侧按成功、无音轨和失败分别显示。
  // 不在preload缓存源路径、音频字节或订阅，任务生命周期由业务拥有者管理。
  videoWaveform: (payload) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_WAVEFORM, payload),
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
  setThemeSource: (source, shellColor) =>
    ipcRenderer.invoke(IPC_CHANNELS.THEME_SET_THEME_SOURCE, source, shellColor),

  // 角色库（animadex）
  animadexSearch: (params) => ipcRenderer.invoke(IPC_CHANNELS.ANIMADEX_SEARCH, params),

  // Agent（Python sidecar）：run 立刻返回 runId，结果走事件流
  runAgent: (options) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_RUN, options),
  cancelAgent: (runId) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CANCEL, runId),
  /** 密钥状态：只有「有没有 / 从哪来 / 怎么存的 / 尾 4 位」，原值留在主进程 */
  // provider 是有限站点 ID；省略时保留旧硅基流动调用行为。
  // preload 只传参数，主进程仍独立验证，不能由这里决定存储路径。
  // 状态接口只返回配置摘要，页面永远不能读回密钥原值。
  // 保存中的 provider 固定在本次调用里，切换标签不会改变其作用域。
  // 目录读取仅暴露 provider/force，不开放任意 HTTP 请求能力。
  // 所有返回值都保留 IpcResult 包装，渲染层统一解包失败。
  // 不订阅全局模型事件，因此无需额外常驻监听或清理订阅。
  // force 只是刷新缓存，不涉及付费生成或服务商账户操作。
  // 桥接只增加所需最小 API，不暴露 ipcRenderer 本体。
  agentSecretStatus: (provider) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_STATUS, provider),
  agentSetSecret: (apiKey, provider) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_SET, apiKey, provider),
  agentClearSecret: (provider) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_SECRET_CLEAR, provider),
  agentCatalog: (provider, force) => ipcRenderer.invoke(IPC_CHANNELS.AGENT_CATALOG, provider, force),
  transformPrompt: (request) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_TRANSFORM, request),
  promptSecretStatus: (connection) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_STATUS, connection),
  promptSetSecret: (connection, key) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_SET, connection, key),
  promptClearSecret: (connection) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SECRET_CLEAR, connection),
  accountRegister: (request) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_REGISTER, request),
  accountVerifyEmail: (token) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_VERIFY_EMAIL, token),
  accountResendVerification: (email) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_RESEND_VERIFICATION, email),
  accountLogin: (request) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_LOGIN, request),
  accountMe: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_ME),
  accountLogout: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_LOGOUT),
  // 游客切换只调用固定无参 handler，不使用注销账号的网络路径。
  // 等待结果后再放行本地页面，避免残留令牌在并发请求中被复用。
  // 旧账户凭据始终留在主进程，不会通过返回值暴露给页面。
  accountEnterGuest: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_ENTER_GUEST),
  cloudImageUpload: (request) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_IMAGE_UPLOAD, request),
  cloudLibraryRequest: (request) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_LIBRARY_REQUEST, request),
  cloudImageGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_IMAGE_GET, id),
  cloudCollectionGet: (id) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_COLLECTION_GET, id),
  cloudCollectionItems: (request) => ipcRenderer.invoke(IPC_CHANNELS.CLOUD_COLLECTION_ITEMS, request),
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
