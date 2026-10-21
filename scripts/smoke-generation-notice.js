/** Exercise stage generation text and terminal notices with deferred fixture generation; verify queue behavior and caption clearance. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments, registerWindowChrome } = require("../apps/electron/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "generation-notice", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-notice-smoke-"));
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
const settings = { paths: {}, theme: "light", outputPath: root };
let userData = { version: 1, settings };
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession(userData), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
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
const run = (source) => win.webContents.executeJavaScript(source, true);
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(100); }
  throw new Error("Notice test timed out: " + source);
}
async function assertPosition(name, top) {
  await wait(`document.querySelector('[data-generation-notice]')?.getBoundingClientRect().top===${top}`);
  smoke.check(name, await run(`(()=>{const r=document.querySelector('[data-generation-notice]').getBoundingClientRect();const caption=document.querySelector('[data-window-titlebar]')?.getBoundingClientRect();return r.top===${top}&&r.right<=innerWidth&&r.left>=0&&(!caption||r.top>=caption.bottom+16)})()`));
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
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 960, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  registerWindowChrome(win); win.webContents.debugger.attach("1.3");
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
    await wait("document.querySelector('[data-generation-notice=success]')"); await assertPosition("Completion notice shares the corrected offset", 48);
    smoke.check("Stage status disappears on completion", await run("!document.querySelector('[data-stage-generating]')"));
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false); await assertPosition("Fullscreen/native chrome preserves the original 16px inset", 16);
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true); await assertPosition("Restored caption moves a mounted notice back down", 48);
    await begin(); complete(true); await wait("document.querySelector('[data-generation-notice=error]')");
    await assertPosition("Failure notice shares the corrected offset", 48);
    smoke.check("Stage status disappears on failure", await run("!document.querySelector('[data-stage-generating]')"));
    await checkQueue();
    await checkBatch();
    await checkTaskTheme();
    await checkCancellation();
    await checkDisconnectedQueue();
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
async function captureTasks(name) {
  await wait("!document.documentElement.classList.contains('page-transition')&&!document.documentElement.classList.contains('theme-ripple')");
  await delay(100);
  const rect = await run("(()=>{const r=document.querySelector('[data-window-generation-center]').getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()");
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
