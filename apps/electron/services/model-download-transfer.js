/** Stream model files with backpressure and hash checking; stage files before a no-overwrite commit. */
const fs = require("fs");
const { createHash, randomUUID } = require("crypto");
const { nativeImage } = require("electron");
const path = require("path");
const { allowedUrl, downloadFetch } = require("./model-download-network");
const { responseRange, hashPrefix, writeChunk } = require("./model-download-resume");
const LOGO_LIMIT = 20 * 1024 * 1024;
/** @param {string} url @param {AbortSignal} signal @param {string|typeof downloadFetch} [apiKeyOrFetcher] @param {typeof downloadFetch} [fetcher] @param {Record<string,string>} [extraHeaders] */
async function fetchDownload(url, signal, apiKeyOrFetcher = "", fetcher = downloadFetch, extraHeaders = {}) {
  // Keep the old third-argument fetcher form usable by the transfer smoke tests.
  const apiKey = typeof apiKeyOrFetcher === "string" ? apiKeyOrFetcher.trim() : "";
  if (typeof apiKeyOrFetcher === "function") fetcher = apiKeyOrFetcher;
  for (let redirects = 0; redirects < 8; redirects++) {
    if (!allowedUrl(url)) throw new Error("invalid");
    const hostname = new URL(url).hostname.toLowerCase();
    const headers = { ...extraHeaders };
    if (apiKey && (hostname === "civitai.com" || hostname === "civitai.red")) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetcher(url, { signal, redirect: "manual", credentials: "omit", headers });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("redirect");
      try { url = new URL(location, url).href; } catch { throw new Error("redirect"); }
      continue;
    }
    if (response.status === 416 && extraHeaders.Range) {
      await response.body?.cancel(); extraHeaders = {}; continue;
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(response.status === 401 || response.status === 403 ? "auth" : "response"); }
    return response;
  }
  throw new Error("redirect");
}
/** @param {ReadableStreamDefaultReader<Uint8Array>} reader @param {AbortController} controller */
async function readChunk(reader, controller) {
  const timer = setTimeout(() => controller.abort(new Error("timeout")), 90000);
  try { return await reader.read(); } finally { clearTimeout(timer); }
}
/** @param {Response} response @param {string} temporary @param {string} expectedHash @param {AbortController} controller @param {(received:number,total:number)=>void} progress @param {number} [offset] */
async function writeModel(response, temporary, expectedHash, controller, progress, offset = 0) {
  if (/text\/|json|html/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Error("response"); }
  const range = responseRange(response, offset), total = range.total;
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
  const file = await fs.promises.open(temporary, fs.existsSync(temporary) ? range.offset ? "r+" : "w" : "wx");
  const hash = createHash("sha256");
  let received = range.offset;
  try {
    await hashPrefix(temporary, received, hash, controller.signal);
    progress(received, total);
    while (true) {
      const chunk = await readChunk(reader, controller);
      if (chunk.done) break;
      controller.signal.throwIfAborted();
      if (!received && /^\s*(<!doctype|<html|\{"error)/i.test(Buffer.from(chunk.value.subarray(0, 100)).toString("utf8"))) throw new Error("response");
      hash.update(chunk.value);
      await writeChunk(file, chunk.value, received);
      received += chunk.value.length;
      progress(received, total);
    }
    if (!received || (total && received !== total)) throw new Error("integrity");
    if (expectedHash && hash.digest("hex").toLowerCase() !== expectedHash.toLowerCase()) throw new Error("integrity");
    await file.sync();
  } finally { await file.close(); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/** @param {Buffer} bytes */
function logoPng(bytes) {
  if (bytes.length > LOGO_LIMIT) throw new Error("invalid");
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error("invalid");
  const { width, height } = image.getSize();
  if (width * height > 40000000) throw new Error("invalid");
  return image.resize({ width: Math.min(width, 1024) }).toPNG();
}
/** @param {string} folder @param {Buffer} bytes @param {boolean} replace */
async function saveLogo(folder, bytes, replace) {
  const png = logoPng(bytes), target = path.join(folder, "logo.png"), temporary = path.join(folder, ".logo-" + randomUUID() + ".part");
  try {
    await fs.promises.writeFile(temporary, png, { flag: "wx" });
    if (replace) await fs.promises.rename(temporary, target);
    else await fs.promises.link(temporary, target);
    return target;
  } finally { await fs.promises.rm(temporary, { force: true }); }
}
/** @param {string} url @param {AbortController} controller */
async function remoteLogo(url, controller) {
  const response = await fetchDownload(url, controller.signal);
  if (Number(response.headers.get("content-length")) > LOGO_LIMIT) throw new Error("invalid");
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const chunk = await readChunk(reader, controller);
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > LOGO_LIMIT) { await reader.cancel(); throw new Error("invalid"); }
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
module.exports = { fetchDownload, writeModel, saveLogo, remoteLogo, allowedUrl };
