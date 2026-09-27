/**
 * 静态标签库（动作 / 背景 / 表情）的解析、分页、排序与分类名。
 *
 * 怎么做：纯函数 —— `parseTagString` 拆标签、`listTagCategories` 归并分类；
 * 展示文案一律给词条 key（模块级不写死中文）。
 */
import type { MessageKey } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";

/** 每页数量（4 列 × 6 行，与角色选择器一致） */
export const TAG_LIBRARY_PAGE_SIZE = 24;

export type TagSortMode = "default" | "az";

/** `label` 存的是**词条 key**（渲染时 `t(option.label)`），避免在模块级写入中文 */
export const TAG_SORT_OPTIONS: { value: TagSortMode; label: MessageKey }[] = [
  { value: "default", label: "characters.tagLibrary.sortDefault" },
  { value: "az", label: "characters.tagLibrary.sortAz" },
];

/**
 * 解析标签串：数据集里有的以逗号结尾（动作库）、有的没有（背景库），
 * 这里统一去掉首尾空白与空项，避免拼出双逗号或结尾逗号。
 */
export function parseTagString(tags: string): string[] {
  return String(tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 分类列表（保持数据集里首次出现的顺序） */
export function listTagCategories(items: StaticTagItem[]): string[] {
  const seen: string[] = [];
  for (const item of items) {
    for (const category of item.categories ?? []) {
      if (!seen.includes(category)) seen.push(category);
    }
  }
  return seen;
}

/** 分类简短名（去掉括号里的英文） */
export function tagCategoryShortName(category: string): string {
  return category.replace(/\s*\(.*\)\s*$/, "").trim() || category;
}

export type TagFilterInput = {
  query: string;
  category: string;
  selectedIds: string[];
  selectedOnly: boolean;
  sort: TagSortMode;
};

export function filterTagItems(
  items: StaticTagItem[],
  input: TagFilterInput
): StaticTagItem[] {
  const keyword = input.query.trim().toLowerCase();
  let list = items;

  if (input.category) {
    list = list.filter((item) => (item.categories ?? []).includes(input.category));
  }

  if (keyword) {
    list = list.filter((item) => {
      const haystack = [
        item.name,
        item.name_zh,
        item.tags,
        item.tags_zh,
        ...(item.traits ?? []),
        ...(item.categories ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }

  if (input.selectedOnly) {
    list = list.filter((item) => input.selectedIds.includes(item.id));
  }

  if (input.sort === "az") {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }

  return list;
}

/** 已选条目拼成提示词（去重保序、逗号分隔） */
export function buildTagPrompt(items: StaticTagItem[]): string {
  const tags: string[] = [];
  for (const item of items) {
    for (const tag of parseTagString(item.tags)) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.join(", ");
}

export function formatTagPreview(tags: string, limit = 2): string {
  return parseTagString(tags).slice(0, limit).join(", ");
}
