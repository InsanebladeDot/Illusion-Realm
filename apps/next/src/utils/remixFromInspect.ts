/**
 * 把「本地解析」的结果转成「二创」要用的 Meta / 表单数据。
 *
 * 怎么做：先校验内嵌 Meta 的版本（版本高于当前只提示、不二创），
 * 再从解析出的字段重建 Meta 文档或表单补丁 —— 纯函数为主。
 */
import { t } from "@/i18n";
import type { ComfyApiPrompt } from "@/types/comfy";
import type { GeneratedImageMetaDocument } from "@/types/generatedImageMeta";
import { GENERATED_IMAGE_META_VERSION } from "@/types/generatedImageMeta";
import { IMAGE_WORKFLOW_DEFAULTS } from "@/utils/comfy/imageWorkflow";
import {
  parseComfyWorkflow,
  resolveComfyWorkflowFromInspect,
} from "@/utils/sdImageInspector/parseComfyWorkflow";
import { displayModelFileName } from "@/utils/buildGeneratedImageMeta";
import { META_FIELD_ID } from "@/utils/sdImageInspector/metaFieldId";
import {
  isMetaVersionSupported,
  LEGACY_META_VERSION,
} from "@/utils/sdImageInspector/metaMarker";
import {
  buildRemixApplyResult,
  type RemixApplyResult,
} from "@/utils/remixFromMeta";
import type { LocalModel } from "@/types/localModel";
import type { SdImageInspectResult } from "@/types/sdImageMeta";

const SAMPLER_CLASS_TYPES = new Set([
  "KSampler",
  "KSamplerAdvanced",
  "SamplerCustom",
]);
const LORA_CLASS_TYPES = new Set(["LoraLoader", "LoraLoaderModelOnly"]);
const CHECKPOINT_CLASS_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isGeneratedImageMetaDocument(
  value: unknown
): value is GeneratedImageMetaDocument {
  if (!value || typeof value !== "object") return false;
  const record = value as GeneratedImageMetaDocument;
  return record.params != null && typeof record.params === "object";
}

function extractGenerationParamsFromWorkflow(workflow: ComfyApiPrompt) {
  let seed = 0;
  let steps = IMAGE_WORKFLOW_DEFAULTS.steps;
  let cfg = IMAGE_WORKFLOW_DEFAULTS.cfg;
  let samplerName = IMAGE_WORKFLOW_DEFAULTS.samplerName;
  let scheduler = IMAGE_WORKFLOW_DEFAULTS.scheduler;
  let width = IMAGE_WORKFLOW_DEFAULTS.width;
  let height = IMAGE_WORKFLOW_DEFAULTS.height;
  let batchSize = IMAGE_WORKFLOW_DEFAULTS.batchSize;

  for (const node of Object.values(workflow)) {
    if (SAMPLER_CLASS_TYPES.has(node.class_type)) {
      seed = asNumber(node.inputs.seed) ?? seed;
      steps = asNumber(node.inputs.steps) ?? steps;
      cfg = asNumber(node.inputs.cfg) ?? cfg;
      samplerName = asString(node.inputs.sampler_name) ?? samplerName;
      scheduler = asString(node.inputs.scheduler) ?? scheduler;
    }
    if (node.class_type === "EmptyLatentImage") {
      width = asNumber(node.inputs.width) ?? width;
      height = asNumber(node.inputs.height) ?? height;
      batchSize = asNumber(node.inputs.batch_size) ?? batchSize;
    }
  }

  return { seed, steps, cfg, samplerName, scheduler, width, height, batchSize };
}

