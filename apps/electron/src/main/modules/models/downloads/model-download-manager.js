/**
 * 下载管理器通过 storage 读取配置，不要求页面处于打开状态。
 * Civitai 授权仍取自独立凭据模块，队列快照不新增保存明文令牌。
 * 文件下载与扫描继续共用 models 域的路径规则，避免重新启动后找不到原断点。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
/** Own download jobs in the main process; emit revisioned snapshots and clean only job-owned temporary files. */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { dialog, BrowserWindow } = require("electron");
const { IPC_CHANNELS } = require("../../../../common/ipc-channels");
const { resolve: resolveCivitaiKey } = require("../../civitai/secret");
const { downloadTarget, modelFolder, validateLocalFolder } = require("./model-download-paths");
const { fetchDownload, writeModel, saveLogo, remoteLogo } = require("./model-download-transfer");
const { downloadFetch } = require("./model-download-network");
const { resumeValidator } = require("./model-download-resume");
const { checkFolder, fileIdentity, deleteArtifacts } = require("./model-download-files");
const { assertFolderUnlocked } = require("../model-folder-locks");
const { saveDownloadMetadata } = require("./model-download-metadata");
/** 磁盘队列与恢复校正独立于网络传输，避免渲染层水合把断点覆盖。 */
/** 写入不保存owner/controller等进程对象，重新绑定时只重建运行时资源。 */
/** 任务清单沿用版本化格式，不向账户用户文档混入大型下载快照。 */
const { saveQueue, loadQueue } = require("./model-download-persistence");
const { authorizeResume, recoverRecord } = require("./model-download-recovery");
/** @typedef {import("@illusion-realm/shared").ModelDownloadRequest} Request */
/** @typedef {import("@illusion-realm/shared").ModelDownloadTask} Task */
/** @typedef {{task:Task, request:Request, owner:Electron.WebContents, controller:AbortController, lastEmit:number, sampleTime:number, sampleBytes:number, temporary:string, realFolder:string, validator:string, owned:Map<string,string>, running:Promise<void>|null, removing:boolean}} Job */
/** @type {Map<string, Job>} */
const jobs = new Map();
/** 恢复只允许一份并发读取；失败时保留rejected状态，防止空列表覆盖损坏队列。 */
/** 新的IPC请求都会先等待恢复，不能让新下载抢先覆盖旧任务清单。 */
/** 退出标记阻止收尾期间启动新传输，已完成任务仍然保留历史记录。 */
/** @type {Promise<void>|null} */ let restoring = null;
let shuttingDown = false;
/**
 * 序列化当前任务归属与状态；进度事件不逐帧落盘，模型断点从文件实际长度恢复。
 * 每次状态转换和收到服务器验证器时保存，避免高频复制自选封面的base64。
 * 保存失败由传输或IPC边界返回io；事件路径仅输出固定错误，不泄露路径。
 * removed在Map删除之前就过滤，不能在重启时复活已移除记录。
 * 持久化是主进程的唯一写点，渲染层只订阅revisioned任务快照。
 * 用户切换工具页面不会触发新的磁盘列表或创建一份重复下载队列。
 * 历史completed保留在同一个Map，满足完成记录也可继续查看的选择。
 * 任务移除先把状态设为removed，写入过滤即使发生在Map.delete之前也不会复活。
 * owned按文件身份保存，而不是只记一组稍后可被替换的文件名。
 * 原始owner不序列化，避免下次启动后错误地归属旧窗口。
 * 原始AbortController不序列化，因为已取消信号没有跨进程恢复意义。
 * lastEmit与sampleTime不序列化，新运行从实际文件长度重新开始速度采样。
 * validator在收到响应头时保存，未写任何字节也能保留原来源内容版本。
 * 保存发生在模型传输开始前，因此崩溃时至少能找到正在写哪个.part。
 * 模型文件的逐块写入与JSON状态写入分开，避免每250ms写入整份封面和来源描述。
 * 队列文件不包含最终跳转到CDN的地址，重试仍使用稳定的公开模型入口。
 * 元数据sidecar依旧由现有commitModel生成，本次不改变落盘图片或工作流格式。
 * 下载并发限制继续在start/retry中检查，恢复任务不自动占据运行槽位。
 * 事件发送可因窗口销毁而停止，但后台持久化不依赖事件是否成功发送。
 * 窗口销毁时仍会取消控制器，后续catch把该任务转换成保留断点的暂停态。
 * 这个保存入口也供正常退出收尾显式await，避免app.quit丢掉尚在排队的写入。
 * @returns {Promise<void>}
 */
