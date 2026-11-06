/**
 * 给 Agent 暴露创建页同一份本地/Animadex 检索，避免模型凭记忆猜角色译名。
 * 这里只读角色资料，不下载 LoRA，也不把站点推荐误认为本机已安装模型。
 * 默认从内置八千条角色资料检索，显式 online 才请求 Animadex。
 * 按名确认最多返回三个候选，分类浏览保留八个；名称、作品与触发词用于核对身份。
 * query 若提供必须来自用户；也可只按作品、性别、发色、瞳色浏览候选。
 * copyright、gender、hair、eye 均与创建页使用同一交集匹配。
 * 查询无结果或仍有歧义时要求用户确认，不自行猜译名连续换词搜索。
 */
const { searchCharacters } = require("../animadex");
// 参数校验与 UI IPC 复用，不能让 Agent 绕过分类的类型约束。
// source 默认本地；只有明确指定 online 才允许外部角色站点请求。
// 结果不会包含模型目录或任何私人文件路径。
// Agent 的离线身份摘要跳过整库分类构造，但共用页面的名称匹配器。
// 显式在线查询仅保留旧入口兼容，默认检索和失败回退都不联网。
// 返回层级和作品冲突，让执行器能区分容错候选与已确认身份。
const { validateCharacterSearch, searchLocalIdentity } = require("../animadex/local-catalog");

/**
 * 模型参数要经运行时验证，工具声明并不能保证调用者遵守。
 * source 缺省为 local，保证普通角色查询可以离线完成。
 * query 转为 UI 同一 q 字段，其余字段使用同一校验器。
 * 只要一种非空条件即可查询，支持仅按外观浏览候选。
 * 全空请求拒绝，避免模型把整个角色库当上下文展开。
 * 未知字段不静默丢弃，直接反馈参数错误以便更正。
 * 返回 params 不含调用者可控 URL 或绝对文件路径。
 * 页码固定第一页，模型不能自主逐页扫描八千条记录。
 * @param {Record<string, unknown>} args
 * @returns {import('@illusion-realm/shared').AnimadexSearchParams}
 */
function characterParams(args) {
  // Schema 之外的调用也必须拒绝拼错字段，而非悄悄忽略后扩大结果。
  // query 是工具层名称，只有适配器可以将它转成 UI 的 q 字段。
  // 页码固定，不允许调用方覆盖后绕过候选条数限制。
  if (Object.keys(args).some(field => !["query", "source", "copyright", "gender", "hair", "eye"].includes(field))) throw new Error("不支持的角色查询字段");
  const { query, ...filters } = args;
  const params = { source: "local", ...filters, q: query, page: 1, pageSize: 8 };
  const invalid = validateCharacterSearch(params);
  if (invalid) throw new Error(invalid);
  if (![query, args.copyright, args.gender, args.hair, args.eye].some(value => typeof value === "string" && value.trim())) throw new Error("请提供角色名或至少一个角色分类");
  return /** @type {import('@illusion-realm/shared').AnimadexSearchParams} */ (params);
}

/**
 * 只输出角色身份和提示词所需信息，移除缩略图等大段展示数据。
 * 候选的 trigger 与 tags 使用来源的原始资料，不用模型推测来补全不存在的标签。
 * 站点推荐 LoRA 只是检索线索，实际加载仍要查询本地 LoRA 及主模型兼容性。
 * 候选数量来自上游 total；截断时保留总数，不把八项当作全部匹配。
 * 同名角色通过作品字段区分，不把第一项自动当成用户要的角色。
 * 空结果明确返回 needsConfirmation，让下一步成为询问而非递归搜索。
 * 按姓名多项结果保留确认；按外观浏览时可以返回多个候选供用户选择。
 * 角色库不一定收录所有中文别名，因此没命中不等于角色不存在。
 * 推荐的名字不包含本机路径或用户模型目录，避免无关本地清单外发。
 * 本地读取错误不转为在线补猜；在线网络错误沿既有超时返回。
 * 空姓名允许属性检索，但全空条件被拒绝，防止整库遍历。
 * 页码固定第一页；分页由用户补充作品后缩小范围，而非 Agent 自行遍历。
 * 结果不下载封面，避免普通身份确认变成额外流量和文件写入。
 * @param {Record<string, unknown>} args
 * @returns {Promise<string>}
 */
