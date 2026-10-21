/** 模型来源回归：真实 UI + 原生下载 IPC，纯色预览和内存模型文件验证封面选择与 JSON 落盘。 */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { createHash } = require("node:crypto");
const { app, BrowserWindow, protocol, nativeImage } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const { getDownloadSession } = require("../apps/electron/services/model-download-network");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-source-")), modelsRoot = path.join(directory, "models");
const smoke = createSmokeHarness({ name: "model-source", timeoutMs: 90000 });
const document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { paths: { searchPath: modelsRoot }, theme: "light", locale: "zh-CN" } });
const bytes = Buffer.alloc(65536, 42), hash = createHash("sha256").update(bytes).digest("hex");
const cover = color => nativeImage.createFromBitmap(Buffer.from(color), { width: 1, height: 1 }).toPNG();
const blue = cover([200, 100, 42, 255]), red = cover([42, 100, 200, 255]);
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], imageRequests = [];
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(directory, "secrets");
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/userData").readUserData = () => ({ data: document, filePath: "", isNew: false });
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
require("../apps/electron/ipc-handlers/model-download.handlers").registerModelDownloadHandlers();
require("../apps/electron/ipc-handlers/models.handlers").registerModelHandlers();
require("../apps/electron/ipc-handlers/civitai.handlers").registerCivitaiHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => directory);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, filePath) => fs.existsSync(filePath) ? "data:image/png;base64," + fs.readFileSync(filePath).toString("base64") : null);
const file = id => ({ id: id + 1000, name: `fixture-${id}.safetensors`, sizeKB: bytes.length / 1024, primary: true, hashes: { SHA256: hash }, metadata: { format: "SafeTensor" }, downloadUrl: `https://civitai.red/api/download/models/${id}?type=Model&token=fixture-secret` });
const model = { id: 1, name: "Source fixture", type: "LORA", description: "<p>Model introduction</p>", creator: { username: "Fixture author" }, modelVersions: [101, 102].map(id => ({ id, name: `v${id}`, baseModel: "SDXL", description: `<p>Version ${id}</p>`, trainedWords: ["fixture style", "fixture word"], files: [file(id)], images: [1, 2].map(index => ({ type: "image", nsfwLevel: 1, url: `https://image.civitai.com/preview-${index}.png` })) })) };
async function api(request) {
  if (request.url.includes("/api/v1/models")) return new Response(JSON.stringify({ items: [model], metadata: {} }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  return new Response(request.url.includes("preview-2") ? red : blue, { headers: { "Content-Type": "image/png" } });
}
async function network(request) {
  if (request.url.includes("preview-")) { imageRequests.push(request.url); return new Response(request.url.includes("preview-2") ? red : blue, { headers: { "Content-Type": "image/png" } }); }
  return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) } });
}
async function wait(expression) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await run(`Boolean(${expression})`)) return; await delay(50); }
  console.error(await run("JSON.stringify({url:location.href,text:document.body.innerText.slice(-1500)})"));
  throw new Error("Model source condition timeout: " + expression);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(50); }
