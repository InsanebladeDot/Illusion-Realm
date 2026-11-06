/** Animadex 角色库（https://animadex.net/api/characters/search）数据类型 */

/** 角色附带的 LoRA（详情弹框的「+ LoRA」会列出这些） */
export type AnimadexLora = {
  name: string;
  url: string;
  thumb: string;
};

export type AnimadexCharacter = {
  /** 本地资料携带原始属性；在线条目不伪造这些字段。 */
  /** 空值与缺失均表示未知，不表示角色没有此特征。 */
  /** reference 用于在同一张详情卡中复用标签展示。 */
  reference?: { gender: string; hair: string; eye: string };
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
  /** 未指定来源时兼容原在线接口，创建页显式选择本地。 */
  /** Agent 默认使用本地，以免一次角色查询依赖远端站点。 */
  /** 四项属性筛选仅用于本地，不能静默传给不支持的在线端点。 */
  source?: "local" | "online";
  /** 性别按库中原值筛选，如 1girl；未知值不猜测。 */
  /** 此字段与作品、发色、瞳色共同取交集。 */
  /** 空字符串表示取消该项筛选。 */
  gender?: string;
  /** 发色是资料值，如 blonde，并非任意自然语言描述。 */
  /** 不会根据模型训练词或预览图推断颜色。 */
  /** 多颜色字符串保留原值，精确匹配完整分类。 */
  hair?: string;
  /** 瞳色与发色分开，避免把 blue 误用到另一个属性。 */
  /** 属性缺失时不能命中非空颜色条件。 */
  /** 在线接口若接到此筛选会明确拒绝。 */
  eye?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  /** 作品 slug 过滤 */
  copyright?: string;
  /** recent = 最新，az = 字母序，缺省按热度 */
  sort?: "recent" | "az";
};

export type AnimadexSearchResult = {
  /** 分类数量取自本地整份资料，不是远端站点热度。 */
  /** 每个属性原值对应记录数，空属性不计入分类。 */
  /** 与 facets 同一批次返回，避免列表与数量来自不同数据源。 */
  facetCounts?: Record<"copyright" | "gender" | "hair" | "eye", Record<string, number>>;
  /** 本地分类来自整份数据，空页也可继续更换筛选。 */
  /** 不将当前分页的分类冒充全部可选项。 */
  /** 在线结果无此字段，UI 保留原有作品导航。 */
  facets?: Record<"copyright" | "gender" | "hair" | "eye", string[]>;
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  results: AnimadexCharacter[];
};
