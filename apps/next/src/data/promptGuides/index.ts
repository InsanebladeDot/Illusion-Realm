import { ANIMA_PROMPT_GUIDE } from "@/data/promptGuides/anima";
import { SDXL_PROMPT_GUIDE } from "@/data/promptGuides/sdxl";
import type { MessageKey } from "@/i18n";

/** 与图像工作流系列一一对应 */
export type PromptGuideSeries = "anima" | "sdxl";

export type PromptGuide = {
  series: PromptGuideSeries;
  /** 按钮与弹框标题 */
  title: string;
  markdown: string;
};

/**
 * 教程在渲染进程侧的形状：`title` 存的是**词条 key**，
 * 渲染时用 `t(guide.title)` 取文案 —— 与 `LocalizedNavItem` 同一套做法。
 */
export type LocalizedPromptGuide = Omit<PromptGuide, "title"> & { title: MessageKey };

const PROMPT_GUIDES: Record<PromptGuideSeries, LocalizedPromptGuide> = {
  anima: {
    series: "anima",
    title: "taxonomy.promptGuides.anima.title",
    markdown: ANIMA_PROMPT_GUIDE,
  },
  sdxl: {
    series: "sdxl",
    title: "taxonomy.promptGuides.sdxl.title",
    markdown: SDXL_PROMPT_GUIDE,
  },
};

export function getPromptGuide(series: PromptGuideSeries): LocalizedPromptGuide {
  return PROMPT_GUIDES[series] ?? PROMPT_GUIDES.anima;
}
