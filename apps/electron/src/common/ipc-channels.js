/**
 * IPC 通道名（主进程侧副本）。
 *
 * 为什么不在主进程 require('@illusion-realm/shared')：
 * packages/shared 只有 TS 源码、没有构建产物，主进程是运行时被 Electron 直接执行的
 * 手写 CommonJS，运行期解析不到该包（也无法解析 zod 等依赖）。
 * 因此主进程保留一份常量副本，其**取值必须与 packages/shared/src/ipc-channels.ts 完全一致**，
 * 由 scripts/verify-electron-modules.js 断言（两端漂移会直接失败）。
 */
const IPC_CHANNELS = {
  // window
  WINDOW_SET_FULL_SCREEN: "window:setFullScreen",
  WINDOW_CHROME_VISIBILITY: "window:chromeVisibility",
  // 受限的窗口动作只作用于调用者所在窗口，不接受窗口编号或原生方法名。
  // 与 shared 表保持同值，模块审计会阻止两端通道名漂移。
  // 最大化事件仅携带布尔值，补齐系统快捷键触发的状态变化。
  // 查询初始状态复用控制通道，避免页面加载时依赖一次可能错过的事件。
  // 这两个通道不改变既有全屏控制或全屏时 head 隐藏的行为。
  WINDOW_CONTROL: "window:control",
  WINDOW_MAXIMIZED: "window:maximized",
  // theme
  THEME_SET_THEME_SOURCE: "theme:setThemeSource",
  // dialog
  DIALOG_SELECT_FOLDER: "dialog:selectFolder",
  // models
  MODELS_SCAN: "models:scan",
  MODELS_READ_METADATA: "models:readMetadata",
  // 单文件识别由主进程读取，不接收远程 URL 或预计算摘要。
  // 对应 shared 同名常量；模块审计检查两侧值相等。
  // invoke 返回结构化状态，资料仍走既有只读通道。
  MODELS_RECOVER_METADATA: "models:recoverMetadata",
  MODELS_DOWNLOAD_TARGET: "models:downloadTarget",
  MODELS_DOWNLOAD_START: "models:downloadStart",
  MODELS_DOWNLOAD_CANCEL: "models:downloadCancel",
  MODELS_DOWNLOAD_RETRY: "models:downloadRetry",
  MODELS_DOWNLOAD_REMOVE: "models:downloadRemove",
  MODELS_DOWNLOAD_LIST: "models:downloadList",
  MODELS_CHANGE_LOGO: "models:changeLogo",
  MODELS_CATEGORY_TARGET: "models:categoryTarget",
  MODELS_MOVE_CATEGORY: "models:moveCategory",
  MODELS_BATCH: "models:batch",
  MODELS_DOWNLOAD_PROGRESS: "models:downloadProgress",
  // files
  FILES_READ_IMAGE_DATA_URL: "files:readImageDataUrl",
  FILES_LIST_IMAGE_FILES: "files:listImageFiles",
  FILES_SAVE_GENERATED_IMAGES: "files:saveGeneratedImages",
  FILES_SAVE_IMAGE_AS: "files:saveImageAs",
  FILES_LIST_GENERATED_IMAGES: "files:listGeneratedImages",
  FILES_CREATE_HISTORY_FOLDER: "files:createHistoryFolder",
  FILES_PREVIEW_DELETE_HISTORY_FOLDER: "files:previewDeleteHistoryFolder",
  FILES_DELETE_HISTORY_FOLDER: "files:deleteHistoryFolder",
  FILES_DELETE_GENERATED_IMAGES: "files:deleteGeneratedImages",
  FILES_RENAME_GENERATED_IMAGE: "files:renameGeneratedImage",
  FILES_MOVE_IMAGES_TO_FOLDER: "files:moveImagesToFolder",
  FILES_LIST_OUTPUT_FOLDERS: "files:listOutputFolders",
  // comfy
  COMFY_GENERATE: "comfy:generate",
  COMFY_CANCEL: "comfy:cancel",
  // 释放模型内存单独走固定通道，不借用停止任务的取消命令。
  // 两份通道表保持同值，preload 和共享类型才能指向同一处理器。
  // 此操作没有文件路径参数，不能用它删除下载资源或模型文件。
  COMFY_FREE_MEMORY: "comfy:freeMemory",
  COMFY_UPLOAD_IMAGE: "comfy:uploadImage",
  COMFY_LIST_MODELS: "comfy:listModels",
  // paths
  PATHS_GET_DEFAULT_OUTPUT: "paths:getDefaultOutput",
  // shell
  SHELL_OPEN_PATH: "shell:openPath",
  // userData
  USER_DATA_READ: "userData:read",
  USER_DATA_WRITE: "userData:write",
  USER_DATA_GET_DEFAULT_PATH: "userData:getDefaultPath",
  // changelog
  CHANGELOG_READ: "changelog:read",
  // video
  VIDEO_FFMPEG_STATUS: "video:ffmpegStatus",
  VIDEO_SELECT_FFMPEG: "video:selectFfmpeg",
  VIDEO_PICK_FILE: "video:pickVideo",
  VIDEO_PICK_OUTPUT_FOLDER: "video:pickOutputFolder",
  VIDEO_PICK_OUTPUT: "video:pickOutput",
  VIDEO_PROBE: "video:probe",
  // 波形请求与取消共用业务通道，任务身份由所属窗口隔离。
  // 不向渲染层提供FFmpeg命令、原始音频或任意通道入口。
  // 此值对应shared常量，由模块检查比对，不能各自改名。
  VIDEO_WAVEFORM: "video:waveform",
  VIDEO_RUN: "video:run",
  VIDEO_CANCEL: "video:cancel",
  VIDEO_PROGRESS_EVENT: "video:progress",
  // view3d
  VIEW3D_PICK_MODEL: "view3d:pickModel",
  VIEW3D_READ_MODEL_FILE: "view3d:readModelFile",
  // animadex
  ANIMADEX_SEARCH: "animadex:search",
  // agent（Python sidecar）
  AGENT_RUN: "agent:run",
  AGENT_CANCEL: "agent:cancel",
  AGENT_EVENT: "agent:event",
  // 宿主工具：主进程 → 渲染层请求执行，渲染层回执结果
  AGENT_HOST_CALL: "agent:hostCall",
  AGENT_HOST_RESULT: "agent:hostResult",
  // agent 密钥：只由主进程持有，渲染层只能问状态 / 要求写入 / 要求清除
  AGENT_SECRET_STATUS: "agent:secretStatus",
  AGENT_SECRET_SET: "agent:secretSet",
  AGENT_SECRET_CLEAR: "agent:secretClear",
  // 与 shared 保持同值；目录只允许固定服务商，不接收自由 URL。
  // 认证头由主进程按服务商注入，preload 不读取或缓存原始密钥。
  // 该通道使用 registerHandle，所以异常仍返回标准 IpcResult。
  AGENT_CATALOG: "agent:catalog",
  CIVITAI_KEY_STATUS: "civitai:keyStatus",
  CIVITAI_KEY_SET: "civitai:keySet",
  CIVITAI_KEY_CLEAR: "civitai:keyClear",
  PROMPT_TRANSFORM: "prompt:transform",
  PROMPT_SECRET_STATUS: "prompt:secretStatus",
  PROMPT_SECRET_SET: "prompt:secretSet",
  PROMPT_SECRET_CLEAR: "prompt:secretClear",
  ACCOUNT_REGISTER: "account:register",
  ACCOUNT_VERIFY_EMAIL: "account:verifyEmail",
  ACCOUNT_RESEND_VERIFICATION: "account:resendVerification",
  // 画布工程只开放明确动作，不暴露通用读写或任意压缩包解压接口。
// 主进程通道副本采用既有双引号格式。
// 现有模块审计用明确文本模式读取这一表，改成单引号会被识别为缺失。
// 因此虽然 JavaScript 字符串值等价，也必须遵守当前门禁的源码约定。
// 这不是新增运行时通道差异，shared 与此处值应始终相同。
// preload 与 handler 都从本表取值，避免手写字符串分叉。
// 页面使用的是类型化方法名，不让用户直接传这些通道字符串。
// 工程服务注册汇总要同步接通，只有常量没有 handler 仍不可用。
// 最终 Electron 回归检查实际 invoke，不把文本表一致当作全部行为证据。
  CANVAS_IMPORT_MEDIA: "canvas:importMedia",
  CANVAS_EXPORT_PROJECT: "canvas:exportProject",
  CANVAS_OPEN_PROJECT: "canvas:openProject",
  ACCOUNT_LOGIN: "account:login",
  ACCOUNT_ME: "account:me",
  ACCOUNT_LOGOUT: "account:logout",
  // 与 shared 同值；游客切换只撤销本地凭据，不发送后端登出请求。
  // 保留独立入口，避免复用 ACCOUNT_LOGOUT 时意外发起网络请求。
  // 参数固定为空，业务 handler 再次验证，preload 不提供任意通道调用。
  ACCOUNT_ENTER_GUEST: "account:enterGuest",
  CLOUD_IMAGE_UPLOAD: "cloudImage:upload",
  CLOUD_LIBRARY_REQUEST: "cloudLibrary:request",
  CLOUD_IMAGE_GET: "cloudImage:get",
  CLOUD_COLLECTION_GET: "cloudCollection:get",
  CLOUD_COLLECTION_ITEMS: "cloudCollection:items",
};

module.exports = { IPC_CHANNELS };
