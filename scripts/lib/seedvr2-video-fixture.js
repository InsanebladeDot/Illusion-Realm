/** ComfyUI替身读取同一完整源，按所选批FPS和1秒范围模拟工作流；不验证GPU画质。 */
const fs = require("node:fs/promises"), path = require("node:path");
const { execFile } = require("node:child_process"), { promisify } = require("node:util");
const { resolveTools } = require("../../apps/electron/src/main/modules/ffmpeg/locate");
const { inspectClip } = require("../../apps/electron/src/main/modules/ffmpeg/upscale-media");
const execute = promisify(execFile);

function create(root) {
  const uploads = new Map(), batches = [];
  const directory = path.join(root, "mock-comfy-video"), signal = new AbortController().signal;
  const tools = resolveTools();
  async function upload(name, bytes) {
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, path.basename(name));
    await fs.writeFile(file, bytes);
    uploads.set(`fixture-input/${name}`, file);
  }
  async function submit(prompt, id, held) {
    const source = uploads.get(prompt["73"].inputs.file);
    if (!source) throw Error("Video fixture received an unknown upload");
    const info = await inspectClip(tools.ffprobePath, source, signal);
    const start = prompt["113:115"].inputs.start_time, fps = prompt["113:112"].inputs.fps;
    const frames = Math.min(fps, info.frames - start * fps);
    if (!Number.isInteger(start) || start < 0 || frames < 1 || !Number.isInteger(fps) || fps < 1 || fps > 120 || prompt["113:115"].inputs.duration !== 1 || prompt["66:81"].inputs.switch !== false) throw Error("Video fixture requires fixed workflow batches");
    batches.push({ source: prompt["73"].inputs.file, frames, fps, start, seed: prompt["66:54"].inputs.seed });
    const output = path.join(directory, id + ".mp4"), scale = prompt["66:57"].inputs["resize_type.multiplier"];
    const filter = `trim=start_frame=${start * fps}:end_frame=${start * fps + frames},settb=1/${fps},setpts=N,scale=iw*${scale}:ih*${scale}`;
    await execute(tools.ffmpegPath, ["-v", "error", "-i", source, "-an", "-vf", filter, "-enc_time_base", `1:${fps}`, "-r", String(fps), "-fps_mode", "cfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", output], { windowsHide: true, timeout: 20000 });
    return { id, prompt, bytes: await fs.readFile(output), video: true, held, cancelled: false };
  }
  const readInput = name => fs.readFile(uploads.get(`fixture-input/${name}`));
  return { upload, submit, batches, readInput, history: videoHistory };
}

/** 按真实 ComfyUI 的回包：输入和 SaveVideo 都在 images 内，防止仅测试旧 videos 字段。 */
function videoHistory(item) {
  const file = item.prompt["73"].inputs.file;
  return {
    "73": { images: [{ filename: path.basename(file), subfolder: "fixture-input", type: "input" }], animated: [true] },
    "76": { images: [{ filename: item.id + ".mp4", subfolder: "", type: "output" }], animated: [true] },
  };
}
module.exports = { create };
