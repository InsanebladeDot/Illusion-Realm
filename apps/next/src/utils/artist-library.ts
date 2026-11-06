/**
 * 画师元数据适配与查询：使用参考工具的名称、作品数和独特性分数。
 * 本地JSON保留源值；仅展示层映射为所有资料库共用的StaticTagItem。
 * 收藏分组与已选视图是独立查询入口，不发明画风或作品分类。
 * 预览来自原工具使用的公开地址，加载失败不影响本地标签应用。
 */
import data from "@/data/prompt/artist-reference.json";
import type { ArtistLibraryData } from "@illusion-realm/shared/schemas/artist-library.schema";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import type { TagFilterInput } from "@/utils/tagLibrary";

/**
 * 排序保留参考工具七种模式，随机模式使用一次点击产生的seed。
 * seed改变才重新洗牌，不让React普通重绘或分页不断改变顺序。
 * 名称排序使用原文，不将不存在的中文译名当作可搜索资料。
 * works与unique来自静态参考数据，不表示实时站点统计或模型效果承诺。
 */
export type ArtistSort = "works-desc" | "works-asc" | "unique-desc" | "unique-asc" | "name-asc" | "name-desc" | "random";
export const ARTIST_SORTS: ArtistSort[] = ["works-desc", "works-asc", "unique-desc", "unique-asc", "name-asc", "name-desc", "random"];

/**
 * Map按源ID索引，指标无需每渲染一张卡就扫描四万条记录。
 * 源JSON为纯数据，不执行外部js中的window全局赋值。
 * 画师名包含的转义括号在提示词里保留，仅图片地址按参考规则去转义。
 * URI编码整个文件名，空格、斜杠和非英文字符不会被当成额外路径段。
 * categories留空，因为参考工具没有声明客观画风分类。
 * folder仅作内部标识，不代表电脑上存在相应目录。
 * 原名就是输出tag，不拼接未经资料声明的artist:前缀。
 * 本地元数据没有图片下载副作用，图片只在当前页卡片挂载后读取。
 */
export const ARTIST_METADATA = new Map(data.map(item => [item.id, item]));
export const ARTIST_ITEMS: StaticTagItem[] = data.map(item => ({ id: item.id, name: item.name, name_zh: "", tags: item.name, tags_zh: "", categories: [], traits: [], folder: "artist", preview: `https://blobs.animadex.net/ArtistOutputs/thumbs/${encodeURIComponent(item.name.replace(/\\([()[\]{}])/g, "$1").trim())}.webp` }));

/**
 * Fisher-Yates处理副本，零seed同样是合法确定顺序。
 * 伪随机仅用于浏览排序，不用于密钥、生成种子或安全用途。
 * 每次排序用相同seed重建序列，因此翻页不会重复或漏掉候选。
 * 随机序列来自当前候选集合，搜索结果仍完整且不重复。
 * 不在比较器中调用Math.random，避免不满足排序比较的传递性。
 */
function shuffle(items: StaticTagItem[], seed: number): StaticTagItem[] {
  let state = seed >>> 0;
  for (let index = items.length - 1; index > 0; index--) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const other = state % (index + 1); [items[index], items[other]] = [items[other], items[index]]; }
  return items;
}

/**
 * group为空表示全部，favorites为默认收藏，其余值必须匹配真实自定义分组。
 * 未知或已删除分组返回空结果，不能悄悄放宽到全部画师。
 * 已选视图优先使用完整选择草稿，绕过名称搜索及分组。
 * 作品数和分数缺失视为0，不将未知数据包装成高评分。
 * 分数相同时按原名稳定排序，重复刷新不改变分页边界。
 * 名称搜索不区分大小写，只命中原资料中实际存在的名称。
 * 返回新数组，不能对ARTIST_ITEMS原地排序影响其他弹窗。
 * 过滤后才分页，由共用弹窗计算总数；收藏不能仅筛当前24张。
 * groupIds来自已校验文档，不拼接成本地文件路径。
 * 当前函数无网络、写盘或修改收藏的副作用。
 * 参数input沿用共用搜索/已选接口，普通库的分类规则不混入此处。
 * 收藏组不限制用户选择数量，真正显存消耗不由浏览器画师数推断。
 */
/**
 * 作品数排序的相同值使用名字作次序，双向排序不会任意打乱同分段。
 * 独特性评分不作为过滤阈值，避免把没有来源依据的分档当成官方分类。
 * name-desc只反转名称比较，作品数与评分不会偷偷影响结果。
 * 随机模式遍历候选副本，每个ID最多出现一次，不按有放回抽样取值。
 * 分类为空时不访问成员白名单，全部四万条记录都能参与名称搜索。
 * 普通视图先限制实际成员再匹配关键词，已选视图则跳过这两项。
 * selected对象允许来自其他分页，源集合中未显示的条目也不会丢失。
 * 默认收藏和自定义组都按ID匹配，显示名的转义符不会破坏分组。
 * 查询参数只trim和转小写，不尝试把中文别名转换为其他画师。
 * 排序数组与源JSON顺序互不干扰，同一应用内重开弹窗仍有稳定默认。
 * 在同一组内切换排序只重排显示，不改变收藏时间或成员保存顺序。
 * 该模块只含参考元数据和纯查询，不能说明在线图库当前可访问。
 * 资料中的p分区原值保留在JSON，当前主预览地址使用规范化名称。
 * 后续更新资料应独立核对源JSON数量与唯一ID，不能用当前页反推总数。
 */
export function filterArtistItems(items: StaticTagItem[], input: TagFilterInput, group: string, collections: ArtistLibraryData, sort: ArtistSort, selected: StaticTagItem[], seed: number): StaticTagItem[] {
  const ids = group === "favorites" ? collections.favorites : collections.groups.find(item => item.id === group)?.artistIds ?? [];
  const query = input.query.trim().toLowerCase();
  const list = input.selectedOnly ? [...selected] : items.filter(item => (!group || ids.includes(item.id)) && (!query || item.name.toLowerCase().includes(query)));
  if (sort === "random") return shuffle(list, seed);
  return list.sort((a, b) => { const name = a.name.localeCompare(b.name, "en"); if (sort === "name-asc" || sort === "name-desc") return sort === "name-asc" ? name : -name; const first = ARTIST_METADATA.get(a.id), second = ARTIST_METADATA.get(b.id); const delta = sort.startsWith("works") ? (first?.post_count ?? 0) - (second?.post_count ?? 0) : (first?.uniqueness_score ?? 0) - (second?.uniqueness_score ?? 0); return (sort.endsWith("desc") ? -delta : delta) || name; });
}
