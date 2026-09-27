import type { QuickPhrase } from "@/types/quickPhrase";

export const QUICK_PHRASE_DESCRIPTION =
  "快捷短语是用于快速插入常用长文本的快捷方式。输入 '@' 即可使用快捷短语。";

export const EMPTY_QUICK_PHRASE_FORM = {
  keyword: "",
  promptText: "",
  imagePath: null as string | null,
};

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
