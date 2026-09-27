import animeIcon from "@/assets/icon/create/Anime.png";
import sdxlIcon from "@/assets/icon/create/SDXL.png";
import type { PresetPromptOption, PresetPromptSeries } from "@/types/presetPrompt";

export const PRESET_PROMPT_DESCRIPTION =
  "预设提示词是自动插入到你的提示词和反向提示词之前或之后的文本。";

export const PRESET_PROMPT_SERIES: PresetPromptSeries[] = [
  {
    id: "pony",
    label: "Pony",
    icon: sdxlIcon,
    description: "适用于 Pony 生成",
    presets: [],
  },
  {
    id: "illustrious",
    label: "Illustrious",
    icon: sdxlIcon,
    description: "适用于 Illustrious 生成",
    presets: [],
  },
  {
    id: "anima",
    label: "Anima",
    icon: animeIcon,
    description: "适用于 Anima 生成",
    presets: [
      {
        id: "anima-nlp-quality",
        name: "BetterWaifu Default for Anima",
        positivePrefix: "masterpiece, best quality, score_8,",
        negativePrefix:
          "worst quality, low quality, score_1, score_2, score_3, artist name,",
        isDefault: true,
      },
      {
        id: "anima-glossy",
        name: "Glossy",
        positivePrefix:
          "masterpiece, best quality, absurdres, highres, score_7, score_8, score_9,",
        negativePrefix:
          "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, bad anatomy, bad hands, mutated hands, fused fingers, extra fingers, watermark, signature, logo,",
        isDefault: true,
      },
      {
        id: "anima-none",
        name: "Not So Glossy",
        positivePrefix: "newest, good quality, score_6, score_5, highres,",
        negativePrefix: "low quality, score_1, score_2,",
        isDefault: true,
      },
    ],
  },
];

export const DEFAULT_PRESET_ID = "anima-nlp-quality";

export const EMPTY_CUSTOM_PRESET_FORM = {
  name: "",
  positivePrefix: "",
  positiveSuffix: "",
  negativePrefix: "",
  negativeSuffix: "",
} as const;

export function createCustomPresetId(seriesId: string): string {
  return `custom-${seriesId}-${Date.now()}`;
}

export function findPresetById(id: string): PresetPromptOption | undefined {
  for (const series of PRESET_PROMPT_SERIES) {
    const preset = series.presets.find((item) => item.id === id);
    if (preset) return preset;
  }
  return undefined;
}

export function findPresetInAll(
  id: string,
  customPresets: Record<string, PresetPromptOption[]>
): PresetPromptOption | undefined {
  const builtIn = findPresetById(id);
  if (builtIn) return builtIn;

  for (const presets of Object.values(customPresets)) {
    const preset = presets.find((item) => item.id === id);
    if (preset) return preset;
  }

  return undefined;
}

export function getSeriesPresets(
  seriesId: string,
  customPresets: Record<string, PresetPromptOption[]>
): PresetPromptOption[] {
  const series = PRESET_PROMPT_SERIES.find((item) => item.id === seriesId);
  const builtIn = series?.presets ?? [];
  const custom = customPresets[seriesId] ?? [];
  return [...builtIn, ...custom];
}

export function findSeriesIdByPresetId(
  presetId: string,
  customPresets: Record<string, PresetPromptOption[]> = {}
): string {
  for (const series of PRESET_PROMPT_SERIES) {
    if (series.presets.some((item) => item.id === presetId)) {
      return series.id;
    }
  }

  for (const [seriesId, presets] of Object.entries(customPresets)) {
    if (presets.some((item) => item.id === presetId)) {
      return seriesId;
    }
  }

  return "anima";
}
