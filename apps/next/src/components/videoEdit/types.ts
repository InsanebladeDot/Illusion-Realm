/** 视频剪辑 / GIF 制作共用的片段模型 */
import type { VideoClipEffects, VideoClipInput } from "@/types/electron-api";

/** 时间轴上的一个片段（含各自的剪切区间） */
export type ClipItem = {
  id: string;
  name: string;
  path: string;
  /** 源片段总时长（秒） */
  duration: number;
  width: number;
  height: number;
  /** 帧率（用于逐帧步进） */
  fps: number;
  hasAudio: boolean;
  size: number;
  /** 该片段的剪切区间（秒） */
  trim: { start: number; end: number };
  effects?: VideoClipEffects;
  /** 复制的区间独立编辑源时间轴，避免同源副本与原片互相限制剪切位置。 */
  sourceGroup?: string;
};

/** 交给主进程处理的片段输入（与 VideoClipInput 结构一致，避免 UI 类型泄漏到 IPC 层） */
export type ClipInput = VideoClipInput;

export function createClipId(): string {
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