function orderLorasInChain(
  workflow: ComfyApiPrompt
): Array<{ name: string; strength: number }> {
  let currentRef: unknown = null;

  for (const node of Object.values(workflow)) {
    if (SAMPLER_CLASS_TYPES.has(node.class_type)) {
      currentRef = node.inputs.model;
      break;
    }
  }

  const chain: Array<{ name: string; strength: number }> = [];

  while (Array.isArray(currentRef) && currentRef.length >= 1) {
    const nodeId = String(currentRef[0]);
    const node = workflow[nodeId];
    if (!node) break;

    if (LORA_CLASS_TYPES.has(node.class_type)) {
      const rawName = asString(node.inputs.lora_name);
      if (rawName) {
        chain.unshift({
          name: rawName,
          strength: asNumber(node.inputs.strength_model) ?? 1,
        });
      }
      currentRef = node.inputs.model;
      continue;
    }

    if (CHECKPOINT_CLASS_TYPES.has(node.class_type)) {
      break;
    }

    break;
  }

  return chain;
}

function parseA1111GenerationParams(text: string) {
  const seedMatch = text.match(/Seed:\s*(-?\d+)/i);
  const stepsMatch = text.match(/Steps:\s*(\d+)/i);
  const cfgMatch = text.match(/CFG(?:\s*scale)?:\s*([\d.]+)/i);
  const samplerMatch = text.match(/Sampler:\s*([^,\n]+)/i);
  const sizeMatch = text.match(/Size:\s*(\d+)\s*x\s*(\d+)/i);

  return {
    seed: seedMatch ? Number(seedMatch[1]) : 0,
    steps: stepsMatch ? Number(stepsMatch[1]) : IMAGE_WORKFLOW_DEFAULTS.steps,
    cfg: cfgMatch ? Number(cfgMatch[1]) : IMAGE_WORKFLOW_DEFAULTS.cfg,
    samplerName:
      samplerMatch?.[1]?.trim() ?? IMAGE_WORKFLOW_DEFAULTS.samplerName,
    scheduler: IMAGE_WORKFLOW_DEFAULTS.scheduler,
    width: sizeMatch ? Number(sizeMatch[1]) : IMAGE_WORKFLOW_DEFAULTS.width,
    height: sizeMatch ? Number(sizeMatch[2]) : IMAGE_WORKFLOW_DEFAULTS.height,
    batchSize: IMAGE_WORKFLOW_DEFAULTS.batchSize,
  };
}

function buildMetaFromA1111Inspect(
  embeddedMeta: SdImageInspectResult
): GeneratedImageMetaDocument | null {
  const positivePrompt =
    embeddedMeta.fields.find((field) => field.key === META_FIELD_ID.prompt)?.value ??
    "";
  const negativeField = embeddedMeta.fields.find(
    (field) => field.key === META_FIELD_ID.negativePrompt
  )?.value;
  /**
   * 「无」是 `inspectSdImage` 在解析不到反向提示词时写入的占位值。
   * 两边都取同一条词条，避免把**可翻译文案**当成跨模块哨兵常量
   * （硬编码中文在这里会在切换语言后失配）。
   */
  const negativePrompt =
    negativeField && negativeField !== t("inspect.sdImage.noNegativePrompt")
      ? negativeField
      : "";
  const paramsText =
    embeddedMeta.fields.find((field) => field.key === META_FIELD_ID.otherParams)
      ?.value ??
    embeddedMeta.rawParameters ??
    "";

  if (!positivePrompt && !paramsText) return null;

  const generation = parseA1111GenerationParams(paramsText);

  return {
    version: GENERATED_IMAGE_META_VERSION,
    promptId: "inspect-a1111",
    createdAt: new Date().toISOString(),
    imageIndex: 0,
    generationKind: "text2img",
    params: {
      positivePrompt,
      negativePrompt,
      seed: generation.seed,
      steps: generation.steps,
      cfg: generation.cfg,
      samplerName: generation.samplerName,
      scheduler: generation.scheduler,
      width: generation.width,
      height: generation.height,
      batchSize: generation.batchSize,
      checkpointName: "",
      loras: [],
    },
    workflow: {},
  };
}

/**
 * 从图片内嵌的工作流构造二创数据：
 * 所有参数（正面 / 反向提示词、模型、LoRA 链、采样参数、尺寸）都来自图片 Meta，
 * 不再读取任何旁车 JSON。
 */
