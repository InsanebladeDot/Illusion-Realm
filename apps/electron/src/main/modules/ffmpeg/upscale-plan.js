/** 只探测完整原视频并规划批次；像按胶卷格数列装盒清单，不在本机裁剪或抽帧。 */
const { inspectClip } = require("./upscale-media");

/** 每盒容量由用户设置；工作流用相同FPS重组原帧，所以每批始终对应一秒。 */
/** @param {{ffprobePath: string}} tools @param {string} input @param {AbortSignal} signal @param {number} batchFrames */
async function planVideo(tools, input, signal, batchFrames = 10) {
  if (!Number.isInteger(batchFrames) || batchFrames < 1 || batchFrames > 120) throw Error("Invalid upscale batch frames");
  const source = await inspectClip(tools.ffprobePath, input, signal);
  const count = Math.ceil(source.frames / batchFrames);
  if (!Number.isInteger(source.frames) || source.frames < 1 || count > 10000) throw Error("Invalid upscale frame count");
  if (!Number.isFinite(source.fps) || source.fps <= 0) throw Error("Invalid upscale frame rate");
  const batches = Array.from({ length: count }, (_, index) => ({
    startTime: index,
    startFrame: index * batchFrames,
    frames: Math.min(batchFrames, source.frames - index * batchFrames),
  }));
  return { batches, fps: batchFrames, sourceFps: source.fps, sourceRate: source.rate, duration: source.duration, totalFrames: source.frames };
}
module.exports = { planVideo };
