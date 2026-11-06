// 视频变速与按帧重排共用音频变速链，逐级拆分以保证每级 atempo 都在安全范围内。
/** @param {number} speed @returns {string[]} */
function buildAtempoFilters(speed) {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("无效的音频变速比例");
  const filters = [];
  let remaining = speed;
  while (remaining > 2) { filters.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  filters.push(`atempo=${Number(remaining.toPrecision(12))}`);
  return filters;
}
module.exports = { buildAtempoFilters };
