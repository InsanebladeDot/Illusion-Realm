/** Translate prompts through an OpenAI-compatible endpoint; reuse Agent safeStorage in isolated directories. */
const path = require("node:path");
const { createHash } = require("node:crypto");
const { getDefaultUserDataPath } = require("../userDataPaths");
const secret = require("../agent/secret");
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4";
/** @typedef {import('@illusion-realm/shared').PromptConnection} Connection */
/** @typedef {import('@illusion-realm/shared').PromptTransformRequest} Request */
/** @param {Connection} connection */
function endpoint(connection) {
  const url = new URL(connection.provider === "glm" ? GLM_URL : connection.baseUrl);
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
  const stored = secret.readSecret(secretDir(connection));
  return { configured: Boolean(stored?.key), protection: stored?.protection || "", tail: stored && stored.key.length > 4 ? stored.key.slice(-4) : "" };
}
/** @param {Connection} connection @param {string} key */
function setSecret(connection, key) {
  try { secret.writeSecret(key, secretDir(connection)); return status(connection); }
  catch { throw new Error("secretSaveFailed"); }
}
/** @param {Connection} connection */
function clearSecret(connection) {
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
  const url = endpoint(request); const key = secret.readSecret(secretDir(request))?.key;
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