function persistJobs() {
  return saveQueue([...jobs.values()].filter(job => job.task.status !== "removed").map(job => ({ task: { ...job.task }, request: job.request, temporary: job.temporary, realFolder: job.realFolder, validator: job.validator, owned: [...job.owned] })));
}
/**
 * 第一个正式窗口认领磁盘任务，不复用旧进程的WebContents编号。
 * 已有owner销毁后可由重建的主窗口重新绑定，活着的其它窗口不能抢任务。
 * 恢复时重建AbortController、采样时钟及Map，旧promise不具有跨进程意义。
 * 原先活跃任务由recoverRecord转为可继续状态，不自动突破三个并发限制。
 * 所有记录校正完后一次保存，再返回列表，使界面看到的状态与磁盘一致。
 * 恢复只执行一次完整磁盘读取，多次list/start复用同一个Promise。
 * 如果读取因为损坏或I/O失败而拒绝，后续请求不会自动改成空队列重试覆盖。
 * 正在运行的主窗口仍拥有自己的任务，另一个活着的窗口不能通过list抢占。
 * 只有旧owner已经销毁的记录才会在同一进程窗口重建时重新绑定。
 * 异步恢复期间不发起下载，所以不存在恢复到一半就占满并发槽位的情况。
 * recoverRecord逐项处理目录与断点，最终构造的job都具备完整运行期字段。
 * 新controller处于未取消状态，但status是cancelled或failed时不会自动launch。
 * 用户主动retry会再创建一次controller，避免复用某次失败或退出的中断信号。
 * 新Map的running为null，不能等待一个属于上次应用的不可恢复Promise。
 * 未完成任务以原id返回，列表可使用稳定key保留当前详情或控件关系。
 * 条目字节数被校正后保存一次，后续列表不反复重算和增加revision。
 * 空历史没有必要首次就创建空文件，减少仅浏览应用时的无意义写盘。
 * 启动新任务仍由现有路径解析器构建目录，不从UI传入任意路径。
 * 完成任务不自动重新扫描模型，渲染初始列表只恢复显示，新的完成事件才通知扫描。
 * 状态恢复不修改账户会话，不把一个任务的归属转换为另一个账号权限声明。
 * 应用正常退出不清空Map，下一次从磁盘恢复的内容与最后一份快照一致。
 * 这些保证针对本机下载任务，不声称支持多个不同客户端同时写同一份队列。
 * 旧版本没有清单的孤立.part缺少请求与内容版本，不能根据文件大小猜测安全续传。
 * 此限制保留旧资源而不误删，也不把无法验证来源的文件拼接进新任务。
 * 用户仍可以通过现有新下载入口获取模型，修复后任务会拥有可恢复的清单。
 * @param {Electron.WebContents} owner
 */
async function restoreDownloads(owner) {
  restoring ??= (async () => {
    const records = await loadQueue();
    for (const record of records) {
      const saved = await recoverRecord(record);
      if (!jobs.has(saved.task.id)) jobs.set(saved.task.id, { ...saved, owned: new Map(saved.owned), owner, controller: new AbortController(), lastEmit: 0, sampleTime: Date.now(), sampleBytes: saved.task.received, running: null, removing: false });
    }
    if (records.length) await persistJobs();
  })();
  await restoring;
  for (const job of jobs.values()) if (job.owner.isDestroyed()) job.owner = owner;
}
/**
 * 正常退出先中断网络，再等待文件句柄关闭和最终状态写入。
 * AbortError沿用手动暂停语义，保留.part供下次继续，不把退出当作完整文件错误。
 * 不清空jobs，completed和未完成记录均保存，满足重启后仍可查看任务的要求。
 * 传输Promise已内部处理网络错误，磁盘保存错误由退出入口单独报告。
 * @returns {Promise<void>}
 */
