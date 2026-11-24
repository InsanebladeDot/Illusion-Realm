/** 下载快照的公开请求清理和原恢复校验；原文件权限规则保持不变。 */
const path = require('node:path');
const { validateDownload } = require('./model-download-validation');
/** @typedef {{task:import('@illusion-realm/shared').ModelDownloadTask,request:import('@illusion-realm/shared').ModelDownloadRequest,temporary:string,realFolder:string,validator:string,owned:[string,string][]}} SavedDownload */

/** @param {SavedDownload["request"]} request */
function publicRequest(request) {
  const url = new URL(request.downloadUrl), query = new URLSearchParams();
  for (const key of ["type", "format", "size", "fp", "fileId"]) { const value = url.searchParams.get(key); if (value) query.set(key, value); }
  url.search = query.toString(); url.hash = "";
  const preview = request.previewUrl ? new URL(request.previewUrl) : null; if (preview) { preview.search = ""; preview.hash = ""; }
  return { ...request, downloadUrl: url.href, previewUrl: preview?.href || "" };
}

/** @param {unknown} value @returns {value is SavedDownload} */
function isSavedDownload(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {SavedDownload} */ (value), t = v.task;
  if (validateDownload([v.request]) || !t || typeof t !== "object" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(t.id)) return false;
  if (t.fileName !== v.request.fileName || t.modelName !== v.request.modelName || !["downloading", "saving", "completed", "failed", "cancelled", "removed"].includes(t.status)) return false;
  if (t.queued !== undefined && (typeof t.queued !== "boolean" || !v.request.setupId || t.queued && t.status !== "downloading")) return false;
  if (![t.received, t.total, t.revision].every(n => Number.isSafeInteger(n) && n >= 0) || typeof t.logoWarning !== "boolean") return false;
  if (typeof t.folderPath !== "string" || !path.isAbsolute(t.folderPath) || t.filePath !== path.join(t.folderPath, t.fileName) || v.temporary !== path.join(t.folderPath, ".download-" + t.id + ".part") || typeof v.realFolder !== "string" || !path.isAbsolute(v.realFolder) || typeof v.validator !== "string" || v.validator.length > 4096) return false;
  return Array.isArray(v.owned) && v.owned.every(pair => Array.isArray(pair) && pair.length === 2 && [t.filePath, t.filePath + ".civitai.json", path.join(t.folderPath, "logo.png")].includes(pair[0]) && typeof pair[1] === "string");
}

module.exports = { publicRequest, isSavedDownload };
