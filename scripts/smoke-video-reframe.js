// 按帧导出的真实回归：从 1 FPS 原片经 UI/IPC 导出，验证帧数、时长、音轨与取消。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-reframe", timeoutMs: 120000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-reframe-"));
smoke.setWorkDir(work);
const ffmpeg = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffmpeg.exe");
const ffprobe = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffprobe.exe");
const source = path.join(work, "one-fps.mp4");
const documentPath = path.join(work, "user.json");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
app.setPath("userData", work); app.disableHardwareAcceleration();
registerAppProtocol(); registerVideoToolIpc();
let document = { version: 1, userDataPath: documentPath, videoTool: { ffmpegPath: ffmpeg, outputFolder: work } };
registerHandle("userData:read", () => ({ filePath: documentPath, data: require("./lib/guest-session-fixture").withGuestSession(document), isNew: false }));
registerHandle("userData:write", (_event, data) => { document = data; return { filePath: documentPath, data }; });
registerHandle("userData:getDefaultPath", () => documentPath);
registerHandle("theme:setThemeSource", () => null);
registerHandle("models:downloadList", () => []);
registerHandle("changelog:read", () => "");
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });

async function waitFor(run, condition) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await run(`Boolean(${condition})`)) return;
    await delay(80);
  }
  throw new Error(`Timed out: ${condition}`);
}

function inspect(file) {
  return JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], { windowsHide: true }).toString());
}

function verifyVideo(file, fps, audio) {
  const info = inspect(file);
  const video = info.streams.find(stream => stream.codec_type === "video");
  assert.equal(Number(video.nb_read_frames), 124);
  assert.equal(Number(video.avg_frame_rate.split("/")[0]) / Number(video.avg_frame_rate.split("/")[1]), fps);
  assert.ok(Math.abs(Number(video.duration || info.format.duration) - 124 / fps) < 0.08);
  assert.equal(info.streams.some(stream => stream.codec_type === "audio"), audio);
  assert.ok(Math.abs(Number(info.format.duration) - 124 / fps) < 0.15);
}

async function directExport(run, inputPath, fps, name) {
  return run(`window.electronAPI.videoRun(${JSON.stringify({ job: { mode: "reframe", inputPath, outputPath: path.join(work, name), fps }, manualFfmpegPath: ffmpeg })})`);
}

async function verifyApi(run) {
  for (const fps of [5, 120]) {
    const result = await directExport(run, source, fps, `target-${fps}.mp4`);
    assert.equal(result.success, true, result.error); verifyVideo(result.data.outputPath, fps, true);
    smoke.check(`124 original frames retained at ${fps} FPS with synchronized audio`, true);
  }
  const silent = path.join(work, "silent.mp4");
  execFileSync(ffmpeg, ["-v", "error", "-i", source, "-an", "-c:v", "copy", silent], { windowsHide: true });
  const result = await directExport(run, silent, 20, "silent-20.mp4");
  assert.equal(result.success, true, result.error); verifyVideo(result.data.outputPath, 20, false);
  const slow = await directExport(run, result.data.outputPath, 5, "slow.mp4");
  assert.equal(slow.success, true, slow.error); verifyVideo(slow.data.outputPath, 5, false);
  smoke.check("Silent video and slower target FPS retain every frame", true);
  for (const fps of [0, -1, 2.5, 121, "30", null]) {
    const invalid = await directExport(run, source, fps, "invalid.mp4");
    assert.equal(invalid.success, false); assert.equal(invalid.code, "INVALID_ARGUMENT");
  }
  assert.equal(fs.existsSync(path.join(work, "invalid.mp4")), false);
  smoke.check("Invalid FPS rejected before any output is created", true);
  const again = await directExport(run, source, 5, "target-5.mp4");
  assert.equal(again.success, true, again.error);
  assert.notEqual(again.data.outputPath, path.join(work, "target-5.mp4"));
  verifyVideo(again.data.outputPath, 5, true);
  smoke.check("Repeated exports append a number and preserve earlier files", true);
  const cancel = await run(`(async () => {
    let cancelResult; const off = window.electronAPI.onVideoProgress(event => {
      if (event.percent === 0) cancelResult = window.electronAPI.videoCancel(event.jobId);
    });
    try { const result = await window.electronAPI.videoRun(${JSON.stringify({ job: { mode: "reframe", inputPath: source, outputPath: path.join(work, "cancel.mp4"), fps: 30 }, manualFfmpegPath: ffmpeg })});
      return { result, cancelled: await cancelResult }; } finally { off(); }
  })()`);
  assert.equal(cancel.cancelled.success, true); assert.equal(cancel.cancelled.data, true);
  assert.equal(cancel.result.success, false);
  smoke.check("Immediate progress supplies a job ID and cancellation terminates the native export", true);
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=1:d=124",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=124", "-c:v", "libx264", "-c:a", "aac", "-shortest", source], { windowsHide: true, timeout: 30000 });
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
    preload: path.resolve(__dirname, "../apps/electron/preload.js") } });
  smoke.attachWebContents(win.webContents); await smoke.hardenWindow(win);
  await win.loadURL("app://app/tools/video/editor"); const run = smoke.createRun();
  await waitFor(run, `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('点击添加视频片段')&&!b.disabled)`);
  await run(`document.querySelector('button').focus(); Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('点击添加视频片段')).click()`);
  await waitFor(run, `document.querySelector('[data-testid="video-reframe-run"]') && !document.querySelector('[data-testid="video-reframe-run"]').disabled`);
  assert.equal(await run(`document.querySelector('[aria-label="目标帧率"]').value`), "30");
  await run(`document.querySelector('[data-testid="video-reframe-run"]').click()`);
  await waitFor(run, `Array.from(document.querySelectorAll('span')).some(s=>s.title?.endsWith('one-fps_30fps.mp4'))`);
  verifyVideo(path.join(work, "one-fps_30fps.mp4"), 30, true);
  smoke.check("Main editor UI repairs a 124-second / 1 FPS video to 124 frames / 30 FPS / 4.13 seconds", true);
  await run(`document.querySelector('[aria-label="快捷功能"]').click()`);
  await waitFor(run, `!!document.querySelector('[data-video-quick-panel]')`);
  await run(`Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent==='按帧导出').click()`);
  assert.equal(await run(`document.querySelectorAll('[data-video-reframe-controls]').length`), 2);
  await run(`(() => { const select=document.querySelector('[data-video-quick-panel] select'); select.value='10'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor(run, `document.querySelector('[aria-label="目标帧率"]').value==='10'`);
  smoke.check("Quick tools and main editor reuse the same controls and target FPS state", true);
  win.setSize(520, 800); await delay(300);
  assert.equal(await run(`(() => { const r=document.querySelector('[data-video-quick-panel]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth; })()`), true);
  smoke.check("Quick tools remain within the narrow viewport", true);
  await verifyApi(run);
  win.destroy(); await smoke.finish({ app, ok: true, cleanupDir: work });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
