/**
 * LIVE-01 真媒体回归：使用磁盘上的实际编码视频、生产协议、preload 和 ffprobe。
 * 测试视频由 FFmpeg 生成可辨认测试图，不把假元数据当作导入成功。
 * 系统选择框与资源管理器拖入使用 Windows UI Automation，另行记录自动载荷的边界。
 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");
const { app, BrowserWindow, nativeTheme } = require("electron");
// 离屏软件绘制与生产窗口的硬件加速无关，只规避测试截图的GPU表面失效。
// 只在显式夹具模式切换，不覆盖用户正式应用的硬件加速设置。
// 真实文件探测仍由随包FFmpeg完成，截图后端不改变视频元数据。
if (process.env.LIVE_FIXTURE_CHOOSER === "1") app.disableHardwareAcceleration();
const { createSmokeHarness } = require("./lib/smoke-harness");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { resolveTools } = require("../apps/electron/src/main/modules/ffmpeg/locate");
const smoke = createSmokeHarness({ name: "video-live-01", timeoutMs: 240000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-video-live01-"));
const media = path.join(root, "media");
fs.mkdirSync(media);
app.setPath("userData", path.join(root, "browser"));
smoke.setWorkDir(root); smoke.installConsoleTee(); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("./lib/guest-session-fixture").installGuestDocumentFixture();
for (const [channel, result] of [[C.USER_DATA_GET_DEFAULT_PATH, ""], [C.PATHS_GET_DEFAULT_OUTPUT, root], [C.CHANGELOG_READ, ""], [C.MODELS_DOWNLOAD_LIST, { revision: 0, tasks: [] }]]) registerHandle(channel, () => result);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
require("../apps/electron/src/main/modules/ffmpeg").registerVideoToolIpc();
let win;
const run = smoke.createRun();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(query, milliseconds = 15000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await run(`Boolean(${query})`)) return; await delay(100); }
  throw new Error(`Condition not reached: ${query}`);
}
function makeVideo(name, size, rate, audio, codec = "libx264") {
  const target = path.join(media, name);
  const args = ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=330");
  args.push("-t", "6", "-c:v", codec, "-pix_fmt", "yuv420p", ...(audio ? ["-c:a", "aac", "-shortest"] : ["-an"]), target);
  const result = spawnSync(resolveTools().ffmpegPath, args, { windowsHide: true, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr);
  return target;
}
function nativeAction(action, files = [], target = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "lib/video-live-native.ps1"), "-Action", action, "-ProcessIdValue", String(process.pid), "-FilesJson", JSON.stringify(files), "-TargetX", String(target.x || 0), "-TargetY", String(target.y || 0)], { windowsHide: true });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; if (String(chunk).includes("OLE_TARGET")) screenshot("live-01-drag-feedback").catch(error => console.error(error)); }); child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(output) : reject(new Error(`Native ${action}: ${output}`)));
  });
}
async function pick(files, cancel = false) {
  // 无桌面窗口时只替换系统选择框的返回值，不替换生产导入、探测或视频字节。
  // 显式开关避免把离屏回归误报为原生选择框UI自动化通过。
  // 未设置开关仍走原Windows自动化，原先实机验证入口保留。
  // 本轮桌面不可用，不能为了跑测试抢占用户鼠标或置顶窗口。
  // cancel使用真正的canceled结果，由既有导入流程决定如何恢复busy。
  // 返回路径仍经过preload、IPC和ffprobe，不直接给素材列表塞数据。
  // 此分支与原生分支共用后面的busy等待和同一组行为断言。
  // 选择框的可访问性、系统多选和资源管理器手势仍须单独实测。
  if (process.env.LIVE_FIXTURE_CHOOSER === "1") {
    require("electron").dialog.showOpenDialog = async () => ({ canceled: cancel, filePaths: cancel ? [] : files });
    await run("document.querySelector('[data-editor-region=R01] button[aria-label=导入素材]').click()");
    await wait("!document.querySelector('[data-editor-region=R02]').hasAttribute('aria-busy')", 45000);
    return;
  }
  const action = nativeAction(cancel ? "cancel" : "pick", files);
  await run("[...document.querySelectorAll('[data-editor-region=R01] button')].find(b=>b.getAttribute('aria-label')==='导入素材').click()");
  console.log(await action);
  await wait("!document.querySelector('[data-editor-region=R02]').hasAttribute('aria-busy')", 45000);
}
async function screenshot(name) { fs.writeFileSync(path.join(root, `${name}.png`), (await win.webContents.capturePage()).toPNG()); }

async function verifySourceLifecycle() {
  await run("window.__switchedVideo=document.querySelector('[data-live-video]');document.querySelector('[data-editor-region=R03] button[aria-label=播放]').click()");
  await wait("!document.querySelector('[data-live-video]').paused");
  await run("document.querySelectorAll('[data-editor-asset]')[1].click()");
  await wait("document.querySelector('[data-live-video]').videoWidth===360&&document.querySelector('[data-live-video]').readyState>=2");
  smoke.check("Source switch releases old playing media", await run("window.__switchedVideo.paused&&!window.__switchedVideo.hasAttribute('src')"));
  smoke.check("Portrait switch uses actual 24fps source and defaults muted", await run("document.querySelector('[data-live-video]').muted&&document.querySelector('[data-editor-region=R03]').textContent.includes('24fps')"));
  await screenshot("live-01-portrait-dark");
  await run("window.__previousVideo=document.querySelector('[data-live-video]');document.querySelector('[data-editor-region=R03] button[aria-label=播放]').click()");
  await wait("document.querySelector('[data-live-video]').currentTime>.3");
  await run("document.querySelector('[data-editor-region=R03] button[aria-label=返回节目预览]').click()");
  smoke.check("Return removes and releases old source without changing selection", await run("!document.querySelector('[data-live-video]')&&window.__previousVideo.paused&&!window.__previousVideo.hasAttribute('src')&&document.querySelectorAll('[data-editor-asset][aria-current=true]').length===1"));
  const sameName = path.join(root, "same-name");
  fs.mkdirSync(sameName);
  const copied = path.join(sameName, "landscape-audio.mp4");
  fs.copyFileSync(path.join(media, "landscape-audio.mp4"), copied);
  await pick([copied]);
  smoke.check("Same name in a different folder has independent identity", await run("[...document.querySelectorAll('[data-editor-asset]')].filter(b=>b.title==='landscape-audio.mp4').length===2"));
}
async function verifyMetadataOnly() {
  const unsupported = makeVideo("unsupported-ffv1.mkv", "320x240", 25, false, "ffv1");
  await pick([unsupported]);
  await run("[...document.querySelectorAll('[data-editor-asset]')].find(b=>b.title==='unsupported-ffv1.mkv').click()");
  await wait("document.querySelector('[data-editor-region=R03]').textContent.includes('视频预览解码失败')");
  smoke.check("Real FFV1 probe succeeds while browser decode failure retains metadata", await run("[...document.querySelectorAll('[data-editor-asset]')].find(b=>b.title==='unsupported-ffv1.mkv').textContent.includes('320×240 · 25fps')&&!document.querySelector('[data-editor-asset][aria-current=true]').disabled"));
  await screenshot("live-01-decode-error-dark");
  await run("document.querySelector('[data-editor-region=R03] button[aria-label=重试预览]').click()");
  await wait("document.querySelector('[data-editor-region=R03]').textContent.includes('视频预览解码失败')");
  smoke.check("Decoder retry preserves imported metadata and never creates clips", await run("document.querySelectorAll('[data-editor-clip]').length===0"));
  win.setSize(960,720);
  // 调整窗口后等一轮真实绘制再截图；不能在旧Viz表面已销毁时立刻capture。
  // 仅给截图腾出提交时间，媒体ready/播放进度仍使用条件等待。
  // 延时不是截图正确的断言，最终仍打开PNG核对布局。
  await delay(150);
  await screenshot("live-01-narrow-dark");
  smoke.check("Narrow window retains project import access", await run("[...document.querySelectorAll('[data-editor-region=R01] button')].some(b=>b.getAttribute('aria-label')==='导入素材'&&!b.disabled)"));
  win.setSize(1480,960);
}
async function verifyFilteredImport() {
  const candidate = path.join(media, "filtered-import.mp4");
  fs.copyFileSync(path.join(media, "landscape-audio.mp4"), candidate);
  await run(`(()=>{const input=document.querySelector('[data-editor-region=R02] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'no-match-asset');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pick([candidate]);
  smoke.check("Filtered import reports hidden assets without silently clearing query", await run("document.querySelectorAll('[data-editor-asset]').length===0&&document.querySelector('[data-editor-region=R02]').textContent.includes('被当前筛选隐藏')&&document.querySelector('[data-editor-region=R02] input').value==='no-match-asset'"));
  await run("[...document.querySelectorAll('[data-editor-region=R02] button')].find(b=>b.getAttribute('aria-label')==='清除搜索和筛选').click()");
  smoke.check("Clear filter reveals newly imported real asset", await run("[...document.querySelectorAll('[data-editor-asset]')].some(b=>b.title==='filtered-import.mp4')"));
}
async function verifyCancellation() {
  const candidate = makeVideo("cancel-during-import.mp4", "480x270", 25, false);
  await run(`window.__cancelObserver=new MutationObserver(()=>{
    const row=document.querySelector('[data-editor-asset][aria-busy=true]');
    const cancel=[...document.querySelectorAll('[data-editor-region=R01] button')].find(b=>b.getAttribute('aria-label')==='取消导入');
    if(row&&cancel){window.__cancelObserver.disconnect();cancel.click();}
  });window.__cancelObserver.observe(document.querySelector('[data-live-video-session]'),{subtree:true,childList:true,attributes:true});`);
  await pick([candidate]);
  await delay(500);
  smoke.check("Cancel in-flight marks row cancelled and discards late probe result", await run("[...document.querySelectorAll('[data-editor-asset]')].find(b=>b.title==='cancel-during-import.mp4').disabled&&document.querySelector('[data-editor-region=R02]').textContent.includes('已取消导入')"));
  await screenshot("live-01-cancelled-dark");
  await win.loadURL("app://app/tools/video/editor/samples/project");
  await wait("document.querySelector('[data-video-editor-ui=UI-04]')");
  await win.loadURL("app://app/tools/video/editor");
  await wait("document.querySelector('[data-live-video-session]')");
  smoke.check("Return to formal page starts an isolated empty session", await run("document.querySelectorAll('[data-editor-asset]').length===0&&!document.querySelector('[data-live-video]')"));
}

function createLiveWindow() {
  // 夹具模式使用隐藏窗口，不更改真实客户端的窗口可见性。
  // offscreen保证capturePage仍能取得实际渲染画面。
  // 两种模式均保留backgroundThrottling:false，媒体条件等待不是rAF死等。
  // 这不是遮挡维度验证，不声称隐藏窗口覆盖真实桌面上的前后台行为。
  // 默认不加这个模式，避免悄悄降低原实机脚本的验收范围。
  // 当前测试不会调用Explorer自动化，避免在后台启动资源管理器抢窗口。
  // 设置只影响本测试创建的BrowserWindow，不会保存到用户偏好。
  // 所有媒体播放仍使用Chromium实际解码和事件，不使用假的播放器时钟。
  const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
  const fixture = process.env.LIVE_FIXTURE_CHOOSER === "1";
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), width: 1480, height: 960, show: !fixture, webPreferences: { offscreen: fixture, additionalArguments: chrome.windowChromeArguments(), preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  chrome.registerWindowChrome(win);
  smoke.attachWebContents(win.webContents);
}

async function openFormalSession() {
    await win.loadURL("app://app/tools/video/editor"); await wait("document.querySelector('[data-live-video-session]')");
    await delay(700); await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    smoke.check("Formal session starts empty without demo assets or clips", await run("document.querySelectorAll('[data-editor-asset]').length===0&&document.querySelectorAll('[data-editor-clip]').length===0&&document.querySelector('[data-editor-region=R10]').textContent.includes('00:00:00:00')"));
}

async function verifyInitialImport(horizontal, vertical) {
    await pick([horizontal, vertical]);
    smoke.check(process.env.LIVE_FIXTURE_CHOOSER === "1" ? "Chooser-result fixture imports two actual videos and covers" : "Native multi-select imports two actual videos and covers", await run("document.querySelectorAll('[data-editor-asset]').length===2&&document.querySelectorAll('[data-editor-asset] img').length===2"));
    smoke.check("Metadata reflects distinct dimensions, fps and audio", await run("document.querySelector('[data-editor-region=R02]').textContent.includes('640×360 · 30fps · 含音轨')&&document.querySelector('[data-editor-region=R02]').textContent.includes('360×640 · 24fps · 无音轨')"));
    await run("document.querySelector('[data-editor-asset]').click()"); await wait("document.querySelector('[data-live-video]').readyState>=2");
    await run("document.querySelector('[data-editor-region=R03] button[aria-label=播放]').click()"); await wait("document.querySelector('[data-live-video]').currentTime>.5");
    smoke.check("Actual media events advance source time, never create timeline clips", await run("document.querySelector('[data-editor-region=R03] b').textContent!=='00:00:00:00'&&document.querySelectorAll('[data-editor-clip]').length===0"));
    await run("document.querySelector('[data-editor-region=R03] button[aria-label=暂停]').click()");
    smoke.check("Pause is reflected by the native media state", await run("document.querySelector('[data-live-video]').paused"));
    await wait("document.querySelector('[data-editor-region=R03] button[aria-label=播放]')");
    await screenshot("live-01-import-light");
}

async function verifyRejectedAndTheme(horizontal) {
    await pick([], true); await pick([horizontal]);
    smoke.check("Cancel and duplicate preserve existing media", await run("document.querySelectorAll('[data-editor-asset]').length===2&&document.querySelector('[data-editor-region=R02]').textContent.includes('重复 1')"));
    const textFile = path.join(media, "not-video.txt");
    fs.writeFileSync(textFile, "Non video import candidate");
    await pick([textFile, horizontal]);
    smoke.check("Mixed invalid and duplicate selection explains rejection without losing media", await run("document.querySelectorAll('[data-editor-asset]').length===2&&document.querySelector('[data-editor-region=R02]').textContent.includes('拒绝 1')&&document.querySelector('[data-editor-region=R02]').textContent.includes('not-video.txt')"));
    await pick([path.join(media, "broken.mp4")]);
    smoke.check("Probe failure preserves successful media and reports a separate failed row", await run("document.querySelectorAll('[data-editor-asset]').length===3&&document.querySelectorAll('[data-editor-asset]:disabled').length===1"));
    await run("document.querySelector('[data-theme-trigger]').click()"); await wait("document.querySelector('[data-theme-option=dark]')");
    await run("document.querySelector('[data-theme-option=dark]').click()"); await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
    await run("document.querySelector('[data-theme-trigger]').click()"); await screenshot("live-01-import-dark");
}

async function verifyExplorerDrop() {
    const dropVideo = makeVideo("explorer-drop.mp4", "480x270", 25, false);
    win.setPosition(460, 10); win.setAlwaysOnTop(true);
    const bounds = win.getContentBounds();
    const point = await run("(()=>{const r=document.querySelector('[data-editor-region=R09]').getBoundingClientRect();return {x:r.x+100,y:r.y+30}})()");
    console.log(await nativeAction("drop", [dropVideo], { x: bounds.x + point.x, y: bounds.y + point.y }));
    try { await wait("document.querySelector('[data-editor-region=R02]').textContent.includes('explorer-drop.mp4')", 20000); } catch(error) { console.error("Explorer evidence",root); throw error; }
    await wait("!document.querySelector('[data-editor-region=R02]').hasAttribute('aria-busy')", 20000);
    smoke.check("Actual Explorer file drop imports into library without creating clips", await run("document.querySelectorAll('[data-editor-asset]').length===1&&document.querySelectorAll('[data-editor-clip]').length===0"));
    win.setAlwaysOnTop(false); await screenshot("live-01-explorer-drop");
}

async function main() {
  await app.whenReady();
  smoke.assertBuildFresh({ app });
  nativeTheme.themeSource = "light";
  const horizontal = makeVideo("landscape-audio.mp4", "640x360", 30, true);
  const vertical = makeVideo("portrait-silent.mp4", "360x640", 24, false);
  fs.writeFileSync(path.join(media, "broken.mp4"), "This is not a video");
  createLiveWindow();
  try {
    await openFormalSession();
    await verifyInitialImport(horizontal, vertical);
    await verifyRejectedAndTheme(horizontal);
    await verifySourceLifecycle();
    await verifyMetadataOnly();
    await verifyFilteredImport();
    await verifyCancellation();
    if (process.env.LIVE_SKIP_EXPLORER === "1") console.log("SKIP actual Explorer drag: desktop occupied; no synthetic fallback");
    else await verifyExplorerDrop();
    console.log("LIVE_MEDIA_ROOT", root);
  } finally { win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}

main().catch(error => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); smoke.finish({ app, ok: false, error }); });
