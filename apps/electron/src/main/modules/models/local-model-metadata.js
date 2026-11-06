/**
 * 本地资料读取复用下载域已有的 configuredPaths 与 isInside，避免出现两套根目录边界。
 * 同名资料仍按实际模型文件解析，模块分类不改变旁车文件命名规则。
 */
/** 按模型文件读取同名 .civitai.json；限定配置目录、真实路径和大小，按版本隔离，不扫描大型模型内容。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { configuredPaths, isInside } = require("./downloads/model-download-paths");
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
// SHA-256 补全与只读详情共用真实路径授权，避免新入口放宽目录限制。
// authorizedModel 仅接受模型扩展名，并检查解析链接后的路径仍在配置根下。
// 这里导出内部策略供主进程复用，不向 preload 暴露任意文件读取。
// Agent 的模型目录来自同一份用户设置，但也支持独立配置文件作为测试输入。
// 导出单项读取策略供宿主复用，根目录仍由调用端从设置生成，不能由工具参数提供。
// 单项入口继续执行真实路径授权、大小限制及来源版本校验，不增加 preload API。
// 返回 missing 与 invalid 等状态供兼容性检查区分缺少资料和不可相信的资料。
// 宿主不直接读取模型权重，也不复制另一份无边界的 JSON 解析实现。
module.exports = { readLocalModelMetadata, validateMetadataArgs, authorizedModel, readEntry };