async function queryCharacters(args) {
  const params = characterParams(args);
  const result = params.source === "local" ? await searchLocalIdentity(params) : await searchCharacters(params);
  const characters = result.results.map(item => ({ name: item.name, slug: item.slug, copyright: item.copyrightName || item.copyright, trigger: item.trigger, tags: item.tags.slice(0, 24), gender: item.reference?.gender || null, hair: item.reference?.hair || null, eye: item.reference?.eye || null, missingFields: ["gender", "hair", "eye"].filter(field => !item.reference?.[/** @type {"gender"|"hair"|"eye"} */ (field)]), suggestedLoras: item.loras.slice(0, 4).map(lora => lora.name) }));
  const intent = typeof args.query === "string" && args.query.trim() ? "identify" : "browse";
  // 缺失字段和候选总数继续保留，精简不能省掉反幻觉的必要依据。
  // 回退和错字需要确认，即使仅一项也不能当作可直接生成。
  // nextAction 表示可以使用资料，不是对生成的额外授权。
  // 是否执行仍取决于最新用户请求；只列清单时不能自动画图。
  // 不再每条回执重复长规则，规则在正式工具声明和系统指令维护。
  // characters 只是有限候选，歧义判断必须使用上游完整 total 和确认标志。
  // tags 保留资料原文；没有发色资料仍明确给 null，不用常见印象填补。
  // 本地结果不附整库分类表，按分类浏览另有只读工具，避免普通姓名查询过重。
  const needsConfirmation = "needsConfirmation" in result ? result.needsConfirmation : result.total === 0 || (intent === "identify" && result.total !== 1);
  return JSON.stringify({ source: params.source, query: params.q || "", intent, total: result.total, returned: characters.length, truncated: result.total > characters.length, characters, ...("match" in result ? { match: result.match } : {}), needsConfirmation, nextAction: needsConfirmation ? "ask_user" : intent === "identify" ? "use_character" : "choose_candidate" });
}

// 只导出宿主工具执行函数，不新增 renderer 可随意请求网络的 IPC。
// host-tools 注册表会将声明交给 Python，执行仍留在主进程。
// 测试复用相同导出及本机模拟 HTTP，不调用真实角色服务或生成模型。
/**
 * 返回真实可用分类，避免 Agent 自己猜颜色标签或作品拼写。
 * field 只接受四个数据属性，query 仅按分类文本包含匹配。
 * 单次最多三十个值，同时报告总数与截断状态。
 * 分类取自整份本地资料，不依赖外网或当前搜索命中页。
 * 前缀不唯一时保留候选，不把相近的作品名当成一个作品。
 * 不接受任意 JSON 路径或动态属性，避免扩大数据访问面。
 * 查询文字只用于筛选，不执行其中的指令。
 * 全部分类过多时应让用户补充名称，而非不停翻页。
 * 返回 source 明确是参考数据，不能冒充权威的角色百科。
 * @param {Record<string, unknown>} args
 * @returns {Promise<string>}
 */
async function queryCharacterFilters(args) {
  // field 不能靠 String 强转，数组 ["hair"] 也不应被接受为属性名。
  // 固定字符串白名单与工具 Schema 的 enum 保持同一边界。
  // JSON 之外的直接调用仍应与模型工具入口表现一致。
  if (typeof args.field !== "string" || !["copyright", "gender", "hair", "eye"].includes(args.field) || Object.keys(args).some(field => !["field", "query"].includes(field))) throw new Error("请选择作品、性别、发色或瞳色分类");
  if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > 200)) throw new Error("分类关键词须不超过 200 个字符");
  const result = await searchCharacters({source:"local",pageSize:1});
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  const values = result.facets?.[/** @type {"copyright"|"gender"|"hair"|"eye"} */ (args.field)]?.filter(value => value.toLowerCase().includes(query)) || [];
  return JSON.stringify({source:"local",field:args.field,total:values.length,values:values.slice(0,30),truncated:values.length>30});
}

// 宿主直接使用这两个只读入口，不授予模型编辑内置资料的能力。
// 工具发现与真正执行共用此导出，避免仅有文档却无法调用。
// 无匹配是明确结果，不能声称工具已经确认未知属性。
module.exports = { queryCharacters, queryCharacterFilters };
