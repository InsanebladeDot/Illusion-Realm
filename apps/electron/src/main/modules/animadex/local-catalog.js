/**
 * 本地角色目录：读取随安装分发的 JSON，提供四属性交集检索。
 * 开发态与打包态使用同一份 shared 数据，不执行 renderer 的 TS。
 * 此模块不访问网络、不下载权重、不读取用户模型文件夹。
 * 创建页经既有角色 IPC 调用，Agent 经宿主工具直接调用。
 * 两个入口因此使用同样的匹配、分页与未知属性语义。
 * 数据只缓存成功读取的结果，第一次失败后允许下次重新读取。
 * 返回角色卡形状以复用收藏、多选、详情与提示词应用。
 * 封面按 AnimaDex 已有的姓名与作品命名规则关联，不额外搜索每张卡。
 * 图片加载交给已有卡片，资料查询本身仍可完全离线运行。
 * 参考热度来自 post_count，不代表用户生成统计或实时站点计数。
 */
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
 * JSON 是应用随包资料，不接受调用方指定磁盘路径。
 * 开发根通过 core 查找，不假定 app.getAppPath 等于 monorepo 根。
 * 打包资源在 resources 根，与 electron-builder 的复制目标一致。
 * 异步读取让首查不阻塞主进程文件 I/O。
 * 解析时先作为 unknown，再逐行验证完整数据契约。
 * 缺失字段视为损坏，不能静默过滤后假装数据完整。
 * 原始空字符串允许保留，代表未知属性。
 * post_count 必须是有限数；不会把未知热度强制变成流行角色。
 * 失败向上返回，由 IPC 或宿主工具提供受控错误信息。
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
 * 复用线上卡片契约，slug 加 local 前缀隔离不同来源的收藏。
 * 编码完整角色名与作品，避免只按名字覆盖同名不同作品。
 * 原始姓名就是本地库可证实的触发标签，不生成未知别名。
 * 性别原值如 1girl 可以直接应用；颜色需要补属性后缀。
 * 颜色缺失就不生成对应 tag，不能补默认蓝眼或金发。
 * copyright 不当作外观 tag，防止作品与角色提示词混淆。
 * reference 始终保留原值，供 Agent 明确列出未知字段。
 * LoRA 数组故意为空；角色资料不证明本地有同名权重。
 * 像用姓名和作品找到书架上的封面，完整身份决定 CDN 文件名。
 * 姓名后接英文逗号和空格，再接作品原文，与参考工具的资源规则一致。
 * 整个身份一起编码，斜杠、问号和中文不会变成路径层级或查询参数。
 * 不把空格换下划线，也不转小写；资源文件名与检索规范化是两件事。
 * 缺少作品时只用姓名，不添加多余逗号，兼容未分类的原始记录。
 * 仅创建本页的预览地址，不用搜索接口逐个补八千份资料。
 * 卡片复用 LibraryCard 的懒加载，列表外图片由浏览器决定何时加载。
 * 固定 HTTPS 域名，不接受用户提供的远端端点或本地磁盘路径。
 * 此处关联的是站点缩略图，不猜测不存在的高清原图路径。
 * imageUrl 同用缩略图，使点击详情时能先显示同一张参考封面。
 * hasImage 保持 false：地址可推导不代表站点已确认资源存在。
 * 404 或断网由卡片缺图回退处理，不能让本地姓名检索失败。
 * 浏览器复用同地址的图片缓存，不再创建第二套磁盘缓存或用户数据段。
 * 本地 url 和 LoRA 仍为空；封面规则不能作为来源页面或权重推荐的依据。
 * rating/favCount 是卡片兼容字段，不代表真实站点评价。
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
 * 先应用四属性交集，再查名称，确保颜色条件不会被精确姓名绕过。
 * 属性完整分类按相等匹配，blonde 不会意外命中其他字符串片段。
 * 名称先匹配标准名和已收录别名，没有命中才取片段或单处错字候选。
 * 结果仍保留全部同层候选，不按热度替用户确认身份。
 * 如果数据真的存在同名项，仍全部返回供用户用作品区分。
 * 热度排序使用原始数据；没有时间字段，不伪造“最新”时间顺序。
 * az 按英文名排序，recent 在本地仍使用稳定参考热度。
 * 页码超过范围时夹到最后一页，零项仍有一个空页。
 * facets 从整份库推导，保证空查询后仍能选择有效分类。
 * 空属性不作为可选分类，用户清除过滤即可包含未知属性。
 * 结果最多六十项，Agent 更小的八项上限由调用者指定。
 * 统计先于切片，总数不能被误读为当前页长度。
 * 不把当前选择写回磁盘，因此筛选无持久化副作用。
 * @param {import('@illusion-realm/shared').AnimadexSearchParams} [params]
 * @returns {Promise<import('@illusion-realm/shared').AnimadexSearchResult>}
 */
