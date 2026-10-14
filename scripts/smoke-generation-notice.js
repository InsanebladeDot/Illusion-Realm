/** Exercise the real creation notice with deferred fixture generation; verify caption clearance at every viewport/state. */
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
registerHandle(C.USER_DATA_READ, () => ({ data: userData, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => { userData = data; return { data, filePath: "" }; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
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
  await wait("document.querySelector('[data-generation-notice=generating]')");
  for (let i = 0; i < 100 && !complete; i++) await delay(100);
  if (!complete) throw new Error("Fixture generation handler was not reached");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const png = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toDataURL();
  registerHandle(C.COMFY_GENERATE, (_event, prompt) => new Promise((resolve, reject) => { prompts.push(prompt); const id = `notice-${prompts.length}`; complete = (fail) => fail ? reject(new Error("fixture")) : resolve({ promptId: id, images: [{ nodeId: "9", filename: "fixture.png", subfolder: "", folderType: "output", dataUrl: png }], videos: [] }); }));
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 960, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  registerWindowChrome(win); win.webContents.debugger.attach("1.3");
  try {
    await win.loadURL("app://app/create"); await wait("document.querySelector('[data-generate-button]')");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    await delay(500); await begin(); await assertPosition("Generating notice clears desktop caption by 16px", 48);
    smoke.check("Generate button remains available while a task runs", await run("!document.querySelector('[data-generate-button]').disabled"));
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await assertPosition("Narrow notice stays below caption and inside viewport", 48);
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false); await assertPosition("Fullscreen/native chrome preserves the original 16px inset", 16);
    win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true); await assertPosition("Restored caption moves a mounted notice back down", 48);
    await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    await wait("document.querySelector('[data-generation-notice=generating]')"); complete(false);
    await wait("document.querySelector('[data-generation-notice=success]')"); await assertPosition("Completion notice shares the corrected offset", 48);
    await begin(); complete(true); await wait("document.querySelector('[data-generation-notice=error]')");
    await assertPosition("Failure notice shares the corrected offset", 48);
    await checkQueue();
    await checkBatch();
    await checkTaskTheme();
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
  const panelColors = () => run("(()=>{const css=getComputedStyle(document.querySelector('[data-window-generation-center]'));return {background:css.backgroundColor,text:css.color}})()");
  const light = await panelColors();
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=dark]')");
  await run("document.querySelector('[data-theme-option=dark]').click()");
  await wait("document.documentElement.dataset.theme==='dark'");
  const dark = await panelColors();
  smoke.check("Generation panel follows dark theme for surfaces and text", light.background !== dark.background && light.text !== dark.text);
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  smoke.check("Task panel fits a narrow viewport without horizontal overflow", await run("(()=>{const r=document.querySelector('[data-window-generation-center]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await run("document.querySelector('[data-theme-trigger]').click()");
  await wait("document.querySelector('[data-theme-option=light]')");
  await run("document.querySelector('[data-theme-option=light]').click()");
  await wait("document.documentElement.dataset.theme==='light'");
  const restored = await panelColors();
  smoke.check("Generation panel restores its light theme", restored.background === light.background && restored.text === light.text);
}
main().catch((error) => { console.error(error.message); if (win && !win.isDestroyed()) win.destroy(); smoke.finish({ app, ok: false, error }); });
