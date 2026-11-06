/**
 * 解析两站公开价目表，不执行远端 JavaScript 或计费表达式。
 * Euzhi 采用 New API 的公开 pricing 数据，按明确分组倍率折算。
 * 硅基流动官网的 RSC 脚本只解 JSON 字符串，不作为代码运行。
 * 两种格式均只保留聊天模型，图片、嵌入、音频不会进入 Agent。
 * 不认识的阶梯表达式显示未知价格，不能降级为零或套用旧公式。
 * 金额使用来源币种，每百万输入和输出 token 各自保留。
 * 精选是 UI 策略，不能据此声称每个模型已完成真实工具调用验证。
 * 官网改版导致无法解析时抛错，由缓存层保留上次有效数据。
 */
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; }
/**
 * 数字转换排除 null、布尔值、空串和无穷值；零才是确切免费。
 * 调用侧据 null 区分未知，不把异常价参与最便宜排序。
 * @param {unknown} value @returns {number|null}
 */
function number(value) { const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(n) && n >= 0 ? n : null; }
/**
 * 所有比较仅发生于同站同币种；输入输出等量是可解释的默认口径。
 * 同价时按数字版本倒序，避免字符串排序把 4.10 放在 4.9 后面。
 * 未知价格永远在末尾，账户明确不可用的模型不参加推荐。
 * @param {import('@illusion-realm/shared').AgentCatalogModel[]} models
 */
function recommend(models) { return [...models].filter(x => x.available !== false && x.input !== null && x.output !== null).sort((a,b) => (Number(a.input) + Number(a.output)) - (Number(b.input) + Number(b.output)) || b.id.localeCompare(a.id, 'en', { numeric: true }))[0]?.id || ''; }
// 推荐中的 available=null 是尚未用用户令牌核对，不代表已经可成功推理。
// available=false 的模型保留用于解释失败，但不参与默认选择。
// 基础价相加只是固定的一百万输入加一百万输出口径，不估算用户实际用量。
// 缓存命中比例未知，所以推荐不把缓存读取折扣当作普遍适用价格。
// 长上下文另行展示，不能宣称基础价最低的模型在所有上下文长度都最低。
// 不将 USD 的 Grok 与 CNY 的硅基流动直接放到同一个数字排序里。
// 比较器在调用前已经排除 null，Number 只为 checkJs 保持窄化后的数值运算。
// 空结果返回空串，调用层需要阻止发送，不得选取列表第一项冒充推荐。
/**
 * 只识别本站已核实的 base / longcontext token 表达式。
 * 这不是通用表达式计算器，不允许远端数据触发 eval 或 Function。
 * 未知表达式仍能列出模型，但不伪造最低价。
 * @param {string} expression @param {number} multiplier
 */
function expressionPrices(expression, multiplier) {
  // 只提取名为 base 的输入 p 与输出 c 系数；缓存 cr/cc 不算普通输入输出。
  // longcontext 提取显式 len 阈值，卡片可以向用户展示更贵的长输入价格。
  // 不使用 model_ratio 兜底未知表达式，因为新计费模式可能改变旧字段含义。
  // 正则只匹配数字，不接受函数调用、指数表达式或用户输入 JavaScript。
  // 这里的 multiplier 来自公开分组倍率，不包含充值赠送或兑换比例。
  // 小数精度保留给排序，格式化时再去掉二进制尾数，不提前四舍五入。
  // 未识别的长阶梯不会被假装成与基础价相同，服务商价目链接仍在界面可见。
  const price = /tier\("base",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)/.exec(expression);
  const long = /len\s*<=\s*(\d+).*tier\("longcontext",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)/.exec(expression);
  return { input: price ? Number(price[1]) * multiplier : null, output: price ? Number(price[2]) * multiplier : null, tiers: long ? [{ above: Number(long[1]), input: Number(long[2]) * multiplier, output: Number(long[3]) * multiplier }] : [] };
}
/**
 * 分组价格取公开可用分组中最低倍率，同时把对应分组名称回给界面。
 * 用户令牌若不能使用该分组，实际请求由认证检查或服务商拒绝。
 * 计次模型不能与 token 模型混排，因此排除 quota_type 非零的条目。
 * @param {Record<string,unknown>} row @param {Record<string,unknown>} ratios
 * @returns {import('@illusion-realm/shared').AgentCatalogModel|null}
 */
