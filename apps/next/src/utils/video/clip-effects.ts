/** 区间效果与编辑操作的纯函数：统一默认值，拆分保留效果，粘贴产生独立的素材实例。 */
import type { ClipItem } from "@/components/videoEdit/types";
import { createClipId } from "@/components/videoEdit/types";
import type { VideoClipEffects } from "@/types/electron-api";

export function getClipEffects(clip: Pick<ClipItem, "effects"> | null): Required<VideoClipEffects> {
  return { speed: 1, volume: 1, muted: false, reverse: false, ...clip?.effects };
}

export function sameSourceGroup(a: ClipItem, b: ClipItem): boolean {
  return a.path === b.path && a.sourceGroup === b.sourceGroup;
}

export function getClipOutputDuration(clip: ClipItem): number {
  return Math.max(0, clip.trim.end - clip.trim.start) / getClipEffects(clip).speed;
}

export function canSplitClip(clip: ClipItem, time: number): boolean {
  const frame = 1 / Math.max(1, clip.fps);
  return time - clip.trim.start >= frame - 0.000001 && clip.trim.end - time >= frame - 0.000001;
}

export function splitClipAt(clip: ClipItem, time: number): ClipItem[] {
  if (!canSplitClip(clip, time)) return [clip];
  const before = { ...clip, trim: { start: clip.trim.start, end: time } };
  const after = { ...clip, id: createClipId(), trim: { start: time, end: clip.trim.end } };
  // 倒放时源时间轴后半段先播放，拆分后仍保持原先的输出画面顺序。
  return getClipEffects(clip).reverse ? [after, before] : [before, after];
}

export function copyClip(clip: ClipItem): ClipItem {
  return { ...clip, trim: { ...clip.trim }, effects: { ...clip.effects } };
}

export function pasteClip(clip: ClipItem): ClipItem {
  const id = createClipId();
  return { ...copyClip(clip), id, sourceGroup: id };
}
