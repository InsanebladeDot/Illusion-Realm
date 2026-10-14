/** Own download jobs in the main process; emit revisioned snapshots and clean only job-owned temporary files. */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { dialog, BrowserWindow } = require("electron");
const { IPC_CHANNELS } = require("../ipcChannels");
const { findIconInDir } = require("../modelScanner");
const { resolve: resolveCivitaiKey } = require("../civitai-secret");
const { downloadTarget, modelFolder, validateLocalFolder } = require("./model-download-paths");
const { fetchDownload, writeModel, saveLogo, remoteLogo } = require("./model-download-transfer");
const { downloadFetch } = require("./model-download-network");
const { resumeValidator } = require("./model-download-resume");
const { checkFolder, fileIdentity, deleteArtifacts } = require("./model-download-files");
const { assertFolderUnlocked } = require("./model-folder-locks");
/** @typedef {import("@illusion-realm/shared").ModelDownloadRequest} Request */
/** @typedef {import("@illusion-realm/shared").ModelDownloadTask} Task */
/** @typedef {{task:Task, request:Request, owner:Electron.WebContents, controller:AbortController, lastEmit:number, sampleTime:number, sampleBytes:number, temporary:string, realFolder:string, validator:string, owned:Map<string,string>, running:Promise<void>|null, removing:boolean}} Job */
/** @type {Map<string, Job>} */
const jobs = new Map();
/** @param {Job} job @param {Partial<Task>} patch */
function update(job, patch) {
  if (job.removing && patch.status !== "removed") return;
  Object.assign(job.task, patch, { revision: job.task.revision + 1 });
  if (!job.owner.isDestroyed()) job.owner.send(IPC_CHANNELS.MODELS_DOWNLOAD_PROGRESS, { ...job.task });
}
/** @param {unknown} error @returns {import("@illusion-realm/shared").ModelDownloadError} */
function errorCode(error) {
  if (error instanceof Error && ["configuration", "invalid", "exists", "network", "auth", "redirect", "timeout", "response", "integrity", "io"].includes(error.message)) return /** @type {import("@illusion-realm/shared").ModelDownloadError} */ (error.message);
  if (error && typeof error === "object" && "code" in error) return error.code === "EEXIST" ? "exists" : "io";
  return "network";
}
/** @param {Job} job @param {Request} request */
async function downloadLogo(job, request) {
  if (!request.logoDataUrl && (!request.previewUrl || findIconInDir(job.task.folderPath))) return;
  const controller = new AbortController();
  const stop = () => controller.abort();
  job.controller.signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 30000);
  try {
    const bytes = request.logoDataUrl ? Buffer.from(request.logoDataUrl.split(",")[1], "base64") : await remoteLogo(request.previewUrl, controller);
    job.controller.signal.throwIfAborted();
    // A download may create a cover, but must not replace a cover belonging to another local model.
    if (fs.existsSync(path.join(job.task.folderPath, "logo.png"))) return;
    const file = await saveLogo(job.task.folderPath, bytes, false);
    job.owned.set(file, fileIdentity(file));
  } catch { job.task.logoWarning = true; }
  finally { clearTimeout(timer); controller.abort(); job.controller.signal.removeEventListener("abort", stop); }
}
/** @param {Job} job */
async function openResponse(job) {
  checkFolder(job.task.folderPath, job.realFolder);
  if (fs.existsSync(job.temporary)) fileIdentity(job.temporary);
  const offset = fs.existsSync(job.temporary) ? fs.statSync(job.temporary).size : 0;
  // Without a content hash or HTTP validator, restarting is safer than combining potentially different files.
  const resume = offset > 0 && Boolean(job.request.sha256 || job.validator);
  const headers = resume ? { Range: `bytes=${offset}-`, ...(job.validator ? { "If-Range": job.validator } : {}) } : {};
  const timer = setTimeout(() => job.controller.abort(new Error("timeout")), 90000);
  try {
    const response = await fetchDownload(job.request.downloadUrl, job.controller.signal, resolveCivitaiKey().key, downloadFetch, headers);
    job.validator = resumeValidator(response);
    return { response, offset: resume ? offset : 0 };
  } finally { clearTimeout(timer); }
}
/** @param {Job} job @param {number} received @param {number} total */
function progress(job, received, total) {
  const now = Date.now(), elapsed = now - job.sampleTime;
  Object.assign(job.task, { received, total });
  if (received < job.sampleBytes) { job.sampleBytes = received; job.sampleTime = now; }
  else if (elapsed >= 500) {
    job.task.bytesPerSecond = Math.max(0, (received - job.sampleBytes) * 1000 / elapsed);
    job.sampleBytes = received; job.sampleTime = now;
  }
  if (now - job.lastEmit > 250) { job.lastEmit = now; update(job, {}); }
}
/** @param {Job} job @param {Request} request @param {string} temporary */
async function transfer(job, request, temporary) {
  const { response, offset } = await openResponse(job);
  await writeModel(response, temporary, request.sha256, job.controller, (received, total) => progress(job, received, total), offset);
  job.controller.signal.throwIfAborted();
  checkFolder(job.task.folderPath, job.realFolder);
  // Commit without replacing an existing file, even when another download races us.
  await fs.promises.link(temporary, job.task.filePath);
  job.owned.set(job.task.filePath, fileIdentity(job.task.filePath));
  update(job, { status: "saving" });
  await downloadLogo(job, request);
  job.controller.signal.throwIfAborted();
  update(job, { status: "completed", bytesPerSecond: 0 });
}
/** @param {Job} job @param {Request} request */
async function run(job, request) {
  const temporary = job.temporary;
  try { await transfer(job, request, temporary); }
  catch (error) {
    const cancelled = job.controller.signal.aborted && job.controller.signal.reason?.name === "AbortError";
    const failure = job.controller.signal.aborted ? job.controller.signal.reason : error;
    const code = errorCode(failure);
    if (!cancelled && ["integrity", "response", "auth", "redirect", "invalid"].includes(code)) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      job.task.received = 0; job.validator = "";
    }
    update(job, { status: cancelled ? "cancelled" : "failed", error: cancelled ? null : code, bytesPerSecond: 0 });
  }
  finally {
    job.controller.abort();
    if (job.task.status === "completed") await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
}
/** @param {Job} job */
function launch(job) {
  const onDestroyed = () => job.controller.abort();
  job.owner.once("destroyed", onDestroyed);
  job.running = run(job, job.request).finally(() => { job.owner.removeListener("destroyed", onDestroyed); job.running = null; }).catch(() => undefined);
}
/** @param {Electron.WebContents} owner @param {Request} request */
function startDownload(owner, request) {
  try {
    const active = [...jobs.values()].filter((job) => job.task.status === "downloading" || job.task.status === "saving");
    if (active.length >= 3) throw new Error("io");
    const root = downloadTarget(request).rootPath, folderPath = modelFolder(root, request.category, request.modelName);
    assertFolderUnlocked(folderPath);
    const filePath = path.join(folderPath, request.fileName);
    if (fs.existsSync(filePath) || active.some((job) => job.task.filePath.toLowerCase() === filePath.toLowerCase())) throw new Error("exists");
    const id = randomUUID();
    const job = { owner, request: { ...request }, controller: new AbortController(), lastEmit: 0, sampleTime: Date.now(), sampleBytes: 0,
      temporary: path.join(folderPath, ".download-" + id + ".part"), realFolder: fs.realpathSync(folderPath), validator: "", owned: new Map(), running: /** @type {Promise<void>|null} */ (null), removing: false,
      task: /** @type {Task} */ ({ id, fileName: request.fileName, modelName: request.modelName, status: "downloading", received: 0, total: 0, bytesPerSecond: 0, folderPath, filePath, logoWarning: false, error: null, revision: 0 }) };
    jobs.set(id, job);
    launch(job);
    return { ...job.task };
  } catch (error) { throw new Error(errorCode(error)); }
}
/** @param {number} ownerId */
function listDownloads(ownerId) { return [...jobs.values()].filter((job) => job.owner.id === ownerId).map((job) => ({ ...job.task })); }
/** @param {number} ownerId @param {string} id */
async function cancelDownload(ownerId, id) {
  const job = jobs.get(id);
  if (!job || job.owner.id !== ownerId || job.task.status !== "downloading") return false;
  job.controller.abort(); await job.running; return true;
}
/** @param {number} ownerId @param {string} id */
async function retryDownload(ownerId, id) {
  const job = jobs.get(id);
  if (!job || job.owner.id !== ownerId || job.removing) throw new Error("invalid");
  if (!["failed", "cancelled"].includes(job.task.status)) throw new Error("invalid");
  await job.running;
  if (job.removing || !["failed", "cancelled"].includes(job.task.status)) throw new Error("invalid");
  const active = [...jobs.values()].filter((item) => ["downloading", "saving"].includes(item.task.status));
  if (active.length >= 3) throw new Error("io");
  if (fs.existsSync(job.task.filePath) || active.some((item) => item.task.filePath.toLowerCase() === job.task.filePath.toLowerCase())) throw new Error("exists");
  checkFolder(job.task.folderPath, job.realFolder);
  job.controller = new AbortController(); job.sampleTime = Date.now(); job.sampleBytes = job.task.received;
  update(job, { status: "downloading", error: null, logoWarning: false, bytesPerSecond: 0 });
  launch(job);
  return { ...job.task };
}
/** @param {number} ownerId @param {string} id */
async function removeDownload(ownerId, id) {
  const job = jobs.get(id);
  if (!job || job.owner.id !== ownerId || job.removing) return false;
  job.removing = true; job.controller.abort();
  try {
    await job.running;
    // A verified, committed model is complete even while its optional cover is still saving.
    const committed = job.owned.has(job.task.filePath);
    if (job.task.status !== "completed") await deleteArtifacts(job.task.folderPath, job.realFolder, job.temporary, committed ? new Map() : job.owned);
    update(job, { status: "removed", error: null, bytesPerSecond: 0 });
    jobs.delete(id);
    return true;
  } catch { job.removing = false; update(job, { status: "failed", error: "io", bytesPerSecond: 0 }); throw new Error("io"); }
}
/** @param {Electron.WebContents} owner @param {string} folderPath */
async function changeLogo(owner, folderPath) {
  try {
    const folder = validateLocalFolder(folderPath);
    assertFolderUnlocked(folder);
    const parent = BrowserWindow.fromWebContents(owner);
    const options = { properties: /** @type {"openFile"[]} */ (["openFile"]), filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    if ((await fs.promises.stat(result.filePaths[0])).size > 20 * 1024 * 1024) throw new Error("invalid");
    validateLocalFolder(folderPath);
    assertFolderUnlocked(folder);
    return await saveLogo(folder, await fs.promises.readFile(result.filePaths[0]), true);
  } catch { throw new Error("io"); }
}
/** @param {string} folder */
function isModelFolderDownloading(folder) {
  const normalized = path.resolve(folder).toLowerCase();
  return [...jobs.values()].some((job) => ["downloading", "saving"].includes(job.task.status) && path.resolve(job.task.folderPath).toLowerCase() === normalized);
}
module.exports = { startDownload, listDownloads, cancelDownload, retryDownload, removeDownload, changeLogo, isModelFolderDownloading };
