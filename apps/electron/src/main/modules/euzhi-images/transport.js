// API 使用固定 Euzhi 地址；返回图片单独下载，不携带 Authorization。
// 这是两趟快递：提交单子需要凭据，去结果仓库取图片不能把凭据一起交给仓库。
// 结果 URL 只允许公网 HTTPS，每次重定向重新检查并固定解析出的地址。
// 因此上游响应不能让客户端访问本机、内网或 file 协议。
const https = require("node:https");
const dns = require("node:dns/promises");
const net = require("node:net");
const LIMIT = 64 * 1024 * 1024;
/** @param {string} address */
function publicAddress(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19));
}
// 流式读有总量上限，不能直接 arrayBuffer 读任意大小的上游响应。
// Content-Length 仅用于提前拒绝，实际累计字节仍复核，防止缺头或虚报。
// AbortSignal 同时覆盖请求、重定向和正文下载，取消不会留一条无界读取。
// 超过上限立即销毁响应流，错误只用固定标识，不暴露 URL 中的签名参数。
/** @param {import('node:http').IncomingMessage} response @returns {Promise<Buffer>} */
async function body(response) {
  const chunks = []; let size = 0;
  for await (const chunk of response) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > LIMIT) { response.destroy(); throw new Error("response-too-large"); }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
/** @param {string} value @param {AbortSignal} signal @param {number} [depth] @returns {Promise<Buffer>} */
async function download(value, signal, depth = 0) {
  const url = new URL(value);
  if (depth > 4 || url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("invalid-result-url");
  const addresses = await dns.lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error("invalid-result-url");
  signal.throwIfAborted();
  const response = await new Promise((resolve, reject) => {
    const request = https.get(url, { signal, family: 4, lookup: (_host, _options, done) => done(null, addresses[0].address, 4) }, resolve);
    request.on("error", reject);
  });
  const incoming = /** @type {import('node:http').IncomingMessage} */ (response);
  if (incoming.statusCode && [301, 302, 303, 307, 308].includes(incoming.statusCode) && incoming.headers.location) {
    incoming.resume(); return download(new URL(incoming.headers.location, url).href, signal, depth + 1);
  }
  if (incoming.statusCode !== 200) { incoming.resume(); throw new Error("download-failed"); }
  return body(incoming);
}
// 服务端错误正文可能反射提示词或凭据，因此只返回状态码供页面翻译。
// 不自动重试收费请求：超时后用户需要先查 Euzhi 消费记录。
// fetch 使用 redirect:error，避免带凭据请求被重定向到另一个来源。
// FormData 自动生成 boundary；这里不手工拼 multipart Content-Type。
/** @param {string} endpoint @param {string} key @param {string|FormData} payload @param {AbortSignal} signal */
async function submit(endpoint, key, payload, signal) {
  const response = await fetch(`https://euzhi.vip/v1/images/${endpoint}`, {
    method: "POST", redirect: "error", signal,
    headers: { Authorization: `Bearer ${key}`, ...(typeof payload === "string" ? { "Content-Type": "application/json" } : {}) }, body: payload,
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`http-${response.status}`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty-result");
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > LIMIT) throw new Error("response-too-large");
      chunks.push(Buffer.from(value));
    }
    return /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
module.exports = { submit, download, publicAddress };
