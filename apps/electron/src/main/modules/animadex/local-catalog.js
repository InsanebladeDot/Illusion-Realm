/** 本地角色库供创建页和 Agent 共用检索；只缓存成功读取的随包 JSON，查询不联网。 */
const fs = require("node:fs/promises"), path = require("node:path");
const { app } = require("electron"), { getAppRootDir } = require("../../core/paths");
// 创建页和 Agent 使用相同分层规则，索引仅缓存标准名与有依据的别名。
// 不把容错候选自动升级为确定身份，Agent 另外读取匹配层级。
// 属性筛选仍在匹配前执行，姓名不能绕过用户指定的外观条件。
const { characterKey, matchCharacterRows } = require("./character-matcher");

/** @typedef {{name:string,copyright:string,gender:string,hair:string,eye:string,post_count:number}} ReferenceRow */
/** @type {ReferenceRow[] | undefined} 只缓存成功解析且字段完整的内置数据。 */
let cached;
// 四项顺序也用于生成分类列表和标签，避免两个入口各自定义顺序。
// 属性名直接来自原始资料，不能混同颜色字段或翻译后再反向猜值。
// name 不作为分类，因为它用于自由文本检索和精确身份确认。
const FIELDS = /** @type {const} */ (["copyright", "gender", "hair", "eye"]);

/**
 * 按开发/打包路径读取并逐行校验，坏资料整体报错；空属性表示未知。
 * @returns {Promise<ReferenceRow[]>}
 */
async function loadCatalog() {
  if (cached) return cached;
  const file = app?.isPackaged ? path.join(process.resourcesPath, "character-reference.json") : path.join(getAppRootDir(), "packages/shared/src/data/character-reference.json");
  const raw = /** @type {unknown} */ (JSON.parse(await fs.readFile(file, "utf8")));
  if (!Array.isArray(raw) || !raw.every(row => row && typeof row.name === "string" && FIELDS.every(field => typeof row[field] === "string") && Number.isFinite(row.post_count))) throw new Error("角色参考资料格式不完整");
  cached = /** @type {ReferenceRow[]} */ (raw);
  return cached;
}

/**
 * 沿用原角色卡契约，以姓名和作品区分身份；缺失外观不补默认值，也不猜同名 LoRA。
 * 缩略图按完整身份编码推导，hasImage=false，不把可推导地址当作已确认存在。
 * @param {ReferenceRow} row
 * @returns {import('@illusion-realm/shared').AnimadexCharacter}
 */
function characterCard(row) {
  const tags = [row.gender, row.hair && `${row.hair} hair`, row.eye && `${row.eye} eyes`].filter(Boolean);
  const identity = row.copyright ? `${row.name}, ${row.copyright}` : row.name;
  const preview = `https://blobs.animadex.net/Outputs/thumbs/${encodeURIComponent(identity)}.webp`;
  return { slug: `local:${encodeURIComponent(row.copyright)}:${encodeURIComponent(row.name)}`, name: row.name, copyright: row.copyright, copyrightName: row.copyright, trigger: row.name, tags, count: row.post_count, reference: { gender: row.gender, hair: row.hair, eye: row.eye }, url: "", thumbUrl: preview, imageUrl: preview, hasImage: false, loras: [], rating: { up: 0, down: 0 }, favCount: 0 };
}

/**
 * 属性先取交集，再匹配姓名；recent 沿用参考热度，不虚构更新时间。
 * 总数先于分页，只转换当前页卡片；分类计数始终来自整库。
 * @param {import('@illusion-realm/shared').AnimadexSearchParams} [params]
 * @returns {Promise<import('@illusion-realm/shared').AnimadexSearchResult>}
 */
