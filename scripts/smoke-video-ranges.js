/** Real editor regression: one video, independent ranges, same-source seeking, reorder/delete and merged pixels/duration. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { registerVideoToolIpc } = require("../apps/electron/ffmpeg");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { probeVideo } = require("../apps/electron/ffmpeg/probe");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-ranges", timeoutMs: 120000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-ranges-"));
smoke.setWorkDir(work);
const profile = path.join(work, "profile");
fs.mkdirSync(profile); app.setPath("userData", profile); app.disableHardwareAcceleration();
const ffmpeg = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffmpeg.exe");
const ffprobe = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffprobe.exe");
const source = path.join(work, "ranges.mp4");
const documentPath = path.join(work, "user.json");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let userDocument = { version: 1, userDataPath: documentPath, videoTool: { ffmpegPath: ffmpeg, outputFolder: work } };
registerAppProtocol(); registerVideoToolIpc();
registerHandle("userData:read", () => ({ filePath: documentPath, data: userDocument, isNew: false }));
registerHandle("userData:write", (_event, data) => { userDocument = data; return { filePath: documentPath, data }; });
registerHandle("userData:getDefaultPath", () => documentPath);
registerHandle("theme:setThemeSource", () => null);
registerHandle("models:downloadList", () => []);
registerHandle("changelog:read", () => "");
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
dialog.showSaveDialog = async () => { throw new Error("The editor must use the configured output folder."); };

async function waitFor(run, condition, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await run(`Boolean(${condition})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function clickText(run, label) {
  await run(`(() => { const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Missing or disabled button'); button.click(); return true; })()`);
  await delay(150);
}

async function dragMarker(run, label, seconds) {
  await run(`(() => { const marker = document.querySelector('[aria-label="${label}"]'); marker.scrollIntoView({block:'center'});
    const rect = marker.parentElement.getBoundingClientRect(); const duration = document.querySelector('video').duration;
    window.__rangeDrag = { x: rect.left + rect.width * ${seconds} / duration, y: rect.top + rect.height / 2 };
    marker.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true,
      buttons:1, clientX:marker.getBoundingClientRect().left, clientY:window.__rangeDrag.y })); return true; })()`);
  await delay(100);
  await run(`(() => { const track = document.querySelector('[aria-label="${label}"]').parentElement; const p = window.__rangeDrag;
    for (const type of ['pointermove','pointerup']) track.dispatchEvent(new PointerEvent(type, { bubbles:true, pointerId:1,
      pointerType:'mouse', isPrimary:true, buttons:type==='pointerup'?0:1, clientX:p.x, clientY:p.y })); return true; })()`);
  await delay(150);
}

async function dragWholeRange(run, from, to, index) {
  await run(`(() => { const marker = ${index === undefined ? "document.querySelector('[aria-label=\"拖动整体区间\"]')" : `document.querySelectorAll('[data-timeline-range]')[${index}]`}; marker.scrollIntoView({block:'center'});
    const track = marker.parentElement; const rect = track.getBoundingClientRect(); const duration = document.querySelector('video').duration;
    const x = rect.left + rect.width * ${from} / duration; window.__wholeDrag = { track, y: rect.top + rect.height / 2,
      from: x, to: rect.left + rect.width * ${to} / duration };
    marker.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:3, pointerType:'mouse', isPrimary:true,
      buttons:1, clientX:x, clientY:window.__wholeDrag.y })); return true; })()`);
  await delay(100);
  await run(`(() => { const p=window.__wholeDrag; p.track.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
    pointerId:3, pointerType:'mouse', isPrimary:true, buttons:1, clientX:p.to, clientY:p.y }));
    p.track.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:3, pointerType:'mouse', isPrimary:true,
      buttons:0, clientX:p.to, clientY:p.y })); return true; })()`);
  await delay(200);
}

async function verifyDirectSelection(run) {
  await run(`document.querySelectorAll('[data-timeline-range]')[1].click()`);
  await waitFor(run, `document.querySelectorAll('[data-timeline-range]')[1].getAttribute('aria-pressed') === 'true' && Math.abs(document.querySelector('video').currentTime - 2.2) < 0.05`, "direct range click");
  await run(`document.querySelectorAll('[data-timeline-range]')[0].click()`);
  await delay(100);
  await dragWholeRange(run, 2.5, 2.7, 1);
  const titles = await run(`Array.from(document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]')).map(b => b.title)`);
  assert.equal(titles[1], "00:02.400 → 00:03.000");
  await dragWholeRange(run, 2.7, 2.5);
  await dragWholeRange(run, 0.5, 4, 0);
  assert.equal(await run(`document.querySelector('[aria-label="当前视频的剪切区间"] [aria-pressed="true"]').title`), "00:01.600 → 00:02.200");
  await dragWholeRange(run, 1.9, 0.5);
  smoke.check("Range bodies support direct click and same-gesture selection/drag; neighbouring ranges stop movement without shortening", true);
}

async function verifyTransport(run, win) {
  for (const width of [1200, 480]) {
    win.setSize(width, 900); await delay(250);
    const bounds = await run(`(() => { const area=document.querySelector('[data-video-preview]').getBoundingClientRect();
      const bar=document.querySelector('[data-video-transport]').getBoundingClientRect();
      return { centered:Math.abs((area.left+area.right-bar.left-bar.right)/2)<1, bottom:Math.abs(area.bottom-bar.bottom)<1,
        inside:bar.left>=area.left && bar.right<=area.right, buttons:document.querySelectorAll('[data-video-transport] button').length }; })()`);
    assert.deepEqual(bounds, { centered:true, bottom:true, inside:true, buttons:5 });
  }
  win.setSize(1200,900); await delay(250);
  smoke.check("Five transport controls are centered inside the preview and flush with its bottom on wide and narrow screens", true);
}

async function prepareRanges(run) {
  await waitFor(run, `!!document.querySelector('[aria-label="拖动设置起点"]') && document.querySelector('video').readyState >= 2`, "video import");
  for (const [index, start, end] of [[1, 0.2, 0.8], [2, 2.2, 2.8], [3, 4.2, 4.8]]) {
    if (index > 1) await clickText(run, "添加剪切区间");
    await dragMarker(run, "拖动设置终点", end);
    await dragMarker(run, "拖动设置起点", start);
  }
  const state = await run(`(() => ({ count: document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]').length,
    summary: document.body.innerText.includes('已添加 1 个视频 · 3 个剪切区间'),
    merge: document.querySelector('[data-testid="video-export-run"]').textContent.includes('合并所有剪切区间') }))()`);
  assert.equal(state.count, 3); assert.equal(state.summary, true); assert.equal(state.merge, true);
  smoke.check("One imported video has three independent ranges and an explicit merge action", true);
  await clickText(run, "区间 1");
  await waitFor(run, `Math.abs(document.querySelector('video').currentTime - 0.2) < 0.05`, "same-source range seek");
  const titles = await run(`Array.from(document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]')).map(b => b.title)`);
  assert.deepEqual(titles, ["00:00.200 → 00:00.800", "00:02.200 → 00:02.800", "00:04.200 → 00:04.800"]);
  smoke.check("Switching ranges keeps every boundary and seeks the same video to the selected start", true);
}

async function exportAndCheck(run, filename, colors) {
  await run(`(() => { document.querySelector('[data-testid="video-export-run"]').click(); return true; })()`);
  await waitFor(run, `document.body.innerText.includes('视频拼接完成') && !Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === '取消')`, "merge export");
  const file = path.join(work, filename);
  const info = await probeVideo(ffprobe, file);
  assert.ok(Math.abs(info.duration - 1.8) < 0.12, `Duration was ${info.duration}`);
  assert.equal(info.width, 160); assert.equal(info.height, 120); assert.equal(info.hasAudio, true);
  for (const [index, color] of colors.entries()) {
    const pixel = execFileSync(ffmpeg, ["-v", "error", "-ss", String(index * 0.6 + 0.2), "-i", file,
      "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { windowsHide: true, timeout: 10000 });
    assert.equal(pixel.length, 3);
    assert.ok(color === "red" ? pixel[0] > 200 && pixel[2] < 30 : color === "blue" ? pixel[2] > 200 && pixel[0] < 30 : pixel[1] > 90 && pixel[0] < 30);
  }
  smoke.check(`Merged export preserves range content/order, audio and total duration (${filename})`, true);
}

async function reorderRanges(run) {
  await run(`(() => { const handles = document.querySelectorAll('[aria-label="拖拽排序"]'); handles[0].scrollIntoView({block:'center'});
    const a = handles[0].getBoundingClientRect(); const b = handles[2].getBoundingClientRect();
    window.__sortRange = { x:a.left+a.width/2, y:a.top+a.height/2, target:b.top+b.height/2 };
    handles[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:2, pointerType:'mouse',
      isPrimary:true, buttons:1, clientX:window.__sortRange.x, clientY:window.__sortRange.y })); return true; })()`);
  await delay(150);
  for (const step of [0.25, 0.6, 1]) {
    await run(`(() => { const p=window.__sortRange; document.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
      pointerId:2, pointerType:'mouse', isPrimary:true, buttons:1, clientX:p.x, clientY:p.y+(p.target-p.y)*${step} })); return true; })()`);
    await delay(150);
  }
  await run(`(() => { const p=window.__sortRange; document.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
    pointerId:2, pointerType:'mouse', isPrimary:true, buttons:0, clientX:p.x, clientY:p.target })); return true; })()`);
  await delay(200);
  const titles = await run(`Array.from(document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]')).map(b => b.title)`);
  assert.equal(titles[0], "00:02.200 → 00:02.800"); assert.equal(titles[2], "00:01.200 → 00:01.800");
  smoke.check("Dragging range cards changes the merge order without losing their boundaries", true);
}

async function removeRanges(run) {
  await clickText(run, "区间 1");
  for (const start of [4.2, 1.2]) {
    await run(`(() => { document.querySelector('[aria-label="移除片段"]').click(); return true; })()`);
    await waitFor(run, `Math.abs(document.querySelector('video').currentTime - ${start}) < 0.05`, "remaining range start");
  }
  const state = await run(`(() => ({ count: document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]').length,
    label: document.querySelector('[data-testid="video-export-run"]').textContent.trim(), precise: document.querySelector('input[type="checkbox"]').checked }))()`);
  assert.equal(state.count, 1); assert.equal(state.label, "开始处理"); assert.equal(state.precise, true);
  smoke.check("Deleting selected ranges activates the next range; a single range restores precise single export", true);
}

function generateVideo() {
  execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x120:r=25",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-vf",
    "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='lt(t,1.5)',drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='gte(t,3)'",
    "-t", "5", "-c:v", "libx264", "-g", "300", "-sc_threshold", "0", "-c:a", "aac", source], { windowsHide: true, timeout: 15000 });
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); generateVideo();
  const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { contextIsolation: true,
    nodeIntegration: false, sandbox: false, backgroundThrottling: false,
    preload: path.resolve(__dirname, "../apps/electron/preload.js"), additionalArguments: ["--initial-locale=zh-CN"] } });
  smoke.attachWebContents(win.webContents); await smoke.hardenWindow(win);
  await win.loadURL("app://app/tools/video/editor");
  const run = smoke.createRun();
  await waitFor(run, `Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('点击添加视频片段') && !b.disabled)`, "editor hydration");
  await run(`(() => { Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('点击添加视频片段')).click(); return true; })()`);
  await prepareRanges(run);
  await verifyDirectSelection(run);
  await verifyTransport(run, win);
  await clickText(run, "区间 1");
  await dragWholeRange(run, 0.5, 1.5);
  const moved = await run(`Array.from(document.querySelectorAll('[aria-label="当前视频的剪切区间"] [aria-pressed]')).map(b => b.title)`);
  assert.equal(moved[0], "00:01.200 → 00:01.800");
  assert.ok(moved.every((title, index) => index === 0 || title.split(" → ")[0] >= moved[index - 1].split(" → ")[1]));
  smoke.check("Dragging the selected range moves both boundaries on one timeline without overlap", true);
  await exportAndCheck(run, "ranges_x3.mp4", ["red", "blue", "green"]);
  await reorderRanges(run);
  await exportAndCheck(run, "ranges_x3 (2).mp4", ["blue", "green", "red"]);
  await removeRanges(run);
  win.destroy(); await smoke.finish({ app, ok: true, cleanupDir: work });
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
