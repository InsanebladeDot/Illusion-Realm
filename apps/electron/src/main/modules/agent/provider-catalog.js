/** 三站共用目录缓存和请求编排；官网价格与令牌权限分开核对，失败保留上次价目表。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { ENDPOINTS, providerId, resolveProviderKey } = require('./provider-secrets');
const { record, recommend, parseEuzhi, parseSiliconFlow, curateSiliconFlow } = require('./provider-catalog-parser');
const { parseGlm } = require('./glm-catalog-parser');
const snapshot = require('./provider-snapshot.json');
const { secretFilePath } = require('./secret');
const { applyModelAvailability, resetModelAvailability } = require('./provider-model-availability');
const TTL = 6 * 60 * 60 * 1000;
const SOURCES = { siliconflow: 'https://www.siliconflow.cn/models', euzhi: 'https://euzhi.vip/api/pricing', glm: 'https://docs.bigmodel.cn/cn/guide/start/pricing.md' };
const GLM_DETAILS = ['https://docs.bigmodel.cn/cn/guide/start/model-overview.md', 'https://docs.bigmodel.cn/cn/guide/models/text/glm-4.md'];
/** @type {Map<string,Promise<import('@illusion-realm/shared').AgentCatalog>>} */
const pending = new Map();
/** @type {Map<string,import('@illusion-realm/shared').AgentCatalog>} */
const memory = new Map();

/** 仅供固定站点调用；超时和体积都设上限，认证请求禁止跟随重定向。 @param {string} url @param {string} [key] */
async function request(url, key) {
  const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (response.status === 401 || response.status === 403) throw Error('auth');
  if (!response.ok) throw Error('network');
  if (Number(response.headers.get('content-length') || 0) > 8 * 1024 * 1024) throw Error('catalog');
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw Error('catalog');
  return text;
}

/** 离线目录保留采集时间，不把打开窗口的时间冒充官网更新时间。 @param {import('@illusion-realm/shared').AgentProvider} provider @returns {import('@illusion-realm/shared').AgentCatalog} */
function fallback(provider) {
  const models = /** @type {import('@illusion-realm/shared').AgentCatalogModel[]} */ (structuredClone(snapshot[provider]));
  return { provider, models, recommended: recommend(models), source: 'snapshot', updatedAt: provider === 'glm' ? snapshot.glmVerifiedAt : snapshot.verifiedAt, error: '' };
}

/** @param {import('@illusion-realm/shared').AgentProvider} provider */
function cachePath(provider) { return path.join(path.dirname(secretFilePath()), `agent-catalog-${provider}.json`); }

/** 缓存不含密钥，也不保存“该令牌可用”的结论；下次使用重新查权限。 @param {import('@illusion-realm/shared').AgentCatalog} catalog */
async function saveCache(catalog) {
  const safe = { ...catalog, models: catalog.models.map(model => ({ ...model, available: null })) };
  memory.set(catalog.provider, safe);
  const file = cachePath(catalog.provider);
  try { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file + '.tmp', JSON.stringify(safe), { mode: 0o600 }); await fs.rename(file + '.tmp', file); }
  catch { /* 缓存写失败不抹掉本次已读到的官网结果。 */ }
}

/** 模型名和价格用于离线浏览；坏缓存不阻止打开列表。 @param {import('@illusion-realm/shared').AgentProvider} provider @returns {Promise<import('@illusion-realm/shared').AgentCatalog>} */
async function cached(provider) {
  const hit = memory.get(provider);
  if (hit) return { ...hit, source: 'cache', error: '' };
  try {
    const body = record(JSON.parse(await fs.readFile(cachePath(provider), 'utf8')));
    if (body.provider !== provider || typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt)) || !Array.isArray(body.models) || !body.models.every(x => typeof record(x).id === 'string')) return fallback(provider);
    return /** @type {import('@illusion-realm/shared').AgentCatalog} */ ({ ...body, source: 'cache', error: '' });
  } catch { return fallback(provider); }
}

/** 令牌目录新出现的聊天型号也能选；未取得官网价格时明确留空，不能猜免费。 @param {string} id @returns {import('@illusion-realm/shared').AgentCatalogModel} */
function discovered(id) {
  return { id, input: null, output: null, currency: 'USD', tier: 'budget', groups: [], context: 0, pricingBasis: 'token', available: null, tiers: [], imageInput: null };
}

