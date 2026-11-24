/** 真实FFmpeg验证原帧批次规划、无损拼接、恢复源FPS和音轨；模拟超分不代表GPU画质。 */
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { execFile } = require("node:child_process"), { promisify } = require("node:util"), { EventEmitter } = require("node:events");
const assert = require("node:assert/strict");
const { app } = require("electron");
const { resolveTools } = require("../apps/electron/src/main/modules/ffmpeg/locate");
const { handleUpscale } = require("../apps/electron/src/main/modules/ffmpeg/upscale.handlers");
const { validateUpscale } = require("../apps/electron/src/main/modules/ffmpeg/upscale-validation");
const { inspectClip } = require("../apps/electron/src/main/modules/ffmpeg/upscale-media");
const execute = promisify(execFile), signal = new AbortController().signal;
let root, tools, checked = 0;

/** 假窗口只提供任务归属；文件、子进程、媒体探测和生产处理器均为真实实现。 */
function caller(id = 91001) {
  const owner = new EventEmitter();
  owner.id = id; owner.getURL = () => "app://app/canvas";
  return { sender: owner };
}
const owner = caller();
async function request(value, event = owner) { return handleUpscale(event, value); }
function check(name, value) { assert(value, name); checked++; console.log("PASS", name); }

async function createSource(duration, audio, rate = 30) {
  const output = path.join(root, `source-${duration}-${audio}-${String(rate).replace("/", "-")}-${require("node:crypto").randomUUID()}.mp4`);
  const sound = audio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-c:a", "aac"] : ["-an"];
  await execute(tools.ffmpegPath, ["-v", "error", "-f", "lavfi", "-i", `testsrc2=size=96x64:rate=${rate}`, ...sound, "-t", String(duration), "-c:v", "libx264", "-pix_fmt", "yuv420p", output], { windowsHide: true, timeout: 20000 });
  return output;
}

