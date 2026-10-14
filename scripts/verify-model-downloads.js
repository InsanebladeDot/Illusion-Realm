/** Deterministic native download regression: isolated settings, real streamed HTTP, filesystem commits and PNG conversion. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { app, dialog, nativeImage, BrowserWindow } = require("electron");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "model-downloads", timeoutMs: 90000 });
smoke.installWatchdog(app);
app.on("window-all-closed", () => {});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-download-"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, "secrets");
const userData = require("../apps/electron/userData");
const originalRead = userData.readUserData;
let paths = { searchPath: root, lorasPath: "", checkpointPath: "", diffusionModelsPath: "" };
userData.readUserData = () => ({ data: { settings: { paths } }, filePath: "", isNew: false });
const targets = require("../apps/electron/services/model-download-paths");
const { validateDownload, validateLocation } = require("../apps/electron/services/model-download-validation");
const manager = require("../apps/electron/services/model-download-manager");
const { getDownloadSession } = require("../apps/electron/services/model-download-network");
const credential = require("../apps/electron/civitai-secret");
const { scanModelsInDirectory } = require("../apps/electron/modelScanner");
const body = Buffer.alloc(512 * 1024, 42);
const hash = createHash("sha256").update(body).digest("hex");
const logo = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
const owner = Object.assign(new EventEmitter(), { id: 779, isDestroyed: () => false, send: () => undefined });
const request = { modelType: "LORA", baseModel: "SDXL", modelName: "Example", fileName: "model.safetensors", downloadUrl: "https://civitai.red/api/download/models/1", category: "", sha256: hash, previewUrl: "https://image.civitai.com/preview.png" };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rangeRequests = [];
async function finished(id) {
  for (let i = 0; i < 150; i++) {
    const task = manager.listDownloads(owner.id).find((item) => item.id === id);
    if (["completed", "failed", "cancelled"].includes(task.status)) { await delay(30); return task; }
    await delay(30);
  }
  throw new Error("test task timeout");
}
function serve(req, res) {
  if (req.url === "/slow-logo") { res.writeHead(200, { "Content-Type": "image/png" }); return setTimeout(() => res.end(logo), 1000); }
  if (req.url === "/logo") { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(logo); }
  if (req.url === "/auth") { res.writeHead(403); return res.end(); }
  if (req.url === "/html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html>error</html>"); }
  if (req.url === "/bad-logo") { res.writeHead(404); return res.end(); }
  const requested = Number(/^bytes=(\d+)-$/.exec(req.headers.range || "")?.[1] || 0);
  if (requested) rangeRequests.push(requested);
  const resume = requested > 0 && req.url !== "/ignore-range";
  let offset = resume ? requested : 0;
  res.writeHead(resume ? 206 : 200, { "Content-Type": "application/octet-stream", "Content-Length": body.length - offset,
    ETag: '"fixture-model"', ...(resume ? { "Content-Range": `bytes ${offset}-${body.length - 1}/${body.length}` } : {}) });
  if (req.url === "/truncated") { res.write(body.subarray(0, 100)); return setTimeout(() => res.destroy(), 10); }
  const timer = setInterval(() => {
    res.write(body.subarray(offset, offset + 16384)); offset += 16384;
    if (offset >= body.length) { clearInterval(timer); res.end(); }
  }, req.url === "/slow" ? 200 : 1);
  res.on("close", () => clearInterval(timer));
}
async function checks(server) {
  const port = server.address().port;
  let mode = "model";
  const downloadSession = getDownloadSession();
  credential.write("test-download-credential-1234");
  downloadSession.protocol.handle("https", (request) => {
    assert.equal(request.headers.get("Authorization"), request.url.includes("preview") ? null : "Bearer test-download-credential-1234");
    return globalThis.fetch(`http://127.0.0.1:${port}/${request.url.includes("preview") ? mode === "slow-logo" ? "slow-logo" : mode === "bad-logo" ? "bad-logo" : "logo" : ["bad-logo", "slow-logo"].includes(mode) ? "model" : mode}`, { signal: request.signal, headers: request.headers });
  });
  try {
    assert.equal(validateDownload([request]), null);
    for (const patch of [{ modelType: ["LORA"] }, { modelType: { toString: "LORA" } }, { category: "../outside" }, { fileName: "../escape.pt" }, { fileName: "CON.pt" }, { downloadUrl: "https://localhost/api/download/models/1" }, { logoDataUrl: "data:text/html;base64,AA==" }]) assert.equal(validateDownload([{ ...request, ...patch }]), "invalid");
    assert.equal(validateLocation([{ modelType: "LORA", baseModel: "SDXL", rootPath: root }]), "invalid");
    assert.equal(targets.downloadTarget(request).rootPath, path.join(root, "loras"));
    const task = await finished(manager.startDownload(owner, request).id);
    assert.equal(task.status, "completed");
    assert.equal(task.filePath, path.join(root, "loras", "Uncategorized", "Example", "model.safetensors"));
    assert.deepEqual(fs.readFileSync(task.filePath), body);
    assert.equal(nativeImage.createFromPath(path.join(task.folderPath, "logo.png")).isEmpty(), false);
    assert.equal(scanModelsInDirectory(path.join(root, "loras"), "lora").length, 1);
    assert.throws(() => manager.startDownload(owner, request), /exists/);
    assert.deepEqual(fs.readFileSync(task.filePath), body);
    smoke.check("Streamed download, configured root, PNG cover, scanner and no overwrite", true);
    await transferFailures((value) => { mode = value; });
    await categoriesAndLogos(task, (value) => { mode = value; });
    await resumeAndRemove((value) => { mode = value; });
  } finally { downloadSession.protocol.unhandle("https"); credential.clear(); }
}
async function transferFailures(setMode) {
  for (const mode of ["truncated", "html", "auth", "hash"]) {
    setMode(mode);
    const task = await finished(manager.startDownload(owner, { ...request, modelName: mode, sha256: mode === "hash" ? "0".repeat(64) : hash }).id);
    assert.equal(task.status, "failed");
    assert.equal(task.error, mode === "auth" ? "auth" : mode === "hash" ? "integrity" : mode === "html" ? "response" : "network");
    assert.equal(fs.existsSync(task.filePath), false);
    assert.equal(fs.readdirSync(task.folderPath).some((name) => name.endsWith(".part")), mode === "truncated");
  }
  setMode("slow");
  const extra = manager.startDownload(owner, { ...request, fileName: "v2.safetensors" });
  const { moveCategory } = require("../apps/electron/services/model-category-manager");
  assert.equal(fs.readdirSync(extra.folderPath).some((name) => name.endsWith(".part")), false);
  assert.throws(() => moveCategory({ folderPath: extra.folderPath, targetRootPath: path.join(root, "loras"), category: "Moving" }), /busy/);
  await manager.cancelDownload(owner.id, extra.id); await finished(extra.id);
  const job = manager.startDownload(owner, { ...request, modelName: "cancel" });
  await delay(500);
  assert.equal(await manager.cancelDownload(123, job.id), false);
  assert.equal(await manager.cancelDownload(owner.id, job.id), true);
  assert.equal((await finished(job.id)).status, "cancelled");
  assert.equal(fs.readdirSync(job.folderPath).some((name) => name.endsWith(".part")), true);
  assert.equal(manager.listDownloads(123).length, 0);
  smoke.check("Auth/HTML/hash discard; connection/cancel preserve partial bytes and ownership", true);
}
async function resumeAndRemove(setMode) {
  for (const mode of ["model", "ignore-range"]) {
    setMode("slow");
    const task = manager.startDownload(owner, { ...request, modelName: "resume-" + mode });
    await delay(750); await manager.cancelDownload(owner.id, task.id);
    const partial = manager.listDownloads(owner.id).find((item) => item.id === task.id);
    assert.equal(partial.status, "cancelled"); assert.ok(partial.received > 0 && partial.received < body.length);
    assert.ok(partial.bytesPerSecond === 0);
    await assert.rejects(manager.retryDownload(123, task.id), /invalid/);
    setMode(mode);
    const rangesBefore = rangeRequests.length;
    const resumed = await manager.retryDownload(owner.id, task.id);
    assert.equal(resumed.id, task.id); assert.ok(resumed.revision > partial.revision);
    const completed = await finished(task.id);
    assert.equal(completed.status, "completed"); assert.deepEqual(fs.readFileSync(completed.filePath), body);
    assert.equal(rangeRequests[rangesBefore], partial.received);
    const unrelated = path.join(completed.folderPath, "keep.txt"); fs.writeFileSync(unrelated, "user file");
    if (mode === "ignore-range") {
      fs.renameSync(completed.folderPath, completed.folderPath + "-moved");
      fs.symlinkSync(completed.folderPath + "-moved", completed.folderPath, "junction");
    }
    assert.equal(await manager.removeDownload(123, task.id), false);
    assert.equal(await manager.removeDownload(owner.id, task.id), true);
    assert.deepEqual(fs.readFileSync(completed.filePath), body);
    assert.equal(fs.existsSync(path.join(completed.folderPath, "logo.png")), true);
    assert.equal(fs.readFileSync(unrelated, "utf8"), "user file");
    if (mode === "ignore-range") assert.equal(fs.lstatSync(completed.folderPath).isSymbolicLink(), true);
    assert.equal(manager.listDownloads(owner.id).some((item) => item.id === task.id), false);
    await assert.rejects(manager.retryDownload(owner.id, task.id), /invalid/);
  }
  await removeRunning(setMode);
  await dismissWhileSaving(setMode);
  smoke.check("Same-task HTTP Range resume, full hash, fallback restart and scoped deletion", true);
}
async function dismissWhileSaving(setMode) {
  setMode("slow-logo");
  const task = manager.startDownload(owner, { ...request, modelName: "dismiss-saving-cover" });
  for (let i = 0; i < 100 && manager.listDownloads(owner.id).find((item) => item.id === task.id)?.status !== "saving"; i++) await delay(10);
  assert.equal(manager.listDownloads(owner.id).find((item) => item.id === task.id)?.status, "saving");
  assert.deepEqual(fs.readFileSync(task.filePath), body);
  await manager.removeDownload(owner.id, task.id);
  assert.deepEqual(fs.readFileSync(task.filePath), body);
  assert.equal(fs.readdirSync(task.folderPath).some((name) => name.endsWith(".part")), false);
  assert.equal(manager.listDownloads(owner.id).some((item) => item.id === task.id), false);
}
async function removeRunning(setMode) {
  setMode("slow");
  const task = manager.startDownload(owner, { ...request, modelName: "remove-running" });
  await delay(500); await manager.removeDownload(owner.id, task.id);
  assert.equal(fs.existsSync(task.folderPath), false);
  assert.equal(manager.listDownloads(owner.id).some((item) => item.id === task.id), false);
  await delay(250);
  assert.equal(fs.existsSync(task.filePath), false);
  const failed = manager.startDownload(owner, { ...request, modelName: "retry-network" });
  await manager.cancelDownload(owner.id, failed.id);
  setMode("truncated"); await manager.retryDownload(owner.id, failed.id);
  assert.equal((await finished(failed.id)).status, "failed");
  setMode("model"); await manager.retryDownload(owner.id, failed.id);
  assert.equal((await finished(failed.id)).status, "completed");
}
async function categoriesAndLogos(original, setMode) {
  setMode("model");
  const custom = await finished(manager.startDownload(owner, { ...request, modelName: "Custom", category: "Styles", previewUrl: "", logoDataUrl: "data:image/png;base64," + logo.toString("base64") }).id);
  assert.equal(custom.status, "completed", "custom: " + custom.error);
  assert.equal(path.basename(path.dirname(custom.folderPath)), "Styles");
  assert.equal(targets.downloadTarget(request).categories.includes("Styles"), true);
  const noLogo = await finished(manager.startDownload(owner, { ...request, modelName: "No logo", previewUrl: "" }).id);
  assert.equal(noLogo.status, "completed", "noLogo: " + noLogo.error);
  assert.equal(fs.existsSync(path.join(noLogo.folderPath, "logo.png")), false);
  setMode("bad-logo");
  const warning = await finished(manager.startDownload(owner, { ...request, modelName: "Bad logo" }).id);
  assert.equal(warning.status, "completed", "warning: " + warning.error); assert.equal(warning.logoWarning, true);
  const originalDialog = dialog.showOpenDialog;
  const imagePath = path.join(root, "replacement.png"); fs.writeFileSync(imagePath, logo);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imagePath] });
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try { assert.equal(await manager.changeLogo(win.webContents, original.folderPath), path.join(original.folderPath, "logo.png")); }
  finally { dialog.showOpenDialog = originalDialog; win.destroy(); }
  assert.equal(targets.resolveRoot(paths, { modelType: "Checkpoint", baseModel: "Anima" }), path.join(root, "diffusion_models", "Anima"));
  assert.equal(targets.resolveRoot(paths, { modelType: "TextualInversion", baseModel: "SD1" }), path.join(root, "embeddings"));
  const outside = path.join(root, "outside"); fs.mkdirSync(outside);
  const junction = path.join(root, "loras", "Escape"); fs.symlinkSync(outside, junction, "junction");
  assert.throws(() => targets.modelFolder(path.join(root, "loras"), "Escape", "model"), /invalid/);
  paths = { ...paths, searchPath: "", lorasPath: path.join(root, "specific") };
  assert.equal(targets.downloadTarget(request).rootPath, paths.lorasPath);
  assert.throws(() => targets.downloadTarget({ modelType: "TextualInversion", baseModel: "SD1" }), /configuration/);
  smoke.check("Categories, custom/failed covers, replacement, roots and junction rejection", true);
}
app.whenReady().then(async () => {
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await checks(server); smoke.finish({ app, ok: true }); }
  catch (error) { console.error("FAIL native downloads:", error.message); smoke.finish({ app, ok: false }); }
  finally { server.close(); userData.readUserData = originalRead; /* Isolated fixtures remain in OS temp for failure inspection. */ }
}).catch((error) => { console.error(error.message); smoke.finish({ app, ok: false }); });
