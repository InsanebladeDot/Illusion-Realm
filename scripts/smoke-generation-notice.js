/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
/** Exercise stage generation text and terminal notices with deferred fixture generation; verify queue behavior and caption clearance. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments, registerWindowChrome } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "generation-notice", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-notice-smoke-"));
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 当前标题栏会查询原生窗口状态，使用正式注册入口补齐测试环境。
// 只作用于这个隔离进程，不操纵用户正在使用的客户端窗口。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
const settings = { paths: {}, theme: "light", outputPath: root };
let userData = { version: 1, settings };
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession(userData), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
// 设置页也会读取中转站目录，使用生产离线快照，避免测试环境缺 handler。
// fallback 只构造公开目录，不调用联网刷新，不读取用户配置的密钥。
// 该目录不参与本次生成模型使用统计，也不是用户本地安装模型清单。
registerHandle(C.AGENT_CATALOG, (_event, provider) => require("../apps/electron/src/main/modules/agent/provider-catalog").fallback(provider));
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
const changedOutput = path.join(root, "changed-output");
registerHandle(C.DIALOG_SELECT_FOLDER, () => changedOutput);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => []);
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.FILES_READ_IMAGE_DATA_URL, () => null);
const saved = [];
registerHandle(C.FILES_SAVE_GENERATED_IMAGES, (_event, outputPath, files) => {
  return files.map((file) => {
    const target = path.join(outputPath, file.filename);
    fs.mkdirSync(outputPath, { recursive: true });
    fs.writeFileSync(target, Buffer.from(file.dataBase64, "base64"));
    saved.push({ path: target, outputPath, data: Buffer.from(file.dataBase64, "base64") });
    return target;
  });
});
registerHandle(C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: [] }));
let complete;
let win;
const prompts = [];
const cancelledRequests = [];
let currentRequestId;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 共用运行器把页面求值也纳入单步看门狗，失败日志保留具体表达式。
// 主进程 wait 仍负责轮询节拍，不依赖被遮挡窗口中的 requestAnimationFrame。
const run = smoke.createRun();
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(100); }
  throw new Error("Notice test timed out: " + source);
}
// 通知位置随真实标题栏高度变化，旧的固定 70px 不能作为布局契约。
// 测试仍要求完整的 16px 间距，不能改成“只要在窗口内就通过”。
// 同时检查左右边界，避免换标题栏后通知被窗口控制按钮裁切。
// 等待由主进程有界轮询，通知根本不出现时仍明确失败。
/**
 * 当前外壳验证的环境说明：
 * 应用标题栏高度是布局变量，历史的 54px 并非固定业务契约。
 * 通知顶边应始终等于真实标题栏底边加十六像素。
 * 进入原生无标题栏模式时，标题栏高度可以为零。
 * 同一断言仍需要保留十六像素窗口内间距。
 * 恢复自定义标题栏后，已挂载通知要重新跟随这个变量。
 * 因此不能只检查通知出现，也不能把旧的 70px 写死在期望里。
 * 当前测试比较实际矩形，能发现 CSS 变量与 DOM 外壳不同步。
 * 窗口控制查询必须注册正式处理器，否则 renderer 启动会产生缺 handler 噪声。
 * 缺 handler 属于测试环境准备，不应冒充统计实现失败。
 * 补齐处理器之后仍保留 contextIsolation 和原 preload。
 * 测试不暴露任意 Node 能力给渲染层，也不增加产品通道。
 * 设置入口已移到账号菜单，导航测试需要遵循当前真实交互路径。
 * 点击菜单后等待实际链接，再触发客户端路由。
 * 不能用 window.location 强制刷新来替代那一项页面卸载期间继续生成的验证。
 * 本次只有私密统计恢复组刻意 loadURL，以覆盖重新装配后的持久化读取。
 * 两种导航的目的不同，不能为了复用一个工具把它们混为同一次验证。
 */
