import type { MessageKey } from "@/i18n";
import type { ImageAsset } from "@/types/common";
import animeIcon from "@/assets/icon/create/Anime.png";
import sdxlIcon from "@/assets/icon/create/SDXL.png";

export type ModelSeries = {
  id: string;
  label: string;
  description: string;
  tipsTitle: string;
  tips: string[];
  icon: ImageAsset;
};

/**
 * 模型系列在渲染进程侧的形状：`description` / `tipsTitle` / `tips` 存的都是
 * **词条 key**，渲染时用 `t(...)` 取文案 —— 与 `LocalizedNavItem` 同一套做法。
 * （`label` 是系列名本身 SDXL / Anima，专有名词，留在数据里。）
 */
export type LocalizedModelSeries = Omit<
  ModelSeries,
  "description" | "tipsTitle" | "tips"
> & {
  description: MessageKey;
  tipsTitle: MessageKey;
  tips: MessageKey[];
};

export const MODEL_SERIES: LocalizedModelSeries[] = [
  {
    id: "sdxl",
    label: "SDXL",
    description: "taxonomy.modelSeries.sdxl.description",
    tipsTitle: "taxonomy.modelSeries.sdxl.tipsTitle",
    tips: ["taxonomy.modelSeries.sdxl.tip1"],
    icon: sdxlIcon,
  },
  {
    id: "anima",
    label: "Anima",
    description: "taxonomy.modelSeries.anima.description",
    tipsTitle: "taxonomy.modelSeries.anima.tipsTitle",
    tips: ["taxonomy.modelSeries.anima.tip1"],
    icon: animeIcon,
  },
];

export const DEFAULT_MODEL_SERIES_ID = "anima";
