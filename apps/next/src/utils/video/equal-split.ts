/** 等时长切分原始视频：按总时长直接计算边界，避免逐段累加导致误差。 */
import { normalizeOutputFileName } from "./outputPath";

export interface VideoSplitRange { start: number; end: number }

export function getMaxSplitParts(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1000, Math.floor(duration * (Number.isFinite(fps) && fps > 0 ? fps : 25)));
}

export function buildEqualSplitRanges(duration: number, parts: number, fps: number): VideoSplitRange[] {
  if (!Number.isInteger(parts) || parts < 2 || parts > getMaxSplitParts(duration, fps)) return [];
  return Array.from({ length: parts }, (_, index) => ({
    start: duration * index / parts,
    end: index === parts - 1 ? duration : duration * (index + 1) / parts,
  }));
}

export function buildSplitFileName(name: string, index: number, parts: number): string {
  const base = name.replace(/\.[^.]+$/, "");
  const number = String(index + 1).padStart(Math.max(2, String(parts).length), "0");
  return normalizeOutputFileName(`${base}_part_${number}_of_${parts}.mp4`, `video_part_${number}.mp4`, ".mp4");
}
