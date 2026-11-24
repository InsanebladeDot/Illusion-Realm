/** 组装本次 Agent 配置；固定供应商地址，从所属加密分区读取密钥，不能跨站借用。 */
const { ENDPOINTS, providerId, resolveProviderKey } = require('./provider-secrets');
/** @param {import('@illusion-realm/shared').AgentRunConfig} config */
function providerRunConfig(config) {
  const provider = providerId(config.provider);
  const { key } = resolveProviderKey(provider);
  if (provider === 'euzhi' && /image|imagine|video|audio|embedding|rerank|whisper|tts|dall-e/i.test(String(config.model))) throw new Error('Euzhi Agent requires a chat model');
  if (provider !== 'siliconflow' && !key && !config.fakeLlm) throw new Error(`${provider} API Key is not configured`);
  return { ...config, ...(config.provider ? { baseUrl: ENDPOINTS[provider] } : {}), ...(key ? { apiKey: key } : {}) };
}
module.exports = { providerRunConfig };
