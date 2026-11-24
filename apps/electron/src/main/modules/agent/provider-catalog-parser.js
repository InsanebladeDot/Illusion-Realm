/** 解析官网价格，不执行网页脚本或计费表达式；保留币种、分组和长上下文条件，未知价格不猜免费。 */
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {}; }
/** 空串、布尔值和 null 不算价格。 @param {unknown} value @returns {number|null} */
function number(value) { const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(n) && n >= 0 ? n : null; }
/** 只按同站基础价排序；未公布或令牌不可用的型号不参与。 @param {import('@illusion-realm/shared').AgentCatalogModel[]} models */
function recommend(models) { return [...models].filter(x => x.available !== false && x.input !== null && x.output !== null).sort((a,b) => (Number(a.input) + Number(a.output)) - (Number(b.input) + Number(b.output)) || b.id.localeCompare(a.id, 'en', { numeric: true }))[0]?.id || ''; }
/** 只识别 base/longcontext 数字系数，不运行服务商表达式。 @param {string} expression @param {number} multiplier */
function expressionPrices(expression, multiplier) {
  const price = /tier\("base",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)/.exec(expression);
  const long = /len\s*<=\s*(\d+).*tier\("longcontext",\s*p\s*\*\s*([\d.]+)\s*\+\s*c\s*\*\s*([\d.]+)/.exec(expression);
  return { input: price ? Number(price[1]) * multiplier : null, output: price ? Number(price[2]) * multiplier : null, tiers: long ? [{ above: Number(long[1]), input: Number(long[2]) * multiplier, output: Number(long[3]) * multiplier }] : [] };
}
/** 基础价按最低公开分组折算，各组参考价另留给界面核对。 @param {Record<string,unknown>} row @param {Record<string,unknown>} ratios @returns {import('@illusion-realm/shared').AgentCatalogModel|null} */
function euzhiModel(row, ratios) {
  if (typeof row.model_name !== 'string' || /imagine|image|video|audio|embedding|rerank|whisper|tts|dall-e/i.test(row.model_name) || row.quota_type !== 0) return null;
  if (!Array.isArray(row.supported_endpoint_types) || !row.supported_endpoint_types.includes('openai')) return null;
  const groups = Array.isArray(row.enable_groups) ? row.enable_groups.filter(x => typeof x === 'string' && number(ratios[x]) !== null) : [];
  if (!groups.length) return null;
  const multiplier = Math.min(...groups.map(x => Number(ratios[x])));
  const ratio = number(row.model_ratio), completion = number(row.completion_ratio);
  const prices = row.billing_mode === 'tiered_expr' ? expressionPrices(String(row.billing_expr || ''), multiplier) : { input: ratio === null ? null : ratio * 2 * multiplier, output: ratio === null || completion === null ? null : ratio * 2 * completion * multiplier, tiers: [] };
  const groupPrices = groups.map(group => {
    const rate = Number(ratios[group]);
    const fee = row.billing_mode === 'tiered_expr' ? expressionPrices(String(row.billing_expr || ''), rate) : { input: ratio === null ? null : ratio * 2 * rate, output: ratio === null || completion === null ? null : ratio * 2 * completion * rate };
    return { group, input: fee.input, output: fee.output };
  });
  return { id: row.model_name, ...prices, groupPrices, currency: 'USD', tier: prices.input === 0 && prices.output === 0 ? 'free' : 'budget', groups, context: 0, pricingBasis: row.billing_mode === 'tiered_expr' ? 'tiered' : 'token', available: null, imageInput: imageCapability(row) };
}
/** 只接受供应商明确给出的输入能力，不凭 GPT、GLM 或 VL 等名字猜测。 @param {Record<string,unknown>} row */
function imageCapability(row) {
  if (typeof row.vlm === 'boolean') return row.vlm;
  if (Array.isArray(row.input_modalities)) return row.input_modalities.includes('image');
  return null;
}
/** 接口失败与真实空目录分开；同 ID 只保留最后一项。 @param {unknown} value */
function parseEuzhi(value) {
  const body = record(value);
  if (body.success !== true || !Array.isArray(body.data)) throw new Error('catalog');
  const models = body.data.map(x => euzhiModel(record(x), record(body.group_ratio))).filter(x => x !== null);
  return [...new Map(models.map(x => [x.id, x])).values()];
}
/** 从 Flight 数据树读取明确支持工具的聊天模型，深度设限。 @param {unknown} value @param {Record<string,unknown>[]} rows @param {number} depth */
function collect(value, rows, depth = 0) {
  if (depth > 20 || !value || typeof value !== 'object') return;
  const row = record(value);
  if (row.subType === 'chat' && row.status === 'normal' && row.functionCallSupport === true && typeof row.modelName === 'string') rows.push(row);
  else for (const child of Object.values(value)) collect(child, rows, depth + 1);
}
/** 只取明确标注每百万 token 的输入输出价，保留 Pro/ 原始名称。 @param {Record<string,unknown>} row @returns {import('@illusion-realm/shared').AgentCatalogModel} */
function siliconModel(row) {
  const prices = Array.isArray(row.pricing) ? row.pricing.map(record) : [];
  const input = number(prices.find(x => x.specification === 'prompt' && /M Tokens/.test(String(x.unitOfGood)))?.price);
  const output = number(prices.find(x => x.specification === 'completion' && /M Tokens/.test(String(x.unitOfGood)))?.price);
  return { id: String(row.modelName), input, output, currency: 'CNY', tier: input === 0 && output === 0 ? 'free' : input !== null && output !== null && input + output <= 12 ? 'budget' : 'premium', groups: [], context: number(row.contextLen) || 0, pricingBasis: 'token', tiers: [], available: null, imageInput: imageCapability(row) };
}
/** 页面脚本像包装纸：只拆出 JSON 内容，不执行脚本。 @param {string} html */
function parseSiliconFlow(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)].map(x => { try { return JSON.parse(x[1])[1] || ''; } catch { return ''; } }).join('');
  /** @type {Record<string,unknown>[]} */ const rows = [];
  for (const line of chunks.split('\n')) { try { collect(JSON.parse(line.slice(line.indexOf(':') + 1)), rows); } catch { /* Flight 资源行不含可解析的目录。 */ } }
  if (!rows.length) throw new Error('catalog');
  return [...new Map(rows.map(x => { const model = siliconModel(x); return [model.id, model]; })).values()];
}
/** 按既有目录分档精选，不把精选顺序当成质量保证。 @param {import('@illusion-realm/shared').AgentCatalogModel[]} rows */
function curateSiliconFlow(rows) {
  const preferred = require('./provider-snapshot.json').siliconflow.map(x => x.id);
  const rank = (/** @type {string} */ id) => { const index = preferred.indexOf(id); return index < 0 ? 999 : index; };
  const sorted = [...rows].sort((a,b) => rank(a.id) - rank(b.id) || (Number(a.input) + Number(a.output)) - (Number(b.input) + Number(b.output)) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  const curated = ['free', 'budget', 'premium'].flatMap(tier => sorted.filter(x => x.tier === tier && x.available !== false).slice(0, tier === 'budget' ? 5 : 3));
  // 精选像首页货架，视觉分类像完整专区：专区不能被首页的数量限制截掉。
  return [...new Map([...curated, ...sorted.filter(model => model.imageInput === true)].map(model => [model.id, model])).values()];
}
module.exports = { record, number, recommend, parseEuzhi, parseSiliconFlow, curateSiliconFlow };
