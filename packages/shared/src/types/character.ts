/** Animadex 角色库（https://animadex.net/api/characters/search）数据类型 */

/** 角色附带的 LoRA（详情弹框的「+ LoRA」会列出这些） */
export type AnimadexLora = {
  name: string;
  url: string;
  thumb: string;
};

export type AnimadexCharacter = {
  slug: string;
  name: string;
  /** 作品 slug，如 vocaloid */
  copyright: string;
  /** 作品显示名，如 Vocaloid */
  copyrightName: string;
  /** 触发词（直接写进提示词的那串） */
  trigger: string;
  tags: string[];
  /** 作品热度（出图数量） */
  count: number;
  /** 来源链接（Danbooru 等） */
  url: string;
  thumbUrl: string;
  imageUrl: string;
  hasImage: boolean;
  loras: AnimadexLora[];
  rating: { up: number; down: number };
  favCount: number;
};

export type AnimadexSearchParams = {
  q?: string;
  page?: number;
  pageSize?: number;
  /** 作品 slug 过滤 */
  copyright?: string;
  /** recent = 最新，az = 字母序，缺省按热度 */
  sort?: "recent" | "az";
};

export type AnimadexSearchResult = {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  results: AnimadexCharacter[];
};