function grokModel(row, ratios) {
  // 支持 OpenAI chat endpoint 是进入 Agent 目录的前置条件，Responses-only 不收。
  // image/imagine/video/audio 名称排除用于防止不同协议进入聊天客户端。
  // quota_type=1 是按次计费，无法与每百万 token 基础价使用同一排序口径。
  // vendor_id 不是模型协议依据，不依赖站点内部厂商编号的稳定性。
  // enable_groups 可能包含目前未公布倍率的组，未知组不能当作默认倍率一。
  // group_ratio=0 是有效免费倍率，必须与字段不存在区分。
  // 多组最低价只用于公开参考；令牌仍可能只获准使用其中更贵的一组。
  // 界面保留最低倍率对应的全部组名，让用户能核对自己的令牌分组。
  // billing_expr 可能是外部不可信文本，仅按有限文法提取，不能执行。
  // context 未公布时取零作未知标志，而不是构造无限上下文能力。
  if (typeof row.model_name !== 'string' || !/^grok-/i.test(row.model_name) || /imagine|image|video|audio/i.test(row.model_name) || row.quota_type !== 0) return null;
  if (!Array.isArray(row.supported_endpoint_types) || !row.supported_endpoint_types.includes('openai')) return null;
  const groups = Array.isArray(row.enable_groups) ? row.enable_groups.filter(x => typeof x === 'string' && number(ratios[x]) !== null) : [];
  if (!groups.length) return null;
  const multiplier = Math.min(...groups.map(x => Number(ratios[x])));
  const ratio = number(row.model_ratio), completion = number(row.completion_ratio);
  const prices = row.billing_mode === 'tiered_expr' ? expressionPrices(String(row.billing_expr || ''), multiplier) : { input: ratio === null ? null : ratio * 2 * multiplier, output: ratio === null || completion === null ? null : ratio * 2 * completion * multiplier, tiers: [] };
  return { id: row.model_name, ...prices, currency: 'USD', tier: prices.input === 0 && prices.output === 0 ? 'free' : 'budget', groups: groups.filter(x => Number(ratios[x]) === multiplier), context: 0, pricingBasis: row.billing_mode === 'tiered_expr' ? 'tiered' : 'token', available: null };
}
/**
 * success:false 和缺少 data 均是目录失败，不将空对象当作成功。
 * 允许真正空列表，模型下架时不自动重新插入随包旧条目。
 * 重复 ID 按最后一条去重，避免 React key 和推荐不一致。
 * @param {unknown} value
 */
function parseEuzhi(value) {
  // success=false 常见于接口权限变化，不能把服务商错误页作为空目录成功。
  // data 必须为数组，HTML 或认证 JSON 的其他形状应进入缓存失败分支。
  // 空数组却是合法下架结果，与接口失效严格区分。
  // 每个条目独立过滤，目录包含非 Grok 不会让整个站点无法显示。
  // 相同模型多条记录按最后一条覆盖，避免重复 key 引起选择状态错配。
  // 解析器不携带认证状态，因此可复用于公开缓存与离线快照校验。
  const body = record(value);
  if (body.success !== true || !Array.isArray(body.data)) throw new Error('catalog');
  const models = body.data.map(x => grokModel(record(x), record(body.group_ratio))).filter(x => x !== null);
  return [...new Map(models.map(x => [x.id, x])).values()];
}
/**
 * 提取 Next Flight 内嵌的纯 JSON 数据树；绝不运行页面脚本。
 * 遍历只收带明确工具支持标记的聊天模型，忽略页面链接和描述。
 * 深度有上限，以免远端异常结构导致递归栈耗尽。
 * @param {unknown} value @param {Record<string,unknown>[]} rows @param {number} depth
 */
function collect(value, rows, depth = 0) {
  // Flight 树同时包含 React 元素数组和普通属性对象，遍历两者的值即可。
  // 只有具有完整目录特征的对象才收集，不从 HTML 文本猜测模型 ID。
  // normal 限制排除已经在官网标为停用或下架的条目。
  // functionCallSupport 必须是明确布尔 true，字符串 true 不当作能力证明。
  // 不递归进入已识别模型的描述字段，避免嵌套营销数据重复匹配。
  // 深度上限只拒绝不正常嵌套，不影响已核实官网浅层 data 数组。
  // 返回值是纯数据条目引用，后续映射会构造独立的跨进程对象。
  if (depth > 20 || !value || typeof value !== 'object') return;
  const row = record(value);
  if (row.subType === 'chat' && row.status === 'normal' && row.functionCallSupport === true && typeof row.modelName === 'string') rows.push(row);
  else for (const child of Object.values(value)) collect(child, rows, depth + 1);
}
/**
 * 公开字段 specification 区分输入输出，不能用卡片上的单一价格代替。
 * 缺一项价格仍允许展示，但保持 null，禁止贴免费标签。
 * 价目单位不是百万 token 的条目不按 token 价猜测。
 * @param {Record<string,unknown>} row
 * @returns {import('@illusion-realm/shared').AgentCatalogModel}
 */