/** 每批输出用真实解码放大模拟，帧序与帧数不变；最终合并仍调用生产服务。 */
async function simulateUpscale(prepared, source) {
  const paths = [];
  for (const [index, batch] of prepared.batches.entries()) {
    const output = path.join(prepared.directory, `IR_video_fixture_${index}.mp4`);
    await execute(tools.ffmpegPath, ["-v", "error", "-i", source, "-an", "-vf", `trim=start_frame=${batch.startFrame}:end_frame=${batch.startFrame + batch.frames},settb=1/${prepared.fps},setpts=N,scale=iw*2:ih*2`, "-enc_time_base", `1:${prepared.fps}`, "-r", String(prepared.fps), "-fps_mode", "cfr", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", output], { windowsHide: true, timeout: 20000 });
    paths.push(output);
  }
  return paths;
}

/** 比较解码后的逐帧指纹，确认拼接顺序，不能只凭时长相等判断没有重复片段。 */
async function frameHashes(file, filter) {
  const { stdout } = await execute(tools.ffmpegPath, ["-v", "error", "-i", file, "-map", "0:v:0", "-an", ...filter ? ["-vf", filter] : [], "-pix_fmt", "yuv420p", "-f", "framemd5", "-"], { windowsHide: true, maxBuffer: 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split(",").at(-1).trim());
}

/** 同一源文件按帧号取互斥范围，不先降帧；比较真实逐帧内容，拒绝只验总数。 */
async function checkInputBoundaries(prepared, source, paths) {
  const frames = [];
  for (const file of paths) frames.push(...await frameHashes(file));
  const reference = await frameHashes(source, "scale=iw*2:ih*2");
  check("All original frames survive exactly once across batches", JSON.stringify(frames) === JSON.stringify(reference));
  check("Starts are consecutive seconds and disjoint ten-frame ranges", prepared.batches.every((batch, index) => batch.startTime === index && batch.startFrame === index * prepared.fps));
}

async function checkFrameOrder(paths, output) {
  const expected = [];
  for (const file of paths) expected.push(...await frameHashes(file));
  check("Merged decoded frames retain segment order without duplicates or missing frames", JSON.stringify(await frameHashes(output)) === JSON.stringify(expected));
}

async function checkRoundtrip(duration, audio, rate = 30, batchFrames = 10) {
  const inputPath = await createSource(duration, audio, rate), requestId = `fixture-${duration}-${audio}-${batchFrames}`;
  const { prepared } = await request({ action: "prepare", requestId, inputPath, fps: batchFrames });
  try {
    check(`${duration}s batches equal ceil(original frames / 10)`, prepared.batches.length === Math.ceil(prepared.totalFrames / batchFrames));
    check("Prepare only plans and never creates input slices", (await fs.readdir(prepared.directory)).length === 0);
    const counts = prepared.batches.map(batch => batch.frames);
    check("Every full batch has ten frames and final remainder is preserved", counts.every((count, index) => count > 0 && count <= batchFrames && (index === counts.length - 1 || count === batchFrames)) && counts.reduce((a, b) => a + b) === prepared.totalFrames);
    const paths = await simulateUpscale(prepared, inputPath);
    await checkInputBoundaries(prepared, inputPath, paths);
    const output = await request({ action: "merge", requestId, paths, outputPath: path.join(root, "project", "video") });
    await checkFrameOrder(paths, output.savedPath);
    const result = await inspectClip(tools.ffprobePath, output.savedPath, signal);
    check("Merged output keeps every original frame, source FPS and true 2x dimensions", result.frames === prepared.totalFrames && Math.abs(result.fps - prepared.sourceFps) < .001 && result.width === 192 && result.height === 128);
    check("Final filename uses original prefix plus SeedVR2", path.basename(output.savedPath) === path.parse(inputPath).name + "SeedVR2.mp4");
    const probe = JSON.parse((await execute(tools.ffprobePath, ["-v", "error", "-show_streams", "-of", "json", output.savedPath], { windowsHide: true })).stdout);
    check("Original audio survives, silent source stays silent", probe.streams.some(stream => stream.codec_type === "audio") === audio);
    check("Video duration returns to source duration within one source frame", Math.abs(result.duration - prepared.duration) <= 1 / prepared.sourceFps + .001);
  } finally { await request({ action: "release", requestId }); }
  check("Release removes only intermediate directory and preserves source", !(await exists(prepared.directory)) && await exists(inputPath));
}

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }

/** 错误不会发布半成片；取消在 prepare 尚未完成时也必须命中。 */
async function checkFailures() {
  const inputPath = await createSource(1.4, false), requestId = "failure";
  const { prepared } = await request({ action: "prepare", requestId, inputPath, fps: 10 });
  await assert.rejects(request({ action: "merge", requestId, paths: [inputPath], outputPath: root }), /processing failed/); checked++;
  check("Foreign files cannot be merged; failed session cleans its directory", !(await exists(prepared.directory)) && await exists(inputPath));
  const next = request({ action: "prepare", requestId: "cancel-early", inputPath, fps: 10 });
  await request({ action: "cancel", requestId: "cancel-early" });
  await assert.rejects(next, /stopped/); checked++;
  await request({ action: "release", requestId: "cancel-early" });
  const ready = await request({ action: "prepare", requestId: "owner", inputPath, fps: 10 });
  await request({ action: "release", requestId: "owner" }, caller(91002));
  check("Another window cannot release this session", await exists(ready.prepared.directory));
  owner.sender.emit("destroyed");
  const end = Date.now() + 5000;
  while (await exists(ready.prepared.directory) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 25));
  check("Closing owning window cleans its temporary assets", !(await exists(ready.prepared.directory)));
}

function checkValidation() {
  check("Windows path missing its drive is rejected", !!validateUpscale([{ action: "prepare", requestId: "ok", inputPath: "\\relative.mp4", fps: 10 }]));
  for (const value of [null, [], {}, { action: "prepare", requestId: "ok", inputPath: "https://example.com/a.mp4", fps: 10 }, { action: "prepare", requestId: "ok", inputPath: root, fps: 0 }, { action: "prepare", requestId: "ok", inputPath: root, fps: 121 }, { action: "cancel", requestId: "ok", inputPath: root }]) check("Malformed request rejected", !!validateUpscale([value]));
  check("Valid local prepare accepted", validateUpscale([{ action: "prepare", requestId: "ok", inputPath: root, fps: 10 }]) === null);
}


/** Matroska没有nb_frames，必须真实计数；同名结果独占发布，第二次不得覆盖第一次。 */
async function checkMissingCountAndCollision() {
  const source = await createSource(.4, true), inputPath = path.join(root, "no-count.mkv");
  await execute(tools.ffmpegPath, ["-v", "error", "-i", source, "-c", "copy", inputPath], { windowsHide: true });
  const outputs = [];
  for (let index = 0; index < 2; index++) {
    const requestId = `collision-${index}`;
    const { prepared } = await request({ action: "prepare", requestId, inputPath, fps: 10 });
    try {
      check("Missing container frame metadata falls back to real counting", prepared.totalFrames === 12);
      const paths = await simulateUpscale(prepared, inputPath);
      outputs.push((await request({ action: "merge", requestId, paths, outputPath: path.join(root, "project", "video") })).savedPath);
    } finally { await request({ action: "release", requestId }); }
  }
  check("Repeated source names preserve both published results", outputs[0] !== outputs[1] && (await Promise.all(outputs.map(exists))).every(Boolean));
}

async function main() {
  await app.whenReady(); root = await fs.mkdtemp(path.join(os.tmpdir(), "ir-upscale-verify-"));
  tools = resolveTools();
  if (!tools.ffmpegPath || !tools.ffprobePath) { console.error("FFmpeg/FFprobe unavailable"); app.exit(2); return; }
  try {
    checkValidation();
    // 短尾批与整批可能使用不同的B帧延迟，覆盖1帧、3帧尾批和非整数FPS。
    for (const [duration, audio, rate] of [[1, true, 60], [1.05, true, 60], [.3, false, 30], [.35, false, 30], [1, false, "30000/1001"]]) await checkRoundtrip(duration, audio, rate);
    await checkRoundtrip(1.05, true, 60, 20);
    await checkRoundtrip(.3, false, 30, 1);
    await checkFailures();
    await checkMissingCountAndCollision();
    console.log("VIDEO_UPSCALE_VERIFY_OK", { checked, gpuInference: false });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
  app.exit(0);
}
main().catch(error => { console.error(error); app.exit(1); });
