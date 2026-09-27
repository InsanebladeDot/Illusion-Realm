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
  VIDEO_RUN: 'video:run',
  VIDEO_CANCEL: 'video:cancel',
  /** 主进程 → 渲染进程的单向进度推送（webContents.send，非 invoke） */
  VIDEO_PROGRESS_EVENT: 'video:progress',

  // view3d —— Three.js 模型
  VIEW3D_PICK_MODEL: 'view3d:pickModel',
  VIEW3D_READ_MODEL_FILE: 'view3d:readModelFile',

  // animadex —— 角色库
  ANIMADEX_SEARCH: 'animadex:search',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/** 全部通道取值（供校验脚本断言主进程/preload 未使用表外通道） */
export const IPC_CHANNEL_VALUES: readonly string[] = Object.values(IPC_CHANNELS);
