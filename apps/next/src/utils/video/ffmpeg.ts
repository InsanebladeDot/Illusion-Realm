/**
 * 视频工具箱的 Electron 桥接层：ffmpeg 探测、文件选择、元数据探测、任务执行与进度订阅。
 * 非 Electron 环境下安全返回空值/抛出可读错误。
 */
import type {
  FfmpegStatus,
  VideoEditJob,
  VideoProbeResult,
  VideoProgressEvent,
  VideoRunResult,
} from "@/types/electron-api";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { unwrapIpc, unwrapIpcOr } from "@/utils/ipcResult";
import { t } from "@/i18n";

export type { VideoEditJob };

function requireDesktop(): void {
  if (!isElectronEnvironment() || !window.electronAPI) {
    throw new Error(t("errors.desktopOnly.videoEditing"));
  }
}

export async function getFfmpegStatus(
  manualFfmpegPath?: string | null
): Promise<FfmpegStatus | null> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoFfmpegStatus) {
    return null;
  }
  return unwrapIpcOr(
    await window.electronAPI.videoFfmpegStatus(manualFfmpegPath ?? null),
    null,
    "videoFfmpegStatus"
  );
}

export async function selectFfmpegExecutable(): Promise<string | null> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoSelectFfmpeg) {
    return null;
  }
  return unwrapIpcOr(
    await window.electronAPI.videoSelectFfmpeg(),
    null,
    "videoSelectFfmpeg"
  );
}

/** 选择视频文件（支持多选，按选择顺序即拼接顺序） */
export async function pickVideoFiles(): Promise<string[]> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoPickFile) {
    return [];
  }
  const files = unwrapIpcOr(
    await window.electronAPI.videoPickFile(),
    [],
    "videoPickFile"
  );
  return Array.isArray(files) ? files : [];
}

/** 视频剪辑所需的桌面能力是否齐备（用于给出准确提示，而不是静默失败） */
export function hasVideoBridge(): boolean {
  return Boolean(isElectronEnvironment() && window.electronAPI?.videoPickFile);
}

/**
 * 选择输出文件夹：文件名由页面按参数自动生成（也支持自定义）。
 * title 可区分用途（视频导出 / GIF 导出）。
 */
export async function pickOutputFolder(
  title?: string
): Promise<string | null> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoPickOutputFolder) {
    return null;
  }
  return unwrapIpcOr(
    await window.electronAPI.videoPickOutputFolder(title),
    null,
    "videoPickOutputFolder"
  );
}

/** 未选择输出文件夹时的回退：走系统「保存文件」对话框，直接选定单个文件 */
export async function pickOutputFile(
  defaultName?: string,
  kind: "video" | "gif" | "image" = "video"
): Promise<string | null> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoPickOutput) {
    return null;
  }
  return unwrapIpcOr(
    await window.electronAPI.videoPickOutput(defaultName, kind),
    null,
    "videoPickOutput"
  );
}

/** 选择输出文件夹的桥接是否可用（用于提示主进程过旧，而不是静默失败） */
export function hasOutputFolderBridge(): boolean {
  return Boolean(
    isElectronEnvironment() && window.electronAPI?.videoPickOutputFolder
  );
}

export async function probeVideoFile(
  inputPath: string,
  manualFfmpegPath?: string | null
): Promise<VideoProbeResult> {
  requireDesktop();
  return unwrapIpc(
    await window.electronAPI!.videoProbe({ inputPath, manualFfmpegPath })
  );
}

export async function runVideoEdit(
  job: VideoEditJob,
  manualFfmpegPath?: string | null
): Promise<VideoRunResult> {
  requireDesktop();
  return unwrapIpc(
    await window.electronAPI!.videoRun({ job, manualFfmpegPath })
  );
}

export async function cancelVideoEdit(jobId: string): Promise<boolean> {
  if (!isElectronEnvironment() || !window.electronAPI?.videoCancel) {
    return false;
  }
  return unwrapIpcOr(
    await window.electronAPI.videoCancel(jobId),
    false,
    "videoCancel"
  );
}

/** 订阅转码进度，返回取消订阅函数 */
export function onVideoProgress(
  callback: (event: VideoProgressEvent) => void
): () => void {
  if (!isElectronEnvironment() || !window.electronAPI?.onVideoProgress) {
    return () => {};
  }
  return window.electronAPI.onVideoProgress(callback);
}
