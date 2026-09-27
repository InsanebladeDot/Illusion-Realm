import type { ImageAsset } from "@/types/common";
import amanatsuCover from "@/assets/icon/create/model.png";
import animaOfficialBaseCover from "@/assets/icon/create/models/anima-official-base.webp";
import animaPreview2Cover from "@/assets/icon/create/models/anima-preview2.webp";
import animaPreview3Cover from "@/assets/icon/create/models/anima-preview3.webp";
import arthemyComicsCover from "@/assets/icon/create/models/arthemy-comics.webp";
import arthemyToonsCover from "@/assets/icon/create/models/arthemy-toons.webp";
import cyberrealisticPonyCover from "@/assets/icon/create/models/cyberrealistic-pony.webp";
import dreamboxCover from "@/assets/icon/create/models/dreambox.webp";
import hassakuXlCover from "@/assets/icon/create/models/hassaku-xl.webp";
import hyphoriaCover from "@/assets/icon/create/models/hyphoria.webp";
import noobaiXlCover from "@/assets/icon/create/models/noobai-xl.webp";
import tPonynai3Cover from "@/assets/icon/create/models/t-ponynai3.webp";
import type { CreateModel, ModelCover, ModelSeriesTag, SelectedModel } from "@/types/model";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import {
  buildCreateModelsFromLocal,
  getLocalCheckpointDisplay,
  isLocalCheckpointId,
  parseLocalCheckpointId,
} from "@/utils/localModelResources";
import {
  collectLocalModelCategories,
  resolveScanRootForType,
} from "@/utils/localModelCategory";

export const ANIMA_VERSION_MODEL_ID = "anima-official";

export const CREATE_MODELS: CreateModel[] = [
  {
    id: "amanatsu",
    name: "Amanatsu",
    seriesTag: "Anima",
    cover: amanatsuCover,
    versions: [{ id: "amanatsu-v1", label: "v1.0", cover: amanatsuCover }],
  },
  {
    id: "arthemy-comics",
    name: "Arthemy Comics Illustrious",
    seriesTag: "Illustrious",
    cover: arthemyComicsCover,
    versions: [{ id: "arthemy-v8", label: "v8.0", cover: arthemyComicsCover }],
  },
  {
    id: "arthemy-toons",
    name: "Arthemy Toons Illustrious",
    seriesTag: "Illustrious",
    cover: arthemyToonsCover,
    versions: [{ id: "arthemy-toons-v4", label: "v4.0", cover: arthemyToonsCover }],
  },
  {
    id: ANIMA_VERSION_MODEL_ID,
    name: "Anima [Official]",
    seriesTag: "Anima",
    cover: animaOfficialBaseCover,
    versions: [
      { id: "anima-base-v10", label: "baseV10", cover: animaOfficialBaseCover },
      { id: "anima-preview3", label: "preview3-base", cover: animaPreview3Cover },
      { id: "anima-preview2", label: "preview2", cover: animaPreview2Cover },
    ],
  },
  {
    id: "cyberrealistic-pony",
    name: "CyberRealistic Pony",
    seriesTag: "Pony",
    cover: cyberrealisticPonyCover,
    versions: [
      { id: "cyberrealistic-v18", label: "v18.0 CoreShift", cover: cyberrealisticPonyCover },
      { id: "cyberrealistic-v17", label: "v17.0", cover: cyberrealisticPonyCover },
      { id: "cyberrealistic-v16", label: "v16.0", cover: cyberrealisticPonyCover },
    ],
  },
  {
    id: "dreambox",
    name: "DREAMBOX",
    seriesTag: "Illustrious",
    cover: dreamboxCover,
    versions: [
      { id: "dreambox-v45", label: "v4.5", cover: dreamboxCover },
      { id: "dreambox-v44", label: "v4.4", cover: dreamboxCover },
    ],
  },
  {
    id: "hassaku-xl",
    name: "Hassaku XL",
    seriesTag: "Illustrious",
    cover: hassakuXlCover,
    versions: [
      { id: "hassaku-v34", label: "v3.4", cover: hassakuXlCover },
      { id: "hassaku-v33", label: "v3.3", cover: hassakuXlCover },
      { id: "hassaku-v32", label: "v3.2", cover: hassakuXlCover },
      { id: "hassaku-v31", label: "v3.1", cover: hassakuXlCover },
    ],
  },
  {
    id: "hyphoria",
    name: "Hyphoria",
    seriesTag: "Illustrious",
    cover: hyphoriaCover,
    versions: [{ id: "hyphoria-v002", label: "v0.02", cover: hyphoriaCover }],
  },
  {
    id: "noobai-xl",
    name: "NoobAI-XL",
    seriesTag: "NoobAI",
    cover: noobaiXlCover,
    versions: [{ id: "noobai-v10", label: "v1.0 vpred", cover: noobaiXlCover }],
  },
  {
    id: "t-ponynai3",
    name: "T-ponynai3",
    seriesTag: "Pony",
    cover: tPonynai3Cover,
    versions: [
      { id: "t-ponynai-v7", label: "v7", cover: tPonynai3Cover },
      { id: "t-ponynai-v6", label: "v6", cover: tPonynai3Cover },
      { id: "t-ponynai-v5", label: "v5", cover: tPonynai3Cover },
    ],
  },
];

