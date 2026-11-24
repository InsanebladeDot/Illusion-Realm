/** 视频超分的本地分批会话；只允许固定操作，不接受 FFmpeg 命令或任意删除目录。 */
import { z } from "zod";

const requestId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const localPath = z.string().min(1).max(4096).refine(value => value.trim().length > 0 && !value.includes("\0") && /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value));
export const VideoUpscaleRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), requestId, inputPath: localPath, fps: z.number().int().min(1).max(120) }).strict(),
  z.object({ action: z.literal("merge"), requestId, paths: z.array(localPath).min(1).max(10000), outputPath: localPath }).strict(),
  z.object({ action: z.literal("cancel"), requestId }).strict(),
  z.object({ action: z.literal("release"), requestId }).strict(),
]);
export type VideoUpscaleRequest = z.infer<typeof VideoUpscaleRequestSchema>;

/** 工作流读取同一完整原视频；开始秒数对应互不重叠的批帧范围，尾批保留余数。 */
export interface VideoUpscaleBatch { startTime: number; startFrame: number; frames: number }
export interface VideoUpscalePrepared {
  directory: string;
  batches: VideoUpscaleBatch[];
  totalFrames: number;
  fps: number;
  sourceFps: number;
  sourceRate: string;
  duration: number;
}
export interface VideoUpscaleResult {
  prepared?: VideoUpscalePrepared;
  savedPath?: string;
}
