/**
 * 纯静态标签库条目（动作 / 背景等数据集共用同一结构）：
 * 数据来自 `src/data/prompt/*.ts`，随应用打包，不联网。
 */
export type StaticTagItem = {
  id: string;
  /** 原始 id（部分数据集带） */
  original_id?: string;
  /** 英文名 */
  name: string;
  /** 中文名 */
  name_zh: string;
  /** 英文标签串（部分数据集以逗号结尾，需先剥掉再拼接） */
  tags: string;
  /** 中文标签串 */
  tags_zh: string;
  /** 所属分类 */
  categories: string[];
  /** 检索用特征词 */
  traits: string[];
  folder: string;
  /** 预览图（jsDelivr CDN） */
  preview: string;
  /** 数据集里标记为重复 / 占位的条目，加载时会被过滤掉 */
  duplicate?: boolean;
};
