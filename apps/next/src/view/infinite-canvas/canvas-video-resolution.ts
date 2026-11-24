/** MiniMax 节点用面积预算计算宽高；像固定面积的画框，比例决定两边，最终遵守原32像素格。 */
import { isMinimaxWorkflow, DEFAULT_VIDEO_WORKFLOW_ID } from "@/data/videoForm";
import { clampVideoSide } from "@/utils/comfy/video-resolution";
import type { CanvasData } from "./canvas-model";

export const VIDEO_MEGAPIXELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;

export function isCanvasMinimax(data: CanvasData) {
  return data.kind === "video" && isMinimaxWorkflow(data.workflow ?? DEFAULT_VIDEO_WORKFLOW_ID);
}

/** 1024²沿用ComfyUI面积口径；两边分别取32倍数，显示和工作流使用同一最终值。 */
export function canvasMegapixelDimensions(ratio: string, megapixels: number) {
  const [width, height] = ratio.split(/[/:]/).map(Number);
  if (!VIDEO_MEGAPIXELS.some(value => value === megapixels) || !Number.isFinite(width / height) || width <= 0 || height <= 0) throw new Error("canvas-invalid-video-resolution");
  const scale = Math.sqrt(megapixels * 1024 * 1024 / (width * height));
  return { width: clampVideoSide(width * scale), height: clampVideoSide(height * scale) };
}

/** 比例和面积一起写入原事务，防止撤销只恢复标签而没有恢复工作流像素。 */
export function canvasMegapixelPatch(data: CanvasData, ratio: string, megapixels: NonNullable<CanvasData["videoMegapixels"]>): Partial<CanvasData> {
  if (!isCanvasMinimax(data)) throw new Error("canvas-invalid-video-resolution");
  return { ratio, videoMegapixels: megapixels, videoOutput: canvasMegapixelDimensions(ratio, megapixels) };
}
