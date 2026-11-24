/** Moss 转译附带真实画幅，复用构图编辑器的 JSON 校验后才回填。 */
import { t } from "@/i18n";
import { parseMossComposition } from "@/view/create/moss-composition/composition-json";
import type { CompositionSize } from "@/view/create/moss-composition/composition-draft";

export function mossCompositionInstruction(instruction: string, { width, height }: CompositionSize): string {
  return `${instruction}\n\nCurrent workflow output size: W=${width} pixels, H=${height} pixels. Use these dimensions for all bounding boxes, even if the scene text mentions a different size.`;
}

/** 新生成的 JSON 必须有场景和区域描述；旧编辑器手写的空描述仍能打开修改。 */
export function validateMossComposition(text: string, size: CompositionSize): string {
  const result = parseMossComposition(text, size);
  if (!result?.summary.caption.trim() || !result.items.length || result.items.some(item => !item.caption.trim())) {
    throw new Error(t("create.promptAssistant.mossCompositionJsonInvalid"));
  }
  return JSON.stringify(result);
}
