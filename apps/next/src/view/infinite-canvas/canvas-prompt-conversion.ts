/** MiniMax 默认转换；其他工作流在用户确认自定义前缀后使用同一规则，不改变上传顺序。 */
import { isCanvasMinimax } from "./canvas-video-resolution";
import { canvasImageInputs, canvasIsTextToImage } from "./canvas-input-rules";
import { canvasReferenceMedia } from "./canvas-reference-media";
import { normalizeVideoReferences } from "@/utils/comfy/video-reference-media";
import type { CanvasData, CanvasDocument, CanvasNode } from "./canvas-model";

export function usesMinimaxPrompt(data: CanvasData) {
  return data.kind === "audio" || isCanvasMinimax(data) || data.kind === "image" && !data.remoteImage && data.workflow === "minimax-image-edit";
}
export function canvasPromptReferencesEnabled(data: CanvasData) {
  return !canvasIsTextToImage(data) && data.promptConversion !== false && (usesMinimaxPrompt(data) || data.promptReferenceLabels !== undefined);
}

/** 普通模型只转换本次请求快照，原稿仍保留 @；MiniMax 继续在原构建器里校验和转换。 */
export function canvasCustomPromptNode(node: CanvasNode, document: Pick<CanvasDocument, "nodes" | "edges">): CanvasNode {
  if (!canvasPromptReferencesEnabled(node.data) || usesMinimaxPrompt(node.data)) return node;
  const media = canvasReferenceMedia(canvasImageInputs(node.id, document), node.data.inputImages);
  const prompt = normalizeVideoReferences(node.data.prompt, media, node.data.promptReferenceLabels);
  return { ...node, data: { ...node.data, prompt } };
}
