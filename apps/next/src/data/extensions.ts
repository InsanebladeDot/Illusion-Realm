import coverAnimeInReal from "@/assets/icon/create/extensions/anime-in-real.webp";
import coverHyperrealistic from "@/assets/icon/create/extensions/hyperrealistic.webp";
import coverIllustriousStylePack from "@/assets/icon/create/extensions/illustrious-style-pack.webp";
import type { CreateExtension, ExtensionCover, ExtensionSeriesTag } from "@/types/extension";
import type { LocalModel } from "@/types/localModel";
import type { SettingsPaths } from "@/types/settings";
import { t } from "@/i18n";
import {
  buildCreateExtensionsFromLocal,
  getLocalLoraDisplay,
  isLocalLoraId,
  parseLocalLoraId,
  type LocalResourceSeries,
} from "@/utils/localModelResources";

export const EXTENSION_TAG_CLASS: Record<ExtensionSeriesTag, string> = {
  "SDXL 1.0": "bg-blue-400/80 text-white",
  Pony: "bg-pink-400/80 text-white",
  Illustrious: "bg-cyan-400/80 text-white",
  Local: "bg-zinc-700/80 text-white",
};

export const CREATE_EXTENSIONS: CreateExtension[] = [
  {
    id: "anime-in-real",
    name: "Anime in real",
    seriesTag: "Illustrious",
    cover: coverAnimeInReal,
    versionLabel: "V1",
  },
  {
    id: "illustrious-style-pack",
    name: "Illustrious Style Pack",
    seriesTag: "Illustrious",
    cover: coverIllustriousStylePack,
    versionLabel: "MSS v2",
  },
  {
    id: "hyperrealistic",
    name: "Hyperrealistic [Pony | Illustrious]",
    seriesTag: "Illustrious",
    cover: coverHyperrealistic,
    versionLabel: "v4.0 - Illustrious",
  },
];

export function filterAndSortExtensions(
  query: string,
  localModels: LocalModel[] = [],
  paths?: SettingsPaths,
  category: string | null = null,
  series?: LocalResourceSeries
): CreateExtension[] {
  const source = buildCreateExtensionsFromLocal(localModels, paths, series);
  const normalized = query.trim().toLowerCase();

  return source
    .filter((extension) => {
      if (category && extension.category !== category) return false;
      if (!normalized) return true;
      return (
        extension.name.toLowerCase().includes(normalized) ||
        (extension.category?.toLowerCase().includes(normalized) ?? false) ||
        (extension.versions?.some((version) =>
          version.label.toLowerCase().includes(normalized)
        ) ?? false)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function getLocalExtensionCategories(
  localModels: LocalModel[],
  paths?: SettingsPaths,
  series?: LocalResourceSeries
): string[] {
  const categories = buildCreateExtensionsFromLocal(localModels, paths, series)
    .map((extension) => extension.category);
  return [...new Set(categories.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function getExtensionById(
  id: string,
  localModels: LocalModel[] = []
): CreateExtension | undefined {
  if (isLocalLoraId(id)) {
    const filePath = parseLocalLoraId(id);
    if (!filePath) return undefined;

    for (const extension of buildCreateExtensionsFromLocal(localModels)) {
      const version = extension.versions?.find((item) => item.id === id);
      if (version) {
        return {
          ...extension,
          id,
          versionLabel: version.label,
        };
      }

      if (extension.id === id) {
        return extension;
      }
    }

    return buildCreateExtensionsFromLocal(localModels).find(
      (extension) => extension.id === id
    );
  }
  return CREATE_EXTENSIONS.find((extension) => extension.id === id);
}

export function getExtensionDisplay(
  id: string,
  localModels: LocalModel[] = []
): {
  name: string;
  versionLabel: string;
  cover: ExtensionCover;
} {
  const localPath = parseLocalLoraId(id);
  if (localPath) {
    const localDisplay = getLocalLoraDisplay(localModels, localPath);
    if (localDisplay) {
      return localDisplay;
    }
  }

  const extension = CREATE_EXTENSIONS.find((item) => item.id === id);
  if (!extension) {
    return {
      name: t("taxonomy.extensions.unknown"),
      versionLabel: "",
      cover: coverAnimeInReal,
    };
  }
  return {
    name: extension.name,
    versionLabel: extension.versionLabel,
    cover: extension.cover,
  };
}