async function searchLocalCharacters(params = {}) {
  // rows 为已验证资料；过滤产生新数组，排序不会改变缓存本身。
  // 不把每次查询的 UI 状态写回原始数据，保持跨窗口结果稳定。
  // query 不参与四个分类字段，以免作品关键字被误当角色名。
  // 未填写姓名时保留整份分类候选，再按指定页返回摘要。
  const rows = await loadCatalog();
  let { rows: matches } = await matchLocalCharacters(params);
  matches.sort((a, b) => params.sort === "az" ? a.name.localeCompare(b.name) : b.post_count - a.post_count);
  // 只有固定数量的卡片会被归一化，避免每页反复创建八千份大对象。
  // 页号变化不改变 total，前端可以据此渲染稳定的分页总量。
  // 页面变窄仅改变网格列数，不应悄悄改变当前筛选逻辑。
  // 页长和页号由入口验证为正整数，这里只处理上限和末页夹紧。
  const pageSize = Math.min(params.pageSize || 36, 60), pages = Math.max(1, Math.ceil(matches.length / pageSize)), page = Math.min(params.page || 1, pages);
  // 空数组必须标明元素类型，不能让 checkJs 推成不可写入的 never[]。
  // 四个属性键由共享结果类型限定，遗漏分类会在类型检查中报错。
  // 分类只包含非空资料值，未知属性不会被转成伪造的选项。
  /** @type {Record<'copyright'|'gender'|'hair'|'eye', string[]>} */
  const facets = { copyright: [], gender: [], hair: [], eye: [] };
  // 侧栏数字表示整库分类数量，不用当前分页卡片数或 post_count 热度代替。
  // 每个字段分别计数，同一个 blue 不能混合发色和瞳色两种分母。
  // 空字符串是未知，不创建一个误导性的“无颜色”分类。
  // Object.create(null) 避免资料值与对象原型键冲突，IPC 可正常序列化。
  // 计数不随当前筛选变化，用户能稳定浏览和切换其他分类。
  // 每个非空字段一条记录只贡献一次，因此数值可以独立对照原始 JSON。
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
 * 先按属性筛选，再执行姓名分层匹配，创建页和 Agent 都从这里进入。
 * 作品、性别与颜色仍是严格条件，不为命中姓名偷偷取消外观约束。
 * 名称索引以完整原数组缓存，候选集合只决定这一轮允许返回哪些身份。
 * 带作品的无结果不会在这里自动放宽；只有 Agent 身份查询可做一次回退。
 * 浏览页因此不会出现选择某作品却混入其他作品的卡片。
 * 属性为空字符串表示没有限制，未知资料只有在用户不筛该属性时才会出现。
 * 姓名检索得到的记录仍引用同一份 rows，名称索引不会脱离分类范围。
 * 不根据发色自动翻译颜色名，调用方应使用分类工具返回的真实值。
 * 加载错误直接向上传递，不能返回空列表后误导用户修改查询文字。
 * 创建页和 Agent 可以共用此处的缓存，但各自决定展示数量和确认交互。
 * 重复调用 loadCatalog 命中已验证数组，不会为两个入口重复读取 JSON。
 * @param {import('@illusion-realm/shared').AnimadexSearchParams} params
 */
async function matchLocalCharacters(params) {
  const rows = await loadCatalog();
  const candidates = rows.filter(row => FIELDS.every(field => !params[field] || characterKey(row[field]) === characterKey(params[field] || "")));
  return matchCharacterRows(rows, candidates, params.q || "");
}

/**
 * Agent 只要身份和触发词，不用每次构造整库分类及图片展示信息。
 * 姓名和作品同时提供却没有结果时，仅允许一次忽略作品的本地补查。
 * 回退保留性别、头发和眼睛限制，错误外观不能靠姓名精确命中绕过。
 * 即使回退只有一人也标记作品待确认，防止自动换成另一作品的角色。
 * 单处错字结果同样要确认；精确、别名或唯一片段可以继续当前任务。
 * 先计算完整命中数再截取前三项，不能把三项上限当成“只有三人”。
 * 外观浏览仍保留八项，兼容原来让用户选择候选的交互。
 * 本地没有结果也不联网，失败与缺失由调用者分别报告。
 * 放宽作品像找通讯录时暂时忽略记错的公司，不能直接认定找到的就是本人。
 * workConflict 标记表示作品条件曾被放宽，即使最后的人名完全精确仍须确认。
 * 如果去掉作品仍无命中，保持普通空结果，不伪造作品冲突或成功阶段。
 * 性别、头发、眼睛是明确输入，不随作品回退一起清空。
 * 仅分类浏览不触发作品回退，避免展示另一部作品的热门角色。
 * q 只有空白时按浏览处理，不把空查询视为“已经确定姓名”。
 * 多候选先排序再切片是展示选择，不改变 needsConfirmation 的结论。
 * total 取完整数组长度，返回三项并不意味着后面没有其他匹配。
 * match.type 记录实际命中的层级，调用方无需从说明文案猜是否纠错。
 * 调用方可将 nextAction 映射为继续任务或询问，但这里不决定用户的任务类型。
 * 即使姓名可直接使用，也没有授予本来只要求清单的用户一次生成操作。
 * 卡片仍由原 characterCard 生产，触发词与创建页保持一致。
 * 这里跳过 facets 构造，不影响创建页侧栏继续显示完整分类与数量。
 * 省略图片展示信息不是删除原库资料，其他页面读取仍使用原来的卡片协议。
 * 单处拼写差异不因唯一命中而升级为精确角色，纠错始终是候选建议。
 * 作品错误的输入只尝试一次回退，不循环猜测作品别名或多套译名。
 * 搜索没有持久化副作用，确认问题后的新查询重新按用户提供的信息匹配。
 * 返回值只含资料与判断标志，异常仍由宿主工具统一转成失败回执。
 * 没有网络降级，离线使用时成功与失败都可重复验证。
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
 * IPC 与 Agent 都先验证再查询，避免把模型输出当可靠类型。
 * 此校验与 shared 的 AnimadexSearchArgsSchema 对齐。
 * 陌生字段拒绝而非忽略，能向 Agent 暴露拼错的属性名。
 * UI 的空筛选合法；工具另行要求至少一个非空查询条件。
 * 页码与页长必须是正整数，防止 NaN 和负值破坏切片。
 * 页长超过六十仍由检索层夹紧，保持既有远端兼容行为。
 * 返回错误文本给 registerHandle，转换为 INVALID_ARGUMENT。
 * 不在错误中回显参数，避免日志泄露用户提供的文字。
 * @param {unknown} value
 * @returns {string | null}
 */
function validateCharacterSearch(value) {
  // typeof null 也是 object，必须先排除才能安全读取字段。
  // 数组即使挂了 source 属性也不是搜索对象，不能被宽松接受。
  // 只验证公开契约，不按 JS 原型或构造器推断调用者可信度。
  // 未知字段会让条件被悄悄忽略，因此采用白名单而非宽松透传。
  if (!value || typeof value !== "object" || Array.isArray(value)) return "角色筛选参数必须是对象";
  const args = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(args).some(field => !["source", "q", "sort", "page", "pageSize", ...FIELDS].includes(field))) return "不支持的角色筛选字段";
  if (["q", ...FIELDS].some(field => args[field] !== undefined && (typeof args[field] !== "string" || /** @type {string} */ (args[field]).length > 200))) return "角色筛选文字须不超过 200 个字符";
  if (["page", "pageSize"].some(field => args[field] !== undefined && (!Number.isInteger(args[field]) || Number(args[field]) < 1))) return "角色页码与页长须为正整数";
  // source 控制联网行为，必须枚举，不能接受字符串模糊匹配。
  // sort 仅保留既有 recent/az，不能把任意字段名当动态排序键。
  // 不支持的在线属性明确报错，防止用户误以为已按发色过滤。
  // copyright 在线仍支持，因为它是原远端接口的正式参数。
  if (args.source !== undefined && args.source !== "local" && args.source !== "online") return "未知角色库来源";
  if (args.sort !== undefined && args.sort !== "recent" && args.sort !== "az") return "未知角色排序";
  if (args.source !== "local" && ["gender", "hair", "eye"].some(field => args[field])) return "在线角色库不支持外观筛选，请使用本地参考库";
  return null;
}

// 导出稳定搜索和验证边界，测试不需要访问缓存内部状态。
// shared JSON 仍是唯一资料源，不通过此导出允许外部注入角色记录。
// 加载错误不会被空数组掩盖，调用方应明确展示资料不可用。
// 身份查询保持在主进程内部，不增加新的 IPC 或任意资料读写入口。
// 普通页面继续使用原分页卡片契约；Agent 使用较小且有匹配依据的摘要。
module.exports = { searchLocalCharacters, searchLocalIdentity, validateCharacterSearch };
