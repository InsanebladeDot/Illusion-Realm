/**
 * 把内嵌 Meta 还原成创建页表单（二创的「应用到表单」）。
 *
 * 怎么做：采样器 / 调度器归一到 UI 支持的取值、宽高比取最近预设、
 * 其余字段做兜底，产出表单补丁 + 给用户看的提示文案。
 */
import {
  DEFAULT_SAMPLER,
  DEFAULT_SCHEDULER,
  SCHEDULERS,
} from "@/data/createForm";
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";
import type { AspectRatioLabel } from "@/types/createForm";
import type { SelectedExtension } from "@/types/extension";
import type { GeneratedImageMetaDocument } from "@/types/generatedImageMeta";
import type { SelectedModel } from "@/types/model";
import type { LocalModel } from "@/types/localModel";
import { SAMPLERS } from "@/data/createForm";
import {
  filterLocalModelsByType,
  makeLocalCheckpointId,
  makeLocalLoraId,
} from "@/utils/localModelResources";
import { clampExtensionWeight } from "@/utils/extensionWeight";
import { clampSeed } from "@/utils/seed";

export type RemixApplyInput = {
  meta: GeneratedImageMetaDocument;
  localModels: LocalModel[];
};

/** 二创仅回填文生图参数到图片创作表单，暂不支持图生图。 */
export type RemixApplyResult = {
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  /** 调度器（任务规范 2.2；旧元数据缺失时回退默认值） */
  scheduler: string;
  aspectRatio: AspectRatioLabel;
  selectedModel: SelectedModel | null;
  selectedExtensions: SelectedExtension[];
  unmatchedCheckpoint: string;
  unmatchedLoras: string[];
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split("/").pop() ?? normalized;
}

function matchCheckpoint(
  checkpointName: string,
  localModels: LocalModel[]
): SelectedModel | null {
  if (!checkpointName) return null;

  const target = normalizePath(checkpointName);
  const targetBase = basename(checkpointName);

  for (const model of filterLocalModelsByType(localModels, "checkpoint")) {
    for (const version of model.versions ?? []) {
      const versionPath = normalizePath(version.filePath);
      if (
        versionPath === target ||
        versionPath.endsWith(`/${target}`) ||
        basename(version.filePath) === targetBase
      ) {
        return {
          modelId: makeLocalCheckpointId(model.filePath),
          versionId: version.filePath,
        };
      }
    }
  }

  return null;
}

function matchLora(
  loraName: string,
  localModels: LocalModel[]
): string | null {
  const target = normalizePath(loraName);
  const targetBase = basename(loraName);

  for (const model of filterLocalModelsByType(localModels, "lora")) {
    for (const version of model.versions ?? []) {
      const versionPath = normalizePath(version.filePath);
      if (
        versionPath === target ||
        versionPath.endsWith(`/${target}`) ||
        basename(version.filePath) === targetBase
      ) {
        return makeLocalLoraId(version.filePath);
      }
    }
  }

  return null;
}

export function closestAspectRatio(
  width: number,
  height: number
): AspectRatioLabel {
  const fallback: AspectRatioLabel = "2:3";
  if (!width || !height) return fallback;

  const ratio = width / height;
  let best: AspectRatioLabel = fallback;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const preset of IMAGE_SIZE_PRESETS) {
    const diff = Math.abs(ratio - preset.width / preset.height);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset.id;
    }
  }

  return best;
}

export function normalizeSamplerForUi(samplerName: string): string {
  const normalized = samplerName.trim().toLowerCase().replace(/\s+/g, "_");
  const exact = SAMPLERS.find((option) => option.value === normalized);
  if (exact) return exact.value;

  const fuzzy = SAMPLERS.find(
    (option) =>
      option.value.includes(normalized) || normalized.includes(option.value)
  );
  return fuzzy?.value ?? DEFAULT_SAMPLER;
}

/** 调度器回填（任务规范 2.2）：不在列表中的值回退默认调度器 */
export function normalizeSchedulerForUi(scheduler: string | undefined): string {
  const normalized = (scheduler ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const exact = SCHEDULERS.find((option) => option.value === normalized);
  return exact?.value ?? DEFAULT_SCHEDULER;
}

export function buildRemixApplyResult(
  input: RemixApplyInput
): RemixApplyResult {
  const { meta, localModels } = input;
  const params = meta.params;

  const selectedModel = matchCheckpoint(params.checkpointName, localModels);
  const unmatchedLoras: string[] = [];
  const selectedExtensions: SelectedExtension[] = [];

  for (const lora of params.loras) {
    const extensionId = matchLora(lora.name, localModels);
    if (extensionId) {
      selectedExtensions.push({
        extensionId,
        weight: clampExtensionWeight(lora.strength),
      });
    } else {
      unmatchedLoras.push(lora.name);
    }
  }

  return {
    positivePrompt: params.positivePrompt,
    negativePrompt: params.negativePrompt,
    seed: clampSeed(params.seed),
    steps: params.steps,
    cfg: params.cfg,
    sampler: normalizeSamplerForUi(params.samplerName),
    scheduler: normalizeSchedulerForUi(params.scheduler),
    aspectRatio: closestAspectRatio(params.width, params.height),
    selectedModel,
    selectedExtensions,
    unmatchedCheckpoint: selectedModel ? "" : params.checkpointName,
    unmatchedLoras,
  };
}
