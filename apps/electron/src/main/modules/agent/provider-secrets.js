/**
 * 为两个服务商隔离密钥，复用原有 safeStorage 编解码而不迁移旧密钥文件。
 * 原来的 agent-secret.json 与 ILLUSION_AGENT_API_KEY 始终属于硅基流动。
 * Euzhi 使用子目录里的独立文件；不会从旧环境变量回落读取另一站密钥。
 * 本模块只给主进程使用，渲染进程收到的仍然只有配置状态和尾号。
 * provider 必须先通过允许集检查，不把它直接拼入任意路径。
 * dir 仍可注入以隔离测试；不改变 secret.js 既有可选目录参数含义。
 * 保存后状态重新读取同一服务商，不返回 writeSecret 的环境变量优先状态。
 * 系统不支持加密时保留原有显式 plain 状态，界面继续提醒。
 * 未来增加服务商时必须扩展允许集，不能默认落到硅基流动。
 */
const path = require('node:path');
const secret = require('./secret');
const ENDPOINTS = Object.freeze({ siliconflow: 'https://api.siliconflow.cn/v1', euzhi: 'https://euzhi.vip/v1' });
// 站点 URL 与 provider 的对应关系同时用于目录认证和 sidecar payload。
// 二者使用同一映射，避免目录检查看似成功而聊天发到另一个域名。
// Euzhi 的 OpenAI 兼容地址包含 /v1，chat/completions 由 Python 客户端添加。
// 硅基流动保留原 URL，不把官网 www 的目录域名用于推理。
// 该表只含公开配置，可以随包分发；其中不包含用户环境信息。
// Object.freeze 阻止同进程调用者意外改写运行期的固定目的地。
/**
 * 未传 provider 的旧 preload 继续使用硅基流动。
 * 非法值应在发起网络请求前失败，避免错误密钥分区。
 * @param {unknown} value
 * @returns {import('@illusion-realm/shared').AgentProvider}
 */
function providerId(value = 'siliconflow') {
  // 先验证值再进入文件路径逻辑，未知值不能落到一个默认密钥文件。
  // 不使用对象属性真值判断，防止 constructor 等原型属性被误判允许。
  // 对 undefined 的兼容由参数默认值处理，其余类型都明确拒绝。
  if (value !== 'siliconflow' && value !== 'euzhi') throw new Error('Invalid Agent provider');
  return value;
}
/**
 * 只为 Euzhi 返回子目录，旧服务商保持原文件位置。
 * 默认根目录沿用 secretFilePath 的测试重定向能力。
 * 不读取用户数据文档，所以密钥不会进入普通设置备份。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @param {string} [dir]
 */
function scopedDir(provider, dir) { return provider === 'siliconflow' ? dir : path.join(dir || path.dirname(secret.secretFilePath()), 'agent-euzhi'); }
// 子目录只承载 Euzhi 的独立密钥文件，不复制原站点的环境变量。
// 父级位置由现有用户数据路径策略决定，不在这个模块硬编码盘符。
// 临时目录注入沿用 secret.js 的测试入口，真实运行没有这项覆盖。
// 显式 dir 用于契约测试，不是 renderer 可传入的 IPC 参数。
// 旧文件仍可以被旧版客户端读取，不需要不可逆迁移或批量重写。
// 用户自己复制普通用户 JSON 时不会把这两个独立凭据文件混进备份。
/**
 * 读取指定站点的原值，只允许 runner 和目录请求调用。
 * Euzhi 缺失时返回空值，绝不能借用硅基流动环境变量。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @param {string} [dir]
 * @returns {{key:string,source:'stored'|'env'|'none'}}
 */
function resolveProviderKey(provider, dir) {
  providerId(provider);
  if (provider === 'siliconflow') return secret.resolveApiKey(dir);
  const stored = secret.readSecret(scopedDir(provider, dir));
  // 解密失败与缺文件都视为没有密钥，让页面请求用户重新填写。
  // 不尝试在此猜测别的用户目录或另一个站点的文件。
  // 即使硅基流动环境变量存在，Euzhi 返回值也必须保持为空。
  // source 只表示来源，不包含加密文件名或用户系统路径。
  return { key: stored?.key || '', source: stored?.key ? 'stored' : 'none' };
}
/**
 * 状态不包含密钥全文；短密钥不显示尾号以免等同明文。
 * 状态读取与实际执行使用相同作用域，避免显示已配置但请求用另一把。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @param {string} [dir]
 * @returns {import('@illusion-realm/shared').AgentSecretStatus}
 */
function providerStatus(provider, dir) {
  // 先校验 provider，状态接口也不能成为任意文件读取的入口。
  // 硅基流动沿用原 describeSecret 以保留 env 高于 stored 的约定。
  // Euzhi 没有旧环境变量兼容，否则两个站点会错误共享 configured。
  providerId(provider);
  if (provider === 'siliconflow') return secret.describeSecret(dir);
  const stored = secret.readSecret(scopedDir(provider, dir));
  // 尾号超过四字符才显示，避免短测试值或未来短令牌被完整回显。
  // protection 直接保留实际编码方式，不因界面希望加密而改成 safeStorage。
  // 空字符串表示没有存储方式，不能用作系统加密可用的证明。
  return { configured: Boolean(stored?.key), source: stored?.key ? 'stored' : 'none', protection: stored?.protection || '', tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : '' };
}
/**
 * 写入复用系统加密，不把 API Key 放进 renderer 持久化状态。
 * 清除仅作用于当前站点，旧站点配置不会因切换被覆盖。
 * @param {import('@illusion-realm/shared').AgentProvider} provider
 * @param {string|null} key null 表示清除
 * @param {string} [dir]
 */
function updateProviderKey(provider, key, dir) {
  // null 是内部明确清除指令；空字符串不能被当作成功保存。
  // 读取状态必须再按本站作用域计算，不能直接返回旧模块的 env 投影。
  // 保存失败由原模块抛出，IPC 层负责包成失败结果，不能假装已配置。
  // 清除只删本站文件，不递归删除凭据目录或其他应用用户数据。
  // 正在运行的任务已持有启动快照，清除不会中途截断 Python 的 stdin。
  providerId(provider);
  if (key === null) secret.clearSecret(scopedDir(provider, dir));
  else secret.writeSecret(key, scopedDir(provider, dir));
  return providerStatus(provider, dir);
}
module.exports = { ENDPOINTS, providerId, resolveProviderKey, providerStatus, updateProviderKey };
