/** Stream downloads through a dedicated Chromium session; inspect every redirect and remove secrets before CDN requests. */
const { session } = require("electron");
const { randomUUID } = require("crypto");
const REQUEST_MARKER = "x-illusion-realm-download-id";
const MAX_REDIRECTS = 8;
/** @typedef {{authorization:string, redirects:number, failure:string, id?:number}} DownloadContext */
/** @param {string} value */
function allowedUrl(value) {
  try {
    const url = new URL(value);
    const hosts = ["civitai.com", "civitai.red", "civitai.green", "civitai.blue", "backblazeb2.com", "r2.cloudflarestorage.com", "r2.dev", "amazonaws.com"];
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hosts.some((host) => url.hostname === host || url.hostname.endsWith("." + host));
  } catch { return false; }
}
/** @param {string} value */
function authorizationHost(value) { return ["civitai.com", "civitai.red"].includes(new URL(value).hostname); }
/** @param {string} value */
function loginRedirect(value) {
  const url = new URL(value);
  return /(^|\.)civitai\.(com|red)$/.test(url.hostname) && (/^\/(login|signin|sign-in)(\/|$)/.test(url.pathname) || url.pathname === "/api/auth/signin");
}
/** @param {Record<string,string|string[]>} headers @param {string} name */
function takeHeader(headers, name) {
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name);
  if (!key) return "";
  const value = headers[key]; delete headers[key];
  return Array.isArray(value) ? value[0] || "" : value;
}
/** @param {Electron.Session} target @param {Map<number,DownloadContext>} contexts @param {(url:string)=>boolean} validate */
function installRedirectChecks(target, contexts, validate) {
  target.webRequest.onBeforeRequest((details, callback) => {
    const context = contexts.get(details.id);
    const cancel = !validate(details.url) || Boolean(context?.failure);
    if (cancel && context && !context.failure) context.failure = "redirect";
    callback({ cancel });
  });
  target.webRequest.onBeforeRedirect((details) => {
    const context = contexts.get(details.id);
    if (!context) return;
    if (loginRedirect(details.redirectURL)) context.failure = "auth";
    else if (++context.redirects > MAX_REDIRECTS || !validate(details.redirectURL)) context.failure = "redirect";
  });
  target.webRequest.onCompleted((details) => contexts.delete(details.id));
  target.webRequest.onErrorOccurred((details) => {
    const context = contexts.get(details.id);
    if (context && details.error === "net::ERR_TIMED_OUT") context.failure = "timeout";
    contexts.delete(details.id);
  });
}
/** @param {Electron.Session} target @param {Map<number,DownloadContext>} contexts @param {Map<string,DownloadContext>} pending */
function installAuthorizationChecks(target, contexts, pending) {
  target.webRequest.onBeforeSendHeaders((details, callback) => {
    const marker = takeHeader(details.requestHeaders, REQUEST_MARKER);
    const context = contexts.get(details.id) || pending.get(marker);
    takeHeader(details.requestHeaders, "authorization");
    if (context) {
      context.id = details.id; contexts.set(details.id, context); pending.delete(marker);
      if (context.authorization && authorizationHost(details.url)) details.requestHeaders.Authorization = context.authorization;
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}
/** @param {Electron.Session} target @param {(url:string)=>boolean} [validate] Test callers use isolated loopback sessions. */
function createDownloadTransport(target, validate = allowedUrl) {
  /** @type {Map<number,DownloadContext>} */ const contexts = new Map();
  /** @type {Map<string,DownloadContext>} */ const pending = new Map();
  installRedirectChecks(target, contexts, validate);
  installAuthorizationChecks(target, contexts, pending);
  /** @param {string} url @param {RequestInit} [options] */
  async function fetch(url, options = {}) {
    if (!validate(url)) throw new Error("invalid");
    const marker = randomUUID(), headers = new Headers(options.headers);
    const context = { authorization: authorizationHost(url) ? headers.get("authorization") || "" : "", redirects: 0, failure: "", id: /** @type {number|undefined} */ (undefined) };
    if (!context.authorization) headers.delete("authorization");
    headers.set(REQUEST_MARKER, marker); pending.set(marker, context);
    try { return await target.fetch(url, { ...options, headers, redirect: "follow", credentials: "omit", cache: "no-store" }); }
    catch {
      if (context.id !== undefined) contexts.delete(context.id);
      const reason = options.signal?.reason;
      throw new Error(context.failure || (options.signal?.aborted && reason instanceof Error && ["timeout", "network"].includes(reason.message) ? reason.message : "network"));
    } finally { pending.delete(marker); }
  }
  return { fetch };
}
/** @type {Electron.Session|undefined} */ let downloadSession;
/** @type {ReturnType<typeof createDownloadTransport>|undefined} */ let transport;
function getDownloadSession() {
  if (!downloadSession) {
    downloadSession = session.fromPartition("illusion-realm-model-downloads", { cache: false });
    transport = createDownloadTransport(downloadSession);
  }
  return downloadSession;
}
/** @param {string} url @param {RequestInit} [options] */
function downloadFetch(url, options) { getDownloadSession(); return /** @type {ReturnType<typeof createDownloadTransport>} */ (transport).fetch(url, options); }
module.exports = { allowedUrl, createDownloadTransport, getDownloadSession, downloadFetch };
