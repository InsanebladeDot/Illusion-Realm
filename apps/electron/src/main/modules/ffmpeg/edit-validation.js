// 校验新增区间效果，保持与 shared Zod 的范围一致；非法效果在启动 FFmpeg 前返回 INVALID_ARGUMENT。
/** @param {unknown} effects @returns {string | null} */
function validateEffects(effects) {
  if (effects === undefined) return null;
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) return "区间效果格式错误";
  if ("speed" in effects && effects.speed !== undefined &&
    (typeof effects.speed !== "number" || !Number.isFinite(effects.speed) || effects.speed < 0.1 || effects.speed > 16)) return "区间速度须在 0.1–16 倍之间";
  if ("volume" in effects && effects.volume !== undefined &&
    (typeof effects.volume !== "number" || !Number.isFinite(effects.volume) || effects.volume < 0 || effects.volume > 4)) return "区间音量须在 0–400% 之间";
  if ("muted" in effects && effects.muted !== undefined && typeof effects.muted !== "boolean") return "静音设置须为布尔值";
  if ("reverse" in effects && effects.reverse !== undefined && typeof effects.reverse !== "boolean") return "倒放设置须为布尔值";
  return null;
}
/** @param {object} job @returns {string | null} */
function validateClipEffects(job) {
  const error = validateEffects("effects" in job ? job.effects : undefined);
  if (error) return error;
  if (!("clips" in job) || !Array.isArray(job.clips)) return null;
  for (const clip of job.clips) {
    if (!clip || typeof clip !== "object") return "区间格式错误";
    const error = validateEffects("effects" in clip ? clip.effects : undefined);
    if (error) return error;
  }
  return null;
}
module.exports = { validateClipEffects };
