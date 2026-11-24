/** 旧片段数据的存储格式，用于读取历史用户文档。 */
export type QuickPhrase = {
  id: string;
  /** 不含 #，空格已转为短横线 */
  keyword: string;
  promptText: string;
  imagePath?: string | null;
};