function siliconModel(row) {
  // 官网卡片的 price 可能只显示输出价，不能据此构造输入价。
  // pricing 数组的 specification=prompt/completion 才是对应方向。
  // unitOfGood 必须明确包含 M Tokens，避免把每秒或每张价格当 token 价。
  // 未公布输入或输出任一项时仍保留 null，不能误贴免费徽章。
  // currency 固定来自本中文版官网的人民币目录，不跟随用户界面语言改变。
  // modelName 保留收费版 Pro/ 前缀，targetModelName 不是可替换的请求 ID。
  // contextLen 只展示已公布长度，缺失或无效回落未知标志。
  // tier=budget 的总价阈值是界面分档规则，不保证服务质量或性能。
  const prices = Array.isArray(row.pricing) ? row.pricing.map(record) : [];
  const input = number(prices.find(x => x.specification === 'prompt' && /M Tokens/.test(String(x.unitOfGood)))?.price);
  const output = number(prices.find(x => x.specification === 'completion' && /M Tokens/.test(String(x.unitOfGood)))?.price);
  return { id: String(row.modelName), input, output, currency: 'CNY', tier: input === 0 && output === 0 ? 'free' : input !== null && output !== null && input + output <= 12 ? 'budget' : 'premium', groups: [], context: number(row.contextLen) || 0, pricingBasis: 'token', tiers: [], available: null };
}
/**
 * RSC 被多个 script 分块时先按原顺序拼接，再逐行读取有 JSON 的节点。
 * 某些 Flight 行是资源引用而非 JSON，独立跳过，最后必须确实找到模型。
 * 不用宽泛正则直接截取对象，避免字符串内的括号破坏边界。
 * 解析结果保持原官网模型 ID，包括 Pro/ 前缀，不能改成 targetModelName。
 * @param {string} html
 */
function parseSiliconFlow(html) {
  // Next 可能把一行模型 JSON 分成多个 push，先拼接才能完整 JSON.parse。
  // script 外的页面文本不参与 JSON 识别，避免模型名称被重复收集。
  // Flight 行前缀是引用编号，去掉第一个冒号之前的部分再解析。
  // 资源和懒加载引用不是 JSON，单行失败可忽略，不能因此清空其他合法行。
  // 最后零条模型才是明确格式失效，调用方会保留上次目录并提示失败。
  // 该流程只处理文本，不创建 DOM、不加载脚本，也不执行 innerHTML。
  // 去重发生在规范化之后，renderer 永远拿到稳定的唯一模型 ID。
  // 网络内容长度限制由请求层完成，解析器本身还保留递归深度防线。
  const chunks = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)].map(x => { try { return JSON.parse(x[1])[1] || ''; } catch { return ''; } }).join('');
  /** @type {Record<string,unknown>[]} */ const rows = [];
  for (const line of chunks.split('\n')) { try { collect(JSON.parse(line.slice(line.indexOf(':') + 1)), rows); } catch { /* Flight 资源行不含可解析的目录。 */ } }
  if (!rows.length) throw new Error('catalog');
  return [...new Map(rows.map(x => { const model = siliconModel(x); return [model.id, model]; })).values()];
}
/**
 * 免费三款、低价五款和高价三款，控制选择负担。
 * 当前默认模型优先保留，其余同档按版本和公开价格排序。
 * 过滤不可用必须在精选之前进行，避免账户只剩空的推荐组。
 * 旧会话已选模型不在精选时由调用者额外保留，不能悄悄替换运行。
 * @param {import('@illusion-realm/shared').AgentCatalogModel[]} rows
 */
function curateSiliconFlow(rows) {
  // 免费额度可能有速率与账户条件，免费分类只表示公开 token 价为零。
  // 官网推荐清单更新后价格会重新分档，不将随包旧价格当永久能力。
  // 核实过的常用系列优先于字母顺序，免费三项能兼顾 GLM 与 Qwen。
  // 没被优先表覆盖的新增模型仍可补位，不把快照当硬编码可用全集。
  // 明确不可用条目在配额分配之前剔除，不让它占住免费或低价名额。
  // 每个档位有独立上限，更新后不会突然出现数十个模型挤满选择器。
  // 高价条目保留用于复杂任务的用户主动选择，不自动升级当前模型收费档。
  // 主进程的完整公开缓存仍保留原目录，下次刷新可以重新计算精选。
  // 本函数不接收当前账户余额，不尝试按余额或营销折扣推断最低实际费用。
  // 返回结果仍是模型对象，价格来源、分组和可见性不会因精选被丢弃。
  // 随包核实的代表型号优先，避免按字母把旧 THUDM 排在新 Qwen 前面。
  // 新目录仍可补足失效条目的空位，精选不是硬编码可用模型全集。
  // 每一档先保留不同系列，防止三个高价名额全部被 GLM 同代版本占满。
  const preferred = require('./provider-snapshot.json').siliconflow.map(x => x.id);
  const rank = (/** @type {string} */ id) => { const index = preferred.indexOf(id); return index < 0 ? 999 : index; };
  const sorted = [...rows].sort((a,b) => rank(a.id) - rank(b.id) || (Number(a.input) + Number(a.output)) - (Number(b.input) + Number(b.output)) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  return ['free', 'budget', 'premium'].flatMap(tier => sorted.filter(x => x.tier === tier && x.available !== false).slice(0, tier === 'budget' ? 5 : 3));
}
module.exports = { record, number, recommend, parseEuzhi, parseSiliconFlow, curateSiliconFlow };
// 导出纯解析器供契约测试读取固定样本，测试不需要真实付费推理请求。
// 网络获取、密钥作用域和缓存失效均留在主进程其他单一职责模块。
