/**
 * 把扫描到的本地模型转成创建页的「模型 / LoRA」资源项。
 *
 * 怎么做：纯映射（版本列表、封面候选、默认选中）+ 资源 id 编解码
 * （`LOCAL_CHECKPOINT_PREFIX` / `makeLocalLoraId`…）。
 */
import type { ImageAsset } from "@/types/common";
import type { CreateExtension } from "@/types/extension";
import type { CreateModel, ModelSortMode, SelectedModel } from "@/types/model";
import type { LocalModel, LocalModelVersion } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import {
  getFirstLevelCategory,
  isNonDiffusionModelPath,
  resolveScanRootForType,
} from "@/utils/localModelCategory";

/** 图像工作流系列（与 imageWorkflow 的 ImageWorkflowSeries 一致，避免循环依赖此处用字面量） */
type ImageWorkflowSeriesLike = "anima" | "sdxl";

export const LOCAL_CHECKPOINT_PREFIX = "local-checkpoint:";
export const LOCAL_LORA_PREFIX = "local-lora:";

const DEFAULT_SERIES_TAG = "Illustrious" as const;

export function isLocalCheckpointId(id: string): boolean {
  return id.startsWith(LOCAL_CHECKPOINT_PREFIX);
}

export function isLocalLoraId(id: string): boolean {
  return id.startsWith(LOCAL_LORA_PREFIX);
}

export function makeLocalCheckpointId(folderPath: string): string {
  return `${LOCAL_CHECKPOINT_PREFIX}${folderPath}`;
}

export function makeLocalLoraId(filePath: string): string {
  return `${LOCAL_LORA_PREFIX}${filePath}`;
}

export function parseLocalCheckpointId(id: string): string | null {
  if (!isLocalCheckpointId(id)) return null;
  return id.slice(LOCAL_CHECKPOINT_PREFIX.length);
}

export function parseLocalLoraId(id: string): string | null {
  if (!isLocalLoraId(id)) return null;
  return id.slice(LOCAL_LORA_PREFIX.length);
}

export function filterLocalModelsByType(
  models: LocalModel[],
  type: LocalModel["type"]
): LocalModel[] {
  return models.filter((model) => model.type === type);
}

function findLocalModelByFolder(
  localModels: LocalModel[],
  folderPath: string
): LocalModel | undefined {
  return localModels.find((model) => model.filePath === folderPath);
}

function findLocalModelByFile(
  localModels: LocalModel[],
  filePath: string
): { model: LocalModel; version: LocalModelVersion } | undefined {
  for (const model of localModels) {
    const version = (model.versions ?? []).find(
      (item) => item.filePath === filePath
    );
    if (version) {
      return { model, version };
    }
  }
  return undefined;
}

export function localCheckpointToCreateModel(
  model: LocalModel,
  scanRoot = ""
): CreateModel {
  const cover = model.iconPath ?? "";
  return {
    id: makeLocalCheckpointId(model.filePath),
    name: model.name,
    seriesTag: DEFAULT_SERIES_TAG,
    cover,
    isLocal: true,
    filePath: model.filePath,
    category: getFirstLevelCategory(scanRoot, model.filePath),
    versions: (model.versions ?? []).map((version) => ({
      id: version.filePath,
      label: version.name,
      cover,
    })),
  };
}

export function localLoraToCreateExtension(
  model: LocalModel,
  scanRoot = ""
): CreateExtension {
  const cover = model.iconPath ?? "";
  const primaryVersion = model.versions?.[0];
  return {
    id: makeLocalLoraId(model.filePath),
    name: model.name,
    seriesTag: DEFAULT_SERIES_TAG,
    cover,
    versionLabel: primaryVersion?.name ?? "",
    isLocal: true,
    filePath: model.filePath,
    category: getFirstLevelCategory(scanRoot, model.filePath),
    versions: (model.versions ?? []).map((version) => ({
      id: makeLocalLoraId(version.filePath),
      label: version.name,
    })),
  };
}

