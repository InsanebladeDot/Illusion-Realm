/** 复用原节点工厂和输入约束；工程内素材直接引用，不复制到第二个目录。 */
import type { XYPosition } from "@xyflow/react";
import { t } from "@/i18n";
import type { useCanvasEditor } from "./use-canvas-editor";
import { canvasImageInputs, canvasInputRule } from "./canvas-input-rules";
import { createMediaNode, type CanvasMedia } from "./canvas-media-import";

export interface ExistingMediaTarget { id: string; kind: CanvasMedia["kind"]; reference?: boolean }

export function applyExistingCanvasMedia(editor: ReturnType<typeof useCanvasEditor>, media: CanvasMedia, position: XYPosition, target?: ExistingMediaTarget) {
  const node = editor.nodes.find(node => node.id === target?.id);
  if (target && media.kind !== target.kind) throw Error("canvas-invalid-media");
  if (node?.data.kind === "audio" && target?.reference) {
    editor.updateNodeData(node.id, { audioParameters: { ...node.data.audioParameters, reference: media } });
  } else if (node && target?.reference) {
    const count = (node.data.inputImages?.length ?? 0) + canvasImageInputs(node.id, editor).length;
    if (count >= (canvasInputRule(node.data)?.max ?? 0)) throw Error(t("canvas.imageInputOverflow"));
    editor.updateNodeData(node.id, { inputImages: [...(node.data.inputImages ?? []), media] });
  } else if (node) editor.updateNodeData(node.id, { media });
  else editor.importMedia([createMediaNode(media, position, 0)]);
}