async function waitCompleted(fileName) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const task = (await run("window.electronAPI.listModelDownloads()")).data.find(task => task.fileName === fileName);
    if (task?.status === "completed") return task;
    if (task?.status === "failed") throw new Error("Fixture download failed: " + task.error);
    await delay(50);
  }
  throw new Error("Download did not complete");
}
async function configure() { await click("[data-civitai-download]"); await wait("document.querySelector('[data-model-download-start]')?.disabled===false"); }
async function verifyUi(win) {
  await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelector('[data-civitai-card]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-civitai-card]"); await click("[data-civitai-preview-next]");
  smoke.check("manual next selects the second preview", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  await delay(5500);
  smoke.check("preview does not advance automatically", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  await configure();
  smoke.check("download form uses current preview rather than first image", await run("document.querySelector('[data-model-download-form] img').src.includes('preview-2')"));
  await click("[data-model-download-form] button");
  smoke.check("returning to details preserves the chosen preview", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  await configure();
  await run(`(()=>{const input=document.querySelector('[data-model-download-form] input[type=file]'),transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob('${red.toString("base64")}'),c=>c.charCodeAt(0))],'custom.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait("document.querySelector('[data-model-download-form] img')?.src.startsWith('data:image/png')");
  smoke.check("custom cover still overrides the selected preview", true);
  await run("[...document.querySelectorAll('[data-model-download-form] button')].find(button=>button.textContent.includes('使用当前预览图')).click()");
  smoke.check("resetting custom cover returns to the selected preview", await run("document.querySelector('[data-model-download-form] img').src.includes('preview-2')"));
  await click("[data-model-download-start]");
  const task = await waitCompleted("fixture-101.safetensors"), metadataPath = task.filePath + ".civitai.json";
  smoke.check("model and per-file JSON are both committed", fs.readFileSync(task.filePath).equals(bytes) && fs.existsSync(metadataPath));
  const data = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  smoke.check("source JSON contains versioned model, page, creator and trigger words", data.version === 1 && data.modelId === 1 && data.modelName === model.name && data.source === "Civitai" && data.sourceTitle === model.name && data.sourceUrl === "https://civitai.red" && data.modelPageUrl === "https://civitai.red/models/1?modelVersionId=101" && data.creator === "Fixture author" && data.trainedWords.join(",") === "fixture style,fixture word");
  smoke.check("source JSON keeps plain descriptions and public download options without credentials", data.description === "Model introduction" && data.versionDescription === "Version 101" && data.versionId === 101 && data.versionName === "v101" && data.downloadUrl === "https://civitai.red/api/download/models/101?type=Model" && !JSON.stringify(data).includes("fixture-secret"));
  smoke.check("chosen preview is actually downloaded and saved as logo", imageRequests.at(-1).includes("preview-2") && fs.readFileSync(path.join(task.folderPath, "logo.png")).equals(red));
  smoke.check("no metadata temporary files remain", !fs.readdirSync(task.folderPath).some(name => name.endsWith(".part")));
  const dismissed = await run(`window.electronAPI.removeModelDownload(${JSON.stringify(task.id)})`);
  smoke.check("dismissing completed download preserves model, cover and source JSON", dismissed.success && fs.existsSync(task.filePath) && fs.existsSync(metadataPath) && fs.existsSync(path.join(task.folderPath, "logo.png")));
  await click("[data-civitai-version-bar] button");
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('v102')).click()"); await delay(80);
  smoke.check("version change resets preview to that version's first image", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-1')"));
  await configure(); await click("[data-model-download-start]");
  const second = await waitCompleted("fixture-102.safetensors");
  smoke.check("second version keeps its own JSON without overwriting the first", JSON.parse(fs.readFileSync(second.filePath + ".civitai.json", "utf8")).versionId === 102 && fs.readFileSync(metadataPath, "utf8") === JSON.stringify(data, null, 2) + "\n");
  smoke.check("later version uses its chosen cover even when the model already has a logo", fs.readFileSync(path.join(task.folderPath, "logo.png")).equals(blue));
  await verifyNative(task.folderPath);
  const moved = await run(`window.electronAPI.moveModelCategory(${JSON.stringify({ folderPath: task.folderPath, targetRootPath: path.join(modelsRoot, "loras"), category: "Moved" })})`);
  smoke.check("moving a category carries all version sidecars and the cover", moved.success && ["fixture-101.safetensors.civitai.json", "fixture-102.safetensors.civitai.json", "legacy.safetensors.civitai.json", "logo.png"].every(name => fs.existsSync(path.join(moved.data, name))));
  smoke.check("no React render or hydration errors", errors.length === 0);
}
async function verifyNative(folder) {
  const request = { modelType: "LORA", baseModel: "SDXL", modelName: model.name, fileName: "legacy.safetensors", downloadUrl: "https://civitai.red/api/download/models/103", category: "Uncategorized", sha256: hash, previewUrl: "" };
  const result = await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`);
  smoke.check("legacy callers without source snapshot remain accepted", result.success);
  const task = await waitCompleted(request.fileName);
  smoke.check("legacy downloads also get minimal source JSON and keep existing cover", JSON.parse(fs.readFileSync(task.filePath + ".civitai.json", "utf8")).versionId === 103 && fs.readFileSync(path.join(folder, "logo.png")).equals(blue));
  for (const source of [{ ...model.modelVersions[0], modelId: 1 }, { modelId: 1, versionId: 999, versionName: "v1", creator: "", description: "", versionDescription: "", trainedWords: [] }]) {
    const invalid = await run(`window.electronAPI.startModelDownload(${JSON.stringify({ ...request, source })})`);
    smoke.check("native IPC rejects malformed or mismatched source snapshots", !invalid.success && invalid.code === "INVALID_ARGUMENT");
  }
  const blockedPath = path.join(folder, "blocked.safetensors.civitai.json"); fs.writeFileSync(blockedPath, "existing source");
  const blocked = await run(`window.electronAPI.startModelDownload(${JSON.stringify({ ...request, fileName: "blocked.safetensors" })})`);
  await wait(`document.querySelector('[data-civitai-details]')`);
  let failed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const task = (await run("window.electronAPI.listModelDownloads()")).data.find(task => task.id === blocked.data.id);
    if (task.status === "failed") { failed = true; break; }
    await delay(50);
  }
  smoke.check("sidecar conflict fails visibly, preserves existing JSON and does not commit the model", failed && fs.readFileSync(blockedPath, "utf8") === "existing source" && !fs.existsSync(path.join(folder, "blocked.safetensors")));
  await run(`window.electronAPI.removeModelDownload(${JSON.stringify(blocked.data.id)})`);
  smoke.check("removing failed task preserves metadata owned by another download", fs.readFileSync(blockedPath, "utf8") === "existing source");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); protocol.handle("https", api);
  const downloadSession = getDownloadSession(); downloadSession.protocol.handle("https", network);
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 1500, height: 950, show: false, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.on("console-message", event => { if (event.level === "error" && /React|render|hydration|Minified/i.test(event.message)) errors.push(event.message); });
  try { await verifyUi(win); } finally { occlusion.dispose(); downloadSession.protocol.unhandle("https"); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
