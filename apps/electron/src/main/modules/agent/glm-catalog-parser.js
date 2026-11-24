/** 从智谱官网 Markdown 价目表读取聊天型号与人民币价格；未知格式失败，不猜免费。 */
const { number } = require('./provider-catalog-parser');

/** 官网写“免费”才记零；按长度或输出条件收费的原文另行保留。 @param {string} value */
function price(value) { return value === '免费' ? 0 : number(value); }

/** @param {string} value */
function context(value) {
  const match = /^(\d+(?:\.\d+)?)\s*([KM])?$/i.exec(value);
  return match ? Number(match[1]) * (match[2]?.toUpperCase() === 'M' ? 1000000 : match[2] ? 1000 : 1) : 0;
}

/** 像把多档价签订在一起，同名型号只列一张卡，每档条件原文都保留。 @param {string[]} cells @param {Map<string,import('@illusion-realm/shared').AgentCatalogModel>} models */
function append(cells, models) {
  const id = cells[0].toLowerCase(), input = price(cells[2]), output = price(cells[3]);
  if (input === null || output === null) throw Error('catalog');
  const note = `${cells[1]}: ${input} / ${output} CNY`;
  const previous = models.get(id);
  if (previous) { previous.pricingBasis = 'tiered'; previous.priceNote += `; ${note}`; return; }
  models.set(id, { id, input, output, currency: 'CNY', tier: input === 0 && output === 0 ? 'free' : input + output <= 12 ? 'budget' : 'premium',
    context: context(cells[1]), groups: [], tiers: [], pricingBasis: 'token', available: null, priceNote: note, imageInput: false });
}

/** 概览只补明确写着“免费文本模型”的条目；像补价签，不能覆盖价目表已公布的收费。 @param {string} overview @param {Map<string,import('@illusion-realm/shared').AgentCatalogModel>} models */
function appendFreeOverview(overview, models) {
  for (const line of overview.split('\n')) {
    const cells = line.replace(/^\s*>\s?/, '').trim().split('|').slice(1, -1).map(value => value.trim());
    const id = /^\[(GLM-[\w.-]+)\]\(https:\/\/docs\.bigmodel\.cn\//i.exec(cells[0] || '')?.[1];
    if (id && /^免费文本模型/.test(cells[1]) && !models.has(id.toLowerCase())) append([id, cells[2], '免费', '免费'], models);
  }
}

/** 旧版 Flash 没有独立价目行，只接收官方 GLM-4 说明中明确的“免费语言模型”称呼。 @param {string} legacy @param {Map<string,import('@illusion-realm/shared').AgentCatalogModel>} models */
function appendLegacyFree(legacy, models) {
  for (const match of legacy.matchAll(/免费语言模型\s+(GLM-[\w.-]+)/g)) {
    if (!models.has(match[1].toLowerCase())) append([match[1], '', '免费', '免费'], models);
  }
}

/** 转译需要视觉聊天型号；只读视觉理解表，生成模型和专用 OCR 不混入。 */
/** @param {string} markdown @param {Map<string,import('@illusion-realm/shared').AgentCatalogModel>} models */
function appendVision(markdown, models) {
  const section = markdown.split('### 视觉理解')[1]?.split(/^### /m)[0] || '';
  for (const line of section.split('\n')) {
    const cells = line.replace(/^\s*>\s?/, '').replace(/\\/g, '').trim().split('|').slice(1, -1).map(value => value.trim());
    if (cells.length >= 4 && /^GLM-[\d.]+V(?:-[\w.-]+)?$/i.test(cells[0])) {
      append(cells, models);
      // 以官网视觉理解表为依据；同名型号早先出现在其他表中时也补上能力。
      const model = models.get(cells[0].toLowerCase());
      if (model) model.imageInput = true;
    }
  }
}

/** 不把图像/视频/语音生成及向量价格表混入聊天目录；补充资料仅补缺项。 @param {string} markdown @param {string} [overview] @param {string} [legacy] */
function parseGlm(markdown, overview = '', legacy = '') {
  const section = markdown.split('## 最新模型')[1]?.split('### 视觉理解')[0];
  if (!section) throw Error('catalog');
  /** @type {Map<string,import('@illusion-realm/shared').AgentCatalogModel>} */
  const models = new Map();
  for (const line of section.split('\n')) {
    const cells = line.replace(/^\s*>\s?/, '').replace(/\\/g, '').trim().split('|').slice(1, -1).map(value => value.trim());
    if (cells.length >= 4 && /^GLM-[\w.-]+$/i.test(cells[0])) append(cells, models);
  }
  if (!models.size) throw Error('catalog');
  appendFreeOverview(overview, models);
  appendLegacyFree(legacy, models);
  appendVision(markdown, models);
  return [...models.values()];
}
module.exports = { parseGlm };
