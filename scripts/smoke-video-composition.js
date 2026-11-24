// 原网页在正式画布入口的 Electron 自动回归，不启动研究包的 HTTP 服务。
// File input 由 CDP 赋真实本地文件；它不是人工使用系统选择框或资源管理器拖入。
// 媒体、协议、preload、工程目录和写盘使用生产代码，账户与磁盘故障使用明确夹具。
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { app, BrowserWindow, dialog, nativeTheme } = require("electron");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "video-composition", timeoutMs: 240000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-composition-smoke-"));
const documentPath = path.join(root, "user.json"), run = smoke.createRun(), errors = [], external = [];
let win, failWrites = false, localCancel = true;
const disk = () => JSON.parse(fs.readFileSync(documentPath, "utf8"));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
smoke.setWorkDir(root); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("../apps/electron/src/main/modules/ffmpeg/index").registerVideoToolIpc();
require("../apps/electron/src/main/modules/canvas/canvas-project.handlers").registerCanvasProjectHandlers({ root: path.join(root, "user") });
registerHandle(C.USER_DATA_READ, () => ({ data: disk(), filePath: documentPath, isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => {
  if (failWrites) throw Error("intentional-composition-write-failure");
  return require("../apps/electron/src/main/storage/user-data").writeUserData({ ...data, userDataPath: documentPath, settings: { ...data.settings, userDataPath: documentPath } });
});
for (const [channel, value] of [[C.USER_DATA_GET_DEFAULT_PATH, documentPath], [C.PATHS_GET_DEFAULT_OUTPUT, root], [C.CHANGELOG_READ, ""], [C.MODELS_DOWNLOAD_LIST, { revision: 0, tasks: [] }], [C.MODELS_SCAN, []], [C.ACCOUNT_ME, { status: 401, body: { success: false, code: "UNAUTHENTICATED" } }]]) registerHandle(channel, () => value);
// 只替换系统框的返回值以自动覆盖取消和成功，实际目标文件仍由生产服务写盘。
// 测试不声称已人工确认 Windows 对话框、扬声器试听或长视频导出。
dialog.showSaveDialog = async () => localCancel ? { canceled: true, filePath: undefined } : { canceled: false, filePath: path.join(root, "local-output.mp4") };
const inner = expression => run(`(()=>{const document=window.document.querySelector('[data-original-composition]').contentDocument;return (${expression})})()`);
async function wait(expression) {
  for (let i = 0; i < 200; i++) { if (await run(`Boolean(${expression})`)) return; await delay(60); }
  throw Error("Composition condition timed out: " + expression);
}
async function iw(expression) {
  for (let i = 0; i < 200; i++) { if (await inner(expression)) return; await delay(60); }
  throw Error("Inner condition timed out: " + expression);
}
async function click(selector) { await inner(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function button(text) {
  await iw(`[...document.querySelectorAll('button')].some(node=>node.textContent.trim()===${JSON.stringify(text)})`);
  await inner(`[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===${JSON.stringify(text)}).click()`);
  await delay(100);
}
async function open(id = "composition") {
  await run(`document.querySelector('[data-canvas-node="${id}"] .hy-open-composer').click()`);
  await wait("document.querySelector('[data-composition-state=ready]')");
  await iw("document.querySelector('.vcd-header')");
}
// 原片段通过 mousedown 选择；不能用 HTMLElement.click 省略真实按下阶段。
// 坐标由 iframe 与片段的真实矩形相加，包含应用导航所占空间。
async function clip() {
  const position = await run("(()=>{const f=document.querySelector('[data-original-composition]'),a=f.getBoundingClientRect(),b=f.contentDocument.querySelector('.vcd-clip-video').getBoundingClientRect();return {x:Math.round(a.x+b.x+16),y:Math.round(a.y+b.y+18)}})()");
  for (const type of ["mouseMove","mouseDown","mouseUp"]) win.webContents.sendInputEvent({type,...position,button:"left",clickCount:1});
  await delay(150);
}
async function close() {
  await click('[data-tip="关闭"]');
  await wait("!document.querySelector('[data-original-composition]')");
}
async function shot(name) { await delay(180); fs.writeFileSync(path.join(root, name + ".png"), (await win.webContents.capturePage()).toPNG()); }
async function input(selector, value) {
  await inner(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(String(value))};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));node.dispatchEvent(new FocusEvent('blur',{bubbles:false}));return true})()`);
  await delay(70);
}
// 种子素材先经生产导入器拷贝到隔离工程，再交给正式连线读取。
// 空第二合成器用来证明 A/B 状态不会因复用 iframe 或控制器而串值。
async function seed() {
  const base = path.join(__dirname, "fixtures/video-composition");
  const files = [["image", "image.png"], ["video", "video.mp4"], ["audio", "audio.wav"]].map(([kind, name]) => ({ kind, name, path: path.join(base, name), size: fs.statSync(path.join(base, name)).size }));
  const imported = await require("../apps/electron/src/main/modules/canvas/project-assets").importAssets(path.join(root, "user"), { name: "Composition", files, mode: "copy" });
  const node = (id, kind, x, media) => ({ id, position: { x, y: 100 }, data: { kind, title: id, prompt: "", content: "", ratio: "16/9", ...(media ? { media } : {}) } });
  const document = { version: 1, name: "Composition", workspace: imported.workspace, nodes: [node("composition", "composition", 400), node("isolated", "composition", 800), ...imported.media.map((media, i) => node(media.kind, media.kind, 100 + i * 300, media))], edges: imported.media.map(media => ({ id: media.kind + "-edge", source: media.kind, target: "composition", sourceHandle: "out", targetHandle: "in" })) };
  fs.writeFileSync(documentPath, JSON.stringify(require("./lib/guest-session-fixture").withGuestSession({ version: 1, userDataPath: documentPath, settings: { userDataPath: documentPath, paths: {}, locale: "zh-CN", theme: "dark" }, infiniteCanvas: document, retainedSection: { keep: true } })));
}
async function save() {
  await button("保存");
  await wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return disk().infiniteCanvas.nodes.find(node => node.id === "composition").data.composition;
}
// 三种文件来自磁盘；添加、编辑、复制和播放使用原组件真实按钮与输入事件。
// 不读写 Vue 内部 refs，不把静态状态灌入片段来伪造入轨或效果编辑。
async function checkEditing() {
  // 先证明三类连线素材由原组件接收，再改原输入并检查实际用户 JSON。
  // scale 的输入单位是百分数，120 必须落成 1.2，不能保存成 120 倍。
  // 0.8 秒片段与未改的视频并存，避免把整条时间线错误裁成图片时长。
  // 播放断言同时要求解码就绪、非暂停和源时间推进；仅按钮换图标不算通过。
  await open();
  smoke.check("Original Vue compositor loads connected image/video/audio", await inner("document.querySelectorAll('.vcd-material').length===3"));
  smoke.check("Embedded page has no Electron API", await run("typeof document.querySelector('[data-original-composition]').contentWindow.electronAPI==='undefined'"));
  // 连线素材由原组件的既有初始化规则自动入轨，保留原行为，不再手动添加第二份。
  await shot("00-open");
  await iw("document.querySelectorAll('.vcd-clip-video').length===2&&document.querySelectorAll('.vcd-clip-audio').length===1");
  await clip();
  await input('[aria-label="片段名称"]', "edited image");
  await input('.vci input[type=number]', .8);
  await inner("(()=>{const n=document.querySelectorAll('.vci input[type=number]')[1];n.value=120;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));n.dispatchEvent(new FocusEvent('blur'));return true})()");
  const saved = await save();
  smoke.check("Real JSON persists original clip edits and tokenized assets", saved.state.videoClips.some(clip => clip.name === "edited image" && clip.scale === 1.2 && clip.endTime === .8) && saved.assets.length === 3 && saved.state.videoClips.every(clip => clip.src.startsWith("composition-asset:")));
  await shot("01-original-compositor-dark");
  await button("复制");
  smoke.check("Original duplicate creates independent clip", await inner("document.querySelectorAll('.vcd-clip-video').length===3"));
  await inner("(()=>{document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyZ',key:'z',ctrlKey:true,bubbles:true}));return true})()");
  smoke.check("Original undo restores clip count", await inner("document.querySelectorAll('.vcd-clip-video').length===2"));
  await click('[data-tip="播放 (空格)"]');
  await iw("document.querySelector('[data-tip=\"暂停 (空格)\"]')");
  await iw("[...document.querySelectorAll('video')].some(v=>!v.paused&&v.readyState>=2&&v.currentTime>0)");
  smoke.check("Actual original preview plays decoded video", await inner("[...document.querySelectorAll('video')].some(v=>!v.paused&&v.readyState>=2&&v.currentTime>0)"));
  await click('[data-tip="暂停 (空格)"]');
}
// 失败注入必须保留磁盘原字节和 iframe 草稿，再恢复生产写盘验证重试。
// 原 save-state 不 await 的漏洞在关闭路径上测，不能只核对保存按钮文案。
async function checkFailureAndRestore() {
  // 写盘拒绝开关在生产写入前抛错，故障期间绝不能更新已确认的磁盘工程。
  // 关闭会触发原组件保存，再触发宿主等待；只测保存按钮无法覆盖这个次序。
  // 重试后检查刚才改过的名称，排除“恢复成旧磁盘副本也能打开”的误判。
  // 刷新才会重新从磁盘装配页面，不能仅凭当前 iframe 草稿证明重开恢复。
  await save();
  const before = JSON.stringify(disk().infiniteCanvas);
  failWrites = true;
  await clip();
  await input('[aria-label="片段名称"]', "retained failed draft");
  await button("保存");
  await iw("document.body.textContent.includes('操作未完成')");
  smoke.check("Save failure leaves confirmed disk unchanged", JSON.stringify(disk().infiniteCanvas) === before);
  await click('[data-tip="关闭"]');
  await iw("document.querySelector('.vcd-header')");
  smoke.check("Failed close reopens unsaved composition", await inner("document.querySelectorAll('.vcd-clip-video').length===2"));
  failWrites = false;
  await button("重试");
  await wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  smoke.check("Retry writes retained draft to actual JSON", disk().infiniteCanvas.nodes.find(node => node.id === "composition").data.composition.state.videoClips.some(clip => clip.name === "retained failed draft"));
  await close(); await win.reload();
  await wait("document.querySelector('[data-infinite-canvas]')&&!document.querySelector('[data-auth-loading]')");
  await open();
  smoke.check("Reload restores original timeline and managed media", await inner("document.querySelectorAll('.vcd-clip-video').length===2&&document.querySelectorAll('.vcd-material').length===3"));
}
// CDP 只给原 file input 设置真实文件，不用 File/Blob 返回值冒充系统选择。
// 原选择器随后触发生产媒体写盘，资产必须确实落在当前工程的 Picture 中。
async function checkLocalImport() {
  // 调用的是原组件素材选择入口，未将新素材直接塞入 Vue 内部状态。
  // CDP 提供 File 后仍须经过 MessagePort、preload 和生产受管写盘服务。
  // 检查路径归属与文件存在能发现“素材卡出现，但仅有临时 blob 地址”的问题。
  await button("从素材库添加");
  await iw("document.querySelector('input[aria-label=选择本地素材]')");
  const result = await win.webContents.debugger.sendCommand("Runtime.evaluate", { expression: "document.querySelector('[data-original-composition]').contentDocument.querySelector('input[aria-label=选择本地素材]')" });
  await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { objectId: result.result.objectId, files: [path.join(__dirname, "fixtures/video-composition/image.png")] });
  await iw("document.querySelectorAll('.vcd-material').length===4");
  await clip(); await input('[aria-label="片段名称"]', "imported saved");
  const saved = await save();
  smoke.check("Iframe file import creates managed real image", saved.assets.length===4 && saved.assets.every(asset => fs.existsSync(asset.media.path)) && saved.assets.at(-1).media.path.includes(path.sep+"Picture"+path.sep));
}
async function exportVideo(local) {
  await button("导出");
  if (local) await button("本地");
  await button("480P");
  await button("开始导出");
}
// 本地取消和成功都真实编码；只有系统框返回值是夹具。
// 画布导出另外验证生成新视频节点与生产 localfile 解码，不只看成功 toast。
async function checkExports() {
  // 三次导出分开检查：取消、本地成功、画布成功不能共享一条假成功回执。
  // 系统框返回值仅确定输出位置；编码正文、文件写入与解码都不使用返回值夹具。
  // 取消不创建结果节点，本地成功也不应把成片偷偷加进画布。
  // 画布出口必须同时写文件、建视频节点和建合成来源边，缺一个都不是闭环。
  // 最后用生产 localfile 协议重新解码成片，不以文件名或大于零字节代替有效视频。
  // 时长容差只吸收编码帧边界误差，没有放宽为任意非零时长。
  // 原始比例保留源分辨率；明确选择 16:9 才按 480P 输出尺寸验证。
  // 不把 320×180 小源强行解释成编码器忽略分辨率，也不缩小既定断言。
  await button("比例 原始");
  await button("16:9");
  await exportVideo(true);
  await iw("document.body.textContent.includes('已取消另存为')");
  smoke.check("Cancelled local export creates no output file or result node", !fs.existsSync(path.join(root, "local-output.mp4")) && disk().infiniteCanvas.nodes.length===5);
  localCancel = false;
  await exportVideo(true);
  await iw("document.body.textContent.includes('成片已保存到所选位置')");
  smoke.check("Local export really writes MP4", fs.statSync(path.join(root, "local-output.mp4")).size>1000);
  await button("导出"); await button("画布"); await button("480P"); await button("开始导出");
  await wait("!document.querySelector('[data-original-composition]')");
  const document = disk().infiniteCanvas, result = document.nodes.find(node => node.data.title === "视频合成结果");
  smoke.check("Canvas export creates real video and validated composition edge", !!result && fs.statSync(result.data.media.path).size>1000 && document.edges.some(edge=>edge.source==='composition'&&edge.target===result.id));
  const decoded = await run(`new Promise(resolve=>{const video=document.createElement('video');video.muted=true;video.onloadeddata=()=>{resolve({width:video.videoWidth,height:video.videoHeight,duration:video.duration});video.pause();video.removeAttribute('src');video.load()};video.onerror=()=>resolve(null);setTimeout(()=>resolve(null),10000);video.src='localfile://local/?path='+encodeURIComponent(${JSON.stringify(result.data.media.path)})})`);
  smoke.check("Exported MP4 decodes at real 480P with timeline duration", !!decoded && decoded.height===480 && Math.abs(decoded.duration-2)<.2, JSON.stringify(decoded));
  await shot("03-canvas-result");
  console.log("COMPOSITION_EXPORT", result.data.media.path);
}
async function checkIsolationAndTheme() {
  // 第二个合成节点没有输入边，必须为空；前一个节点的保存与导入不能流入它。
  // 空工程导出应由原校验拒绝，不能为了方便接入让宿主生成一段黑视频。
  // 浅色检查验证宿主主题信号和实际边界，原组件固定深色不在此伪称已重绘。
  // 关闭外观菜单并等待主题动画结束后截图，避免把遮挡的中间帧作为证据。
  await close(); await open("isolated");
  smoke.check("Second compositor has independent empty state", await inner("!document.querySelector('.vcd-clip')&&!document.querySelector('.vcd-material')"));
  await button("导出"); await button("开始导出");
  await iw("document.body.textContent.includes('请先添加视频或图片片段')");
  smoke.check("Empty export uses original validation", true);
  await close(); await open();
  win.setContentSize(960,720); await delay(200);
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=light]')");
  await run("document.querySelector('[data-theme-option=light]').click()");
  await iw("!document.defaultView.matchMedia('(prefers-color-scheme: dark)').matches");
  await inner("(()=>{document.defaultView.dispatchEvent(new Event('resize'));return true})()");
  await iw("!document.documentElement.classList.contains('dark')");
  await run("if(document.querySelector('[data-theme-option=dark]'))document.querySelector('[data-theme-trigger]').click()");
  await wait("!document.documentElement.classList.contains('theme-ripple')");
  smoke.check("Light host keeps original compositor within the actual iframe", await inner("document.querySelector('.vcd-header').getBoundingClientRect().right<=document.defaultView.innerWidth"));
  await shot("02-original-compositor-light-narrow");
  await run("if(!document.querySelector('[data-theme-option=dark]'))document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=dark]')");
  await run("document.querySelector('[data-theme-option=dark]').click()");
  await run("if(document.querySelector('[data-theme-option=dark]'))document.querySelector('[data-theme-trigger]').click()");
  await wait("!document.documentElement.classList.contains('theme-ripple')");
  win.setContentSize(1600,1000); await delay(160);
}
async function main() {
  // 隔离临时 userData 与工程目录，不使用或覆盖用户真实作品和账户状态。
  // 静态指纹检查在页面加载前执行，拒绝拿旧导出验证新源码。
  // 本脚本离屏运行，自动输入与截图可复现，但不代表人工窗口操作已验收。
  // finally 只销毁本脚本创建的窗口，不扫描或结束用户的其他 Electron 进程。
  await app.whenReady(); smoke.assertBuildFresh({ app }); await seed();
  const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
  win = new BrowserWindow({ ...chrome.windowChromeOptions(),show:false,width:1600,height:1000,webPreferences:{additionalArguments:chrome.windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/src/preload/index.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false} });
  smoke.attachWebContents(win.webContents); win.webContents.debugger.attach("1.3");
  win.webContents.on("console-message", event=>{if(event.level==='error')errors.push(event.message)});
  win.webContents.session.webRequest.onBeforeRequest((details, callback)=>{if(/^https?:/.test(details.url))external.push(details.url);callback({cancel:false})});
  try {
    await win.loadURL("app://app/canvas");
    await win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    await wait("document.querySelector('[data-infinite-canvas]')&&!document.querySelector('[data-auth-loading]')");
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='知道了')");
    await run("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='知道了').click();document.querySelector('[data-main-document-title] button')?.click()");
    await checkEditing(); await checkFailureAndRestore(); await checkLocalImport(); await checkIsolationAndTheme(); await checkExports();
    smoke.check("Unrelated user section remains intact", disk().retainedSection.keep===true);
    smoke.check("No external media upload requests", external.length===0);
    smoke.check("No renderer hydration or Vue errors", !errors.some(value=>/hydration|Minified React|Unhandled|Vue warn/.test(value)), JSON.stringify(errors));
  } finally { console.log("RENDERER_ERRORS",errors); await shot("04-final").catch(()=>{}); win.destroy(); }
  console.log("COMPOSITION_EVIDENCE", root);
  smoke.finish({app,ok:smoke.allPassed()});
}
main().catch(error=>{console.error(error.stack);smoke.finish({app,ok:false})});
