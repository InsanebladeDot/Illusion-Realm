import type { MessageKey } from "@/i18n";
import type { PromptTabToolId } from "@/types/promptTabs";

/**
 * 「既有功能」（工具）注册表 —— 高级组装里那一排入口的唯一事实来源。
 *
 * 在这张表之前，同一个工具的信息散在四处：按钮行（`PromptSection`）、
 * 组装面板当前分类下的入口、自定义分类里的挂载开关（`PromptAssemblyPanel`）、
 * 以及「确认后写进哪个默认分类」（`utils/promptTarget.ts`）。加一个工具要改四个文件，
 * 改漏一处就会出现「按钮在、点了没反应」或「写错分类」。
 *
 * 现在：**加工具 = 在这张表里加一条 + 补词条**。
 * - `defaultTab`：确认后写进哪个默认分类（默认分类与工具是**写死一对一**的固定绑定）；
 * - `dialog`：这个工具用哪种弹窗。`tagLibrary` 的**具体是哪个库**不写在这里 ——
 *   库自己声明它属于哪个工具（`data/tagLibraries.ts` 的 `tool` 字段，
 *   用 `getTagLibraryByTool(toolId)` 反查）；一条事实只有一个出处，
 *   于是「动作库 / 背景库 / 表情库」共用同一条渲染路径，加第四个库不用碰组件。
 */

/** 工具的弹窗类型：角色选择器 / 3D 视角 / 静态标签库 */
export type PromptToolDialog = "character" | "view3d" | "tagLibrary";

export type PromptToolDefinition = {
  id: PromptTabToolId;
  /** 按钮文字（按钮行 / 组装面板 / 挂载开关共用） */
  label: MessageKey;
  /** 提示词下方按钮行的 title */
  rowTitle: MessageKey;
  /** 组装面板里工具按钮的 title */
  panelTitle: MessageKey;
  /** 数据钩子：按钮行 `data-<rowTestId>-trigger` */
  rowTestId: string;
  /** 数据钩子：组装面板 `data-prompt-tool="<panelTestId>"` */
  panelTestId: string;
  /** 确认后写进的默认分类 id */
  defaultTab: string;
  /** 确认后的提示（覆盖默认分类时） */
  covered: MessageKey;
  /** 弹窗类型；`tagLibrary` 时用 `getTagLibraryByTool(id)` 取具体的库 */
  dialog: PromptToolDialog;
};

/** 顺序即按钮行 / 挂载开关里的先后顺序 */
export const PROMPT_TOOLS: PromptToolDefinition[] = [
  {
    id: "character",
    label: "promptAssembly.tools.character",
    rowTitle: "promptAssembly.tools.characterTitle",
    panelTitle: "promptAssembly.tools.characterToolTitle",
    rowTestId: "character-picker",
    panelTestId: "character",
    defaultTab: "character",
    covered: "promptAssembly.tools.coveredCharacter",
    dialog: "character",
  },
  {
    id: "pose",
    label: "promptAssembly.tools.pose",
    rowTitle: "promptAssembly.tools.poseTitle",
    panelTitle: "promptAssembly.tools.poseToolTitle",
    rowTestId: "pose-library",
    panelTestId: "pose",
    defaultTab: "pose",
    covered: "promptAssembly.tools.coveredPose",
    dialog: "tagLibrary",
  },
  {
    id: "background",
    label: "promptAssembly.tools.background",
    rowTitle: "promptAssembly.tools.backgroundTitle",
    panelTitle: "promptAssembly.tools.backgroundToolTitle",
    rowTestId: "background-library",
    panelTestId: "background",
    defaultTab: "background",
    covered: "promptAssembly.tools.coveredBackground",
    dialog: "tagLibrary",
  },
  {
    id: "expression",
    label: "promptAssembly.tools.expression",
    rowTitle: "promptAssembly.tools.expressionTitle",
    panelTitle: "promptAssembly.tools.expressionToolTitle",
    rowTestId: "expression-library",
    panelTestId: "expression",
    defaultTab: "expression",
    covered: "promptAssembly.tools.coveredExpression",
    dialog: "tagLibrary",
  },
  {
    id: "view3d",
    label: "promptAssembly.tools.view3d",
    rowTitle: "promptAssembly.tools.view3d",
    panelTitle: "promptAssembly.tools.view3dTitle",
    rowTestId: "view3d",
    panelTestId: "3d",
    defaultTab: "shot",
    covered: "promptAssembly.tools.coveredShot",
    dialog: "view3d",
  },
];

/** 合法工具 id（文档是外部输入，脏值不能原样带进 UI） */
export const PROMPT_TOOL_IDS: readonly PromptTabToolId[] = PROMPT_TOOLS.map(
  (tool) => tool.id
);

function indexTools(): Record<PromptTabToolId, PromptToolDefinition> {
  const map = {} as Record<PromptTabToolId, PromptToolDefinition>;
  for (const tool of PROMPT_TOOLS) map[tool.id] = tool;
  return map;
}

const PROMPT_TOOL_INDEX: Record<PromptTabToolId, PromptToolDefinition> = indexTools();

export function getPromptTool(id: PromptTabToolId): PromptToolDefinition {
  return PROMPT_TOOL_INDEX[id];
}

/** 某个默认分类固定绑定的工具（自定义分类的落点由分类自己决定，不走这里） */
export function promptToolsForTab(tabId: string): PromptToolDefinition[] {
  return PROMPT_TOOLS.filter((tool) => tool.defaultTab === tabId);
}

/** 工具 → 默认落点分类（默认分类的固定绑定） */
function indexDefaultTabs(): Record<PromptTabToolId, string> {
  const map = {} as Record<PromptTabToolId, string>;
  for (const tool of PROMPT_TOOLS) map[tool.id] = tool.defaultTab;
  return map;
}

export const TOOL_DEFAULT_TAB: Record<PromptTabToolId, string> = indexDefaultTabs();
