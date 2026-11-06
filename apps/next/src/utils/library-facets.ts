/**
 * 本地资料库分类规则：从完整可用数据计算计数，再组合场景和特征条件。
 * 复用静态标签库的关键词解析，不新增网络请求或第二份背景数据。
 * 分类括号内英文作为比较键，兼容数据中的中英双语分类名。
 * 角色作品菜单只展示热门三十项，输入作品名后可检索完整分类集合。
 * 这些函数只返回新数组，不排序或改写原始数据集。
 */
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { filterTagItems, type TagFilterInput } from "@/utils/tagLibrary";

/**
 * value 保留源数据原值，展示翻译不影响筛选和稳定键。
 * count 是条目数，不是图片热度，也不是当前页长度。
 * 同一条记录重复声明同一分类时只计一次。
 */
export interface LibraryFacet { value: string; count: number }

/**
 * categories 是多选并集，选中任意一个场景大类即可命中。
 * traits 是多选交集，例如夜晚与雨天需要同时存在。
 * 两组条件彼此取交集，空数组表示该组不限制。
 * 分类只针对背景启用，动作与表情仍使用旧的单分类规则。
 */
export interface BackgroundFilters { categories: string[]; traits: string[] }

/**
 * 括号提取严格限定末尾，避免误删名称中间的括号。
 * 只有比较时规范化；显示和返回给调用方的原值保持不变。
 * 英文名与“中文 (English)”能匹配相同类别。
 * 空白值返回空键，不额外发明默认场景。
 */
export function categoryKey(value: string): string {
  return (value.match(/\(([^)]+)\)\s*$/)?.[1] || value).trim().toLowerCase();
}

/**
 * 统计整份可用背景记录，分页与搜索不会让侧栏类别消失。
 * Set 排除单条记录内重复标签，避免右侧徽标虚高。
 * 按数量降序、原值升序稳定排列，特征列表遵循参考工具。
 * 忽略空项；不从生成提示词猜测未声明的 traits。
 * 结果使用 Map，外部分类名不能成为对象原型属性。
 * 返回统一的 value/count 结构供侧栏共用行组件消费。
 */
export function listLibraryFacets(items: StaticTagItem[], field: "categories" | "traits"): LibraryFacet[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const value of new Set(item[field].filter(Boolean))) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * 背景继续使用已有搜索与排序实现，避免中文关键词匹配分叉。
 * 已选视图直接展示全量选择草稿，不与旧搜索或分类再取交集。
 * 该视图只改变展示，分类值仍保留，退出后恢复原筛选结果。
 * 普通视图先做关键词搜索，然后检查分类并集与特征交集。
 * some 只用于 categories，every 只用于 traits，不能互换。
 * category 旧单选字段在背景模式下显式清空，防止隐藏条件叠加。
 * 字符串规范化仅用于大类；traits 使用源数据精确值。
 * 数据源不含某个标签时正常返回空数组，不自动放宽条件。
 * selectedItems 来自父组件已有多选状态，允许跨页选择。
 * 无副作用：不会修改选择、写入收藏或启动图片下载。
 */
// 输入示例：categories=[Nature & Outdoors, Urban & Daily]允许任意一个场景。
// traits=[night, rainy]要求同一条记录同时具备两个特征。
// 夜晚的自然场景与雨天的都市场景不能拼成一次虚假的联合命中。
// 一个条目属于两个已选大类时只返回一次，因为过滤遍历的是条目而非分类。
// 当前页来自调用方在过滤后截取，此函数绝不提前slice到24条。
// 分页总数应由完整返回数组计算，不能从最后一页长度反推全集。
// 空query和空条件保留原数据顺序，默认排序仍由源资料决定。
// 排序az只作用结果副本，不会让菜单计数依赖发生改变。
// 关键词覆盖中文名、英文名和双语标签，沿用应用已有匹配范围。
// 条件中的未知trait代表用户选择了未命中的值，不能自动忽略。
// selectedItems是完整草稿，因此两张不同页卡片仍能同时展示。
// 已选视图中的selectedIds不用于重新过滤，以对象草稿为事实来源。
// 调用方退出已选视图后仍可继续使用原来保存的两组分类条件。
// 函数不修改input，使用展开副本屏蔽背景不支持的旧单分类字段。
// 背景图片地址是否可访问不属于分类判据，离线时仍可搜索标签。
export function filterBackgroundItems(items: StaticTagItem[], input: TagFilterInput, filters: BackgroundFilters, selectedItems: StaticTagItem[]): StaticTagItem[] {
  if (input.selectedOnly) return filterTagItems(selectedItems, { ...input, query: "", category: "", selectedOnly: false });
  const categories = new Set(filters.categories.map(categoryKey));
  return filterTagItems(items, { ...input, category: "" }).filter(item => (!categories.size || item.categories.some(value => categories.has(categoryKey(value)))) && filters.traits.every(value => item.traits.includes(value)));
}

/**
 * 作品热度按本地角色条目数计算，不使用 post_count。
 * 未输入关键词时只返回前30项，避免侧栏加载数千作品。
 * 搜索针对完整分类集合，不局限于前30项。
 * 当前选中作品即使不在热门列表也保留一行，便于取消。
 * 搜索不命中当前作品时同样保留它，避免活动条件变成隐形。
 * 选择状态由父级维护，这里只生成菜单，不重写实际搜索条件。
 * 当数据暂未返回时输出空列表，不猜作品名称或数量。
 * 副本排序确保 facets 原始数组不会在 React 渲染时被修改。
 */
export function characterWorkFacets(values: string[], counts: Record<string, number>, query: string, selected = ""): string[] {
  const ordered = [...values].sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));
  const keyword = query.trim().toLowerCase();
  const visible = keyword ? ordered.filter(value => value.toLowerCase().includes(keyword)) : ordered.slice(0, 30);
  return selected && values.includes(selected) && !visible.includes(selected) ? [selected, ...visible] : visible;
}