function buildMetaFromParsedWorkflow(
  workflow: ComfyApiPrompt
): GeneratedImageMetaDocument {
  const parsed = parseComfyWorkflow(workflow);
  const generation = extractGenerationParamsFromWorkflow(workflow);
  const loras = orderLorasInChain(workflow);

  return {
    version: GENERATED_IMAGE_META_VERSION,
    promptId: "embedded-comfy",
    createdAt: new Date().toISOString(),
    imageIndex: 0,
    generationKind: "text2img",
    params: {
      positivePrompt: parsed.positivePrompt ?? "",
      negativePrompt: parsed.negativePrompt ?? "",
      seed: generation.seed,
      steps: generation.steps,
      cfg: generation.cfg,
      samplerName: generation.samplerName,
      scheduler: generation.scheduler,
      width: generation.width,
      height: generation.height,
      batchSize: generation.batchSize,
      checkpointName: parsed.checkpointRaw ?? "",
      loras:
        loras.length > 0
          ? loras
          : parsed.loras.map((lora) => ({
              name: lora.rawName,
              strength: lora.strengthModel ?? 1,
            })),
    },
    workflow,
  };
}

export function buildRemixMetaFromImageInspect(
  embeddedMeta: SdImageInspectResult
): GeneratedImageMetaDocument | null {
  /**
   * 版本闸门：比当前应用更新的图不做二创 —— 结构可能已变，
   * 硬解析出的参数会是错的，宁可不给。没有标记的图按 v1 放行（见 metaMarker.ts）。
   */
  if (!isMetaVersionSupported(embeddedMeta.metaVersion ?? LEGACY_META_VERSION)) {
    return null;
  }

  const resolved = resolveComfyWorkflowFromInspect({
    fields: embeddedMeta.fields,
  });
  if (resolved) {
    return buildMetaFromParsedWorkflow(resolved.workflow);
  }

  if (embeddedMeta.metaType === "SD-WEBUI") {
    return buildMetaFromA1111Inspect(embeddedMeta);
  }

  return null;
}

/**
 * 这张图是不是「由更新版本的应用生成、当前版本读不了」。
 * 与「非本生成器生成」是两回事：前者应该提示用户升级，后者说明参数解析不到。
 */
export function isMetaVersionTooNew(
  embeddedMeta?: SdImageInspectResult | null
): boolean {
  if (!embeddedMeta) return false;
  return !isMetaVersionSupported(embeddedMeta.metaVersion ?? LEGACY_META_VERSION);
}

export function buildRemixMetaFromInspect(input: {
  embeddedMeta?: SdImageInspectResult | null;
}): GeneratedImageMetaDocument | null {
  if (!input.embeddedMeta) return null;
  return buildRemixMetaFromImageInspect(input.embeddedMeta);
}

export function canRemixFromInspect(input: {
  embeddedMeta?: SdImageInspectResult | null;
}): boolean {
  return buildRemixMetaFromInspect(input) != null;
}

export function buildRemixApplyResultFromInspect(input: {
  embeddedMeta?: SdImageInspectResult | null;
  localModels: LocalModel[];
}): RemixApplyResult | null {
  const meta = input.embeddedMeta
    ? buildRemixMetaFromImageInspect(input.embeddedMeta)
    : null;
  if (!meta) return null;

  return buildRemixApplyResult({
    meta,
    localModels: input.localModels,
  });
}

export function formatRemixWarnings(result: RemixApplyResult): string[] {
  const warnings: string[] = [];
  if (result.unmatchedCheckpoint) {
    warnings.push(
      t("inspect.errors.modelNotFound", {
        name: displayModelFileName(result.unmatchedCheckpoint),
      })
    );
  }
  if (result.unmatchedLoras.length > 0) {
    warnings.push(
      t("inspect.errors.lorasNotFound", {
        count: result.unmatchedLoras.length,
      })
    );
  }
  return warnings;
}
