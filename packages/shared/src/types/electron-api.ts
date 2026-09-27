import type { LocalModel, LocalModelType } from "./localModel";
import type { ComfyApiPrompt } from "./comfy";
import type { AnimadexSearchParams, AnimadexSearchResult } from "./character";
import type { OutputFolderEntry } from "./historyFolder";
import type { IpcResult } from "../ipc-result";

type ComfyRemoteImage = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  dataUrl: string;
};

type ComfyRemoteVideo = {
  nodeId: string;
  filename: string;
  subfolder: string;
  folderType: string;
  kind: string;
  dataUrl: string;
};

export type ComfyUploadedImage = {
  name: string;
  subfolder: string;
  type: string;
};

/** ffmpeg / ffprobe 探测结果 */
export type FfmpegStatus = {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  source: "manual" | "path" | "common" | "bundled" | null;
  version: string | null;
};

export type VideoProbeResult = {
  path: string;
  fileName: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasAudio: boolean;
  size: number;
};

export type VideoCropOptions = {
  enabled: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

/** 拼接用的单个片段输入 */
export type VideoClipInput = {
  inputPath: string;
  /** 源片段总时长 */
  duration: number;
  hasAudio: boolean;
  trim?: { start: number; end: number };
};

/** GIF 制作参数（视频 → 动图） */
export type VideoGifOptions = {
  /** 帧率（帧/秒），1–120 */
  fps: number;
  /** 输出宽度（等比缩放，高度自动取偶数，且不超过源分辨率） */
  width: number;
  /** 是否无限循环，默认 true */
  loop?: boolean;
};

export type VideoEditJob = {
  /** single（默认）：单片段剪辑；concat：多片段拼接；gif：多片段合成动图 */
  mode?: "single" | "concat" | "gif";
  /** 单片段模式使用 */
  inputPath?: string;
  /** 拼接 / GIF 模式使用（顺序即输出顺序） */
  clips?: VideoClipInput[];
  outputPath: string;
  /** 拼接目标尺寸/帧率（取首段） */
  width?: number;
  height?: number;
  fps?: number;
  /** 源视频总时长（用于进度换算） */
  sourceDuration?: number;
  trim?: { start: number; end: number };
  speed?: number;
  crop?: VideoCropOptions;
  /** 强制重新编码以获得帧级精确剪切（默认无损流拷贝、按关键帧对齐） */
  accurateCut?: boolean;
  /** GIF 模式使用 */
  gif?: VideoGifOptions;
};

export type VideoRunResult = {
  jobId: string;
  outputPath: string;
  requiresReencode: boolean;
};

export type VideoProgressEvent = {
  jobId: string;
  percent: number;
  seconds: number;
};

/**
 * preload 暴露给渲染进程的 API（window.electronAPI）。
 *
 * 所有 invoke 类方法统一返回 `Promise<IpcResult<T>>`：主进程不再跨边界抛异常，
 * 失败信息以 `{ success: false, error, code? }` 返回；`on*` 订阅类方法返回取消订阅函数。
 */
export type ElectronAPI = {
  isElectron: boolean;
  selectFolder: () => Promise<IpcResult<string | null>>;
  scanModels: (dirPath: string, type: LocalModelType) => Promise<IpcResult<LocalModel[]>>;
  readLocalImage: (filePath: string | null) => Promise<IpcResult<string | null>>;
  listImageFiles: (
    dirPath: string
  ) => Promise<IpcResult<Array<{ filePath: string; fileName: string }>>>;
  comfyGenerate: (
    prompt: ComfyApiPrompt,
    serverAddress: string
  ) => Promise<
    IpcResult<{
      promptId: string;
      images: ComfyRemoteImage[];
      videos: ComfyRemoteVideo[];
    }>
  >;
  comfyUploadImage: (
    serverAddress: string,
    payload: { filename: string; dataBase64: string; subfolder?: string }
  ) => Promise<IpcResult<ComfyUploadedImage>>;
  comfyListModels: (
    serverAddress: string
  ) => Promise<
    IpcResult<{
      checkpoints: string[];
      loras: string[];
    }>
  >;
  getDefaultOutputPath: () => Promise<IpcResult<string>>;
  saveGeneratedImages: (
    outputPath: string,
    files: Array<{
      filename: string;
      dataBase64: string;
    }>
  ) => Promise<IpcResult<string[]>>;
  /** 把一张已生成的图片另存到用户选定的位置 */
  saveImageAs: (
    outputPath: string,
    filePath: string
  ) => Promise<IpcResult<string | null>>;
  openPathInExplorer: (targetPath: string) => Promise<IpcResult<string>>;
  listGeneratedImages: (
    outputPath: string,
    folderDirPath: string | null
  ) => Promise<
    IpcResult<
      Array<{
        filePath: string;
        fileName: string;
        modifiedAt: number;
      }>
    >
  >;
  createHistoryFolder: (
    outputPath: string,
    folderName: string,
    parentDirPath?: string | null
  ) => Promise<
    IpcResult<{
      dirPath: string;
      name: string;
      parentDirPath: string | null;
      depth: number;
    }>
  >;
  previewDeleteHistoryFolder: (
    outputPath: string,
    folderDirPath: string
  ) => Promise<
    IpcResult<{
      imageCount: number;
      sidecarCount: number;
      subfolderCount: number;
    }>
  >;
  deleteHistoryFolder: (
    outputPath: string,
    folderDirPath: string
  ) => Promise<
    IpcResult<{
      deletedImageCount: number;
      deletedSidecarCount: number;
      deletedSubfolderCount: number;
    }>
  >;
  deleteGeneratedImages: (
    outputPath: string,
    filePaths: string[]
  ) => Promise<
    IpcResult<{
      deletedImageCount: number;
      deletedSidecarCount: number;
      skippedCount: number;
    }>
  >;
  /** 在线改名：只改文件名，保留扩展名与图片内嵌 Meta */
  renameGeneratedImage: (
    outputPath: string,
    filePath: string,
    newFileName: string
  ) => Promise<
    IpcResult<{
      oldPath: string;
      filePath: string;
      fileName: string;
      modifiedAt: number;
    }>
  >;
  moveImagesToFolder: (
    outputPath: string,
    targetFolderDirPath: string,
    filePaths: string[]
  ) => Promise<IpcResult<string[]>>;
  listOutputFolders: (
    outputPath: string
  ) => Promise<IpcResult<OutputFolderEntry[]>>;
  readUserData: () => Promise<
    IpcResult<{
      filePath: string;
      data: Record<string, unknown>;
      isNew: boolean;
    }>
  >;
  writeUserData: (data: Record<string, unknown>) => Promise<
    IpcResult<{
      filePath: string;
      data: Record<string, unknown>;
    }>
  >;
  getDefaultUserDataPath: () => Promise<IpcResult<string>>;
  readChangelogMarkdown: () => Promise<IpcResult<string | null>>;

  // 视频工具箱（ffmpeg）
  videoFfmpegStatus: (manualFfmpegPath?: string | null) => Promise<IpcResult<FfmpegStatus>>;
  videoSelectFfmpeg: () => Promise<IpcResult<string | null>>;
  videoPickFile: () => Promise<IpcResult<string[]>>;
  /** 选择输出**文件夹**（文件名由渲染进程生成或自定义） */
  videoPickOutputFolder: (title?: string) => Promise<IpcResult<string | null>>;
  /** 保存单个文件（未选择输出文件夹时的回退路径） */
  videoPickOutput: (
    defaultName?: string,
    kind?: "video" | "gif"
  ) => Promise<IpcResult<string | null>>;
  videoProbe: (payload: {
    inputPath: string;
    manualFfmpegPath?: string | null;
  }) => Promise<IpcResult<VideoProbeResult>>;
  videoRun: (payload: {
    job: VideoEditJob;
    manualFfmpegPath?: string | null;
  }) => Promise<IpcResult<VideoRunResult>>;
  videoCancel: (jobId: string) => Promise<IpcResult<boolean>>;
  onVideoProgress: (
    callback: (event: VideoProgressEvent) => void
  ) => () => void;

  // 3D 视角（three.js）角色模型
  view3dPickModel: (defaultPath?: string) => Promise<IpcResult<string | null>>;
  view3dReadModelFile: (
    filePath: string
  ) => Promise<IpcResult<{ fileName: string; data: Uint8Array } | null>>;
  /** 拖拽文件时取回真实路径（浏览器环境下为 null） */
  getPathForFile: (file: File) => string | null;
  /** 窗口级无边框全屏（3D 视窗 DOM 全屏不可用时的回退） */
  setFullScreen: (flag: boolean) => Promise<IpcResult<boolean>>;
  /** 深色 / 浅色 / 跟随系统：主进程转发到 `nativeTheme.themeSource`，返回生效值 */
  setThemeSource: (
    source: "system" | "light" | "dark"
  ) => Promise<IpcResult<string>>;

  // 角色库（animadex）
  animadexSearch: (params: AnimadexSearchParams) => Promise<IpcResult<AnimadexSearchResult>>;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