async function suspendDownloads() {
  shuttingDown = true;
  for (const job of jobs.values()) job.controller.abort();
  await Promise.all([...jobs.values()].map(job => job.running));
  if (jobs.size) await persistJobs();
}
/** @param {Job} job @param {Partial<Task>} patch */
function update(job, patch) {
  if (job.removing && patch.status !== "removed") return;
  Object.assign(job.task, patch, { revision: job.task.revision + 1 });
  // 状态变化立即排入持久化链，普通250ms进度通知只更新内存。
  // 断点字节数由恢复时stat重新读取，避免把事件节流误当成写入落盘边界。
  // 日志仅有模块与io错误，不打印用户路径、下载URL或认证信息。
  if (patch.status) void persistJobs().catch(() => console.error({ level: "error", module: "model-downloads", message: "queue persistence failed", code: "io" }));
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
  if (!request.logoDataUrl && !request.previewUrl) return;
  const controller = new AbortController();
  const stop = () => controller.abort();
  job.controller.signal.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, 30000);
  try {
    const bytes = request.logoDataUrl ? Buffer.from(request.logoDataUrl.split(",")[1], "base64") : await remoteLogo(request.previewUrl, controller);
    job.controller.signal.throwIfAborted();
    // 同一模型目录的下一次下载也采用本次选中的预览图；无图时保留已有封面。
    const file = await saveLogo(job.task.folderPath, bytes, true);
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
    // 首块数据写入前确保ETag/Last-Modified已保存，退出后仍可安全发送If-Range。
    // 不持久化response或重定向CDN地址，重新打开时使用公开来源和当前密钥。
    // 保存失败主动取消响应，不能继续积累下次无法定位的孤立断点文件。
    try { await persistJobs(); } catch { await response.body?.cancel(); throw new Error("io"); }
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
/** 来源快照先落盘，再提交模型；失败时只回滚本任务创建的快照，旧文件不受影响。 @param {Job} job */
async function commitModel(job) {
  checkFolder(job.task.folderPath, job.realFolder);
  const metadata = await saveDownloadMetadata(job.task.filePath, job.request);
  const identity = fileIdentity(metadata);
  job.owned.set(metadata, identity);
  try {
    job.controller.signal.throwIfAborted();
    checkFolder(job.task.folderPath, job.realFolder);
    await fs.promises.link(job.temporary, job.task.filePath);
    job.owned.set(job.task.filePath, fileIdentity(job.task.filePath));
  } catch (error) {
    checkFolder(job.task.folderPath, job.realFolder);
    if (fs.existsSync(metadata) && fileIdentity(metadata) === identity) await fs.promises.unlink(metadata);
    job.owned.delete(metadata);
    throw error;
  }
}
/** @param {Job} job @param {Request} request @param {string} temporary */
async function transfer(job, request, temporary) {
  const { response, offset } = await openResponse(job);
  await writeModel(response, temporary, request.sha256, job.controller, (received, total) => progress(job, received, total), offset);
  job.controller.signal.throwIfAborted();
  checkFolder(job.task.folderPath, job.realFolder);
  await commitModel(job);
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
  // 首次落盘必须先于网络传输，突然退出也至少保留任务身份与临时文件位置。
  // 写入失败走同一个failed/io事件，不能静默开始一个无法恢复的下载。
  // finally仍负责解绑当前owner事件，避免重试多次积累监听器。
  job.running = persistJobs().then(() => run(job, job.request)).catch(() => update(job, { status: "failed", error: "io", bytesPerSecond: 0 })).finally(() => { job.owner.removeListener("destroyed", onDestroyed); job.running = null; }).catch(() => undefined);
}
/** @param {Electron.WebContents} owner @param {Request} request */
function startDownload(owner, request) {
  try {
    // 退出等待落盘期间拒绝创建新任务，避免最后一份快照后再次开始写模型。
    // 这不是并发队列调度变化，原有最多三个同时下载的限制保持不变。
    // 新任务只有在正常工作阶段才可以获取文件路径和启动资源。
    if (shuttingDown) throw new Error("io");
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
  // 继续必须重新验证保存路径仍属于当前配置，不能把磁盘快照当作任意写入授权。
  // 对原realpath的校验还能拒绝重启期间被替换的junction或模型目录。
  // 已进入退出阶段的任务只保留断点，不重新打开网络或文件句柄。
  if (!job || job.owner.id !== ownerId || job.removing || shuttingDown) throw new Error("invalid");
  authorizeResume(job.request, job.task.folderPath, job.realFolder);
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
    // 未完成记录清理前重检配置根目录；完成记录只从队列移除，绝不删除模型。
    // 重启恢复的owned保留文件身份约束，无关或已被用户替换的文件继续受到保护。
    // 原目录已不存在时只移除记录，不能再要求它通过“仍存在”的续传校验。
    // 像清掉已搬空货架的领货单，没有货架不该阻止注销单据。
    // 否则首次清理或外部移走目录后，会一直 failed/io，直到新下载重建目录。
    // 此分支不创建目录、不追踪外部移动位置，也不扫描其它目录寻找文件。
    // 只有当前原位置确实有目录，才重新授权并清理属于本任务的资源。
    // 现存目录仍检查配置、realpath 与文件身份，不能因修复而放宽文件删除权限。
    // 缺失目录没有文件删除动作，配置变动也不会因此触碰新模型根目录。
    // 完成记录依旧只移除任务，不把已经提交的成品或封面作为垃圾删除。
    // 重复移除在任务 Map 找不到编号时返回 false，不会重建或误删同名目录。
    // 之后仍等待原持久化写入，不能把列表消失等同于记录已跨重启删除。
    if (job.task.status !== "completed" && fs.existsSync(job.task.folderPath)) {
      authorizeResume(job.request, job.task.folderPath, job.realFolder);
      await deleteArtifacts(job.task.folderPath, job.realFolder, job.temporary, committed ? new Map() : job.owned);
    }
    update(job, { status: "removed", error: null, bytesPerSecond: 0 });
    jobs.delete(id);
    // 移除操作等待队列写入完成后才回复成功，重启不会从旧快照复活任务。
    // 文件清理已完成时写入失败仍返回io，让界面不会误报持久化成功。
    // 重试保存只会减少记录，不重新触碰已完成的模型文件。
    await persistJobs();
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
module.exports = { restoreDownloads, suspendDownloads, startDownload, listDownloads, cancelDownload, retryDownload, removeDownload, changeLogo, isModelFolderDownloading };
