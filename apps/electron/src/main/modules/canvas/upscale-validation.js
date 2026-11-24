/** 与共享配置表保持一致；旧工程允许省略批帧数和种子配置。 */
/** @param {unknown} value */
function upscaleSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(row).some(key => !["enabled", "model", "scale", "batchFrames", "seedMode", "seed"].includes(key))) return false;
  if (typeof row.enabled !== "boolean" || (typeof row.model !== "string" || !["seedvr2_3b", "seedvr2_7b"].includes(row.model))) return false;
  if (typeof row.scale !== "number" || !Number.isInteger(row.scale) || row.scale < 2 || row.scale > 8) return false;
  if (row.batchFrames !== undefined && (typeof row.batchFrames !== "number" || !Number.isInteger(row.batchFrames) || row.batchFrames < 1 || row.batchFrames > 120)) return false;
  if (row.seedMode !== undefined && (typeof row.seedMode !== "string" || !["random", "fixed", "shared"].includes(row.seedMode))) return false;
  return row.seed === undefined || typeof row.seed === "string" && /^\d{1,16}$/.test(row.seed) && Number.isSafeInteger(Number(row.seed));
}
module.exports = { upscaleSettings };
