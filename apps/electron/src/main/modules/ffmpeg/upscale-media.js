/** 探测超分片段并按原顺序合并画面，最后合入原视频音轨。 */
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execute = promisify(execFile);

/** @typedef {{ffmpegPath: string, ffprobePath: string}} Tools */
/** @typedef {{frames: number, fps: number, rate: string, width: number, height: number, duration: number}} ClipInfo */

/** 优先读容器帧数；缺少计数时真实解码计帧，不能靠时长四舍五入规划任务。 */
/** @param {string} binary @param {string} file @param {AbortSignal} signal @returns {Promise<ClipInfo>} */
async function inspectClip(binary, file, signal) {
  const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames,nb_read_frames,avg_frame_rate,r_frame_rate,width,height,duration:format=duration", "-of", "json", file];
  const options = { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024, windowsHide: true };
  let result = JSON.parse(String((await execute(binary, args, options)).stdout));
  if (!(Number(result.streams?.[0]?.nb_frames) > 0)) result = JSON.parse(String((await execute(binary, ["-count_frames", ...args], options)).stdout));
  const stream = result.streams?.[0];
  const rate = stream?.avg_frame_rate !== "0/0" ? stream?.avg_frame_rate : stream?.r_frame_rate;
  const [numerator, denominator] = String(rate || "0/1").split("/").map(Number);
  const info = { frames: Number(stream?.nb_frames) || Number(stream?.nb_read_frames), fps: numerator / denominator, rate: `${numerator}/${denominator}`, width: Number(stream?.width || 0), height: Number(stream?.height || 0), duration: Number(stream?.duration || result.format?.duration || 0) };
  if (!info.width || !info.height || !Number.isFinite(info.duration) || info.duration <= 0 || !Number.isInteger(info.frames) || info.frames < 1 || !Number.isFinite(info.fps) || info.fps <= 0) throw Error("Invalid upscale video");
  return info;
}

/** 每段必须与对应输入帧数一致；顺序由调用方维护，缺段不能靠拼接掩盖。 */
/** @param {Tools} tools @param {string[]} paths @param {number[]} frames @param {number} fps @param {AbortSignal} signal */
async function inspectResults(tools, paths, frames, fps, signal) {
  if (paths.length !== frames.length || new Set(paths).size !== paths.length) throw Error("Incomplete upscale batches");
  let dimensions = "";
  for (const [index, file] of paths.entries()) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Invalid upscale batch file");
    const info = await inspectClip(tools.ffprobePath, file, signal);
    const size = `${info.width}x${info.height}`;
    if (info.frames !== frames[index] || Math.abs(info.fps - fps) > .02 || dimensions && dimensions !== size) throw Error("Upscale batch frame mismatch");
    dimensions = size;
  }
}

/** 先无损拼接无声画面，再恢复源FPS，最后才合音轨；像先接好胶卷，再调放映机速度。 */
/** @param {Tools} tools @param {string[]} paths @param {string} source @param {string} directory @param {string} rate @param {number} frames @param {AbortSignal} signal @param {number} batchFps */
async function mergeVideo(tools, paths, source, directory, rate, frames, signal, batchFps = 10) {
  const list = path.join(directory, "concat.txt"), joined = path.join(directory, "joined.mp4");
  const restored = path.join(directory, "restored.mp4"), output = path.join(directory, "merged.mp4");
  await fs.writeFile(list, paths.map(file => `file '${path.basename(file)}'`).join("\n"), "utf8");
  await writeFrames(tools, ["-f", "concat", "-safe", "1", "-i", list], joined, `${batchFps}/1`, signal);
  await writeFrames(tools, ["-i", joined], restored, rate, signal);
  const info = await inspectClip(tools.ffprobePath, restored, signal);
  const [numerator, denominator] = rate.split("/").map(Number);
  if (info.frames !== frames || Math.abs(info.fps - numerator / denominator) > .001) throw Error(`Upscale restored frames mismatch: ${info.frames}/${frames}, FPS ${info.fps}/${rate}`);
  await muxAudio(tools, restored, source, output, frames * denominator / numerator, signal);
  return output;
}

/** 按输入帧序改播放速度，passthrough禁止补丢帧；反读总数兜底，CRF0保持画面。 */
/** @param {Tools} tools @param {string[]} input @param {string} output @param {string} rate @param {AbortSignal} signal */
async function writeFrames(tools, input, output, rate, signal) {
  const [numerator, denominator] = rate.split("/");
  const filter = `settb=expr=${denominator}/${numerator},setpts=N`;
  await execute(tools.ffmpegPath, ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-r", rate, ...input, "-map", "0:v:0", "-an", "-vf", filter, "-enc_time_base", `${denominator}:${numerator}`, "-fps_mode", "passthrough", "-c:v", "libx264", "-preset", "fast", "-crf", "0", "-bf", "0", output], { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024, windowsHide: true });
}

/** 优先直接复制原音轨；容器不兼容时才转AAC，失败和取消都交会话层回收临时文件。 */
/** @param {Tools} tools @param {string} video @param {string} source @param {string} output @param {number} duration @param {AbortSignal} signal */
async function muxAudio(tools, video, source, output, duration, signal) {
  const args = ["-v", "error", "-nostdin", "-y", "-i", video, "-i", source, "-map", "0:v:0", "-map", "1:a?", "-c:v", "copy", "-t", String(duration), "-movflags", "+faststart"];
  const options = { signal, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024, windowsHide: true };
  try { await execute(tools.ffmpegPath, [...args, "-c:a", "copy", output], options); }
  catch {
    signal.throwIfAborted();
    await execute(tools.ffmpegPath, [...args, "-c:a", "aac", "-b:a", "192k", output], options);
  }
}
module.exports = { inspectClip, inspectResults, mergeVideo };
