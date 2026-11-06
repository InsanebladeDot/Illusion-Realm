/**
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * model-download-paths：模型下载目标路径由下载域的路径规则决定。
 * model-download-validation：下载与分类操作继续使用主进程的参数校验。
 * model-download-manager：下载管理器继续持有队列和运行任务的生命周期。
 * model-download-network：复用下载专用会话和网络传输约束。
 * secret：Civitai 凭据由其业务域的密钥模块提供。
 * scanner：使用本地模型扫描器发现目录里的实际模型文件。
 * model-category-manager：模型分类变更由 models 域统一协调。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * model-download-paths：模型类型和相对分类位置仍经过校验后才拼接目标位置。
 * model-download-validation：路径、模型类型和业务参数的接受范围不随目录命名变化。
 * model-download-manager：页面销毁或切换不应重新创建管理器实例。
 * model-download-network：下载连接策略属于主进程，页面不自行读取 Cookie 或认证头。
 * secret：模型下载授权与 Agent 服务商密钥是两个独立边界。
 * scanner：分类目录和文件名来自扫描结果，不以界面上的显示名称代替路径。
 * model-category-manager：分类操作需要同时保持磁盘文件和扫描结果一致。
 * user-data：读文档时的路径解析继续委托统一根目录，不能改成模块旁的文件。
 * model-download-paths：分类迁移不能把下载文件改写到应用源码目录。
 * model-download-validation：验证失败要在网络或文件写入之前返回，不能依赖页面阻止非法请求。
 */
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
// 下载队列现在写入Electron userData；专项必须使用临时目录隔离真实下载历史。
// 在加载manager之前设置路径，生产持久化实现不需要测试专用目录参数。
// 模型目录与密钥目录仍保留各自夹具，测试结束不会触碰用户真实下载任务。
app.setPath("userData", path.join(root, "browser"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, "secrets");
const userData = require("../apps/electron/src/main/storage/user-data");
const originalRead = userData.readUserData;
let paths = { searchPath: root, lorasPath: "", checkpointPath: "", diffusionModelsPath: "" };
userData.readUserData = () => ({ data: { settings: { paths } }, filePath: "", isNew: false });
const targets = require("../apps/electron/src/main/modules/models/downloads/model-download-paths");
const { validateDownload, validateLocation } = require("../apps/electron/src/main/modules/models/downloads/model-download-validation");
const manager = require("../apps/electron/src/main/modules/models/downloads/model-download-manager");
const { getDownloadSession } = require("../apps/electron/src/main/modules/models/downloads/model-download-network");
const credential = require("../apps/electron/src/main/modules/civitai/secret");
const { scanModelsInDirectory } = require("../apps/electron/src/main/modules/models/scanner");
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
  // 单条失败记录在没有新增任务时就必须能移除，不能等待下载中心下一次刷新。
  // 分别验证仍有断点和目录已不存在的情况；清理已不存在的文件应视为完成。
  // 临时目录属于本轮测试，不删除用户真实模型或修改用户下载队列。
  await removeFailedTask(setMode, false);
  await removeFailedTask(setMode, true);
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
  const { moveCategory } = require("../apps/electron/src/main/modules/models/model-category-manager");
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

/**
 * 真实断连会留下本任务的 .part，再通过生产 removeDownload 删除。
 * 第二个用例先移走目录，模拟用户或外部清理器已经清除了下载现场。
 * 移走而不递归删除，既保留失败现场，也避免测试本身删除未知文件。
 * 任务请求和根目录配置保持原样，所以这不是“路径配置失效”的测试。
 * 移除前不启动新任务，防止下一次下载重建目录后掩盖原问题。
 * 成功要同时体现在内存列表、持久化清单和 removed 事件上。
 * 用实际文件系统检查断点消失，不把前端把行隐藏当作清理成功。
 * 目录存在的正例与缺失的负例共用同一网络异常，差异只在目录状态。
 * 完整模型从未提交，不能把删除完成记录的分支当作本次修复依据。
 * 失败保留 .part 的策略不变，用户点 X 以前仍可选择断点续传。
 * 外部移走的目录不属于原位置的删除授权，不能追踪并删除它。
 * 不设置时间延迟等待新任务，removeDownload 返回时就应完成持久化。
 * owner 仍使用当前正式窗口身份，不绕过主进程拥有者校验。
 * 磁盘 JSON 由生产管理器写入，测试只读取判断是否还有原任务编号。
 * 两次移除共用一个 id 的 false 结果也需要成立，避免重复清理未知目录。
 * @param {(mode:string)=>void} setMode 控制隔离 HTTP 服务的返回方式。
 * @param {boolean} missing 是否在点击 X 之前让原目录不存在。
 */
async function removeFailedTask(setMode, missing) {
  // truncated 在传输首块后断开，区别于服务器回 HTML 时立即丢弃无效内容。
  // failed 是已结束的任务，不需要再消耗一个下载槽位才能请求移除。
  // received 不是删除授权依据，生产清理仍按原目录与 .part 文件名限制执行。
  // readdir 确认确实有断点，防止正例在没有资源可删的情况下空通过。
  // 缺失分支使用 rename 使原路径消失，而不是伪造 existsSync 结果。
  // 外移目录仍在同一测试根下，进程失败时可供检查实际断点内容。
  // 不修改生产文件归属 Map，因此清理仍按真实下载任务登记的资源执行。
  // 原路径不存在意味着清理已经没有对象，任务删除不应依赖重新 mkdir。
  // readFile 的目标是 Electron 临时 userData，绝不读取用户自己的下载历史。
  // remove 返回后马上读 JSON，能发现仅入队异步持久化却提前返回的实现。
  // 列表和 JSON 分开断言，避免只移除 Map 而下次启动又恢复旧条目。
  // 第二次 remove 应返回 false，因为第一次已完成，并非因为 owner 被切换。
  // 没有修改服务器模式再新建成功任务，测试不会替失败条目重建目标目录。
  // assert.rejects 不用于这个正例，任何 io 异常都应该使整轮真实失败。
  // 原任务 id 由生产 randomUUID 生成，测试不借用其他任务的文件位置。
  // 这个用例同时保护可重试失败的原行为：在点击移除之前 .part 必须保留。
  setMode("truncated");
  const task = await finished(manager.startDownload(owner, { ...request, modelName: "remove-failed-" + missing }).id);
  assert.equal(task.status, "failed");
  assert.equal(task.error, "network");
  assert.equal(fs.readdirSync(task.folderPath).some(name => name.endsWith(".part")), true);
  if (missing) fs.renameSync(task.folderPath, task.folderPath + "-external");
  assert.equal(await manager.removeDownload(owner.id, task.id), true);
  assert.equal(manager.listDownloads(owner.id).some(item => item.id === task.id), false);
  assert.equal(fs.existsSync(task.folderPath), false);
  const queue = JSON.parse(fs.readFileSync(path.join(root, "browser/model-download-queue.json"), "utf8"));
  assert.equal(queue.jobs.some(job => job.task.id === task.id), false);
  if (missing) assert.equal(fs.existsSync(task.folderPath + "-external"), true);
  assert.equal(await manager.removeDownload(owner.id, task.id), false);
  smoke.check("Failed download is removed without a new task; missing folder=" + missing, true);
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
