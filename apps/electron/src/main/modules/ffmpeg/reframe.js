// 修复错误帧率：按解码帧序号重建时间戳，逐帧保留；音轨同步变速，视频结束时停止输出。
const { buildAtempoFilters } = require("./audio-filters");

/**
 * @param {import("@illusion-realm/shared").VideoEditJob} job
 * @param {import("@illusion-realm/shared").VideoProbeResult | undefined} source
 * @returns {{ args: string[], requiresReencode: boolean, expectedDuration: number }}
 */
function buildReframeArgs(job, source) {
  const fps = job.fps;
  if (!job.inputPath || !Number.isInteger(fps) || !fps || fps < 1 || fps > 120) {
    throw new Error("重新按帧导出需要输入视频和 1–120 的整数帧率");
  }
  if (!source || !Number.isFinite(source.fps) || source.fps <= 0 || source.duration <= 0) {
    throw new Error("无法读取原视频的有效帧率和时长");
  }
  const speed = fps / source.fps;
  // 输入侧 -r 同时重设每帧时长，避免最后一帧沿用原来 1 秒的时长而被补帧。
  const args = ["-y", "-hide_banner", "-r", String(fps), "-i", job.inputPath, "-map", "0:v:0",
    "-vf", `settb=expr=1/${fps},setpts=N,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
    "-r", String(fps), "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"];
  if (source.hasAudio) {
    args.push("-map", "0:a:0", "-af", [...buildAtempoFilters(speed), "asetpts=PTS-STARTPTS", "apad"].join(","),
      "-c:a", "aac", "-b:a", "192k", "-shortest");
  } else args.push("-an");
  args.push("-movflags", "+faststart", job.outputPath);
  return { args, requiresReencode: true, expectedDuration: source.duration / speed };
}
module.exports = { buildReframeArgs };