async function assertPosition(name) {
  const condition = "(()=>{const el=document.querySelector('[data-generation-notice]'),caption=document.querySelector('[data-window-titlebar]');if(!el)return false;const r=el.getBoundingClientRect(),bottom=caption?.getBoundingClientRect().bottom??0;return Math.abs(r.top-bottom-16)<1&&r.right<=innerWidth&&r.left>=0})()";
  await wait(condition);
  smoke.check(name, await run(condition));
}
async function begin() {
  complete = undefined;
  await run("(()=>{const input=document.querySelector('#prompt-editor');input.textContent='test portrait';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-generate-button]').click()})()");
  await wait("document.querySelector('[data-stage-generating]')");
  for (let i = 0; i < 100 && !complete; i++) await delay(100);
  if (!complete) throw new Error("Fixture generation handler was not reached");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const png = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toDataURL();
  registerHandle(C.COMFY_GENERATE, (_event, prompt, _server, requestId) => new Promise((resolve, reject) => {
    prompts.push(prompt); currentRequestId = requestId; const id = `notice-${prompts.length}`;
    complete = (fail) => fail ? reject(Object.assign(new Error("fixture"), { code: typeof fail === "string" ? fail : undefined }))
      : resolve({ promptId: id, images: [{ nodeId: "9", filename: "fixture.png", subfolder: "", folderType: "output", dataUrl: png }], videos: [] });
  }));
  registerHandle(C.COMFY_CANCEL, (_event, requestId) => {
    if (requestId !== currentRequestId) return false;
    cancelledRequests.push(requestId); complete("COMFY_CANCELLED"); return true;
  });
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 960, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  registerWindowChrome(win); win.webContents.debugger.attach("1.3");
  // 注册到共用宿主后，页面脚本异常会出现在本次日志而不是只有通用错误句。
  // 宿主只持有这个新建测试窗口，不寻找或关闭用户已有窗口。
  smoke.attachWebContents(win.webContents);
  try {
    await win.loadURL("app://app/create"); await wait("document.querySelector('[data-generate-button]')");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    await delay(500); await begin();
    const states = new Set();
    for (let i = 0; i < 22; i++) { states.add(await run("document.querySelector('[data-stage-generating] [aria-hidden=true]').textContent")); await delay(100); }
    smoke.check("Stage status cycles through zero to three dots", ["", ".", "..", "..."].every(dots => states.has("正在生成" + dots)) && states.size === 4);
    smoke.check("Generating floating notice is removed", await run("!document.querySelector('[data-generation-notice=generating]')"));
    smoke.check("Generate button remains available while a task runs", await run("!document.querySelector('[data-generate-button]').disabled"));
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    smoke.check("Narrow viewport has no generating floating notice", await run("!document.querySelector('[data-generation-notice=generating]')"));
    await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    complete(false);
    await wait("document.querySelector('[data-generation-notice=success]')"); await assertPosition("Completion notice shares the corrected offset", 70);
    smoke.check("Stage status disappears on completion", await run("!document.querySelector('[data-stage-generating]')"));
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false); await assertPosition("Fullscreen/native chrome preserves the original 16px inset", 16);
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true); await assertPosition("Restored caption moves a mounted notice back down", 70);
    await begin(); complete(true); await wait("document.querySelector('[data-generation-notice=error]')");
    await assertPosition("Failure notice shares the corrected offset", 70);
    smoke.check("Stage status disappears on failure", await run("!document.querySelector('[data-stage-generating]')"));
    await checkQueue();
    await checkBatch();
    await checkTaskTheme();
    await checkCancellation();
    await checkDisconnectedQueue();
    // 复用本专项已经生成的真实队列状态，不另塞一组漂亮的统计数字。
    // ComfyUI 与文件输出仍是隔离夹具，截图只证明真实渲染与数据接线。
    await checkPrivateStatistics();
  } finally { win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
async function submit(text) {
  await run(`(()=>{const input=document.querySelector('#prompt-editor');input.textContent=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-generate-button]').click()})()`);
}
async function checkQueue() {
  await begin();
  const first = complete;
  const before = prompts.length;
  await submit("second independent task");
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-generation-task-status=queued]')");
  smoke.check("Second click queues an independent task without interrupting the first", prompts.length === before);
  smoke.check("Caption badge counts running and queued tasks", await run("document.querySelector('[data-window-generation-count]').textContent==='2'"));
  smoke.check("Task panel stays below caption", await run("document.querySelector('[data-window-generation-center]').getBoundingClientRect().top>=document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom"));
  await checkTaskPresentation();
  await run("document.querySelector('#prompt-editor').textContent='changed after submission'");
  first(true);
  await wait("document.querySelector('[data-generation-task-status=generating]')");
  for (let i = 0; i < 100 && prompts.length === before; i++) await delay(50);
  smoke.check("Queue continues after a task fails", prompts.length === before + 1);
  smoke.check("Queued prompt remains the submitted snapshot", JSON.stringify(prompts[prompts.length - 1]).includes("second independent task") && !JSON.stringify(prompts[prompts.length - 1]).includes("changed after submission"));
  // 设置入口已随账户菜单移动，先打开真实菜单，不能假定 nav 常驻设置链接。
  // 保留客户端路由切换，才能验证页面卸载期间任务仍然执行。
  await run("document.querySelector('[data-account-menu-trigger]').click()");
  await wait("document.querySelector('a[href=\"/settings\"]')");
  await run("document.querySelector('a[href=\"/settings\"]').click()");
  await wait("location.pathname.includes('settings')");
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-window-generation-center]')");
  smoke.check("Tasks remain visible after leaving the creation page", await run("document.querySelectorAll('[data-generation-task]').length===4"));
  complete(false);
  await wait("document.querySelectorAll('[data-generation-task-status=completed]').length===2");
  smoke.check("Task completes and saves after its creation page unmounts", saved.length === 2);
  smoke.check("Each task uses its own metadata and output target", saved.every(file => file.outputPath === root && file.data.includes(Buffer.from('illusionRealmMeta')) && file.data.includes(Buffer.from('prompt'))));
  smoke.check("Completed task provides an image action", await run("Array.from(document.querySelectorAll('[data-generation-task] button')).some(button=>button.textContent==='查看图片')"));
  smoke.check("Active badge clears when the queue finishes", await run("!document.querySelector('[data-window-generation-count]')"));
  await run("document.querySelector('[data-window-download]').click()");
  await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Download center still works and only one task panel is open", await run("!document.querySelector('[data-window-generation-center]')"));
}
async function openTasks() {
  if (!await run("Boolean(document.querySelector('[data-window-generation-center]'))")) {
    await run("document.querySelector('[data-window-generation]').click()");
  }
  await wait("document.querySelector('[data-window-generation-center]')");
}
async function selectTaskTab(tab) {
  await run(`document.querySelector('[data-generation-tab="${tab}"]').click()`);
  await wait(`document.querySelector('[data-generation-tab="${tab}"]').getAttribute('aria-selected')==='true'`);
}
async function checkTaskPresentation() {
  smoke.check("Generation summary separates running and queued counts", await run("document.querySelector('[data-window-generation-center] header [role=status]').textContent==='1 个生成中 · 1 个排队中'"));
  smoke.check("In-progress tab contains only active tasks in FIFO order", await run("(()=>{const tasks=[...document.querySelectorAll('#generation-active-panel [data-generation-task]')];return tasks.length===2&&tasks[0].dataset.generationTaskStatus==='generating'&&tasks[1].dataset.generationTaskStatus==='queued'})()"));
  await run("document.querySelector('#generation-active-panel [data-generation-parameters] summary').click()");
  smoke.check("Parameter disclosure exposes the submitted snapshot", await run("(()=>{const d=document.querySelector('#generation-active-panel [data-generation-parameters]');return d.open&&d.textContent.includes('test portrait')&&d.querySelectorAll('dd').length===4})()"));
  await run("document.querySelector('#generation-active-panel [data-generation-parameters] summary').click()");
  await captureTasks("generation-queue-light");
  await run("document.querySelector('[data-generation-tab=active]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  await wait("document.querySelector('[data-generation-tab=history]').getAttribute('aria-selected')==='true'");
  smoke.check("Arrow keys move tab focus and show only historical tasks", await run("document.activeElement.dataset.generationTab==='history'&&document.querySelector('#generation-active-panel').hidden&&[...document.querySelectorAll('#generation-history-panel [data-generation-task]')].every(task=>['completed','failed','cancelled'].includes(task.dataset.generationTaskStatus))"));
  await captureTasks("generation-history-light");
  await selectTaskTab("active");
}
// 同一截图能力支持任务局部和整窗两种几何，数据与实际 DOM 不作修改。
// selector 缺省只截队列面板，null 则保留个人中心完整外壳。
// 显式参数避免按文件名猜测截图范围，也避免复制一套截图保存方法。
async function captureTasks(name, selector = "[data-window-generation-center]") {
  await wait("!document.documentElement.classList.contains('page-transition')&&!document.documentElement.classList.contains('theme-ripple')");
  await delay(100);
  const rect = selector ? await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`) : undefined;
  const target = path.join(root, name + ".png");
  fs.writeFileSync(target, (await win.webContents.capturePage(rect)).toPNG());
  console.log("GENERATION_TASK_SCREENSHOT", target);
}
function taskElement(text) {
  return `Array.from(document.querySelectorAll('[data-generation-task]')).find(item=>item.textContent.includes(${JSON.stringify(text)}))`;
}
async function checkCancellation() {
  await run("document.querySelector('a[href=\"/create\"]').click()");
  await wait("document.querySelector('[data-generate-button]')"); await chooseCount(1); await begin();
  const before = prompts.length, stopped = cancelledRequests.length;
  await submit("cancel queued fixture"); await openTasks();
  await wait(`${taskElement("cancel queued fixture")}?.dataset.generationTaskStatus==='queued'`);
  await captureTasks("generation-stop-controls");
  await run(`${taskElement("cancel queued fixture")}.querySelector('[data-generation-cancel]').click()`);
  await wait(`${taskElement("cancel queued fixture")}.dataset.generationTaskStatus==='cancelled'`);
  smoke.check("Cancelling queued task neither submits nor interrupts a running request", prompts.length === before && cancelledRequests.length === stopped);
  await run(`document.querySelector('[data-generation-cancel="${currentRequestId}"]').click()`);
  await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("Stopping a running task reaches main and settles as cancelled", cancelledRequests.length === stopped + 1 && prompts.length === before);
  smoke.check("Stopped tasks remove the generating indicator", await run("!document.querySelector('[data-stage-generating]')"));
  await chooseCount(2); const savedBefore = saved.length;
  await submit("cancel partial batch"); await nextPrompt(before);
  complete(false); await nextPrompt(before + 1);
  await submit("cancel all queued fixture");
  const accepted = prompts.length;
  await run("document.querySelector('[data-generation-cancel-all]').click()");
  await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("Stop all cancels queued work without another submission", prompts.length === accepted && await run(`${taskElement("cancel all queued fixture")}.dataset.generationTaskStatus==='cancelled'`));
  smoke.check("Stopping a partial batch retains the saved image and 1 of 2 count", saved.length === savedBefore + 1 && await run(`${taskElement("cancel partial batch")}.dataset.generationTaskStatus==='cancelled'&&${taskElement("cancel partial batch")}.textContent.includes('1 / 2')&&Boolean(${taskElement("cancel partial batch")}.querySelector('button'))`));
  await selectTaskTab("history");
  await captureTasks("generation-stopped-partial");
  await selectTaskTab("active");
}
async function checkDisconnectedQueue() {
  await chooseCount(2); const before = prompts.length, savedBefore = saved.length;
  await submit("disconnect partial batch"); await nextPrompt(before);
  complete(false); await nextPrompt(before + 1);
  await submit("disconnect pending fixture"); await openTasks();
  complete("COMFY_DISCONNECTED");
  await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("Disconnect fails current task with a readable connection error", await run(`${taskElement("disconnect partial batch")}.dataset.generationTaskStatus==='failed'&&${taskElement("disconnect partial batch")}.textContent.includes('连接已断开')`));
  smoke.check("Disconnect terminates queued tasks without submitting them", prompts.length === before + 2 && await run(`${taskElement("disconnect pending fixture")}.dataset.generationTaskStatus==='cancelled'`));
  smoke.check("Disconnect retains already completed images", saved.length === savedBefore + 1 && await run(`${taskElement("disconnect partial batch")}.textContent.includes('1 / 2')`));
  await chooseCount(1); await submit("manual resubmit after disconnect"); await nextPrompt(before + 2);
  complete(false); await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("User may explicitly submit again after checking the service", await run(`${taskElement("manual resubmit after disconnect")}.dataset.generationTaskStatus==='completed'`));
}
async function chooseCount(count) {
  await run("document.querySelector('[data-generate-button]').parentElement.querySelector('[aria-haspopup=menu]').click()");
  await wait("document.querySelector('[role=menuitem]')");
  await run(`Array.from(document.querySelectorAll('[role=menuitem]')).find(button=>button.textContent.trim()==='x${count}').click()`);
}
async function nextPrompt(previous) {
  for (let i = 0; i < 100 && prompts.length === previous; i++) await delay(50);
  if (prompts.length !== previous + 1) throw new Error("Queued fixture prompt was not reached");
}
async function checkBatch() {
  await run("document.querySelector('a[href=\"/create\"]').click()");
  await wait("document.querySelector('[data-generate-button]')");
  await chooseCount(2); const before = prompts.length; const savedBefore = saved.length;
  await submit("batch snapshot"); await nextPrompt(before);
  await chooseCount(1); await submit("queued output snapshot");
  // 设置入口已随账户菜单移动，先打开真实菜单，不能假定 nav 常驻设置链接。
  // 保留客户端路由切换，才能验证页面卸载期间任务仍然执行。
  await run("document.querySelector('[data-account-menu-trigger]').click()");
  await wait("document.querySelector('a[href=\"/settings\"]')");
  await run("document.querySelector('a[href=\"/settings\"]').click()");
  await wait("location.pathname.includes('settings')");
  await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='选择文件夹').click()");
  await wait(`document.body.textContent.includes(${JSON.stringify(changedOutput)})`);
  for (let i = 0; i < 100 && userData.settings.outputPath !== changedOutput; i++) await delay(50);
  smoke.check("Output setting is updated before subsequent submissions", userData.settings.outputPath === changedOutput);
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-window-generation-center]')");
  smoke.check("Batch submission is one task with two requested images", await run("Array.from(document.querySelectorAll('[data-generation-task]')).find(item=>item.textContent.includes('batch snapshot'))?.textContent.includes('0 / 2')"));
  complete(false); await nextPrompt(before + 1);
  smoke.check("Batch records partial completion before the next image", await run("Array.from(document.querySelectorAll('[data-generation-task]')).find(item=>item.textContent.includes('batch snapshot'))?.textContent.includes('1 / 2')"));
  complete(false); await nextPrompt(before + 2);
  smoke.check("Batch completes before the next queued task starts", await run("Array.from(document.querySelectorAll('[data-generation-task]')).find(item=>item.textContent.includes('batch snapshot'))?.dataset.generationTaskStatus==='completed'"));
  complete(false); await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("Running and queued tasks retain their submitted output directory", saved.length === savedBefore + 3 && saved.slice(savedBefore).every(file => file.outputPath === root));
  await checkPartialBatch();
}
async function checkPartialBatch() {
  await run("document.querySelector('a[href=\"/create\"]').click()");
  await wait("document.querySelector('[data-generate-button]')");
  await chooseCount(2); const before = prompts.length; const savedBefore = saved.length;
  await submit("partial batch"); await nextPrompt(before);
  await chooseCount(1); await submit("after partial failure");
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-window-generation-center]')");
  complete(false); await nextPrompt(before + 1);
  complete(true); await nextPrompt(before + 2);
  smoke.check("Failed batch preserves its first saved image and completed count", await run("Array.from(document.querySelectorAll('[data-generation-task]')).some(item=>item.dataset.generationTaskStatus==='failed'&&item.textContent.includes('partial batch')&&item.textContent.includes('1 / 2')&&item.querySelector('button'))"));
  complete(false); await wait("!document.querySelector('[data-window-generation-count]')");
  smoke.check("Next task completes after a partial batch failure", saved.length === savedBefore + 2);
  smoke.check("New submissions use the updated output directory", saved.slice(savedBefore).every(file => file.outputPath === changedOutput), saved.slice(savedBefore).map(file => file.outputPath === root ? "original root" : file.outputPath === changedOutput ? "updated root" : "other root").join(", "));
}
async function checkTaskTheme() {
  if (!await run("Boolean(document.querySelector('[data-window-generation-center]'))")) {
    await run("document.querySelector('[data-window-generation]').click()");
    await wait("document.querySelector('[data-window-generation-center]')");
  }
  const panelColors = () => run("(()=>{const css=getComputedStyle(document.querySelector('[data-window-generation-center]'));return {background:css.backgroundColor,text:css.color}})()");
  const light = await panelColors();
  await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, "[data-theme-trigger]");
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=dark]')");
  await run("document.querySelector('[data-theme-option=dark]').click()");
  await wait("document.documentElement.dataset.theme==='dark'");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-window-generation-center]')");
  const dark = await panelColors();
  smoke.check("Generation panel follows dark theme for surfaces and text", light.background !== dark.background && light.text !== dark.text);
  await selectTaskTab("history");
  await captureTasks("generation-history-dark");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  smoke.check("Task panel fits a narrow viewport without horizontal overflow", await run("(()=>{const r=document.querySelector('[data-window-generation-center]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));
  smoke.check("History scrolls within its panel and keeps footer visible", await run("(()=>{const p=document.querySelector('#generation-history-panel'),f=document.querySelector('[data-window-generation-center] footer');return p.scrollHeight>p.clientHeight&&p.scrollWidth<=p.clientWidth&&f.getBoundingClientRect().bottom<=innerHeight})()"));
  await captureTasks("generation-history-narrow");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, "[data-theme-trigger]");
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=light]')");
  await run("document.querySelector('[data-theme-option=light]').click()");
  await wait("document.documentElement.dataset.theme==='light'");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await run("document.querySelector('[data-window-generation]').click()");
  await wait("document.querySelector('[data-window-generation-center]')");
  const restored = await panelColors();
  smoke.check("Generation panel restores its light theme", restored.background === light.background && restored.text === light.text);
}
main().catch((error) => { console.error(error.message); if (win && !win.isDestroyed()) win.destroy(); smoke.finish({ app, ok: false, error }); });

/**
 * 本组从同一 Electron 窗口真实点击生成、失败和停止得到的账本做期望值。
 * 再重新加载个人中心，让页面经过真正的用户文档水合，而不是直接塞 store。
 * 比较图片总量与成功率，不把 LoRA 为空时的无数据解释成坏图表。
 * 截图包含深色、浅色和窄窗口，不触碰正在运行的用户客户端。
 */
/**
 * 私密统计实机渲染的反证安排：
 * 测试先用真实创建按钮产生成功、失败、排队与停止状态。
 * 这些状态通过生产任务 store 形成用户文档账本。
 * 没有为个人中心另建一套固定 186 张之类的截图数据。
 * records 直接从本测试隔离的 USER_DATA_WRITE 回执缓存取得。
 * 排除 cancelled 后计算期望分母，和产品汇总器不共享算法函数。
 * 这样产品汇总器若漏掉停止规则，界面读数会与独立期望不同。
 * 图片期望数按真实保存夹具回执累计，不按点击按钮次数累计。
 * 成功率期望按终态任务数计算，不使用图片数作分母。
 * 先断言记录里确实有 failed 和 cancelled，保证负向样本存在。
 * 如果前面测试根本没有走停止分支，不能宣称已验证排除规则。
 * 重新 loadURL 会卸载原 React 树并重新装配 AppShell。
 * 这是恢复接入的关键，不能只在同一个内存 store 上切一个标签。
 * 重新进入后必须默认选中实际内容，避免误看显式界面样例。
 * 点击私密统计后等待真正的 ECharts SVG 出现。
 * 图表初始化未完成时不能过早截图一张空白容器。
 * 五张指标的第一张应等于实际保存图片总量。
 * 第二张应等于实际任务成功率，保留一位小数。
 * 第五张积分应维持未知，防止样例消费数字漏进真实模式。
 * 截图前滚到统计面板，使交付画面包含任务驱动的指标而不是主页横幅。
 * 先显式切换到深色再截图，不能依赖前一个测试组结束时的主题。
 * 再通过现有外观入口选择浅色，而不是给 body 注入一套测试 CSS。
 * 等待 data-theme 生效后才截图，避免抓到切换中的混合状态。
 * 相同图表实例应重新取主题色，数据数值不因主题变化而改变。
 * 截图使用实际 Electron capturePage，不手工拼接指标图片。
 * 媒体与文件输出仍来自本专项夹具，所以不能声称真实 GPU 推理成功。
 * 测试窗口有独立 userData 路径，不读取当前登录的用户资料。
 * 关闭测试窗口只结束本次验证，不终止用户正在运行的 Electron。
 * 本组在原队列专项末尾串行执行，没有并发启动另一套冒烟。
 */
/**
 * 统计截图与数据证明的观察边界：
 * 深色图和浅色图都来自同一个已经完成的任务集合。
 * 如果主题切换导致数值变化，说明界面样例或本地状态被意外重置。
 * 页面重新加载后队列卡可以不再存在，但账本仍应恢复。
 * 所以恢复验证不能只检查之前还在内存里的几张卡。
 * 本测试的 USER_DATA_READ 每次都从测试缓存返回文档。
 * 该缓存只由生产 USER_DATA_WRITE 调用更新，不在截图前拼入额外统计。
 * 期望 total 使用保存文件数，期望 rate 使用任务终态数。
 * 它们分别保护产图统计与任务成功率两个不同维度。
 * 保存夹具返回合法 PNG 小图，让界面经历真实媒体解码与元数据保存编排。
 * PNG 像素是测试夹具，不是 GPU 生成作品。
 * 截图证明的是现有组件、主题、滚动以及统计数据接线。
 * 截图不证明用户模型能成功加载或其实际生成速度。
 * 滚到统计区域只控制测试窗口中的滚动位置，不裁切页面 DOM。
 * 捕获时仍保留标题栏和导航，可以检查外壳是否覆盖内容。
 * 截图存到本次临时目录，交付时复制选定结果到文档目录。
 * 没有打开用户的私密模型或本地输出目录，截图不包含真实个人作品。
 */
async function checkPrivateStatistics() {
  await delay(400);
  const records = userData.generationHistory?.records ?? [];
  const counted = records.filter(record => record.status !== "cancelled");
  const total = counted.reduce((sum, record) => sum + record.images, 0);
  const rate = (counted.filter(record => record.status === "completed").length / counted.length * 100).toFixed(1) + "%";
  smoke.check("Persistent ledger includes failures and manual stops separately", counted.some(record => record.status === "failed") && records.some(record => record.status === "cancelled"));
  await win.loadURL("app://app/profile");
  await wait("document.querySelector('[data-profile-actual][aria-pressed=true]')");
  // 完整页面重新加载会再次恢复更新公告，这属于当前隔离用户文档的初始状态。
  // 先等待公告挂载并通过自己的关闭按钮收起，不能直接移除 DOM 欺骗截图。
  // 否则后续脚本虽能程序点击底层控件，真实用户却仍被公告遮挡。
  // 本步骤不改变统计数字，只让真实用户可操作的页面成为截图主体。
  // 等待公告消失后才切私密标签，保证选择器和主题入口实际可达。
  // 后面的截图等待过渡完成，避免关闭动画仍留下半透明遮罩。
  // 公告的内容和发布状态保持原实现，不为测试修改用户文档的更新记录。
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await run("document.querySelector('[data-profile-content-tab=private]').click()");
  await wait("document.querySelector('[data-chart-kind=models] svg')");
  smoke.check("Reloaded local analytics match saved images and task success rate", await run(`(()=>{const values=[...document.querySelectorAll('.pr-metric strong')].map(el=>el.textContent);return values[0]===${JSON.stringify(String(total))}&&values[1]===${JSON.stringify(rate)}&&values[4]==='—'})()`));
  await run("document.querySelector('[data-profile-statistics]').scrollIntoView({block:'start'})");
  await setStatisticsTheme("dark");
  await captureTasks("generation-statistics-dark", null);
  await setStatisticsTheme("light");
  await captureTasks("generation-statistics-light", null);
  await checkStatisticsNarrow();
}

// 模型分类通过已有下拉组件选择，不能改 DOM 文本假装切换成功。
// 本专项没有选择 LoRA，因此切换后的正确结果是空态，主模型不能混入。
// 窄窗口读取真实几何，统计卡片不能撑出宿主产生横向滚动。
// captureTasks 使用真实 webContents.capturePage，图表和文本都由应用绘制。
/**
 * 窄窗口和模型分类的反证安排：
 * 主模型和 LoRA 的下拉复用生产 SimpleSelect。
 * 测试通过 trigger 与 option 真实点击，不直接修改 React state。
 * 选项挂在 portal，因此等待 body 中的 option，而不是搜索 trigger 的子节点。
 * 当前专项没有选择 LoRA，这一事实由前面的真实工作流参数决定。
 * 切换到 LoRA 后应显示暂无统计，不能继续保留主模型的柱条。
 * 空态成立后再检查窄窗口，避免把尚未更新的旧模型图当成通过。
 * 窄视口为三百九十像素，覆盖应用的移动布局边界。
 * 等待尺寸通知后读取 scrollWidth 和 clientWidth。
 * 允许一像素舍入误差，防止设备缩放的小数几何导致假失败。
 * 不允许多余横向内容，长日期和模型分类控件应在容器内布局。
 * 模型卡本身可以有纵向滚动，这与整个主区横向溢出是两回事。
 * 截图保留真实导航和标题栏，不能裁掉出问题的外壳伪装适配。
 * 该截图和桌面浅深图共用同一份账本，能核对跨布局数值一致。
 */
async function checkStatisticsNarrow() {
  await run("[...document.querySelectorAll('[data-simple-select] button')].find(el=>el.getAttribute('aria-label')==='模型使用分类').click()");
  await wait("document.querySelector('[data-simple-select-option=lora]')");
  await run("document.querySelector('[data-simple-select-option=lora]').click()");
  await wait("document.querySelector('[data-chart-kind=models]').textContent.includes('暂无统计')");
  smoke.check("LoRA category stays empty when no LoRA was used", await run("document.querySelector('[data-chart-kind=models]').textContent.includes('暂无统计')"));
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  smoke.check("Local statistics stay inside the narrow main area", await run("(()=>{const el=document.querySelector('[data-profile-statistics]');return el.scrollWidth<=el.clientWidth+1})()"));
  await captureTasks("generation-statistics-narrow", null);
}

/**
 * 两种主题使用同一个真实外观选择流程，避免截图名称与实际主题不符。
 * 前面的队列主题测试会恢复浅色，因此个人中心不能假定已经处于深色。
 * selector 只由调用方提供的 dark/light 常量组成，不接受用户自由脚本。
 * 先等待选项出现再点击，避免外观弹层尚未挂载时查到空元素。
 * 关闭外观弹层后等待 data-theme，确保截图里不是菜单遮盖后的页面。
 * 这一步使用生产主题 store 与主进程主题 IPC，不手动改根节点 class。
 * 浏览器 prefers-color-scheme 和图表主题观察器会收到实际变化。
 * 随后的 captureTasks 还会等待 theme-ripple 结束，保留最终稳定画面。
 * 主题操作不会修改任务账本；浅深截图应具有完全相同的任务数值。
 * helper 不另建窗口，所以仍符合一次只跑一个 Electron 冒烟的约束。
 */
async function setStatisticsTheme(theme) {
  await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, "[data-theme-trigger]");
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await run(`document.querySelector('[data-theme-option=${theme}]').click()`);
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await wait(`document.documentElement.dataset.theme==='${theme}'`);
}
