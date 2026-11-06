/**
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 */
/** Translate prompts through an OpenAI-compatible endpoint; reuse Agent safeStorage in isolated directories. */
const path = require("node:path");
const { createHash } = require("node:crypto");
const { getDefaultUserDataPath } = require("../../storage/user-data-paths");
const secret = require("../agent/secret");
// 复用 Agent 已有的固定站点表和系统加密凭据，不复制 Euzhi API Key。
// 就像两个窗口共用一把保险柜钥匙，保存与清除在两处都作用于同一份本站记录。
// 原始密钥只在主进程读取，普通用户 JSON 与渲染状态仅保存供应商选择。
const { ENDPOINTS, resolveProviderKey, providerStatus, updateProviderKey } = require("../agent/provider-secrets");
// 凭据复用按 provider 分区，不按相似域名、URL 前缀或当前聊天站点猜测归属。
// 只有命名 Euzhi 分支读取 Agent 密钥，用户手写相同地址的 custom 连接仍有独立凭据。
// 因此旧用户用 custom 接入其他站点的记录无需迁移，也不会被自动替换。
// 公开站点地址可以在进程间传递，解密后的凭据只在当前 transform 请求内使用。
// 这里不导入 Agent runner，提示词转换不会启动 Python 或执行 MCP 工具。
// 共享的是凭据和站点配置，聊天历史、工具轮次和系统指令仍属于各自功能。
// 提示词助手继续发送原预设 instruction，不把 Agent 聊天提示词混入翻译。
// Euzhi 的请求主体与普通 OpenAI 兼容端点一致，不添加 GLM 私有 thinking 参数。
// 远端 401、403 与 429 沿用原有错误映射，换站不吞掉账户和权限错误。
// 状态显示 configured 只说明本地保存过密钥，并不声称远端已经验证权限。
// clearSecret 只影响后续请求，已经发送的转换持有自己的局部密钥快照。
// 现有六十秒请求超时包含响应读取，站点不返回也不会让输入框永久忙碌。
// redirect:error 沿用原请求策略，共享凭据不能经服务端跳转传给另一个域名。
// 返回正文继续有大小与结构检查，错误响应不能作为英文提示词直接替换原稿。
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4";
/** @typedef {import('@illusion-realm/shared').PromptConnection} Connection */
/** @typedef {import('@illusion-realm/shared').PromptTransformRequest} Request */
/** @param {Connection} connection */
function endpoint(connection) {
  // 命名供应商与自由端点是不同契约：Euzhi 身份不能同时代表一个任意输入的网址。
  // 因此固定站点的判断在主进程做，即使渲染器保留旧 custom 配置也不会串站。
  // 用户回切 custom 时仍可恢复原地址，没有为接入 Euzhi 清空它的必要。
  // 路径只在此补 chat/completions 一次，Agent 端点表保存的是统一 v1 根地址。
  // 站点地址来源共用，但两种业务的消息组装仍独立，不把工具调用发给文本转换接口。
  // 此函数不读取令牌，地址合法性失败会早于密钥读取，便于保持错误边界清楚。
  // 后面的协议与 URL 限制继续约束 custom，新增命名站点不放宽原兼容接口规则。
  // Euzhi 不信任页面保留的 custom 地址，防止把共享密钥发送到另一个站点。
  // 切换供应商也不改写用户先前保存的自定义地址，回切时仍能继续使用。
  // 同一个固定地址表同时服务 Agent 与提示词助手，避免站点更新后两处漂移。
  const url = new URL(connection.provider === "glm" ? GLM_URL : connection.provider === "euzhi" ? ENDPOINTS.euzhi : connection.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new Error("invalidEndpoint");
  const base = url.href.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  return `${base}/chat/completions`;
}
/** @param {Connection} connection */
function secretDir(connection) {
  const id = createHash("sha256").update(endpoint(connection)).digest("hex").slice(0, 24);
  const root = process.env.ILLUSION_PROMPT_SECRET_DIR || path.join(path.dirname(getDefaultUserDataPath()), "prompt-keys");
  return path.join(root, connection.provider, id);
}
/** @param {Connection} connection */
function status(connection) {
  // 只返回配置状态和尾号，不能为了页面复用把 Agent 解密后的密钥送回去。
  // Euzhi 缺钥不会借用硅基流动环境变量，沿用原服务商隔离边界。
  // GLM 与任意自定义端点仍读取原有按地址隔离的提示词助手凭据。
  if (connection.provider === "euzhi") return providerStatus("euzhi");
  const stored = secret.readSecret(secretDir(connection));
  return { configured: Boolean(stored?.key), protection: stored?.protection || "", tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : "" };
}
/** @param {Connection} connection @param {string} key */
function setSecret(connection, key) {
  // 直接委托原 Agent 写入，成功回执与下一次转换读取的是同一位置。
  // 不在 prompt-keys 下再生成 Euzhi 副本，也不覆盖其他供应商文件。
  // 写入异常沿用提示词助手的固定错误码，界面不会收到系统路径。
  if (connection.provider === "euzhi") {
    try { return updateProviderKey("euzhi", key); }
    catch { throw new Error("secretSaveFailed"); }
  }
  try { secret.writeSecret(key, secretDir(connection)); return status(connection); }
  catch { throw new Error("secretSaveFailed"); }
}
/** @param {Connection} connection */
function clearSecret(connection) {
  // 共享凭据的清除也必须共享，不能在一处显示清除但 Agent 仍保留另一份。
  // 页面在此分区明确说明共享关系，清除不触及模型偏好与已有聊天。
  // 只删除 Euzhi 本站凭据，GLM、自定义站点和硅基流动继续独立保留。
  if (connection.provider === "euzhi") {
    try { return updateProviderKey("euzhi", null); }
    catch { throw new Error("secretSaveFailed"); }
  }
  try { secret.clearSecret(secretDir(connection)); return status(connection); }
  catch { throw new Error("secretSaveFailed"); }
}
/** @param {Response} response */
async function readResponse(response) {
  if (!response.body) throw new Error("emptyResponse");
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length;
      if (size > 2_000_000) throw new Error("invalidResponse"); chunks.push(Buffer.from(next.value)); }
    return /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { await reader.cancel().catch(() => {}); }
}
/** @param {unknown} data */
function responseText(data) {
  if (!data || typeof data !== "object" || !("choices" in data) || !Array.isArray(data.choices)) throw new Error("invalidResponse");
  const choice = data.choices[0];
  if (!choice || typeof choice !== "object") throw new Error("emptyResponse");
  if (choice.finish_reason === "length") throw new Error("truncatedResponse");
  const message = choice.message;
  if (!message || typeof message !== "object" || typeof message.content !== "string" || !message.content.trim()) throw new Error("emptyResponse");
  return message.content.trim();
}
/** @param {Request} request */
async function transform(request) {
  // 推理与状态检查走相同凭据来源，避免界面显示已配置而实际读到空分区。
  // 先解析固定地址再读密钥，任意 custom 地址不能通过 provider 别名获取本站密钥。
  // 请求仍复用下面的超时、限长、响应解析和错误处理，不另建 Grok 客户端。
  const url = endpoint(request); const key = request.provider === "euzhi" ? resolveProviderKey("euzhi").key : secret.readSecret(secretDir(request))?.key;
  if (!key) throw new Error("missingKey");
  const body = { model: request.model, stream: false, max_tokens: 4096,
    messages: [{ role: "system", content: request.instruction }, { role: "user", content: request.text }],
    ...(request.provider === "glm" ? { thinking: { type: "disabled" } } : {}) };
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rateLimited" : `http${response.status}`); }
    return responseText(await readResponse(response));
  } catch (error) {
    const code = error instanceof Error ? error.message : "networkFailed";
    if (["unauthorized", "forbidden", "rateLimited", "emptyResponse", "invalidResponse", "truncatedResponse"].includes(code) || /^http\d{3}$/.test(code)) throw new Error(code);
    throw new Error(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "networkFailed");
  }
}
module.exports = { endpoint, status, setSecret, clearSecret, transform };
