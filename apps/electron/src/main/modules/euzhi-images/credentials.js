// 专用于图片生成的凭据分区；复用既有系统加密，不读取 Agent/chat 的配置。
// 像同一家银行的两张卡：可以填相同的密钥，但不能因清除其中一张而删除另一张。
// 文件根由原 secret 服务解析，兼容现有开发、打包和测试目录规则。
// 普通用户 JSON 与便携工程均不包含这个文件的内容。
const path = require("node:path");
const secret = require("../agent/secret");
/** @param {string} [root] */
function directory(root) { return path.join(root || path.dirname(secret.secretFilePath()), "euzhi-images"); }
/** @param {string} [root] */
function readKey(root) { return secret.readSecret(directory(root))?.key || ""; }
// 不调用 describeSecret：它会优先读取 Agent 的环境变量，与图片分区契约不符。
// 只向页面回配置状态、保护方式和尾号；短令牌不回显全文。
// 解密失败视为未配置，不能悄悄借用其他服务密钥。
/** @param {string} [root] @returns {import('@illusion-realm/shared').AgentSecretStatus} */
function status(root) {
  const stored = secret.readSecret(directory(root));
  return { configured: !!stored?.key, source: stored?.key ? "stored" : "none", protection: stored?.protection || "", tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : "" };
}
/** @param {string|null} key @param {string} [root] */
function update(key, root) {
  if (key === null) secret.clearSecret(directory(root));
  else secret.writeSecret(key, directory(root));
  return status(root);
}
module.exports = { readKey, status, update };