export function buildCreateModelsFromLocal(
  localModels: LocalModel[],
  paths?: SettingsPaths
): CreateModel[] {
  const scanRoot = paths
    ? resolveScanRootForType(paths, "checkpoint")
    : "";
  return filterLocalModelsByType(localModels, "checkpoint").map((model) =>
    localCheckpointToCreateModel(model, scanRoot)
  );
}

export function buildCreateExtensionsFromLocal(
  localModels: LocalModel[],
  paths?: SettingsPaths
): CreateExtension[] {
  const scanRoot = paths ? resolveScanRootForType(paths, "lora") : "";
  return filterLocalModelsByType(localModels, "lora").map((model) =>
    localLoraToCreateExtension(model, scanRoot)
  );
}

export function filterAndSortLocalCreateModels(
  models: CreateModel[],
  query: string,
  sortMode: ModelSortMode,
  category: string | null = null
): CreateModel[] {
  const normalized = query.trim().toLowerCase();
  let result = models.filter((model) => {
    if (category && model.category !== category) return false;
    if (!normalized) return true;
    return (
      model.name.toLowerCase().includes(normalized) ||
      (model.category?.toLowerCase().includes(normalized) ?? false)
    );
  });

  if (sortMode === "az") {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  return result;
}

export function filterAndSortLocalCreateExtensions(
  extensions: CreateExtension[],
  query: string,
  category: string | null = null
): CreateExtension[] {
  const normalized = query.trim().toLowerCase();
  return extensions
    .filter((extension) => {
      if (category && extension.category !== category) return false;
      if (!normalized) return true;
      return (
        extension.name.toLowerCase().includes(normalized) ||
        (extension.category?.toLowerCase().includes(normalized) ?? false)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function getLocalCheckpointDisplay(
  localModels: LocalModel[],
  folderPath: string,
  versionFilePath?: string
): {
  name: string;
  versionLabel: string;
  cover: ImageAsset | string;
} | null {
  const model = findLocalModelByFolder(localModels, folderPath);
  if (!model) return null;

  const version =
    model.versions?.find((item) => item.filePath === versionFilePath) ??
    model.versions?.[0];
  if (!version) return null;

  return {
    name: model.name,
    versionLabel: version.name,
    cover: model.iconPath ?? "",
  };
}

export function getLocalLoraDisplay(
  localModels: LocalModel[],
  filePath: string
): {
  name: string;
  versionLabel: string;
  cover: ImageAsset | string;
} | null {
  const match = findLocalModelByFile(localModels, filePath);
  if (!match) return null;

  return {
    name: match.model.name,
    versionLabel: match.version.name,
    cover: match.model.iconPath ?? "",
  };
}

/**
 * 自动选中一个可用的本地模型（按系列限定来源）：
 * - anima → 只认 `diffusion_models` 下的模型
 * - sdxl → 只认 `checkpoints`/`checkpoint` 下的模型
 * 并排除 upscale_models / vae / clip 等非扩散模型目录，避免把 ESRGAN 之类
 * 的放大模型塞进 UNETLoader.unet_name（ComfyUI 会报 value_not_in_list）。
 */
export function getDefaultLocalSelectedModel(
  localModels: LocalModel[],
  series: ImageWorkflowSeriesLike = "anima"
): SelectedModel | null {
  const candidates = filterLocalModelsByType(localModels, "checkpoint").filter(
    (model) => !isNonDiffusionModelPath(model.filePath)
  );

  const scoped = candidates.filter((model) => {
    const path = model.filePath.replace(/\\/g, "/").toLowerCase();
    return series === "anima"
      ? path.includes("/diffusion_models/")
      : /\/checkpoints?\//.test(path);
  });

  const pool = scoped.length > 0 ? scoped : [];
  const first = pool[0];
  const firstVersion = first?.versions?.[0];
  if (!first || !firstVersion) return null;

  return {
    modelId: makeLocalCheckpointId(first.filePath),
    versionId: firstVersion.filePath,
  };
}
