/**
 * 判断一张图/一个工作流是「文生图 / 图生图 / 视频」（卡片角标用）。
 *
 * 怎么做：从 ComfyUI API prompt 的节点类型推断（`detectGenerationKindFromWorkflow`），
 * 再映射到词条 key 交给渲染侧翻译。
 */
import type { ComfyApiPrompt } from "@/types/comfy";
import type { GenerationKind } from "@/types/generatedImageMeta";
import type { MessageKey } from "@/i18n";

/**
 * 标签存的是**词条 key**（如 `"errors.generationKind.text2imgShort"`），
 * 与 `data/navigation.ts` 的 `LocalizedNavItem` 一致：渲染时用 `t(label)` 取文案，
 * 因此这里不放中文，切换语言时不需要改本文件。
 */
export const GENERATION_KIND_LABELS: Record<
  GenerationKind,
  { short: MessageKey; description: MessageKey }
> = {
  text2img: {
    short: "errors.generationKind.text2imgShort",
    description: "errors.generationKind.text2imgDescription",
  },
  img2img: {
    short: "errors.generationKind.img2imgShort",
    description: "errors.generationKind.img2imgDescription",
  },
};

export function detectGenerationKindFromWorkflow(
  workflow: ComfyApiPrompt | undefined
): GenerationKind {
  if (!workflow) return "text2img";

  const hasLoadImage = Object.values(workflow).some(
    (node) => node.class_type === "LoadImage"
  );
  const hasVaeEncode = Object.values(workflow).some(
    (node) =>
      node.class_type === "VAEEncode" ||
      node.class_type === "VAEEncodeForInpaint"
  );

  return hasLoadImage || hasVaeEncode ? "img2img" : "text2img";
}

export function resolveGenerationKind(input: {
  generationKind?: GenerationKind;
  sourceImagePath?: string | null;
  workflow?: ComfyApiPrompt;
}): GenerationKind {
  if (input.generationKind) return input.generationKind;
  if (input.sourceImagePath) return "img2img";
  return detectGenerationKindFromWorkflow(input.workflow);
}
