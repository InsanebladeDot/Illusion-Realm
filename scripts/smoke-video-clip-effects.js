/**
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * index：使用媒体业务域的真实 IPC 注册入口。
 * result：沿用统一 IPC 结果和参数校验入口。
 * probe：通过实际 FFprobe 封装读取媒体信息。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * index：视频与 GIF 共用媒体任务能力，不在页面内另起本地进程。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * probe：时长和流信息用于校验输出，不能以界面进度代替成品验证。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * protocol：协议定位失败属于资源路径问题，应先于界面样式判断排查。
 */
/** 区间效果真实回归：右键编辑/复制拆分 + FFmpeg 导出的时长、画面顺序、音量与静音。 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");
const { registerAppProtocol } = require("../apps/electron/src/main/core/protocol");
const { registerVideoToolIpc } = require("../apps/electron/src/main/modules/ffmpeg/index.js");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { probeVideo } = require("../apps/electron/src/main/modules/ffmpeg/probe");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-clip-effects", timeoutMs: 180000 });
smoke.installWatchdog(app);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ir-clip-effects-"));
smoke.setWorkDir(work);
const profile = path.join(work, "profile");
fs.mkdirSync(profile); app.setPath("userData", profile); app.disableHardwareAcceleration();
const ffmpeg = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffmpeg.exe");
const ffprobe = path.resolve(__dirname, "../apps/electron/bin/ffmpeg/ffprobe.exe");
const source = path.join(work, "effects.mp4");
const noAudio = path.join(work, "silent.mp4");
const documentPath = path.join(work, "user.json");
let userDocument = { version: 1, videoTool: { ffmpegPath: ffmpeg, outputFolder: work } };
registerAppProtocol(); registerVideoToolIpc();
registerHandle("userData:read", () => ({ filePath: documentPath, data: require("./lib/guest-session-fixture").withGuestSession(userDocument), isNew: false }));
registerHandle("userData:write", (_event, data) => { userDocument = data; return { filePath: documentPath, data }; });
registerHandle("userData:getDefaultPath", () => documentPath);
registerHandle("theme:setThemeSource", () => null);
registerHandle("models:downloadList", () => []);
registerHandle("changelog:read", () => "");
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(run, condition, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await run(`Boolean(${condition})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function clickText(run, label, scope = "document") {
  await run(`(() => { const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});
    if(!b || b.disabled) throw new Error('Missing button: '+${JSON.stringify(label)}); b.click(); })()`);
  await delay(120);
}
async function menu(run, index, fraction = 0.5) {
  await run(`document.querySelectorAll('[data-timeline-range]')[${index}].scrollIntoView({block:'center'})`);
  await delay(100);
  await run(`(() => { const r=document.querySelectorAll('[data-timeline-range]')[${index}];
    const rect=r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,
      clientX:rect.left+rect.width*${fraction},clientY:rect.top+rect.height/2})); })()`);
  await waitFor(run, "document.querySelector('[data-video-clip-menu]')", "context menu");
  await waitFor(run, "getComputedStyle(document.querySelector('[data-video-clip-menu]').parentElement).opacity==='1'", "menu entry animation");
}
async function closeMenu(run) {
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await delay(100);
}
const menuScope = "document.querySelector('[data-video-clip-menu]')";
async function verifyUi(run, win) {
  await waitFor(run, "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('点击添加视频片段')&&!b.disabled)", "hydration");
  // 首次启动公告是真实遮挡层，先按用户路径关闭，避免只靠合成事件穿透遮挡测试。
  await waitFor(run, "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='知道了')", "first-run announcement");
  await clickText(run, "知道了");
  await run("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('点击添加视频片段')).click()");
  await waitFor(run, "document.querySelector('video')?.readyState>=2 && document.querySelector('[data-timeline-range]')", "import");
  await clickText(run, "添加剪切区间");
  await menu(run, 0);
  assert.equal(await run(`(() => {const input=${menuScope}.querySelector('input');const r=input.getBoundingClientRect();
    return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===input;})()`), true);
  fs.writeFileSync(path.resolve(__dirname, "../logs/video-clip-menu-smoke.png"), (await win.webContents.capturePage()).toPNG());
  assert.equal(await run(`${menuScope}.querySelector('button').textContent.trim()`), "0.5×");
  await clickText(run, "2×", menuScope);
  await clickText(run, "放大音量+10%", menuScope);
  await clickText(run, "禁用音轨", menuScope);
  await clickText(run, "倒放", menuScope);
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="速度（倍）"]').value`), "2");
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="音量（%）"]').value`), "110");
  await closeMenu(run);
  await menu(run, 1);
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="速度（倍）"]').value`), "1");
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="音量（%）"]').value`), "100");
  assert.equal(await run("document.querySelector('video').muted"), false);
  await closeMenu(run);
  await menu(run, 0);
  assert.equal(await run("document.querySelector('video').playbackRate"), 2);
  assert.equal(await run("document.querySelector('video').muted"), true);
  smoke.check("Right-click selects interval; speed/volume/mute/reverse remain independent and update preview", true);
  await closeMenu(run);
  await run("document.querySelector('[data-video-transport] [aria-label=\"播放\"]').click()");
  await waitFor(run, "document.querySelector('video').currentTime>0.5", "reverse preview start");
  const before = await run("document.querySelector('video').currentTime");
  await delay(250);
  assert.ok(await run("document.querySelector('video').currentTime") < before);
  await run("document.querySelector('[data-video-transport] [aria-label=\"暂停\"]').click()");
  smoke.check("Reverse preview seeks backwards and can be paused", true);
  await run("document.querySelector('[data-testid=\"video-export-run\"]').click()");
  await waitFor(run, "document.body.innerText.includes('视频拼接完成')", "UI export with independent effects");
  const uiOutput = path.join(work, "effects_x2.mp4");
  const outputInfo = await probeVideo(ffprobe, uiOutput);
  assert.ok(Math.abs(outputInfo.duration - 3) < 0.12);
  assert.ok(rms(uiOutput, 0.3) < 0.0001); assert.ok(rms(uiOutput, 1.4) > 0.04);
  assert.ok(rgb(uiOutput, 0.3)[0] > 200); assert.ok(rgb(uiOutput, 1.4)[2] > 200);
  smoke.check("Editor export sends each interval's effects to IPC and produces the expected 3-second muted/audible result", true);
  await menu(run, 0);
  await clickText(run, "复制区间", menuScope);
  await menu(run, 1);
  await clickText(run, "粘贴到此区间后", menuScope);
  assert.equal(await run("document.querySelectorAll('[data-clip-effects]').length"), 3);
  await run(`(() => { const r=document.querySelectorAll('[data-clip-effects]')[0]; const p=r.getBoundingClientRect();
    r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:p.left,clientY:p.top})); })()`);
  await waitFor(run, "document.querySelector('[data-video-clip-menu]')", "original menu");
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="速度（倍）"]').value`), "2");
  await clickText(run, "1×", menuScope);
  await closeMenu(run);
  // 粘贴实例拥有独立的源时间轴，修改原区间不能改变复制时的快照。
  // 通过列表卡片的右键入口访问粘贴的独立实例。
  await run(`(() => { const r=document.querySelectorAll('[data-clip-effects]')[2]; const p=r.getBoundingClientRect();
    r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:p.left,clientY:p.top})); })()`);
  await waitFor(run, "document.querySelector('[data-video-clip-menu]')", "paste menu");
  assert.equal(await run(`${menuScope}.querySelector('[aria-label="速度（倍）"]').value`), "2");
  await closeMenu(run);
  await menu(run, 0);
  await clickText(run, "从这里切开", menuScope);
  assert.equal(await run("document.querySelectorAll('[data-clip-effects]').length"), 4);
  await menu(run, 0, 0);
  assert.equal(await run(`Array.from(${menuScope}.querySelectorAll('button')).find(b=>b.textContent==='从这里切开').disabled`), true);
  await closeMenu(run);
  await menu(run, 0);
  await clickText(run, "删除区间", menuScope);
  assert.equal(await run("document.querySelectorAll('[data-clip-effects]').length"), 3);
  assert.ok(fs.existsSync(source));
  smoke.check("Copy/paste uses independent effects; split retains settings; boundary split disabled; delete preserves source", true);
  win.setSize(700, 500); await delay(250);
  await menu(run, 0);
  const fits = await run(`(() => {const r=document.querySelector('[role="dialog"][aria-label="区间编辑"]').getBoundingClientRect();
    return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`);
  assert.equal(fits, true);
  await run(`document.querySelector('[role="dialog"][aria-label="区间编辑"]').dispatchEvent(new Event('scroll',{bubbles:true}))`);
  assert.equal(await run("!!document.querySelector('[data-video-clip-menu]')"), true);
  await closeMenu(run); win.setSize(1200, 900);
  smoke.check("Context menu fits short viewport and stays open while its own content scrolls", true);
}

function generateVideo() {
  execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x120:r=25",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-vf",
    "drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='lt(t,2)'",
    "-t", "4", "-c:v", "libx264", "-c:a", "aac", source], { windowsHide: true, timeout: 15000 });
  execFileSync(ffmpeg, ["-v", "error", "-i", source, "-an", "-c:v", "copy", noAudio], { windowsHide: true, timeout: 15000 });
}
async function exportJob(run, job) {
  const result = await run(`window.electronAPI.videoRun(${JSON.stringify({ job, manualFfmpegPath: ffmpeg })})`);
  assert.equal(result.success, true, result.error);
  return probeVideo(ffprobe, result.data.outputPath);
}
function rgb(file, time) {
  return execFileSync(ffmpeg, ["-v", "error", "-ss", String(time), "-i", file, "-frames:v", "1",
    "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { windowsHide: true, timeout: 10000 });
}
function rms(file, start) {
  const data = execFileSync(ffmpeg, ["-v", "error", "-ss", String(start), "-i", file, "-t", "0.25",
    "-vn", "-ac", "1", "-ar", "44100", "-f", "f32le", "pipe:1"], { windowsHide: true, timeout: 10000 });
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data.readFloatLE(i) ** 2;
  assert.ok(data.length > 1000);
  return Math.sqrt(sum / (data.length / 4));
}
async function verifyExports(run) {
  const single = path.join(work, "single.mp4");
  const info = await exportJob(run, { mode: "single", inputPath: source, outputPath: single,
    trim: { start: 0, end: 4 }, effects: { speed: 2, reverse: true, volume: 0.5 } });
  assert.ok(Math.abs(info.duration - 2) < 0.15, `single duration ${info.duration}`);
  assert.ok(rgb(single, 0.25)[2] > 200); assert.ok(rgb(single, 1.5)[0] > 200);
  const ratio = rms(single, 0.3) / rms(source, 0.3);
  assert.ok(ratio > 0.44 && ratio < 0.56, `volume ratio ${ratio}`);
  smoke.check("Single export actually reverses pixels, applies 2x speed and halves audio amplitude", true);
  const concat = path.join(work, "concat.mp4");
  const clip = effects => ({ inputPath: source, duration: 4, hasAudio: true, trim: { start: 0, end: 4 }, effects });
  const merged = await exportJob(run, { mode: "concat", outputPath: concat, width: 160, height: 120, fps: 25,
    clips: [clip({ speed: 2, reverse: true, volume: 2 }), clip({ speed: 4, muted: true }),
      { inputPath: noAudio, duration: 4, hasAudio: false, trim: { start: 0, end: 1 } }, clip({ speed: 2, volume: 0.5 })] });
  assert.ok(Math.abs(merged.duration - 6) < 0.15, `concat duration ${merged.duration}`);
  assert.ok(rgb(concat, 0.3)[2] > 200); assert.ok(rgb(concat, 1.4)[0] > 200);
  assert.ok(rgb(concat, 4.3)[0] > 200); assert.ok(rgb(concat, 5.6)[2] > 200);
  assert.ok(rms(concat, 0.3) / rms(source, 0.3) > 1.85);
  assert.ok(rms(concat, 2.3) < 0.0001); assert.ok(rms(concat, 3.3) < 0.0001);
  assert.ok(rms(concat, 4.3) / rms(source, 0.3) < 0.56);
  smoke.check("Concat independently applies speed/reverse/gain; muted and missing-audio intervals retain correct silent duration", true);
  for (const [name, inputPath] of [["muted", source], ["no-audio", noAudio]]) {
    const result = await exportJob(run, { mode: "single", inputPath, outputPath: path.join(work, `${name}.mp4`),
      trim: { start: 0, end: 2 }, effects: { speed: 0.5, reverse: true, muted: name === "muted", volume: 2 } });
    assert.equal(result.hasAudio, false); assert.ok(Math.abs(result.duration - 4) < 0.15);
  }
  smoke.check("Slow reverse export handles disabled audio and videos originally without audio", true);
  for (const effects of [{ speed: 0 }, { volume: 4.1 }, { muted: "true" }, { reverse: 1 }]) {
    const result = await run(`window.electronAPI.videoRun(${JSON.stringify({ job: { mode: "single", inputPath: source,
      outputPath: path.join(work, "invalid.mp4"), effects }, manualFfmpegPath: ffmpeg })})`);
    assert.equal(result.success, false); assert.equal(result.code, "INVALID_ARGUMENT");
  }
  assert.equal(fs.existsSync(path.join(work, "invalid.mp4")), false);
  smoke.check("Invalid speed, volume and boolean values reject before any file is exported", true);
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); generateVideo();
  // 右键样式回归使用离屏真实窗口，避免抢占用户当前全屏程序的系统焦点。
  // 媒体与FFmpeg导出仍是真实文件，离屏不替换探测、滤镜或输出字节。
  // backgroundThrottling继续关闭，倒放预览的实际媒体事件不依赖前台窗口。
  // 这个设置只影响测试，不修改正式客户端的可见性或硬件加速策略。
  // SMOKE_OCCLUDE需要可见窗口，本次不把离屏运行说成已覆盖遮挡维度。
  // 截图依然来自capturePage，原UI交互断言与真实导出断言继续执行。
  // 本轮没有人工系统右键证据，公开DOM事件会在交付中单列。
  // 仅管理这份隔离窗口，不能为解锁测试关闭用户已运行的Electron应用。
  const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { offscreen: true,
    contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
    preload: path.resolve(__dirname, "../apps/electron/src/preload/index.js"), additionalArguments: ["--initial-locale=zh-CN"] } });
  smoke.attachWebContents(win.webContents); await smoke.hardenWindow(win);
  // 原单片段工具已保留到 legacy，本专项继续验证真实 FFmpeg 处理而非 UI-01 演示。
  // 只更新路由前提，原导入、处理与输出断言不变，不把功能测试换成静态截图。
  // 新工作区由独立 UI 冒烟覆盖，不向它发送旧版导入/修剪事件。
  // 每个区间的倍速、音量和倒放继续绑定旧 clip effects，而非只读属性样例。
  // UI-01 的 1.00× 与 0.0s 只是占位，不参与这里的实际效果计算。
  // 导出参数的合成仍由旧工具产生，新布局不重写 FFmpeg 参数构建器。
  // 源片段的独立效果状态必须由原断言证明，不能把三栏布局通过当作效果通过。
  // 路由变动不改变本测试的真实输入文件和输出探测条件。
  await win.loadURL("app://app/tools/video/editor/legacy");
  const execute = smoke.createRun();
  const run = async code => { try { return await execute(code); }
    catch (error) { console.error("Failed page step:", code); throw error; } };
  await verifyExports(run); await verifyUi(run, win);
  win.destroy(); await smoke.finish({ app, ok: true, cleanupDir: work });
}
main().catch(error => { console.error(error.stack); smoke.finish({ app, ok: false, error }); });
