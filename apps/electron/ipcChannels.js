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
  // theme
  THEME_SET_THEME_SOURCE: "theme:setThemeSource",
  // dialog
  DIALOG_SELECT_FOLDER: "dialog:selectFolder",
  // models
  MODELS_SCAN: "models:scan",
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
  VIDEO_RUN: "video:run",
  VIDEO_CANCEL: "video:cancel",
  VIDEO_PROGRESS_EVENT: "video:progress",
  // view3d
  VIEW3D_PICK_MODEL: "view3d:pickModel",
  VIEW3D_READ_MODEL_FILE: "view3d:readModelFile",
  // animadex
  ANIMADEX_SEARCH: "animadex:search",
};

module.exports = { IPC_CHANNELS };
