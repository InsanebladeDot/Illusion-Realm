/**
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 */
/** 通过兼容接口转译文本；三站共用 Agent 加密凭据，自定义地址仍独立存放。 */
const path = require("node:path");
const { createHash } = require("node:crypto");
const { getDefaultUserDataPath } = require("../../storage/user-data-paths");
const secret = require("../agent/secret");
const { ENDPOINTS, resolveProviderKey, providerStatus, updateProviderKey } = require("../agent/provider-secrets");
const { beginModelAttempt } = require('../agent/provider-model-availability');

/** @typedef {import('@illusion-realm/shared').PromptConnection} Connection */
/** @typedef {import('@illusion-realm/shared').PromptTransformRequest} Request */
/** @param {Connection} connection */
function endpoint(connection) {
  // 三个命名站点只读同一地址表；custom 仍用独立凭据，不借命名站点的钥匙。
  const url = new URL(connection.provider === "custom" ? connection.baseUrl : ENDPOINTS[connection.provider]);
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
  if (connection.provider !== "custom") return providerStatus(connection.provider);
  const stored = secret.readSecret(secretDir(connection));
  return { configured: Boolean(stored?.key), protection: stored?.protection || "", tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : "" };
}
/** @param {Connection} connection @param {string} key */
function setSecret(connection, key) {
  if (connection.provider !== "custom") {
    try { return updateProviderKey(connection.provider, key); }
    catch { throw new Error("secretSaveFailed"); }
  }
  try { secret.writeSecret(key, secretDir(connection)); return status(connection); }
  catch { throw new Error("secretSaveFailed"); }
}
/** @param {Connection} connection */
function clearSecret(connection) {
  if (connection.provider !== "custom") {
    try { return updateProviderKey(connection.provider, null); }
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
  const url = endpoint(request); const key = request.provider === "custom" ? secret.readSecret(secretDir(request))?.key : resolveProviderKey(request.provider).key;
  if (!key) throw new Error("missingKey");
  const modelResult = request.provider === 'custom' ? () => {} : beginModelAttempt(request.provider, request.model, key);
  const body = { model: request.model, stream: false, max_tokens: 4096,
    messages: [{ role: "system", content: request.instruction }, { role: "user", content: userContent(request) }],
    ...(request.provider === "glm" ? { thinking: { type: "disabled" } } : {}) };
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const error = await readResponse(response).catch(() => null);
      modelResult(false, { status: response.status, error });
      throw new Error(responseError(response.status, !!request.images?.length));
    }
    const result = responseText(await readResponse(response));
    modelResult(true);
    return result;
  } catch (error) {
    const code = error instanceof Error ? error.message : "networkFailed";
    if (["unauthorized", "forbidden", "rateLimited", "emptyResponse", "invalidResponse", "truncatedResponse", "imageRequestRejected"].includes(code) || /^http\d{3}$/.test(code)) throw new Error(code);
    throw new Error(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "networkFailed");
  }
}
/** 关闭图片时保留原字符串协议；开启时按输入顺序发真实字节，不发本机路径。 */
/** @param {Request} request */
function userContent(request) {
  if (!request.images?.length) return request.text;
  return [{ type: "text", text: request.text || "Describe the provided images according to the system instruction." },
    ...request.images.map(url => ({ type: "image_url", image_url: { url } }))];
}
/** 拒绝多模态请求时明确提示，不能偷偷丢掉图片重发并产生额外费用。 */
/** @param {number} statusCode @param {boolean} images */
function responseError(statusCode, images) {
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 429) return "rateLimited";
  return images && [400, 422].includes(statusCode) ? "imageRequestRejected" : `http${statusCode}`;
}
module.exports = { endpoint, status, setSecret, clearSecret, transform };
