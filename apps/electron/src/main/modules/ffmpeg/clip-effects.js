// 每个区间独立生成视频/音频滤镜，单段和拼接共用同一规则，旧任务未传效果时行为不变。
const { buildAtempoFilters } = require("./audio-filters");
/** @param {import("@illusion-realm/shared").VideoClipEffects | undefined} effects */
function clipEffectFilters(effects) {
  const speed = effects?.speed ?? 1;
  const volume = effects?.volume ?? 1;
  const muted = Boolean(effects?.muted) || volume === 0;
  const video = [], audio = [];
  if (effects?.reverse) { video.push("reverse"); audio.push("areverse"); }
  if (effects?.reverse || speed !== 1) video.push(`setpts=(PTS-STARTPTS)/${speed}`);
  if (speed !== 1) audio.push(...buildAtempoFilters(speed));
  if (volume !== 1) audio.push(`volume=${volume}`);
  return { speed, muted, video, audio };
}
module.exports = { clipEffectFilters };
