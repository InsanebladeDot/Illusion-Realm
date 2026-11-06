/**
 * 画师收藏文档的唯一形状：版本1只记录收藏ID与用户分组。
 * 不保存在线图片、模型密钥或整份四万条画师资料。
 * 作为v1用户文档的可选增量段，旧文档没有此段时使用空收藏。
 * 删除分组只移除分组关系，不能删除内置画师或默认收藏。
 */
import { z } from "zod";

/**
 * ID来自本地画师资料，分组ID由用户操作生成。
 * 文案裁掉首尾空白并限定长度，不能写入空分组名。
 * 数组采用上限避免手改文档制造无界渲染，不限制实际资料库大小。
 * 各分组可重叠，同一个画师允许加入多个分组。
 * version明确区别未来不兼容格式；未知版本不得当成本版本使用。
 * 读取侧在parse后去重并清除没有收藏的孤立成员。
 * zod仅校验形状，业务不把分组名称解释为路径或脚本。
 */
export const ArtistLibrarySchema = z.object({ version: z.literal(1), favorites: z.array(z.string().min(1)).max(50000), groups: z.array(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(60), artistIds: z.array(z.string().min(1)).max(50000) })).max(200) });

/**
 * 类型从schema推导，渲染层与持久化字段不另建同形接口。
 * 所有值均为JSON原语，不包含Date、Map或React对象。
 * 默认对象每次需要可写副本时由调用方复制，不能直接改它的数组。
 * 空收藏不会触发线上请求，资料清单始终来自随包本地JSON。
 */
export type ArtistLibraryData = z.infer<typeof ArtistLibrarySchema>;
export const EMPTY_ARTIST_LIBRARY: ArtistLibraryData = { version: 1, favorites: [], groups: [] };
