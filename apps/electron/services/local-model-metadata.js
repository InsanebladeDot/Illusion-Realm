/** 按模型文件读取同名 .civitai.json；限定配置目录、真实路径和大小，按版本隔离，不扫描大型模型内容。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { configuredPaths, isInside } = require("./model-download-paths");
const MAX_BYTES = 2 * 1024 * 1024;
/** @typedef {import('@illusion-realm/shared').LocalModelMetadata} Metadata */
/** @typedef {import('@illusion-realm/shared').LocalModelMetadataEntry} Entry */

/** @param {unknown[]} args */
function validateMetadataArgs(args) {
  const paths = args[0];
  return args.length === 1 && Array.isArray(paths) && paths.length > 0 && paths.length <= 200 &&
    paths.every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 4096)
    ? null : "Invalid model metadata request";
}
/** @param {unknown} value @param {number} [limit] */
function text(value, limit = 4096) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
/** 仅保留展示所需的公共 URL 字段，旧文件内的 token 也不会返回界面。 @param {unknown} value */
function publicUrl(value) {
  try {
    const url = new URL(text(value));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    for (const key of [...url.searchParams.keys()]) if (!["modelVersionId", "type", "format", "size", "fp"].includes(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}
/** @param {Record<string, unknown>} raw @returns {Metadata} */
function normalizeMetadata(raw) {
  const words = Array.isArray(raw.trainedWords) ? raw.trainedWords.slice(0, 256).map(value => text(value)).filter(Boolean) : [];
  return {
    version: 1, source: text(raw.source), sourceUrl: publicUrl(raw.sourceUrl), sourceTitle: text(raw.sourceTitle),
    modelPageUrl: publicUrl(raw.modelPageUrl), downloadUrl: publicUrl(raw.downloadUrl), modelName: text(raw.modelName),
    versionName: text(raw.versionName), creator: text(raw.creator), baseModel: text(raw.baseModel), modelType: text(raw.modelType),
    trainedWords: [...new Set(words)], description: text(raw.description, 200000), versionDescription: text(raw.versionDescription, 200000),
    sha256: /^[a-f\d]{64}$/i.test(text(raw.sha256)) ? text(raw.sha256) : "", downloadedAt: text(raw.downloadedAt),
  };
}
/** @param {string} filePath @param {string[]} roots */
async function authorizedModel(filePath, roots) {
  if (!path.isAbsolute(filePath) || !/\.(safetensors|ckpt|pt|pth|gguf)$/i.test(filePath)) return null;
  for (const root of roots) {
    if (!path.isAbsolute(root) || !isInside(path.resolve(root), path.resolve(filePath))) continue;
    try {
      const [realRoot, realModel, stat] = await Promise.all([fs.realpath(root), fs.realpath(filePath), fs.stat(filePath)]);
      if (stat.isFile() && isInside(realRoot, realModel)) return realModel;
    } catch { /* 一个配置目录不可用时继续检查其他目录。 */ }
  }
  return null;
}
/** @param {string} sidecar */
async function readBoundedJson(sidecar) {
  const handle = await fs.open(sidecar, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) throw new Error("invalid");
    return /** @type {unknown} */ (JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
  } finally { await handle.close(); }
}
/** @param {string} filePath @param {string[]} roots @returns {Promise<Entry>} */
async function readEntry(filePath, roots) {
  /** @param {Entry['status']} status @param {Metadata | null} [metadata] */
  const result = (status, metadata = null) => ({ filePath, status, metadata });
  const model = await authorizedModel(filePath, roots);
  if (!model) return result("unavailable");
  try {
    const sidecar = model + ".civitai.json";
    if (await fs.realpath(sidecar) !== sidecar) return result("invalid");
    const raw = await readBoundedJson(sidecar);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result("invalid");
    const data = /** @type {Record<string, unknown>} */ (raw);
    if (data.version !== 1) return result("unsupported");
    return result("ready", normalizeMetadata(data));
  } catch (error) {
    return result(error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? "missing" : "invalid");
  }
}
/** 按小批量并行，避免选中多个 LoRA 时瞬间打开大量文件。 @param {string[]} filePaths */
async function readLocalModelMetadata(filePaths) {
  let roots = /** @type {string[]} */ ([]);
  try { roots = Object.values(configuredPaths()).filter(Boolean); } catch { /* 未配置时逐项返回 unavailable。 */ }
  const entries = /** @type {Entry[]} */ ([]);
  for (let offset = 0; offset < filePaths.length; offset += 8) entries.push(...await Promise.all(filePaths.slice(offset, offset + 8).map(filePath => readEntry(filePath, roots))));
  return entries;
}
module.exports = { readLocalModelMetadata, validateMetadataArgs };
