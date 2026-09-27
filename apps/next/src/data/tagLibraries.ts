import { backgroundData } from "@/data/prompt/background_prompt";
import { expressionData } from "@/data/prompt/expression";
import { poseData } from "@/data/prompt/pose_prompt";
import { toTagItems, type TagSourceFormatId } from "@/data/tagLibraryFormats";
import type { MessageKey } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import type { PromptTabToolId } from "@/types/promptTabs";

export type TagLibraryId = "pose" | "background" | "expression";

/**
 * 库在 UI 层的形状（卡片 / 侧栏 / 工具栏 / 弹窗共用）：
 * 标题 / 条目单位 / 搜索占位存的是**词条 key**（如 `"taxonomy.tagLibraries.pose.title"`），
 * 渲染时用 `t(...)` 取文案 —— 与 `LocalizedNavItem` 同一套做法。
 */
export type LocalizedTagLibraryConfig = {
  id: TagLibraryId;
  title: MessageKey;
  unitLabel: MessageKey;
  searchPlaceholder: MessageKey;
  /** 数据钩子前缀（`data-<prefix>-card` / `data-<prefix>-apply` …） */
  testIdPrefix: string;
  /** 本库对应的既有工具：确认后写进 `TOOL_DEFAULT_TAB[tool]` 那个默认分类 */
  tool: PromptTabToolId;
  items: StaticTagItem[];
};

/**
 * 库的**声明**：数据从哪来（原始数据集 + 格式）、界面文案 key、对应的既有工具。
 *
 * 「加一个新库」现在的成本 = 三件事，**全在数据层**：
 *   1. 数据集放进 `src/data/prompt/`（任意 JSON）；形状与 `StaticTagItem` 不同就在
 *      `data/tagLibraryFormats.ts` 里加一个适配器；
 *   2. 在下面的 `TAG_LIBRARY_DEFINITIONS` 里加一条（数据集 + 格式 + 对应工具 + 文案 key）；
 *   3. 补词条（`taxonomy.tagLibraries.<id>` 与 `promptAssembly.tools.<tool>`）。
 *
 * 组件侧不用动：提示词下方的按钮行、弹窗、确认后写进的**默认分类**、
 * 组装面板当前分类下的工具入口、自定义分类里的「挂载开关」，
 * 都由这张表 + `data/promptTools.ts` 的工具体系生成。
 */
export type TagLibraryDefinition = Omit<LocalizedTagLibraryConfig, "items"> & {
  /** 原始数据集的格式（见 `data/tagLibraryFormats.ts`） */
  format: TagSourceFormatId;
  /** 原始数据集（形状由 `format` 决定） */
  source: unknown;
};

/**
 * 过滤掉数据集里标记为重复 / 占位（`duplicate: true`）以及没有标签或预览图的条目，
 * 避免库里出现空卡片。
 */
function normalizeItems(items: StaticTagItem[]): StaticTagItem[] {
  return items.filter(
    (item) =>
      item?.duplicate !== true &&
      String(item?.tags ?? "").trim().length > 0 &&
      String(item?.preview ?? "").trim().length > 0
  );
}

/** 声明 → UI 配置：`tool` / `format` / `source` 描述「怎么读数据」，不进 UI 形状 */
function buildLibrary(definition: TagLibraryDefinition): LocalizedTagLibraryConfig {
  return {
    id: definition.id,
    title: definition.title,
    unitLabel: definition.unitLabel,
    searchPlaceholder: definition.searchPlaceholder,
    testIdPrefix: definition.testIdPrefix,
    tool: definition.tool,
    items: normalizeItems(toTagItems(definition.source, definition.format)),
  };
}

/** 静态标签库声明表（**加新库只有这一处要填**）：顺序即按钮行里的先后顺序 */
export const TAG_LIBRARY_DEFINITIONS: TagLibraryDefinition[] = [
  {
    id: "pose",
    title: "taxonomy.tagLibraries.pose.title",
    unitLabel: "taxonomy.tagLibraries.pose.unitLabel",
    searchPlaceholder: "taxonomy.tagLibraries.pose.searchPlaceholder",
    testIdPrefix: "pose",
    tool: "pose",
    format: "staticTagItem",
    source: poseData,
  },
  {
    id: "background",
    title: "taxonomy.tagLibraries.background.title",
    unitLabel: "taxonomy.tagLibraries.background.unitLabel",
    searchPlaceholder: "taxonomy.tagLibraries.background.searchPlaceholder",
    testIdPrefix: "background",
    tool: "background",
    format: "staticTagItem",
    source: backgroundData,
  },
  {
    id: "expression",
    title: "taxonomy.tagLibraries.expression.title",
    unitLabel: "taxonomy.tagLibraries.expression.unitLabel",
    searchPlaceholder: "taxonomy.tagLibraries.expression.searchPlaceholder",
    testIdPrefix: "expression",
    tool: "expression",
    format: "expression",
    source: expressionData,
  },
];

/** UI 顺序（按钮行 / 弹窗注册顺序都读它） */
export const TAG_LIBRARY_LIST: LocalizedTagLibraryConfig[] =
  TAG_LIBRARY_DEFINITIONS.map(buildLibrary);

function indexLibraries(
  list: LocalizedTagLibraryConfig[]
): Record<TagLibraryId, LocalizedTagLibraryConfig> {
  const map = {} as Record<TagLibraryId, LocalizedTagLibraryConfig>;
  for (const library of list) map[library.id] = library;
  return map;
}

export const TAG_LIBRARIES: Record<TagLibraryId, LocalizedTagLibraryConfig> =
  indexLibraries(TAG_LIBRARY_LIST);

export function getTagLibrary(id: TagLibraryId): LocalizedTagLibraryConfig {
  return TAG_LIBRARIES[id];
}

/** 工具 → 库：打开弹窗时用（不是库的工具返回 null） */
export function getTagLibraryByTool(
  tool: PromptTabToolId
): LocalizedTagLibraryConfig | null {
  const definition = TAG_LIBRARY_DEFINITIONS.find((item) => item.tool === tool);
  return definition ? TAG_LIBRARIES[definition.id] : null;
}
