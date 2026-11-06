/**
 * IPC 通道单一事实来源。
 *
 * 命名：`CHANNEL_{DOMAIN}_{ACTION}`；取值保持迁移前的原始字符串（`domain:action`），
 * 主进程（ipcMain.handle）与 preload（ipcRenderer.invoke）都必须引用这里的常量，
 * 禁止再使用字符串字面量。
 *
 * 注意：主进程是手写 CommonJS，无法在运行期 require 本文件（packages/shared 不含构建产物），
 * 因此常量的“值”以普通字符串形式嵌入其源码，由 scripts/verify-electron-modules.js
 * 断言主进程用到的通道名全部在本表内，防止两端漂移。
 */
export const IPC_CHANNELS = {
  // window —— 窗口控制
  WINDOW_SET_FULL_SCREEN: 'window:setFullScreen',
  WINDOW_CHROME_VISIBILITY: 'window:chromeVisibility',
  // 窗口控制只接收有限动作，主进程根据发送者确定目标窗口。
  // 不提供任意 BrowserWindow 方法名、窗口编号或脚本执行能力。
  // 最大化通知用于同步系统菜单、快捷键和双击标题栏触发的变化。
  // 初始状态通过 WINDOW_CONTROL 查询，避免依赖加载前已经发出的事件。
  // 与主进程副本一一对应，通道漂移由模块审计阻止。
  WINDOW_CONTROL: 'window:control',
  WINDOW_MAXIMIZED: 'window:maximized',
  /**
   * 深色/浅色：转发给 Electron 的 `nativeTheme.themeSource`。
   *
   * 为什么走主进程而不是在 <html> 上挂个 class：本项目的深色 token 与全部 `dark:`
   * 工具类都由 **`prefers-color-scheme`** 这一个开关驱动（globals.css 里只有一处定义）。
   * 让渲染进程自己加 class 就得把 token 表拆成「媒体查询 + class」两份并维护一致性；
   * 而 `nativeTheme.themeSource` 恰好就是「应用级覆盖 prefers-color-scheme」的官方入口，
   * 于是 CSS 一个字符都不用改，也不存在两套定义漂移的可能。
   */
  THEME_SET_THEME_SOURCE: 'theme:setThemeSource',

  // dialog —— 系统对话框
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',

  // models —— 本地模型扫描
  MODELS_SCAN: 'models:scan',
  MODELS_READ_METADATA: 'models:readMetadata',
  // 单文件 SHA-256 识别入口，不能用它读取任意文件内容。
  // 参数与返回值见 local-model-metadata.schema，主进程校验配置根目录。
  // 与 CommonJS 副本保持同值，由 Electron 模块审计验证。
  MODELS_RECOVER_METADATA: 'models:recoverMetadata',
  MODELS_DOWNLOAD_TARGET: 'models:downloadTarget',
  MODELS_DOWNLOAD_START: 'models:downloadStart',
  MODELS_DOWNLOAD_CANCEL: 'models:downloadCancel',
  MODELS_DOWNLOAD_RETRY: 'models:downloadRetry',
  MODELS_DOWNLOAD_REMOVE: 'models:downloadRemove',
  MODELS_DOWNLOAD_LIST: 'models:downloadList',
  MODELS_CHANGE_LOGO: 'models:changeLogo',
  MODELS_CATEGORY_TARGET: 'models:categoryTarget',
  MODELS_MOVE_CATEGORY: 'models:moveCategory',
  MODELS_BATCH: 'models:batch',
  MODELS_DOWNLOAD_PROGRESS: 'models:downloadProgress',

  // files —— 文件与生成图归档
  FILES_READ_IMAGE_DATA_URL: 'files:readImageDataUrl',
  FILES_LIST_IMAGE_FILES: 'files:listImageFiles',
  FILES_SAVE_GENERATED_IMAGES: 'files:saveGeneratedImages',
  FILES_SAVE_IMAGE_AS: 'files:saveImageAs',
  FILES_LIST_GENERATED_IMAGES: 'files:listGeneratedImages',
  FILES_CREATE_HISTORY_FOLDER: 'files:createHistoryFolder',
  FILES_PREVIEW_DELETE_HISTORY_FOLDER: 'files:previewDeleteHistoryFolder',
  FILES_DELETE_HISTORY_FOLDER: 'files:deleteHistoryFolder',
  FILES_DELETE_GENERATED_IMAGES: 'files:deleteGeneratedImages',
  FILES_RENAME_GENERATED_IMAGE: 'files:renameGeneratedImage',
  FILES_MOVE_IMAGES_TO_FOLDER: 'files:moveImagesToFolder',
  FILES_LIST_OUTPUT_FOLDERS: 'files:listOutputFolders',

  // comfy —— ComfyUI 代理
  COMFY_GENERATE: 'comfy:generate',
  COMFY_CANCEL: 'comfy:cancel',
  // 这里只登记卸载模型的专用入口，不开放任意 ComfyUI 路由。
  // JS 通道副本必须同步，避免打包后桥接找不到主进程处理器。
  // 释放内存与停止生成是两种业务动作，不能共用取消通道。
  COMFY_FREE_MEMORY: 'comfy:freeMemory',
  COMFY_UPLOAD_IMAGE: 'comfy:uploadImage',
  COMFY_LIST_MODELS: 'comfy:listModels',

  // paths —— 路径解析
  PATHS_GET_DEFAULT_OUTPUT: 'paths:getDefaultOutput',

  // shell —— 系统外壳
  SHELL_OPEN_PATH: 'shell:openPath',

  // userData —— 本地 JSON 持久化
  USER_DATA_READ: 'userData:read',
  USER_DATA_WRITE: 'userData:write',
  USER_DATA_GET_DEFAULT_PATH: 'userData:getDefaultPath',

  // changelog —— 改动日志
  CHANGELOG_READ: 'changelog:read',

  // video —— 视频工具箱（ffmpeg）
  VIDEO_FFMPEG_STATUS: 'video:ffmpegStatus',
  VIDEO_SELECT_FFMPEG: 'video:selectFfmpeg',
  VIDEO_PICK_FILE: 'video:pickVideo',
  VIDEO_PICK_OUTPUT_FOLDER: 'video:pickOutputFolder',
  VIDEO_PICK_OUTPUT: 'video:pickOutput',
  VIDEO_PROBE: 'video:probe',
  // 波形只返回有界峰值，不通过探测通道传完整音频。
  // 同一通道也接受按请求身份取消，不开放任意进程操作。
  // 字符串与主进程/preload副本同步，旧探测契约保持不变。
  VIDEO_WAVEFORM: 'video:waveform',
  VIDEO_RUN: 'video:run',
  VIDEO_CANCEL: 'video:cancel',
  /** 主进程 → 渲染进程的单向进度推送（webContents.send，非 invoke） */
  VIDEO_PROGRESS_EVENT: 'video:progress',

  // view3d —— Three.js 模型
  VIEW3D_PICK_MODEL: 'view3d:pickModel',
  VIEW3D_READ_MODEL_FILE: 'view3d:readModelFile',

  // animadex —— 角色库
  ANIMADEX_SEARCH: 'animadex:search',

  // agent —— Python sidecar（stdio 子进程，事件流经 AGENT_EVENT 推给渲染层）
  /** invoke：启动一次运行，立刻返回 runId（结果走事件流） */
  AGENT_RUN: 'agent:run',
  /** invoke：取消某次运行（主进程把整棵进程树收掉） */
  AGENT_CANCEL: 'agent:cancel',
  /** main -> renderer：事件流（与 video:progress 同款单向推送） */
  AGENT_EVENT: 'agent:event',
  /**
   * main -> renderer：宿主工具调用请求（渲染层执行后用 `AGENT_HOST_RESULT` 回执）。
   *
   * 方向与 `AGENT_EVENT` 相同，但这条**需要回执** —— 主进程等它把结果写回 Python 的
   * stdin（见 `apps/electron/src/main/modules/agent/host-tools.js` 的 `callRenderer`）。
   */
  AGENT_HOST_CALL: 'agent:hostCall',
  /** invoke：渲染层回执宿主工具的执行结果（成功与否都要回，否则主进程要等到超时） */
  AGENT_HOST_RESULT: 'agent:hostResult',
  /**
   * invoke：查密钥状态 —— **只回「有没有 / 从哪来 / 怎么存的 / 尾 4 位」**，不回原值。
   * 密钥存在主进程侧（`apps/electron/src/main/modules/agent/secret.js`），渲染层永远读不回它。
   */
  AGENT_SECRET_STATUS: 'agent:secretStatus',
  /** invoke：写入密钥（主进程用 safeStorage 加密落盘，拿不到加密能力时才退明文并标记） */
  AGENT_SECRET_SET: 'agent:secretSet',
  /** invoke：清除密钥 */
  AGENT_SECRET_CLEAR: 'agent:secretClear',
  // 只读远端聊天目录，provider 和 force 由主进程重新校验。
  // 不与绘图模型扫描共用通道，返回值也不携带 API Key。
  // 主进程同值副本必须同步添加，模块验证会检查两端一致性。
  AGENT_CATALOG: 'agent:catalog',
  CIVITAI_KEY_STATUS: 'civitai:keyStatus',
  CIVITAI_KEY_SET: 'civitai:keySet',
  CIVITAI_KEY_CLEAR: 'civitai:keyClear',
  PROMPT_TRANSFORM: 'prompt:transform',
  PROMPT_SECRET_STATUS: 'prompt:secretStatus',
  PROMPT_SECRET_SET: 'prompt:secretSet',
  PROMPT_SECRET_CLEAR: 'prompt:secretClear',
  // account —— 后端账户认证（令牌只在主进程侧保存）
  ACCOUNT_REGISTER: 'account:register',
  ACCOUNT_VERIFY_EMAIL: 'account:verifyEmail',
  ACCOUNT_RESEND_VERIFICATION: 'account:resendVerification',
  // 画布工程只开放明确动作，不暴露通用读写或任意压缩包解压接口。
// 三个画布通道分别对应三种窄业务能力。
// importMedia 只复制这次明确提交的媒体清单。
// exportProject 只导出经过校验的当前作品。
// openProject 必须通过主进程系统框选择文件。
// 通道值保持稳定，不随中文按钮名称或语言切换改变。
// shared 是类型侧来源，common 是主进程运行时同值副本。
// 新增能力需要同时维护两表，不能只新增 preload 方法。
// 通道名称本身不授权任意文件操作，handler 仍验证输入。
// 这组不包含 deleteFile 或任意 writeFile，减少可被滥用的桥接面。
// 删除图节点因此不会意外调用系统文件删除。
// 导出完成通过 IpcResult 返回，不另加可丢失的一次性成功事件。
// 打开取消通过 null 返回，不靠窗口 blur 猜测系统操作结果。
  CANVAS_IMPORT_MEDIA: 'canvas:importMedia',
  CANVAS_EXPORT_PROJECT: 'canvas:exportProject',
  CANVAS_OPEN_PROJECT: 'canvas:openProject',
  ACCOUNT_LOGIN: 'account:login',
  ACCOUNT_ME: 'account:me',
  ACCOUNT_LOGOUT: 'account:logout',
  // 游客入口只清除本地账户凭据，不向账户服务器发送退出请求。
  // 通道不接收路径、令牌或用户标识，不能被用来读取其他账号的凭据。
  // 与公开的登录注册接口分开，便于验证游客进入全过程没有后端请求。
  ACCOUNT_ENTER_GUEST: 'account:enterGuest',
  CLOUD_IMAGE_UPLOAD: 'cloudImage:upload',
  CLOUD_LIBRARY_REQUEST: 'cloudLibrary:request',
  CLOUD_IMAGE_GET: 'cloudImage:get',
  CLOUD_COLLECTION_GET: 'cloudCollection:get',
  CLOUD_COLLECTION_ITEMS: 'cloudCollection:items',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** 全部通道取值（供校验脚本断言主进程/preload 未使用表外通道） */
export const IPC_CHANNEL_VALUES: readonly string[] = Object.values(IPC_CHANNELS);
