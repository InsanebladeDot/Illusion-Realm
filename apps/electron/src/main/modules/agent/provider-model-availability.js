/** 模型默认可选，只记实际调用结果；按站点、密钥指纹和型号隔离，不写入价格缓存。 */
const { createHash } = require('node:crypto');
const { resolveProviderKey } = require('./provider-secrets');
/** @typedef {import('@illusion-realm/shared').AgentProvider} Provider */
/** @type {Map<string, Map<string, { available: boolean|null }>>} */
const results = new Map();

/** 像分开的钥匙柜：同名模型换站点或换密钥后，不能继承原来的失败结论。 */
/** @param {Provider} provider @param {string} key */
function scope(provider, key) {
  return `${provider}:${createHash('sha256').update(key).digest('hex')}`;
}

/** 只认模型不存在或模型权限拒绝；限流、欠费、认证失败和服务器故障均不算。 */
/** @param {unknown} error */
function modelRejected(error) {
  const text = typeof error === 'string' ? error : JSON.stringify(error) || '';
  const status = /(?:"status"\s*:|Error code:)\s*(\d{3})/i.exec(text)?.[1];
  if (status && (['401', '402', '408', '429'].includes(status) || Number(status) >= 500)) return false;
  if (/insufficient_quota|insufficient.balance|rate.limit|余额不足|欠费/i.test(text)) return false;
  return /model_(?:not_found|not_available|access_denied|permission_denied|not_enabled)|(?:model[^\n]{0,160}(?:does not exist|not found|permission denied|access denied))|(?:no access|not have access|not authorized)[^\n]{0,100}model|模型[^\n]{0,60}(?:不存在|无权限|没有权限|未开通|已下线)/i.test(text);
}

/** 每次请求拿独立登记卡；后发请求或手动刷新会作废旧卡，迟到结果不能覆盖新状态。 */
/** @param {Provider} provider @param {string} model @param {string} key */
function beginModelAttempt(provider, model, key) {
  const id = scope(provider, key);
  let models = results.get(id);
  if (!models) { models = new Map(); results.set(id, models); }
  const entry = { available: models.get(model)?.available ?? null };
  models.set(model, entry);
  /** @param {boolean} success @param {unknown} [error] */
  return (success, error) => {
    if (results.get(id)?.get(model) !== entry) return;
    if (success) entry.available = true;
    else if (modelRejected(error)) entry.available = false;
  };
}

/** 目录缺项与旧缓存的 false 都不是调用证据；只有当前钥匙的运行登记可以置灰。 */
/** @param {Provider} provider @param {import('@illusion-realm/shared').AgentCatalogModel[]} models */
function applyModelAvailability(provider, models) {
  const attempts = results.get(scope(provider, resolveProviderKey(provider).key));
  return models.map(model => ({ ...model, available: attempts?.get(model.id)?.available ?? null }));
}

/** 主动刷新或重新登录后允许重试，同时使旧请求的登记卡失效。 @param {Provider} provider */
function resetModelAvailability(provider) {
  results.delete(scope(provider, resolveProviderKey(provider).key));
}

/** Agent 使用发出请求时的配置快照，不用返回时用户新选的站点或密钥。 */
/** @param {string} payload */
function agentModelAttempt(payload) {
  const { config } = /** @type {{ config: { provider?: Provider, model: string, apiKey?: string, fakeLlm?: boolean } }} */ (JSON.parse(payload));
  if (config.fakeLlm) return () => {};
  return beginModelAttempt(config.provider || 'siliconflow', config.model || '', config.apiKey || '');
}

module.exports = { beginModelAttempt, applyModelAvailability, resetModelAvailability, agentModelAttempt };
