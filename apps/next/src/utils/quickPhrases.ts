/**
 * 快捷短语（关键词 → 展开文本）的增删改查。
 *
 * 怎么做：关键词规范化（去 `#`、空格转 `-`）、id 生成、过滤与插入的纯函数。
 */
import type { QuickPhrase } from "@/types/quickPhrase";

export function createQuickPhraseId(): string {
  return `qp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 不允许空格，空格替换为短横线，去掉前导 # */
export function normalizeQuickPhraseKeyword(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function formatQuickPhraseKeyword(keyword: string): string {
  return `#${keyword}`;
}

export function filterQuickPhrases(
  phrases: QuickPhrase[],
  query: string
): QuickPhrase[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return phrases;

  return phrases.filter(
    (phrase) =>
      phrase.keyword.toLowerCase().includes(keyword) ||
      phrase.promptText.toLowerCase().includes(keyword)
  );
}

export function insertPromptText(
  text: string,
  editorId = "prompt-editor"
): void {
  if (typeof document === "undefined" || !text.trim()) return;

  const element = document.getElementById(editorId);
  if (!element) return;

  const snippet = text.trim();
  const current = element.textContent?.trim() ?? "";

  if (!current) {
    element.textContent = snippet;
    return;
  }

  const needsComma = !/[,\s]$/.test(current);
  element.textContent = `${current}${needsComma ? ", " : ""}${snippet}`;
}
