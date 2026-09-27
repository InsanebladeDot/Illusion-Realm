/**
 * 生成图片的「内嵌 Meta 文档」组装：版本号 + promptId + 参数 + 工作流。
 *
 * 怎么做：纯函数拼出 `GeneratedImageMetaDocument`（真正写进 PNG 是
 * `saveGeneratedImages` 那一步）；另外把内容哈希文件名还原成可读模型名
 * （`displayModelFileName`）。
 */
import type { ComfyApiPrompt } from "@/types/comfy";
import type {
  GeneratedImageMetaDocument,
  GenerationKind,
} from "@/types/generatedImageMeta";
import { GENERATED_IMAGE_META_VERSION } from "@/types/generatedImageMeta";
import {
  IMAGE_WORKFLOW_DEFAULTS,
  type ImageWorkflowParams,
} from "@/utils/comfy/imageWorkflow";
import { resolveGenerationKind } from "@/utils/generationKind";

export function buildGeneratedImageMeta(input: {
  promptId: string;
  params: ImageWorkflowParams;
  workflow: ComfyApiPrompt;
  imageIndex?: number;
  generationKind?: GenerationKind;
  sourceImagePath?: string | null;
}): GeneratedImageMetaDocument {
  const params = input.params;
  const generationKind = resolveGenerationKind({
    generationKind: input.generationKind,
    sourceImagePath: input.sourceImagePath,
    workflow: input.workflow,
  });

  return {
    version: GENERATED_IMAGE_META_VERSION,
    promptId: input.promptId,
    createdAt: new Date().toISOString(),
    imageIndex: input.imageIndex ?? 0,
    generationKind,
    sourceImagePath:
      generationKind === "img2img" ? input.sourceImagePath ?? null : null,
    params: {
      positivePrompt: params.positivePrompt ?? "",
      negativePrompt: params.negativePrompt ?? "",
      seed: params.seed ?? 0,
      steps: params.steps ?? IMAGE_WORKFLOW_DEFAULTS.steps,
      cfg: params.cfg ?? IMAGE_WORKFLOW_DEFAULTS.cfg,
      samplerName: params.samplerName ?? IMAGE_WORKFLOW_DEFAULTS.samplerName,
      scheduler: params.scheduler ?? IMAGE_WORKFLOW_DEFAULTS.scheduler,
      width: params.width ?? IMAGE_WORKFLOW_DEFAULTS.width,
      height: params.height ?? IMAGE_WORKFLOW_DEFAULTS.height,
      batchSize: params.batchSize ?? IMAGE_WORKFLOW_DEFAULTS.batchSize,
      checkpointName: params.checkpointName ?? "",
      loras: params.loras ?? [],
    },
    workflow: input.workflow,
  };
}

export function displayModelFileName(modelPath: string): string {
  const normalized = modelPath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? modelPath;
  return base.replace(/\.(safetensors|ckpt|pt|pth)$/i, "");
}