/** /models 只补充型号，不用缺项推断权限；Euzhi 同时补齐 GPT、Claude 等聊天型号。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {import('@illusion-realm/shared').AgentCatalogModel[]} models */
async function accountModels(provider, models) {
  const { key } = resolveProviderKey(provider);
  if (!key) return { models, error: /** @type {const} */ ('') };
  try {
    const body = record(JSON.parse(await request(`${ENDPOINTS[provider]}/models`, key)));
    if (!Array.isArray(body.data)) throw Error('catalog');
    const ids = new Set(body.data.map(x => record(x).id).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200));
    /** @type {import('@illusion-realm/shared').AgentCatalogModel[]} */
    const checked = models.map(x => ({ ...x, available: null }));
    if (provider === 'euzhi') for (const id of ids) {
      if (typeof id === 'string' && !checked.some(x => x.id === id) && !/image|imagine|video|audio|embedding|rerank|whisper|tts|dall-e/i.test(id)) checked.push(discovered(id));
    }
    return { models: checked, error: /** @type {const} */ ('') };
  } catch (error) { return { models, error: /** @type {'auth'|'availability'} */ (error instanceof Error && error.message === 'auth' ? 'auth' : 'availability') }; }
}

/** 价格只取官网；Euzhi 网站登录态与 API Key 不能混用，价格不可读时保留缓存。 @param {import('@illusion-realm/shared').AgentProvider} provider */
async function publicCatalog(provider) {
  // 三份官方资料一起更新；任一读取失败时沿用完整缓存，避免免费旧款时有时无。
  if (provider === 'glm') {
    const [pricing, overview, legacy] = await Promise.all([SOURCES.glm, ...GLM_DETAILS].map(url => request(url)));
    return parseGlm(pricing, overview, legacy);
  }
  const content = await request(SOURCES[provider]);
  return provider === 'euzhi' ? parseEuzhi(JSON.parse(content)) : parseSiliconFlow(content);
}

/** 默认遵循六小时缓存，登录与手动刷新可强制更新；权限每次单独核对。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {boolean} force @returns {Promise<import('@illusion-realm/shared').AgentCatalog>} */
async function refresh(provider, force) {
  let catalog = await cached(provider);
  if (force || catalog.models.some(model => model.imageInput === undefined) || catalog.source === 'snapshot' || Date.now() - Date.parse(catalog.updatedAt) >= TTL) {
    try {
      const models = await publicCatalog(provider);
      catalog = { provider, models, recommended: recommend(models), source: 'live', updatedAt: new Date().toISOString(), error: '' };
      await saveCache(catalog);
    } catch { catalog = { ...catalog, source: catalog.source === 'live' ? 'cache' : catalog.source, error: 'network' }; }
  }
  const checked = await accountModels(provider, catalog.models.map(x => ({ ...x, available: null })));
  // 像价签和入场券：缓存只记型号和价签，不把某次入场许可留给下一把密钥。
  if (checked.models.some(model => !catalog.models.some(old => old.id === model.id))) await saveCache({ ...catalog, models: checked.models });
  const described = checked.models.map(model => ({ ...model, imageInput: model.imageInput ?? snapshot[provider].find(item => item.id === model.id)?.imageInput ?? null }));
  const selected = provider === 'siliconflow' ? curateSiliconFlow(described) : described;
  const models = applyModelAvailability(provider, selected);
  return { ...catalog, models, recommended: recommend(models), error: checked.error || catalog.error };
}

/** 同站请求合并，完成后释放；拒绝未知供应商早于任何文件或网络访问。 @param {unknown} value @param {boolean} [force] @returns {Promise<import('@illusion-realm/shared').AgentCatalog>} */
function getProviderCatalog(value, force = false) {
  const provider = providerId(value);
  if (force) resetModelAvailability(provider);
  let job = pending.get(provider);
  if (job && force) return job.then(() => getProviderCatalog(provider, true));
  if (!job) { job = refresh(provider, force).finally(() => pending.delete(provider)); pending.set(provider, job); }
  return job;
}
module.exports = { getProviderCatalog, request, fallback };
