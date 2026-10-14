/** Production UI/native IPC smoke with isolated model folders, fixture API and the real preload. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { app, BrowserWindow, nativeImage, dialog, protocol } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { getDownloadSession } = require("../apps/electron/services/model-download-network");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, registerWindowChrome, windowChromeArguments } = require("../apps/electron/window-chrome");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-download-ui-"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, "secrets");
const modelsRoot = path.join(root, "models");
const settings = { paths: { searchPath: modelsRoot }, theme: "light", locale: "zh-CN" };
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
require("../apps/electron/userData").readUserData = () => ({ data: { settings }, filePath: "", isNew: false });
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
require("../apps/electron/ipc-handlers/models.handlers").registerModelHandlers();
require("../apps/electron/ipc-handlers/model-download.handlers").registerModelDownloadHandlers();
require("../apps/electron/ipc-handlers/civitai.handlers").registerCivitaiHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: { settings }, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => path.join(root, "output"));
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, file) => fs.existsSync(file) ? "data:image/png;base64," + fs.readFileSync(file).toString("base64") : null);
const openedModelPaths = [];
registerHandle(C.SHELL_OPEN_PATH, (_event, folder) => { openedModelPaths.push(folder); return folder; });
const smoke = createSmokeHarness({ name: "model-download-ui", timeoutMs: 120000 });
const errors = [];
const bytes = Buffer.alloc(512 * 1024, 42);
const hash = createHash("sha256").update(bytes).digest("hex");
const cover = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
const newCover = nativeImage.createFromBitmap(Buffer.from([200, 42, 100, 255]), { width: 1, height: 1 }).toPNG();
const replacement = path.join(root, "replacement.png"); fs.writeFileSync(replacement, newCover);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let win;
let paginationMode = false;
let failLastPage = true;
const pageRequests = [0, 0, 0, 0];
const run = (expression) => win.webContents.executeJavaScript(expression, true);
async function wait(expression) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await run(`Boolean(${expression})`)) return; await delay(100); }
  throw new Error("UI condition timeout: " + expression);
}
async function click(selector) { await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.click()})()`); await delay(100); }
async function input(selector, value) {
  await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(100);
}
async function screenshot(name) {
  await delay(250);
  fs.writeFileSync(path.join(root, name + ".png"), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
function fixtureModel(id, name, preview) {
  return { id, name, type: "LORA", baseModels: ["SDXL"], creator: { username: "Fixture" }, modelVersions: [{ id, name: "v1", baseModel: "SDXL", files: [{ id, name: `fixture-${id}.safetensors`, sizeKB: bytes.length / 1024, primary: true, hashes: { SHA256: hash }, downloadUrl: `https://civitai.red/api/download/models/${id}`, metadata: { format: "SafeTensor" } }], images: preview ? [{ type: "image", nsfwLevel: 1, url: "https://image.civitai.com/preview.png" }] : [] }] };
}
async function fixtureApiResponse(request) {
  if (!request.url.includes("/api/v1/models")) return new Response(cover, { headers: { "Content-Type": "image/png" } });
  let payload = { items: [fixtureModel(1, "With Preview", true), fixtureModel(2, "No Preview", false), fixtureModel(3, "Cancel", false)] };
  if (paginationMode) {
    const page = Number(new URL(request.url).searchParams.get("page") || 1);
    pageRequests[page]++;
    await delay(200);
    if (page === 3 && failLastPage) return new Response("Fixture failure", { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
    const ids = page === 1 ? Array.from({ length: 12 }, (_, index) => index + 1) : page === 2 ? Array.from({ length: 13 }, (_, index) => index + 12) : [25];
    payload = { items: ids.map((id) => fixtureModel(id, "Page model " + id, false)), metadata: page < 3 ? { nextPage: `https://civitai.red/api/v1/models?page=${page + 1}` } : {} };
  }
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function streamingResponse(request) {
  if (request.url.includes("preview")) return Promise.resolve(new Response(cover, { headers: { "Content-Type": "image/png" } }));
  if (request.url.endsWith("/401")) return Promise.resolve(new Response("", { status: 401 }));
  if (request.url.endsWith("/500")) return Promise.resolve(new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
  const offsetStart = Number(/^bytes=(\d+)-$/.exec(request.headers.get("Range") || "")?.[1] || 0);
  let offset = offsetStart;
  const stream = new ReadableStream({ async pull(controller) {
    await delay(request.url.endsWith("/3") ? 300 : 20);
    if (request.signal.aborted) { controller.error(new DOMException("Cancelled", "AbortError")); return; }
    controller.enqueue(bytes.subarray(offset, offset + 16384)); offset += 16384;
    if (offset === bytes.length) controller.close();
  } });
  return Promise.resolve(new Response(stream, { status: offsetStart ? 206 : 200, headers: { "Content-Type": "application/octet-stream", "Content-Length": bytes.length - offsetStart, ETag: '"fixture-model"', ...(offsetStart ? { "Content-Range": `bytes ${offsetStart}-${bytes.length - 1}/${bytes.length}` } : {}) } }));
}
async function configure(id) {
  await click(`[data-civitai-card="${id}"]`); await click("[data-civitai-download]");
  await wait("document.querySelector('[data-model-download-start]')?.disabled===false&&document.querySelector('[data-model-download-start]').getBoundingClientRect().width>0");
}
async function verifyCaptionEntry() {
  await wait("document.querySelector('[data-window-download]')");
  smoke.check("Caption entry reserves space before native minimize controls", await run("(()=>{const button=document.querySelector('[data-window-download]').getBoundingClientRect();return button.top===0&&button.height===32&&button.right<=innerWidth-130&&document.querySelector('#main-content').getBoundingClientRect().top===32&&getComputedStyle(document.querySelector('[data-window-download]')).getPropertyValue('-webkit-app-region')==='no-drag'})()"));
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Download icon opens an empty global center", await run("document.querySelector('[data-window-download-center]').textContent.includes('暂无下载任务')"));
  await screenshot("titlebar-empty-light");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Escape closes the center and restores focus to its trigger", await run("!document.querySelector('[data-window-download-center]')&&document.activeElement===document.querySelector('[data-window-download]')"));
}
async function verifyCaptionProgress() {
  await wait("document.querySelector('[data-window-download-count]')?.textContent==='1'");
  const point = await run("(()=>{const r=document.querySelector('[data-window-download]').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  await wait("document.querySelector('[data-window-download-center]')?.textContent.includes('fixture-3')");
  await wait("document.querySelector('[data-window-download-center] progress')?.value>0");
  smoke.check("Native caption mouse click opens live download progress", await run("document.querySelector('[data-window-download-center] progress')?.max===100"));
  await screenshot("titlebar-download-progress-dark");
  await click("a[href='/tools']"); await wait("location.pathname==='/tools'");
  await wait("!document.documentElement.classList.contains('page-transition')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Downloads remain accessible after leaving the model page", await run("document.querySelector('[data-window-download-center]').textContent.includes('fixture-3')"));
  await run("[...document.querySelectorAll('[data-window-download-center] [data-model-download-task]')].find(el=>el.textContent.includes('fixture-3')).querySelector('[data-download-cancel]').click()");
  await wait("document.querySelector('[data-window-download-center]').textContent.includes('已取消')");
  smoke.check("Global cancel clears the active badge", await run("!document.querySelector('[data-window-download-count]')"));
  await verifyRetryAndRemove();
  await run("document.querySelector('#main-content').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  smoke.check("Outside pointer closes the progress panel", await run("!document.querySelector('[data-window-download-center]')"));
  await click("[data-tool-category=models]"); await click("[data-tool-entry='/tools/models/civitai']");
  await wait("document.querySelectorAll('[data-civitai-card]').length===3");
}
async function verifyRetryAndRemove() {
  const before = (await run("window.electronAPI.listModelDownloads()")).data.find((task) => task.fileName === "fixture-3.safetensors");
  const selector = `[data-model-download-task="${before.id}"]`;
  smoke.check("Cancel preserves partial bytes and displays Retry with the rightmost delete icon", before.received > 0 && fs.existsSync(path.join(before.folderPath, `.download-${before.id}.part`)) && await run(`Boolean(document.querySelector('${selector} [data-download-retry]')&&document.querySelector('${selector} [data-download-remove]'))`));
  await screenshot("download-cancelled-retry");
  await click(selector + " [data-download-retry]");
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='downloading'`);
  smoke.check("Retry resumes the original task and exposes download speed/remaining text", await run(`document.querySelectorAll('${selector}').length===1&&document.querySelector('${selector}').textContent.includes('/s')`));
  await screenshot("download-retry-progress");
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='completed'`);
  smoke.check("Resumed UI download completes with exact model bytes", fs.readFileSync(before.filePath).equals(bytes));
  await click(selector + " [data-download-remove]");
  await wait(`!document.querySelector('${selector}')`);
  smoke.check("Rightmost X dismisses a completed task and preserves the model", fs.readFileSync(before.filePath).equals(bytes) && !(await run("window.electronAPI.listModelDownloads()")).data.some((task) => task.id === before.id));
  await verifyActiveRemoval();
}
async function verifyActiveRemoval() {
  const request = { modelType: "LORA", baseModel: "SDXL", modelName: "Remove active", fileName: "active.safetensors", downloadUrl: "https://civitai.red/api/download/models/3", category: "Uncategorized", sha256: hash, previewUrl: "" };
  const task = (await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`)).data;
  const selector = `[data-model-download-task="${task.id}"]`;
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='downloading'`);
  await delay(650); await click(selector + " [data-download-remove]");
  await wait(`!document.querySelector('${selector}')`);
  await delay(350);
  smoke.check("X on an active task removes partial files without recreating the row", !fs.existsSync(task.folderPath) && await run(`!document.querySelector('${selector}')`));
  await screenshot("download-list-compact-dark");
}
async function verifyDownloads() {
  await configure(1);
  smoke.check("Default category and configured destination shown", await run("document.querySelector('[data-model-download-form]').textContent.includes('Uncategorized')"));
  await screenshot("download-light");
  await click("[data-model-download-start]");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  await wait("document.querySelector('[data-window-download-center] [data-model-download-task]')?.textContent.includes('已完成')");
  smoke.check("Model page has only the titlebar download entry", await run("!document.querySelector('[data-model-downloads]')&&document.querySelectorAll('[data-model-download-list]').length===1"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Download reaches native destination and saves first preview as logo.png", fs.existsSync(path.join(modelsRoot, "loras", "Uncategorized", "With Preview", "fixture-1.safetensors")) && fs.existsSync(path.join(modelsRoot, "loras", "Uncategorized", "With Preview", "logo.png")));
  await configure(2);
  await click("[data-model-download-form] button[aria-label='分类']");
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('自定义分类')).click()");
  await input("#model-download-category", "Styles");
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='dark'");
  await delay(700); await screenshot("download-dark");
  await click("[data-model-download-start]");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  await wait("[...document.querySelectorAll('[data-window-download-center] [data-model-download-task]')].filter(el=>el.textContent.includes('已完成')).length===2");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Custom category creates an independent folder and no-preview models have no logo", fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "fixture-2.safetensors")) && !fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "logo.png")));
  await configure(3); await click("[data-model-download-start]");
  await verifyCaptionProgress();
  smoke.check("Cancelled task can retry to completion and keeps its file after dismissal", fs.readFileSync(path.join(modelsRoot, "loras", "Uncategorized", "Cancel", "fixture-3.safetensors")).equals(bytes));
}
async function verifyLocalAndNarrow() {
  await click("[data-model-library=local]"); await wait("document.querySelectorAll('[data-local-model-card]').length===3");
  smoke.check("Local library auto-refreshes and shows custom categories", await run("document.querySelector('[data-local-model-library]').textContent.includes('Styles')"));
  await openLocalDetails("No Preview");
  smoke.check("Missing logo displays actual model filename", await run("document.querySelector('[data-local-model-details]').textContent.includes('fixture-2.safetensors')"));
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [replacement] });
  try { await click("[data-local-change-logo]"); await wait("document.querySelector('[data-local-model-details] img')?.src.startsWith('data:image/png')"); }
  finally { dialog.showOpenDialog = originalDialog; }
  smoke.check("Change-logo button writes logo.png and updates the cover", fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "logo.png")));
  await openLocalDetails("With Preview");
  await wait("document.querySelector('[data-local-model-details] img')?.src.startsWith('data:image/png')");
  const oldSrc = await run("document.querySelector('[data-local-model-details] img').src");
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [replacement] });
  try { await click("[data-local-change-logo]"); await wait(`document.querySelector('[data-local-model-details] img')?.src!==${JSON.stringify(oldSrc)}`); }
  finally { dialog.showOpenDialog = originalDialog; }
  smoke.check("Replacing the same logo path invalidates the image cache", true);
  await verifyLocalHierarchy();
  await verifyLocalCategoryMoves();
  await verifyBatchModels();
  await click("[data-model-library=online]"); await wait("document.querySelectorAll('[data-civitai-card]').length===3");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await configure(1);
  await screenshot("download-mobile");
  smoke.check("Mobile download configuration fits the viewport", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelectorAll('[data-model-download-form]').length===1&&document.querySelector('[data-model-download-start]').getBoundingClientRect().width>0&&document.querySelector('[data-model-download-start]').getBoundingClientRect().bottom<=innerHeight"));
  smoke.check("Real IPC rejects traversal", (await run("window.electronAPI.startModelDownload({modelType:'LORA',baseModel:'SDXL',modelName:'escape',fileName:'model.pt',downloadUrl:'https://civitai.red/api/download/models/1',category:'../escape',sha256:'',previewUrl:''})")).success === false);
  smoke.check("No React rendering or hydration errors", errors.length === 0);
  await verifyNarrowCenter();
}
async function chooseLocalCategory(name) {
  await click("[data-local-model-category] button");
  await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()===${JSON.stringify(name)}).click()`);
}
async function openLocalDetails(name) {
  await run(`[...document.querySelectorAll('[data-local-model-card]')].find(el=>el.textContent.includes(${JSON.stringify(name)})).parentElement.querySelector('[data-local-model-details-open]').click()`);
  await wait("document.querySelector('[data-local-model-details]')");
}
async function chooseMoveOption(selector, name) {
  await click(selector);
  await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()===${JSON.stringify(name)}).click()`);
}
async function verifyLocalCategoryMoves() {
  const source = path.join(modelsRoot, "loras", "Uncategorized", "With Preview");
  const conflict = path.join(modelsRoot, "loras", "Conflict", "With Preview");
  fs.mkdirSync(conflict, { recursive: true }); fs.writeFileSync(path.join(conflict, "keep.txt"), "existing");
  await openLocalDetails("With Preview");
  await click("[data-local-change-category]"); await wait("document.querySelector('[data-model-category-form]')");
  smoke.check("Change category starts at the actual major/category folder", await run("document.querySelector('[data-model-category-root]').textContent.includes('loras')&&document.querySelector('[data-model-category-form]').textContent.includes('Uncategorized')&&document.querySelector('[data-model-category-move]').disabled"));
  await chooseMoveOption("[data-model-category-root] button", "checkpoints");
  smoke.check("Cross-major selection shows an explanation and no automatic move action", await run("document.querySelector('[data-model-category-cross]').textContent.includes('不支持跨大分类')&&!document.querySelector('[data-model-category-move]')") && fs.existsSync(source));
  await click("[data-model-category-source]"); await click("[data-model-category-target]");
  smoke.check("Cross-major explorer buttons point to source and target folders", openedModelPaths.at(-2) === source && openedModelPaths.at(-1) === path.join(modelsRoot, "checkpoints"));
  await screenshot("local-model-category-cross-dark");
  smoke.check("IPC independently refuses cross-major moves", (await run(`window.electronAPI.moveModelCategory({folderPath:${JSON.stringify(source)},targetRootPath:${JSON.stringify(path.join(modelsRoot, "checkpoints"))},category:'Styles'})`)).error === "crossRoot");
  await chooseMoveOption("[data-model-category-root] button", "loras");
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "Conflict");
  smoke.check("Single move waits for explicit acknowledgement", await run("document.querySelector('[data-model-category-move]').disabled") && fs.existsSync(source));
  await click("[data-model-category-acknowledge]");
  await click("[data-model-category-move]"); await wait("document.querySelector('[data-model-category-form] [role=alert]')");
  smoke.check("UI reports a folder collision without replacing its contents", await run("document.querySelector('[data-model-category-form] [role=alert]').textContent.includes('同名模型文件夹')") && fs.readFileSync(path.join(conflict, "keep.txt"), "utf8") === "existing" && fs.existsSync(source));
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "自定义分类…");
  await input("[data-model-category-form] input[type=text], [data-model-category-form] input:not([type])", "../escape");
  smoke.check("Invalid custom categories cannot be submitted", await run("document.querySelector('[data-model-category-move]').disabled"));
  await input("[data-model-category-form] input[type=text], [data-model-category-form] input:not([type])", "New Style");
  smoke.check("Changing the destination resets move acknowledgement", await run("!document.querySelector('[data-model-category-acknowledge]').checked&&document.querySelector('[data-model-category-move]').disabled"));
  await click("[data-model-category-acknowledge]");
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='light'");
  await screenshot("local-model-category-light");
  await click("[data-model-category-move]");
  await wait("document.querySelector('[data-local-model-details]')?.textContent.includes('New Style')&&document.querySelector('[data-local-model-category] button')?.textContent.includes('New Style')");
  const moved = path.join(modelsRoot, "loras", "New Style", "With Preview");
  smoke.check("Move refreshes category filter, focused details and the cover", !fs.existsSync(source) && fs.existsSync(path.join(moved, "fixture-1.safetensors")) && fs.existsSync(path.join(moved, "logo.png")) && await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-details]').textContent.includes('With Preview')"));
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelector('[aria-labelledby=local-model-details-title]')");
  await click("[data-local-change-category]"); await wait("document.querySelector('[data-model-category-form]')");
  smoke.check("Category editor fits narrow model details", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-model-category-form]').getBoundingClientRect().right<=innerWidth"));
  await screenshot("local-model-category-mobile");
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "Uncategorized");
  await click("[data-model-category-acknowledge]");
  await click("[data-model-category-move]"); await wait("document.querySelector('[data-local-model-details]')?.textContent.includes('Uncategorized')&&!document.querySelector('[data-model-category-form]')");
  smoke.check("Narrow details move back to an existing category and retain the model", fs.existsSync(path.join(source, "fixture-1.safetensors")) && !fs.existsSync(moved));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
}
async function verifyLocalHierarchy() {
  for (const [type, category, name] of [["checkpoints", "Styles", "Checkpoint Style"], ["checkpoints", "Portrait", "Checkpoint Portrait"], ["embeddings", "Expressions", "Embedding Expression"]]) {
    const folder = path.join(modelsRoot, type, category, name); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, name + ".safetensors"), bytes);
  }
  await run("[...document.querySelectorAll('[data-local-model-library] button')].find(el=>el.textContent.includes('重新扫描')).click()");
  await wait("[...document.querySelectorAll('[data-local-model-library] button')].some(el=>el.textContent.includes('重新扫描')&&!el.disabled)");
  await wait("document.querySelectorAll('[data-local-model-card]').length===6");
  await click("[data-local-model-root=loras]");
  await chooseLocalCategory("Styles");
  smoke.check("Root tag filters its models before subcategories", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('No Preview')"));
  await click("[data-local-model-root=checkpoints]");
  smoke.check("Switching root tag resets subcategory and details", await run("document.querySelectorAll('[data-local-model-card]').length===2&&document.querySelector('[data-local-model-category] button').textContent.includes('全部')&&!document.querySelector('[data-local-model-details]')"));
  await click("[data-local-model-category] button");
  smoke.check("Subcategories belong only to the current model type", await run("[...document.querySelectorAll('[role=option]')].map(el=>el.textContent.trim()).sort().join('|')==='Portrait|Styles|全部'"));
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()==='Portrait').click()");
  smoke.check("Checkpoint subcategory shows its own models", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('Checkpoint Portrait')"));
  await click("[data-local-model-root=embeddings]");
  smoke.check("Embedding root tag displays all its models by default", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('Embedding Expression')&&document.querySelector('[data-local-model-category] button').textContent.includes('全部')"));
  await click("[data-local-model-root=loras]");
  smoke.check("Returning to the LoRA root tag displays its models", await run("document.querySelectorAll('[data-local-model-card]').length===3"));
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  smoke.check("Hierarchical filters fit a narrow local library", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-local-model-category]').getBoundingClientRect().right<=innerWidth"));
  await screenshot("local-model-hierarchy-mobile");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await screenshot("local-model-hierarchy");
}
async function verifyBatchModels() {
  await chooseLocalCategory("全部");
  const sources = [path.join(modelsRoot, "loras", "Uncategorized", "With Preview"), path.join(modelsRoot, "loras", "Uncategorized", "Cancel"), path.join(modelsRoot, "loras", "Styles", "No Preview")];
  smoke.check("Default library browses models with no checkboxes or select-all action", await run("document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'&&!document.querySelector('[data-local-model-checkbox]')&&!document.querySelector('[data-local-select-all]')"));
  await click("[data-local-model-card]"); await wait("document.querySelector('[data-local-model-details]')");
  smoke.check("Default card click opens details without selecting or changing files", await run("!document.querySelector('[data-local-model-card][aria-pressed=true]')") && sources.every(fs.existsSync));
  await screenshot("local-model-default-browse");
  await click("[data-local-batch-move]");
  smoke.check("Move enters empty multiselection without opening confirmation", await run("document.querySelectorAll('[data-local-model-checkbox]').length===3&&!document.querySelector('[data-local-model-card][aria-pressed=true]')&&!document.querySelector('[data-local-model-details]')&&!document.querySelector('[data-local-batch-dialog]')&&document.querySelector('[data-local-batch-move]').disabled"));
  await click("[data-local-select-all]");
  smoke.check("Explicit select-all checks cards only after entering a batch action", await run("document.querySelectorAll('[data-local-model-card][aria-pressed=true]').length===3") && sources.every(fs.existsSync));
  await click("[data-local-model-card]");
  smoke.check("Clicking a card toggles only that selection", await run("document.querySelectorAll('[data-local-model-card][aria-pressed=true]').length===2"));
  await click("[data-local-select-all]"); await click("[data-local-batch-move]");
  await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Batch move confirmation lists every source and waits for acknowledgement", await run("document.querySelector('[data-local-batch-confirm]').disabled&&!document.querySelector('[data-local-batch-acknowledge]').checked&&document.querySelector('[data-local-batch-dialog]').textContent.includes('No Preview')") && sources.every(fs.existsSync));
  await chooseMoveOption("[data-local-batch-dialog] button[aria-label='模型大分类']", "checkpoints");
  smoke.check("Batch move refuses crossing major categories", await run("document.querySelector('[data-local-batch-confirm]').disabled&&document.querySelector('[data-local-batch-dialog]').textContent.includes('不支持跨大分类')") && sources.every(fs.existsSync));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Closing batch confirmation leaves all models unchanged", sources.every(fs.existsSync));
  await click("[data-local-batch-move]"); await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  await chooseMoveOption("[data-local-batch-dialog] button[aria-label='分类']", "自定义分类…");
  await input("[data-local-batch-dialog] input:not([type])", "Batch Style");
  await click("[data-local-batch-acknowledge]"); await screenshot("local-model-batch-move-light");
  await click("[data-local-batch-confirm]"); await wait("!document.querySelector('[data-local-batch-dialog]')");
  const destinations = sources.map((source) => path.join(modelsRoot, "loras", "Batch Style", path.basename(source)));
  smoke.check("Confirmed batch move preserves files and covers and returns to browsing", sources.every((source) => !fs.existsSync(source)) && destinations.every(fs.existsSync) && fs.existsSync(path.join(destinations[0], "logo.png")) && await run("document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'&&!document.querySelector('[data-local-model-checkbox]')"));
  await verifyBatchDelete(destinations);
}
async function verifyBatchDelete(destinations) {
  await click("[data-local-batch-delete]"); await click("[data-local-model-card]"); await click("[data-local-select-exit]");
  smoke.check("Exit selection clears checkboxes and returns cards to details behavior", await run("!document.querySelector('[data-local-model-checkbox]')&&!document.querySelector('[data-local-select-all]')&&document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'") && destinations.every(fs.existsSync));
  await click("[data-local-model-card]"); await wait("document.querySelector('[data-local-model-details]')");
  await click("[data-local-batch-delete]");
  smoke.check("Delete starts empty and does not reuse prior selections", await run("document.querySelector('[data-local-batch-delete]').disabled&&!document.querySelector('[data-local-model-card][aria-pressed=true]')"));
  await click("[data-local-select-all]"); await click("[data-local-batch-delete]");
  await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Delete requires acknowledgement and describes Recycle Bin recovery", await run("document.querySelector('[data-local-batch-confirm]').disabled&&document.querySelector('[data-local-batch-dialog]').textContent.includes('系统回收站')") && destinations.every(fs.existsSync));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Cancelling delete preserves all model folders", destinations.every(fs.existsSync));
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='dark'");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click("[data-local-batch-delete]"); await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Reopening starts unchecked and the dark narrow confirmation fits", await run("!document.querySelector('[data-local-batch-acknowledge]').checked&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-local-batch-confirm]').getBoundingClientRect().bottom<=innerHeight"));
  await screenshot("local-model-batch-delete-mobile-dark");
  await click("[data-local-batch-acknowledge]"); await click("[data-local-batch-confirm]");
  await wait("!document.querySelector('[data-local-batch-dialog]')");
  smoke.check("Confirmed batch deletion trashes all selected folders and removes them from the scan", destinations.every((folder) => !fs.existsSync(folder)) && await run("![...document.querySelectorAll('[data-local-model-card]')].some(el=>el.textContent.includes('With Preview')||el.textContent.includes('No Preview')||el.textContent.includes('Cancel'))"));
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
}
async function verifyNarrowCenter() {
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Narrow global center fits without hiding caption controls", await run("(()=>{const r=document.querySelector('[data-window-download-center]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=32&&r.bottom<=innerHeight})()"));
  await screenshot("titlebar-download-mobile");
  await click("[data-window-download]");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false); await wait("document.documentElement.dataset.windowChrome==='native'");
  smoke.check("Native fullscreen releases caption space", await run("!document.querySelector('[data-window-titlebar]')&&getComputedStyle(document.documentElement).getPropertyValue('--window-chrome-height').trim()==='0px'"));
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true); await wait("document.documentElement.dataset.windowChrome==='custom'");
  smoke.check("Leaving fullscreen restores the download caption entry", await run("Boolean(document.querySelector('[data-window-download]'))"));
}
async function verifyScrollPagination() {
  paginationMode = true;
  await input("[data-civitai-query]", "pagination");
  await run("document.querySelector('[data-civitai-query]').form.requestSubmit()");
  await wait("document.querySelectorAll('[data-civitai-card]').length===12&&document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  await delay(300);
  smoke.check("Pagination waits for downward input without an extra load button", pageRequests[2] === 0 && await run("!document.querySelector('[data-civitai-pagination] button')"));
  await run("document.querySelector('[data-civitai-catalog]').dispatchEvent(new WheelEvent('wheel',{deltaY:100}))"); await delay(100);
  smoke.check("Scrolling away from the bottom does not request another page", pageRequests[2] === 0);
  await run("document.querySelector('[data-civitai-catalog]').scrollTop=1e9");
  await wait("document.querySelectorAll('[data-civitai-card]').length===24&&document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  smoke.check("Scrolling the catalog to its bottom appends and deduplicates models", pageRequests[2] === 1);
  await run("(()=>{const el=document.querySelector('[data-civitai-catalog]');el.scrollTop=el.scrollHeight;for(let i=0;i<20;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:100}))})()");
  await wait("document.querySelector('[data-civitai-pagination] button')");
  smoke.check("Continued wheel input at the bottom sends one request and preserves existing cards on failure", pageRequests[3] === 1 && await run("document.querySelectorAll('[data-civitai-card]').length===24"));
  await run("document.querySelector('[data-civitai-catalog]').dispatchEvent(new WheelEvent('wheel',{deltaY:100}))"); await delay(250);
  smoke.check("Failed pagination waits for explicit retry", pageRequests[3] === 1);
  failLastPage = false;
  await click("[data-civitai-pagination] button");
  await wait("document.querySelectorAll('[data-civitai-card]').length===25&&document.querySelector('[data-civitai-pagination]').textContent.includes('已显示全部模型')");
  smoke.check("Retry uses the failed page and appends its models", pageRequests[3] === 2);
  await run("(()=>{const el=document.querySelector('[data-civitai-catalog]');el.scrollTop=el.scrollHeight;el.dispatchEvent(new WheelEvent('wheel',{deltaY:100}))})()"); await delay(250);
  smoke.check("The final page stops further scroll requests", pageRequests[3] === 2);
}
async function main() {
  await app.whenReady(); smoke.installWatchdog(app); smoke.assertBuildFresh({ app });
  protocol.handle("https", fixtureApiResponse);
  const downloadSession = getDownloadSession(); downloadSession.protocol.handle("https", streamingResponse);
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1600, height: 1000, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  registerWindowChrome(win);
  win.webContents.on("console-message", (event) => { if (event.level === "error" && /React|render|hydration|Minified/i.test(event.message)) errors.push(event.message); });
  win.webContents.debugger.attach("1.3");
  try {
    await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelectorAll('[data-civitai-card]').length===3");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    await verifyCaptionEntry(); await verifyDownloads(); await verifyLocalAndNarrow(); await verifyScrollPagination(); await verifyDownloadErrors(); await verifyKeySettings();
  } finally { downloadSession.protocol.unhandle("https"); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
async function verifyDownloadErrors() {
  for (const [id, code, text] of [[401, "auth", "服务器拒绝下载"], [500, "response", "下载服务器返回了错误响应或网页内容"]]) {
    const request = { modelType: "LORA", baseModel: "SDXL", modelName: `Error fixture ${id}`, fileName: `error-${id}.safetensors`, downloadUrl: `https://civitai.red/api/download/models/${id}`, category: "Uncategorized", sha256: "", previewUrl: "" };
    const result = await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`);
    await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
    await wait(`document.querySelector('[data-model-download-task="${result.data.id}"] [role=alert]')`);
    const tasks = (await run("window.electronAPI.listModelDownloads()")).data;
    smoke.check(`Download manager distinguishes ${code} from connection timeout`, tasks.find((item) => item.id === result.data.id)?.error === code && await run(`document.querySelector('[data-model-download-task="${result.data.id}"] [role=alert]').textContent.includes(${JSON.stringify(text)})`));
    smoke.check(`Failed ${code} response creates no model file`, !fs.existsSync(result.data.filePath));
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  }
}
async function verifyKeySettings() {
  await win.loadURL("app://app/settings");
  await wait("document.querySelector('#civitai-api-key')&&!document.querySelector('#civitai-api-key').disabled");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click();document.querySelector('#civitai-api-key').scrollIntoView({block:'center'})");
  smoke.check("Civitai settings explain the supplied Security & Apps registration flow", await run("document.body.textContent.includes('登录 → Security & Apps → Add API Key')"));
  await input("#civitai-api-key", "test-ui-credential-1234");
  await click("[data-civitai-key-save]");
  await wait("document.querySelector('[data-civitai-key-status]').dataset.civitaiKeyStatus==='configured'");
  smoke.check("Saving clears the key input and exposes only masked status", await run("document.querySelector('#civitai-api-key').value===''&&document.querySelector('#civitai-api-key').type==='password'&&document.querySelector('[data-civitai-key-status]').textContent.includes('1234')&& !document.body.textContent.includes('test-ui-credential')"));
  await screenshot("civitai-key-configured");
  await win.loadURL("app://app/settings");
  await wait("document.querySelector('[data-civitai-key-status]')?.dataset.civitaiKeyStatus==='configured'");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  smoke.check("Civitai key status survives renderer reload without returning the key", (await run("window.electronAPI.civitaiKeyStatus()")).data.tail === "1234");
  await click("[data-civitai-key-clear]");
  await wait("document.querySelector('[data-civitai-key-status]').dataset.civitaiKeyStatus==='missing'");
  smoke.check("Clear removes the saved credential", (await run("window.electronAPI.civitaiKeyStatus()")).data.configured === false);
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
