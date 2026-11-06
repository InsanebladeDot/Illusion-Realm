/** 收藏快照校验：读取用户 JSON 时逐项收窄，坏条目不能破坏其他库。 */
// 外部文档像收到的通讯录，先核对每页的字段再放入列表，不直接相信类型断言。
// 读取只整理数据，没有联网补图、写盘或改变当前选择的副作用。
// 导出与界面恢复使用同一规范，避免两种形状互相覆盖。
import type { AnimadexCharacter } from "@/types/character";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import type { StaticFavoriteLibrary, UserDataLibraryFavorites } from "@/types/library-favorites";

export const STATIC_FAVORITE_LIBRARIES: StaticFavoriteLibrary[] = ["pose", "background", "expression"];
// 每次提供新的空对象，多个 store 测试或用户文档之间不能共享可变数组。
// version 不认识时回落空收藏，不能擅自解释未来版本的字段。
export const emptyLibraryFavorites = (): UserDataLibraryFavorites => ({ version: 1, items: { pose: [], background: [], expression: [] } });

// 数组不是记录对象；拒绝它可避免把数字索引误解为配置属性。
// 字符串只保留原值，不在恢复时偷偷改变用户曾收藏的触发词。
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

// id、名称、英文标签是可应用条目的最低条件，空图片仍属于合法收藏。
// 只挑选声明字段，不将外部 JSON 额外夹带的配置带回导出文件。
// 中文译名与特征是可选内容，未知时保持空值而非从图片猜测。
// 原对象不会被修改，后面按 id 去重也不会影响源库。
function tagSnapshot(value: unknown): StaticTagItem | null {
  const item = record(value);
  if (!text(item.id) || !text(item.name) || !text(item.tags).trim()) return null;
  return { id: text(item.id), name: text(item.name), name_zh: text(item.name_zh), tags: text(item.tags), tags_zh: text(item.tags_zh), categories: strings(item.categories), traits: strings(item.traits), folder: text(item.folder), preview: text(item.preview) };
}

// 各分区独立校验，一条坏背景不会清掉动作收藏。
// 同一 id 重复出现时保留最后一条快照，数组顺序以首次登记身份为准。
// 单库设置读取上限，避免损坏文档把数十万条重复记录都挂进 UI。
// 上限只用于恢复输入保护，正常收藏数量不从当前页反推。
export function normalizeLibraryFavorites(value: unknown): UserDataLibraryFavorites {
  const input = record(value);
  const result = emptyLibraryFavorites();
  if (input.version !== 1) return result;
  const items = record(input.items);
  for (const library of STATIC_FAVORITE_LIBRARIES) {
    const raw = items[library];
    if (!Array.isArray(raw)) continue;
    const entries = raw.slice(0, 10000).map(tagSnapshot).filter((item): item is StaticTagItem => !!item);
    result.items[library] = [...new Map(entries.map(item => [item.id, item])).values()];
  }
  return result;
}

// 角色快照恢复为现有卡片契约，缺失的在线热度与推荐信息不影响标签应用。
// 本地属性只有实际存在时保留，不能从角色名猜性别或发色。
// 来源链接和图片地址仍是普通数据，视图沿用原媒体加载与失败边界。
// 数量字段拒绝 Infinity 和 NaN，避免显示非法数字或破坏排序。
// LoRA 推荐不是收藏生成必需字段，恢复后可在原详情流程重新读取。
function characterSnapshot(value: unknown): AnimadexCharacter | null {
  const item = record(value);
  if (!text(item.slug) || !text(item.name)) return null;
  const reference = record(item.reference);
  return { slug: text(item.slug), name: text(item.name), copyright: text(item.copyright), copyrightName: text(item.copyrightName), trigger: text(item.trigger), tags: strings(item.tags), count: typeof item.count === "number" && Number.isFinite(item.count) ? item.count : 0, url: text(item.url), thumbUrl: text(item.thumbUrl), imageUrl: text(item.imageUrl), hasImage: item.hasImage === true, loras: [], rating: { up: 0, down: 0 }, favCount: 0, reference: Object.keys(reference).length ? { gender: text(reference.gender), hair: text(reference.hair), eye: text(reference.eye) } : undefined };
}

// slug 是身份清单，快照必须属于清单中仍被收藏的角色。
// 取消收藏后遗留的脏快照不会在重新读取时变成幽灵收藏。
// 旧版本只有 slug 时正常保留身份，之后可从当前资料页补齐快照。
// 未收藏的浏览记录不会进入导出，避免把整页角色一起写入用户文档。
export function normalizeFavoriteCharacters(value: unknown, slugs: string[]): AnimadexCharacter[] {
  if (!Array.isArray(value)) return [];
  const entries = value.slice(0, 10000).map(characterSnapshot).filter((item): item is AnimadexCharacter => !!item && slugs.includes(item.slug));
  return [...new Map(entries.map(item => [item.slug, item])).values()];
}

// 旧本地身份已明确编码作品与名字，可精确恢复这两个字段，不用模糊匹配。
// 只接受 local:作品:名字 的三段格式，未知在线 slug 不猜成角色名。
// 解码失败保留空结果，界面可提示仍有旧收藏缺快照，不能吞掉其身份记录。
// 属性和图片不在旧身份里，恢复时保持空值，不编造角色外观或在线预览。
function legacyLocalCharacter(slug: string): AnimadexCharacter | null {
  const parts = slug.split(":");
  if (parts.length !== 3 || parts[0] !== "local") return null;
  try {
    const name = decodeURIComponent(parts[2]);
    const copyright = decodeURIComponent(parts[1]);
    return characterSnapshot({ slug, name, copyright, copyrightName: copyright, trigger: name });
  } catch { return null; }
}

// 快照优先，当前页真实资料用于兼容尚未保存快照的老收藏。
// 只有仍在身份清单里的条目可出现，不把在线搜索的普通结果升级为收藏。
// 数组按收藏身份顺序生成，查询页的不同排序不让收藏列表来回跳动。
export function favoriteCharacterCatalog(slugs: string[], saved: AnimadexCharacter[], current: AnimadexCharacter[] = []): AnimadexCharacter[] {
  const indexed = new Map([...current, ...saved].map(item => [item.slug, item]));
  return slugs.map(slug => indexed.get(slug) ?? legacyLocalCharacter(slug)).filter((item): item is AnimadexCharacter => !!item);
}

// 收藏页在保存快照的完整集合上检索，不能再只过滤远端当前页。
// 作品名同时接受 slug 和显示名，但属性筛选保持资料原值。
// 当前页外的收藏也参与搜索，最后再由现有分页器切片。
// 查询不会修改快照；收藏中的旧资料与本轮在线结果各有自己的身份来源。
export function filterFavoriteCharacters(items: AnimadexCharacter[], query: string, work: string, traits: Partial<Record<"gender" | "hair" | "eye", string>>): AnimadexCharacter[] {
  const needle = query.trim().toLowerCase();
  return items.filter(item => (!needle || [item.name, item.trigger, item.copyright, item.copyrightName].some(value => value.toLowerCase().includes(needle))) && (!work || [item.copyright, item.copyrightName].includes(work)) && Object.entries(traits).every(([key, value]) => !value || item.reference?.[key as "gender" | "hair" | "eye"] === value));
}