async function searchLocalCharacters(params = {}) {
  const rows = await loadCatalog();
  let { rows: matches } = await matchLocalCharacters(params);
  matches.sort((a, b) => params.sort === "az" ? a.name.localeCompare(b.name) : b.post_count - a.post_count);
  const pageSize = Math.min(params.pageSize || 36, 60), pages = Math.max(1, Math.ceil(matches.length / pageSize)), page = Math.min(params.page || 1, pages);
  // 空数组必须标明元素类型，不能让 checkJs 推成不可写入的 never[]。
  // 四个属性键由共享结果类型限定，遗漏分类会在类型检查中报错。
  // 分类只包含非空资料值，未知属性不会被转成伪造的选项。
  /** @type {Record<'copyright'|'gender'|'hair'|'eye', string[]>} */
  const facets = { copyright: [], gender: [], hair: [], eye: [] };
  // 空属性不建分类，四个字段各自计数，不能混用发色与瞳色分母。
  /** @type {NonNullable<import('@illusion-realm/shared').AnimadexSearchResult['facetCounts']>} */
  const facetCounts = { copyright: Object.create(null), gender: Object.create(null), hair: Object.create(null), eye: Object.create(null) };
  for (const row of rows) for (const field of FIELDS) if (row[field]) facetCounts[field][row[field]] = (facetCounts[field][row[field]] || 0) + 1;
  for (const field of FIELDS) facets[field] = [...new Set(rows.map(row => row[field]).filter(Boolean))].sort();
  // 总数、分类、计数与这一页卡片来自同一源；不冒充线上完整角色统计。
  // 创建页展示数量徽标，Agent 原有摘要仍只取候选而不倾倒整个计数表。
  // 按属性过滤在前面已完成，附加计数不会扩大实际返回候选。
  return { total: matches.length, page, pageSize, pages, facets, facetCounts, results: matches.slice((page - 1) * pageSize, page * pageSize).map(characterCard) };
}

/**
 * 先严格筛属性，再按姓名层级匹配；普通浏览不放宽作品，Agent 的补查由下一层决定。
 * @param {import('@illusion-realm/shared').AnimadexSearchParams} params
 */
async function matchLocalCharacters(params) {
  const rows = await loadCatalog();
  const candidates = rows.filter(row => FIELDS.every(field => !params[field] || characterKey(row[field]) === characterKey(params[field] || "")));
  return matchCharacterRows(rows, candidates, params.q || "");
}

/**
 * 像查通讯录时暂时忽略记错的公司：姓名加作品无结果时，仅放宽一次作品，仍保留外观条件。
 * 错字或放宽作品后的唯一结果也要确认；先算总命中数，再取身份前三项或浏览前八项。
 * @param {import('@illusion-realm/shared').AnimadexSearchParams} params
 */
async function searchLocalIdentity(params) {
  let match = await matchLocalCharacters(params);
  let workConflict = false;
  // 只有带姓名的身份查询才试一次作品回退；属性浏览仍保持严格交集。
  // 重查用展开后的新对象，不会把调用方保存的原作品条件删除。
  if (!match.rows.length && params.q?.trim() && params.copyright?.trim()) {
    match = await matchLocalCharacters({ ...params, copyright: undefined });
    workConflict = match.rows.length > 0;
  }
  const identifying = Boolean(params.q?.trim());
  const needsConfirmation = !match.rows.length || (identifying && (match.rows.length !== 1 || match.type === "fuzzy" || workConflict));
  const results = match.rows.sort((a, b) => b.post_count - a.post_count).slice(0, identifying ? 3 : 8).map(characterCard);
  return { total: match.rows.length, results, match: { type: match.type, workConflict }, needsConfirmation };
}

/**
 * IPC 与 Agent 共用输入校验，与 shared 对齐；只返回固定错误，不回显查询文字。
 * @param {unknown} value
 * @returns {string | null}
 */
function validateCharacterSearch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "角色筛选参数必须是对象";
  const args = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(args).some(field => !["source", "q", "sort", "page", "pageSize", ...FIELDS].includes(field))) return "不支持的角色筛选字段";
  if (["q", ...FIELDS].some(field => args[field] !== undefined && (typeof args[field] !== "string" || /** @type {string} */ (args[field]).length > 200))) return "角色筛选文字须不超过 200 个字符";
  if (["page", "pageSize"].some(field => args[field] !== undefined && (!Number.isInteger(args[field]) || Number(args[field]) < 1))) return "角色页码与页长须为正整数";
  // 在线接口不支持外观筛选，要明确拒绝，不能让用户误以为过滤已生效。
  if (args.source !== undefined && args.source !== "local" && args.source !== "online") return "未知角色库来源";
  if (args.sort !== undefined && args.sort !== "recent" && args.sort !== "az") return "未知角色排序";
  if (args.source !== "local" && ["gender", "hair", "eye"].some(field => args[field])) return "在线角色库不支持外观筛选，请使用本地参考库";
  return null;
}

module.exports = { searchLocalCharacters, searchLocalIdentity, validateCharacterSearch };
