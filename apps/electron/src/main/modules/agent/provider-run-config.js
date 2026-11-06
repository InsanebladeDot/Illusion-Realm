/**
 * 在启动 sidecar 前把 provider、endpoint 和密钥作为同一快照解析。
 * 显式 provider 的运行始终使用本站固定地址，不受另一个服务商的环境配置影响。
 * 旧版不带 provider 的测试与命令行仍保留原配置，避免破坏本地假模型夹具。
 * IPC 入口另外限制 baseUrl；内部测试的 loopback 不等于允许页面外传密钥。
 * Euzhi 未配置时提前失败，阻止 Python 从继承环境里回落到硅基流动密钥。
 * fakeLlm 只用于原有不联网自检，没有密钥也能跑；生产页面不会设置此开关。
 * 主进程生成的 endpoint 与 apiKey 最后覆盖配置，不接受 renderer 注入原值。
 * 返回对象仅送入 stdin，不返回页面，也不能作为调试日志输出。
 */
const { ENDPOINTS, providerId, resolveProviderKey } = require('./provider-secrets');
/**
 * 请求由运行起点固定；之后切换服务商只影响下一次对话。
 * Euzhi 限制 Grok 聊天 ID，避免选择图片模型后进入错误的聊天协议。
 * 未知模型不伪造成功，由服务商正常返回模型不存在或权限错误。
 * 旧配置无 provider 时仍属于硅基流动，不自动探测 URL 来挑选密钥。
 * @param {import('@illusion-realm/shared').AgentRunConfig} config
 * @returns {import('@illusion-realm/shared').AgentRunConfig}
 */
function providerRunConfig(config) {
  // provider 缺省只服务旧内部调用，现代页面始终传明确站点。
  // 读取密钥时不使用 baseUrl 反推站点，任意 URL 都不能获得另一站的令牌。
  // 模型 ID 检查仅限定聊天系列，不能替代用户令牌的真实模型权限。
  // 无密钥的 Euzhi 不允许进入 Python，因为 Python 仍兼容旧环境变量兜底。
  // fakeLlm 模式不发起远端请求，因此保留既有的无密钥自检能力。
  // apiKey 最后由主进程注入，renderer 同名字段在 IPC 前置验证已被拒绝。
  // 本函数不能记录 config，因为解析后的对象可能含安全存储解密得到的原值。
  const provider = providerId(config.provider);
  const { key } = resolveProviderKey(provider);
  if (provider === 'euzhi' && (!/^grok-/i.test(String(config.model)) || /image|imagine|video|audio/i.test(String(config.model)))) throw new Error('Euzhi Agent requires a Grok chat model');
  if (provider === 'euzhi' && !key && !config.fakeLlm) throw new Error('Euzhi API Key is not configured');
  return { ...config, ...(config.provider ? { baseUrl: ENDPOINTS[provider] } : {}), ...(key ? { apiKey: key } : {}) };
}
module.exports = { providerRunConfig };
