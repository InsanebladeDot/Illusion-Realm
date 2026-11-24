/** Agent 与转译共用三站凭据；像分开的钥匙柜，只向所属固定站点提供密钥。 */
const path = require('node:path');
const { createHash } = require('node:crypto');
const secret = require('./secret');
const ENDPOINTS = Object.freeze({ siliconflow: 'https://api.siliconflow.cn/v1', euzhi: 'https://euzhi.vip/v1', glm: 'https://open.bigmodel.cn/api/paas/v4' });

/** 旧调用省略供应商仍使用硅基流动；未知值不能参与路径或地址拼接。 @param {unknown} value @returns {import('@illusion-realm/shared').AgentProvider} */
function providerId(value = 'siliconflow') {
  if (value !== 'siliconflow' && value !== 'euzhi' && value !== 'glm') throw new Error('Invalid Agent provider');
  return value;
}

/** 硅基流动保留原位置，新增站点分区存放。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {string} [dir] */
function scopedDir(provider, dir) {
  return provider === 'siliconflow' ? dir : path.join(dir || path.dirname(secret.secretFilePath()), `agent-${provider}`);
}

/** 兼容旧版转译的 GLM 钥匙；固定地址求哈希，不能从页面传入其他钥匙柜地址。 @param {string} [dir] */
function legacyGlmDir(dir) {
  const id = createHash('sha256').update(`${ENDPOINTS.glm}/chat/completions`).digest('hex').slice(0, 24);
  const root = process.env.ILLUSION_PROMPT_SECRET_DIR || path.join(dir || path.dirname(secret.secretFilePath()), 'prompt-keys');
  return path.join(root, 'glm', id);
}

/** 首次使用沿用已有 GLM 凭据，写入统一分区后保留原件；失败不假报已迁移。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {string} [dir] */
function storedSecret(provider, dir) {
  const stored = secret.readSecret(scopedDir(provider, dir));
  if (stored || provider !== 'glm') return stored;
  const legacy = secret.readSecret(legacyGlmDir(dir));
  if (legacy?.key) { secret.writeSecret(legacy.key, scopedDir(provider, dir)); return secret.readSecret(scopedDir(provider, dir)); }
  return null;
}

/** 原值仅供主进程请求使用；GLM、Euzhi 缺钥时不会借用硅基流动环境变量。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {string} [dir] @returns {{key:string,source:'stored'|'env'|'none'}} */
function resolveProviderKey(provider, dir) {
  providerId(provider);
  if (provider === 'siliconflow') return secret.resolveApiKey(dir);
  const stored = storedSecret(provider, dir);
  return { key: stored?.key || '', source: stored?.key ? 'stored' : 'none' };
}

/** 只回配置状态与尾号，不向页面回传密钥。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {string} [dir] @returns {import('@illusion-realm/shared').AgentSecretStatus} */
function providerStatus(provider, dir) {
  providerId(provider);
  if (provider === 'siliconflow') return secret.describeSecret(dir);
  const stored = storedSecret(provider, dir);
  return { configured: Boolean(stored?.key), source: stored?.key ? 'stored' : 'none', protection: stored?.protection || '', tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : '' };
}

/** 保存/清除同时作用于两种业务；清除 GLM 也清旧分区，防止旧钥匙被再次迁回。 @param {import('@illusion-realm/shared').AgentProvider} provider @param {string|null} key @param {string} [dir] */
function updateProviderKey(provider, key, dir) {
  providerId(provider);
  if (key === null) {
    if (provider === 'glm') secret.clearSecret(legacyGlmDir(dir));
    secret.clearSecret(scopedDir(provider, dir));
  } else secret.writeSecret(key, scopedDir(provider, dir));
  return providerStatus(provider, dir);
}
module.exports = { ENDPOINTS, providerId, resolveProviderKey, providerStatus, updateProviderKey };
