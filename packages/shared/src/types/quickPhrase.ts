export type QuickPhraseViewMode = "list" | "grid";

export type QuickPhrase = {
  id: string;
  /** 不含 #，空格已转为短横线 */
  keyword: string;
  promptText: string;
  imagePath?: string | null;
};

export type QuickPhraseForm = {
  keyword: string;
  promptText: string;
  imagePath: string | null;
};
