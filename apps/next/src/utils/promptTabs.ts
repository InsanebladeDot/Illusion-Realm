/**
 * 「高级组装」模式的分类 Tab 模型：拼接、已填计数、增删分类与模板。
 *
 * 怎么做：纯函数；`assemblePrompt` 按 Tab 顺序用 `, ` 拼出最终提示词。
 */
import { t } from "@/i18n";
import type {
  PromptTab,
  PromptTabToolId,
  PromptTemplate,
} from "@/types/promptTabs";
import { DEFAULT_PROMPT_TABS, PROMPT_TAB_MAX } from "@/data/promptTabs";
import { PROMPT_TOOL_IDS } from "@/data/promptTools";

/**
 * 合法工具清单：文档是外部输入，脏值（旧版本写的、手改的）不能原样带进 UI。
 * 清单本身来自工具注册表（`data/promptTools.ts`），加工具只改那一处。
 */
export const PROMPT_TAB_TOOL_IDS: readonly PromptTabToolId[] = PROMPT_TOOL_IDS;

/** 只保留合法且不重复的工具 id */
function sanitizeTabTools(value: unknown): PromptTabToolId[] {
  if (!Array.isArray(value)) return [];
  const unique: PromptTabToolId[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const toolId = PROMPT_TAB_TOOL_IDS.find((id) => id === item);
    if (!toolId || unique.includes(toolId)) continue;
    unique.push(toolId);
  }
  return unique;
}

/**
 * 逗号自动拼接（任务规范 v2.1 核心算法）：
 * 按 Tab 顺序遍历所有**非空**输入框，
 * - 若已拼接结果的结尾已有英文逗号 `,`，直接接上（只补一个空格）；
 * - 否则自动追加 `, ` 再拼接。
 * 结果实时输出到只读预览框。
 */
export function assemblePrompt(tabs: PromptTab[]): string {
  let result = "";

  for (const tab of tabs) {
    const text = (tab.content ?? "").trim();
    if (!text) continue;

    if (!result) {
      result = text;
      continue;
    }

    result = /,\s*$/.test(result) ? `${result} ${text}` : `${result}, ${text}`;
  }

  return result;
}

/** 已填写内容的分类数量（用于 Tab 角标） */
export function countFilledTabs(tabs: PromptTab[]): number {
  return tabs.filter((tab) => (tab.content ?? "").trim().length > 0).length;
}

export function isTabFilled(tab: PromptTab): boolean {
  return (tab.content ?? "").trim().length > 0;
}

/**
 * 往分类内容末尾追加文本（快捷插入词 / 角色 / 3D 视角都走这里）：
 * 结尾已有逗号则只补空格，否则自动补 `, `。
 */
export function appendToTabContent(content: string, addition: string): string {
  const snippet = addition.trim();
  if (!snippet) return content;

  const current = (content ?? "").trim();
  if (!current) return snippet;
  return /,\s*$/.test(current) ? `${current} ${snippet}` : `${current}, ${snippet}`;
}

export function createPromptTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createPromptTemplateId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeQuickWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .slice(0, 24);
}

/**
 * 兜底 / 迁移：保证默认 8 个分类始终存在（用户删掉后重建），
 * 自定义分类去重并按 id 去重，最多 PROMPT_TAB_MAX 个。
 */
export function sanitizePromptTabs(value: unknown): PromptTab[] {
  const stored = Array.isArray(value) ? (value as Partial<PromptTab>[]) : [];
  const byId = new Map<string, PromptTab>();

  for (const item of stored) {
    const id = asString(item?.id).trim();
    if (!id) continue;
    byId.set(id, {
      id,
      label: asString(item?.label).trim() || id,
      content: asString(item?.content),
      quickWords: sanitizeQuickWords(item?.quickWords),
      custom: item?.custom === true,
      tools: sanitizeTabTools(item?.tools),
    });
  }

  const tabs: PromptTab[] = [];
  for (const preset of DEFAULT_PROMPT_TABS) {
    const storedTab = byId.get(preset.id);
    tabs.push({
      id: preset.id,
      label: storedTab?.label?.trim() || t(preset.label),
      content: storedTab?.content ?? "",
      quickWords: storedTab?.quickWords?.length
        ? storedTab.quickWords
        : preset.quickWords,
      custom: false,
    });
    byId.delete(preset.id);
  }

  for (const custom of byId.values()) {
    if (tabs.length >= PROMPT_TAB_MAX) break;
    tabs.push({ ...custom, custom: true });
  }

  return tabs;
}

export function sanitizePromptTemplates(value: unknown): PromptTemplate[] {
  if (!Array.isArray(value)) return [];

  return (value as Partial<PromptTemplate>[])
    .map((item) => {
      const id = asString(item?.id).trim();
      const name = asString(item?.name).trim();
      if (!id || !name) return null;
      const rawValues =
        item?.values && typeof item.values === "object" ? item.values : {};
      const values: Record<string, string> = {};
      for (const [key, content] of Object.entries(
        rawValues as Record<string, unknown>
      )) {
        values[key] = asString(content);
      }
      return {
        id,
        name,
        values,
        createdAt:
          typeof item?.createdAt === "number" ? item.createdAt : Date.now(),
      } satisfies PromptTemplate;
    })
    .filter((item): item is PromptTemplate => item !== null)
    .slice(0, 50);
}

/** 快照当前分类内容（保存模板用） */
export function snapshotTabValues(tabs: PromptTab[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const tab of tabs) {
    values[tab.id] = tab.content ?? "";
  }
  return values;
}

/**
 * 套用模板：模板里存在的分类直接覆盖，模板里没有的分类保持原样
 * （这样自定义分类不会被模板清空）。
 */
export function applyTemplateToTabs(
  tabs: PromptTab[],
  template: PromptTemplate
): PromptTab[] {
  return tabs.map((tab) =>
    Object.prototype.hasOwnProperty.call(template.values, tab.id)
      ? { ...tab, content: template.values[tab.id] ?? "" }
      : tab
  );
}
