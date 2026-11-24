/** 与共享 schema 同步验证分批请求；路径必须本地绝对路径，操作不能夹带其他字段。 */
/** @param {unknown} value @returns {value is string} */
function localPath(value) {
  return typeof value === "string" && !!value.trim() && value.length <= 4096 && !value.includes("\0") && /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(value);
}

/** @param {unknown[]} args @returns {string | null} */
function validateUpscale(args) {
  const value = args[0];
  if (args.length !== 1 || !value || typeof value !== "object" || Array.isArray(value)) return "Invalid upscale request";
  const item = /** @type {Record<string, unknown>} */ (value);
  if (typeof item.requestId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(item.requestId)) return "Invalid upscale identity";
  const fields = item.action === "prepare" ? ["action", "requestId", "inputPath", "fps"] : item.action === "merge" ? ["action", "requestId", "paths", "outputPath"] : ["action", "requestId"];
  if (Object.keys(item).some(key => !fields.includes(key))) return "Invalid upscale fields";
  if (item.action === "cancel" || item.action === "release") return null;
  if (item.action === "prepare") return localPath(item.inputPath) && typeof item.fps === "number" && Number.isInteger(item.fps) && item.fps >= 1 && item.fps <= 120 ? null : "Invalid upscale source";
  if (item.action !== "merge" || !localPath(item.outputPath)) return "Invalid upscale operation";
  return Array.isArray(item.paths) && item.paths.length >= 1 && item.paths.length <= 10000 && item.paths.every(localPath) ? null : "Invalid upscale segments";
}
module.exports = { validateUpscale };
