import type { StaticTagItem } from "@/types/staticTagLibrary";

/**
 * 静态标签库的**来源格式**适配层：把「外部 JSON 数据集」翻译成统一形状 `StaticTagItem`。
 *
 * 为什么要这一层：数据集是别人给的（AnimaTags 的动作 / 背景、以及后来的表情数据集），
 * 字段命名各不相同（`id/name/tags/preview` 与 `displayName/langName/object/attribute`）。
 * 库的**声明**（`data/tagLibraries.ts`）只说「用哪个格式读哪份数据」，
 * UI（卡片 / 侧栏 / 工具栏 / 弹窗）只认 `StaticTagItem` —— 于是**加一个新库**＝
 * 「加一份数据 + 加一个适配器 + 在声明表里加一条」，不用改任何组件。
 *
 * 负向约定：认不出（连名字都没有）的条目返回 `null` 被丢掉，而不是塞半截数据进 UI。
 */

/** 原始条目：字段来自外部数据集，形状未知，由适配器负责解释 */
export type RawTagItem = Record<string, unknown>;

export type TagSourceFormatId = "staticTagItem" | "expression";

export type TagSourceFormat = {
  id: TagSourceFormatId;
  /** 字段对照表（写给人看：换数据集时该填什么、缺什么会被丢掉） */
  mapping: string;
  /** 单条转换：认不出时返回 null */
  toItem: (raw: RawTagItem, index: number) => StaticTagItem | null;
};

function isRecord(value: unknown): value is RawTagItem {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

/** 已是 `StaticTagItem` 形状的数据集（动作库 / 背景库）：按字段名取，缺则给空值 */
function toStaticTagItem(raw: RawTagItem): StaticTagItem | null {
  const name = asText(raw.name);
  const nameZh = asText(raw.name_zh);
  if (!name && !nameZh) return null;
  return {
    id: asText(raw.id),
    original_id: asText(raw.original_id) || undefined,
    name,
    name_zh: nameZh,
    tags: asText(raw.tags),
    tags_zh: asText(raw.tags_zh),
    categories: asTextList(raw.categories),
    traits: asTextList(raw.traits),
    folder: asText(raw.folder),
    preview: asText(raw.preview),
    duplicate: raw.duplicate === true,
  };
}

/**
 * 表情数据集（`data/prompt/expression.ts`）：
 * - 分类**依赖 `attribute`**（笑 / 哭 / 不开心 / 蔑视 / 生气 / 其他表情 / 积极情绪 / 负面情绪 / 气质）；
 * - `object`（目前恒为「表情」）与 `attribute` 一起进检索特征词，便于同库以后出现别的 object；
 * - `displayName` 是英文标签、`langName` 是中文名，两者互为兜底；
 * - `id` 由**序号**生成：数据集没有 id，而 `displayName` 里存在 `:d` / `;d` 这类无法当 id 的值
 *   （按名字去空格生成 id 会让这两条撞在一起，于是丢一条）。
 * - `description`（数据集里偶有一条）**当前没有承载位置**：`StaticTagItem` 没有这个字段、
 *   卡片也不展示。保留在原始数据里，要在卡片上展示时再加字段。
 */
function toExpressionItem(raw: RawTagItem, index: number): StaticTagItem | null {
  const name = asText(raw.displayName);
  const nameZh = asText(raw.langName);
  if (!name && !nameZh) return null;
  const object = asText(raw.object);
  const attribute = asText(raw.attribute);
  return {
    id: `expression_${index + 1}`,
    name: name || nameZh,
    name_zh: nameZh || name,
    tags: name || nameZh,
    tags_zh: nameZh || name,
    categories: [attribute || object].filter(Boolean),
    traits: [object, attribute].filter(Boolean),
    folder: "expression",
    preview: asText(raw.preview),
  };
}

/** 格式注册表：新格式加一条即可被 `tagLibraries` 声明引用 */
export const TAG_SOURCE_FORMATS: Record<TagSourceFormatId, TagSourceFormat> = {
  staticTagItem: {
    id: "staticTagItem",
    mapping: "id/name/name_zh/tags/tags_zh/categories/traits/folder/preview(+/duplicate)",
    toItem: (raw) => toStaticTagItem(raw),
  },
  expression: {
    id: "expression",
    mapping: "displayName→name+tags、langName→name_zh+tags_zh、attribute→categories、object+attribute→traits",
    toItem: (raw, index) => toExpressionItem(raw, index),
  },
};

/** 按声明的格式把原始数据集整份转成 `StaticTagItem[]`（非数组、非对象条目一律跳过） */
export function toTagItems(
  source: unknown,
  formatId: TagSourceFormatId
): StaticTagItem[] {
  if (!Array.isArray(source)) return [];
  const format = TAG_SOURCE_FORMATS[formatId];
  const items: StaticTagItem[] = [];
  source.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const item = format.toItem(raw, index);
    if (item) items.push(item);
  });
  return items;
}