export const DEFAULT_SELECTED_MODEL: SelectedModel = {
  modelId: "amanatsu",
  versionId: "amanatsu-v1",
};

export const SERIES_TAG_CLASS: Record<ModelSeriesTag, string> = {
  Illustrious: "bg-cyan-400/80 text-white",
  Pony: "bg-pink-400/80 text-white",
  Anima: "bg-zinc-600/80 text-white",
  NoobAI: "bg-emerald-500/80 text-white",
  Local: "bg-zinc-700/80 text-white",
};

export function getModelById(
  id: string,
  localModels: LocalModel[] = []
): CreateModel | undefined {
  if (isLocalCheckpointId(id)) {
    return buildCreateModelsFromLocal(localModels).find((model) => model.id === id);
  }
  return CREATE_MODELS.find((model) => model.id === id);
}

export function getModelVersion(
  modelId: string,
  versionId: string,
  localModels: LocalModel[] = []
) {
  return getModelById(modelId, localModels)?.versions.find(
    (version) => version.id === versionId
  );
}

export function getSelectedModelDisplay(
  selected: SelectedModel,
  localModels: LocalModel[] = []
) {
  const localPath = parseLocalCheckpointId(selected.modelId);
  if (localPath) {
    const localDisplay = getLocalCheckpointDisplay(
      localModels,
      localPath,
      selected.versionId
    );
    if (localDisplay) {
      return localDisplay;
    }
  }

  const model = getModelById(selected.modelId, localModels);
  const version = getModelVersion(
    selected.modelId,
    selected.versionId,
    localModels
  );
  if (!model || !version) {
    return {
      name: "Amanatsu (Anima)",
      versionLabel: "v1.0",
      cover: amanatsuCover,
    };
  }

  const suffix = model.seriesTag === "Anima" ? " (Anima)" : "";
  return {
    name: `${model.name}${suffix}`,
    versionLabel: version.label,
    cover: version.cover,
  };
}

export function filterAndSortModels(
  query: string,
  sortMode: "az" | "newest",
  localModels: LocalModel[] = [],
  paths?: SettingsPaths,
  category: string | null = null
): CreateModel[] {
  const source = buildCreateModelsFromLocal(localModels, paths);

  const normalized = query.trim().toLowerCase();
  let result = source.filter((model) => {
    if (category && model.category !== category) return false;
    if (!normalized) return true;
    return (
      model.name.toLowerCase().includes(normalized) ||
      model.seriesTag.toLowerCase().includes(normalized) ||
      (model.category?.toLowerCase().includes(normalized) ?? false)
    );
  });

  if (sortMode === "az") {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }

  return result;
}

export function getLocalCheckpointCategories(
  localModels: LocalModel[],
  paths?: SettingsPaths
): string[] {
  const scanRoot = paths
    ? resolveScanRootForType(paths, "checkpoint")
    : "";
  return collectLocalModelCategories(
    localModels.filter((model) => model.type === "checkpoint"),
    scanRoot
  );
}

export function getAnimaVersionOptions() {
  const amanatsu = getModelById("amanatsu");
  const official = getModelById(ANIMA_VERSION_MODEL_ID);
  const options: Array<{
    modelId: string;
    versionId: string;
    name: string;
    label: string;
    cover: ModelCover;
  }> = [];

  if (amanatsu?.versions[0]) {
    options.push({
      modelId: amanatsu.id,
      versionId: amanatsu.versions[0].id,
      name: "Amanatsu (Anima)",
      label: amanatsu.versions[0].label,
      cover: amanatsu.versions[0].cover,
    });
  }

  official?.versions.forEach((version) => {
    options.push({
      modelId: official.id,
      versionId: version.id,
      name: official.name,
      label: version.label,
      cover: version.cover,
    });
  });

  return options;
}
