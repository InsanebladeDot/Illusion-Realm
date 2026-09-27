import type { MessageKey } from "@/i18n";
import type { PromptTab } from "@/types/promptTabs";

/**
 * 分类 Tab 在渲染进程侧的形状：`label` 存的是**词条 key**（如 `"taxonomy.promptTabs.quality"`），
 * 渲染时用 `t(tab.label)` 取文案 —— 与 `LocalizedNavItem` 同一套做法。
 */
export type LocalizedPromptTab = Omit<PromptTab, "label"> & { label: MessageKey };

/**
 * 默认 8 大分类（任务规范 v2.1 + 表情）：
 * 质量词 | 镜头视图 | 画师风格 | 角色 | 服饰 | 姿势 | 表情 | 背景
 * 每个分类自带一组常用的「快捷插入词」，点击即追加到该分类输入框。
 *
 * `id` 与「固定绑定的工具」同名（`data/promptTools.ts` 的 `defaultTab`）：
 * 例如 `expression` 分类里能直接开「表情库」，确认后写进本分类。
 */
export const DEFAULT_PROMPT_TABS: LocalizedPromptTab[] = [
  {
    id: "quality",
    label: "taxonomy.promptTabs.quality",
    content: "",
    quickWords: [
      "masterpiece",
      "best quality",
      "very aesthetic",
      "highly detailed",
      "absurdres",
    ],
  },
  {
    id: "shot",
    label: "taxonomy.promptTabs.shot",
    content: "",
    quickWords: [
      "from front",
      "close-up",
      "upper body",
      "full body",
      "wide shot",
      "high angle",
      "low angle",
    ],
  },
  {
    id: "style",
    label: "taxonomy.promptTabs.style",
    content: "",
    quickWords: ["anime style", "watercolor", "flat color", "cinematic lighting"],
  },
  {
    id: "character",
    label: "taxonomy.promptTabs.character",
    content: "",
    quickWords: ["1girl", "solo", "long hair", "blue eyes", "twintails"],
  },
  {
    id: "outfit",
    label: "taxonomy.promptTabs.outfit",
    content: "",
    quickWords: ["school uniform", "dress", "detached sleeves", "thighhighs"],
  },
  {
    id: "pose",
    label: "taxonomy.promptTabs.pose",
    content: "",
    quickWords: ["standing", "sitting", "looking at viewer", "arms up"],
  },
  {
    id: "expression",
    label: "taxonomy.promptTabs.expression",
    content: "",
    quickWords: [
      "smile",
      "open mouth",
      "tears",
      "blush",
      "angry",
      "half-closed eyes",
    ],
  },
  {
    id: "background",
    label: "taxonomy.promptTabs.background",
    content: "",
    quickWords: ["simple background", "outdoors", "sky", "night", "cherry blossoms"],
  },
];

/** 分类数量上限（含自定义分类） */
export const PROMPT_TAB_MAX = 12;
