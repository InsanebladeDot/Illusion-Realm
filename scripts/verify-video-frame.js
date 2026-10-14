/** Exercise frame export through the real preload and IPC: PNG pixels, dimensions, naming, cancellation and invalid input. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");
const { probeVideo } = require("../apps/electron/ffmpeg/probe");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-frame", timeoutMs: 60000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-frame-"));
const profile = path.join(work, "profile");
fs.mkdirSync(profile);
app.setPath("userData", profile);
app.disableHardwareAcceleration();
const ffmpeg = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffmpeg.exe");
const ffprobe = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffprobe.exe");
const source = path.join(work, "source.mp4");
const output = path.join(work, "capture.png");
let cancelDialog = false;

function generateVideo() {
  execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x120:r=30",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='lt(t,1.5)'",
    "-t", "3", "-c:v", "libx264", "-g", "300", "-sc_threshold", "0", "-c:a", "aac", source],
  { windowsHide: true, timeout: 15000 });
}

async function assertFrame(file, blue) {
  assert.ok(fs.readFileSync(file).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  const info = await probeVideo(ffprobe, file);
  assert.equal(info.width, 160); assert.equal(info.height, 120); assert.equal(info.hasAudio, false);
  const pixel = execFileSync(ffmpeg, ["-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=1:1",
    "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { windowsHide: true, timeout: 15000 });
  assert.equal(pixel.length, 3);
  assert.ok(blue ? pixel[2] > 200 && pixel[0] < 30 : pixel[0] > 200 && pixel[2] < 30);
}

async function verifyExports(run) {
  const picked = await run(`window.electronAPI.videoPickOutput('capture.png', 'image')`);
  assert.equal(picked.success, true); assert.equal(picked.data, output);
  smoke.check("PNG save dialog uses the original bridge and PNG filter", true);
  for (const time of [1.547, 0, 2.966]) {
    const job = { mode: "frame", inputPath: source, outputPath: output, frameTime: time };
    const result = await run(`window.electronAPI.videoRun(${JSON.stringify({ job, manualFfmpegPath: ffmpeg })})`);
    assert.equal(result.success, true, result.error);
    await assertFrame(result.data.outputPath, time >= 1.5);
    if (time === 0) assert.equal(path.basename(result.data.outputPath), "capture (2).png");
  }
  assert.equal(fs.readdirSync(work).filter((name) => name.endsWith(".png")).length, 3);
  smoke.check("First/middle/last frames: correct pixels, original size, PNG signature and unique filenames", true);
}

async function verifyFailures(run) {
  const base = { mode: "frame", inputPath: source, outputPath: output };
  for (const value of ["-1", "NaN", "Infinity", "undefined", "'1.5'"]) {
    const result = await run(`window.electronAPI.videoRun({job:{...${JSON.stringify(base)},frameTime:${value}}})`);
    assert.equal(result.success, false); assert.equal(result.code, "INVALID_ARGUMENT");
  }
  const invalid = await run(`window.electronAPI.videoRun({job:{...${JSON.stringify(base)},frameTime:0,outputPath:'capture.mp4'}})`);
  assert.equal(invalid.code, "INVALID_ARGUMENT");
  const missing = await run(`window.electronAPI.videoRun(${JSON.stringify({ job: { ...base, frameTime: 30 }, manualFfmpegPath: ffmpeg })})`);
  assert.equal(missing.success, false);
  cancelDialog = true;
  const cancelled = await run(`window.electronAPI.videoPickOutput('capture.png', 'image')`);
  assert.equal(cancelled.success, true); assert.equal(cancelled.data, null);
  assert.equal(fs.readdirSync(work).filter((name) => name.endsWith(".png")).length, 3);
  smoke.check("Invalid timestamps/extensions rejected; absent frames fail; cancelled save creates no file", true);
}

async function main() {
  await app.whenReady();
  generateVideo(); registerVideoToolIpc();
  dialog.showSaveDialog = async (options) => {
    assert.deepEqual(options.filters, [{ name: "PNG 图片", extensions: ["png"] }]);
    return { canceled: cancelDialog, filePath: cancelDialog ? undefined : output };
  };
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false,
    sandbox: false, backgroundThrottling: false, preload: path.resolve(__dirname, "../apps/electron/preload.js") } });
  smoke.attachWebContents(win.webContents);
  await win.loadURL("data:text/html,<html><body>Frame export IPC verification</body></html>");
  const run = smoke.createRun();
  await verifyExports(run); await verifyFailures(run);
  win.destroy();
  await smoke.finish({ app, ok: true, cleanupDir: work });
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
