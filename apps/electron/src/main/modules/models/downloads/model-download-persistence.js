/**
 * 下载队列的版本化磁盘快照，保存任务与续传定位信息，不保存 Electron 对象。
 * 临时模型文件仍留在原模型目录，队列只记录其稳定任务编号和服务器验证器。
 * 写入使用异步串行链与同目录原子替换，进度和退出收尾不能互相覆盖。
 * 网络凭据仍由现有密钥服务提供，队列只保留公开的格式选择参数。
 * 这个文件独立于渲染层用户文档，避免 Zustand 回填覆盖主进程下载状态。
 * 版本号用于拒绝未知格式，不能把不可识别的记录当作空队列写回。
 * 缺失文件表示首次使用；损坏文件应显式失败并保留现场，不静默清空历史。
 * 所有读写路径由 app.getPath 确定，测试通过隔离 Electron userData 目录复用生产实现。
 */
const fs = require("fs/promises"), path = require("path");
const { app } = require("electron");
const { validateDownload } = require("./model-download-validation");
/**
 * request 是可重新发起下载的公开请求，不含 Authorization 或临时 CDN 重定向。
 * task 保存用户可见状态，temporary 保存与 id 对应的 .part 文件位置。
 * realFolder 与 owned 保留既有文件归属检查，恢复后删除仍不得清理无关资源。
 * validator 是强 ETag 或 Last-Modified，续传时作为 If-Range 发送。
 * owner、AbortController、Promise 与采样时钟只能在新进程重新创建。
 * owned 使用二元数组存储，读取后再恢复 Map，JSON 不直接序列化 Map。
 * @typedef {{task:import("@illusion-realm/shared").ModelDownloadTask,request:import("@illusion-realm/shared").ModelDownloadRequest,temporary:string,realFolder:string,validator:string,owned:[string,string][]}} SavedDownload
 */
/** @type {Promise<void>} */ let pending = Promise.resolve();
const queueFile = () => path.join(app.getPath("userData"), "model-download-queue.json");
/**
 * URL 只保留公开的 type/format/size/fp，主动丢弃 token、key 或签名查询参数。
 * 重试时重新通过密钥服务注入当前凭据，不能依赖旧下载 URL 中的过期凭据。
 * 预览图同样丢弃查询参数；不持久化 CDN 的临时签名链接。
 * 自选封面是用户公开图片内容，可以随任务保存，不是账户凭据。
 * 克隆请求后再改 URL，不改变正在执行任务所使用的内存请求。
 * 源描述与训练词继续保存，重启后提交模型仍能生成完整来源 sidecar。
 * @param {SavedDownload["request"]} request
 */
function publicRequest(request) {
  const url = new URL(request.downloadUrl), query = new URLSearchParams();
  for (const key of ["type", "format", "size", "fp"]) { const value = url.searchParams.get(key); if (value) query.set(key, value); }
  url.search = query.toString(); url.hash = "";
  const preview = request.previewUrl ? new URL(request.previewUrl) : null; if (preview) { preview.search = ""; preview.hash = ""; }
  return { ...request, downloadUrl: url.href, previewUrl: preview?.href || "" };
}
/**
 * 快照在入队时序列化，不在异步写入时才读取可变任务对象。
 * 因此较早的进度不会在较晚状态落盘后再反向覆盖它。
 * 同目录临时文件通过 rename 替换，进程在写 JSON 中途退出不会留下半截正式文件。
 * 临时文件使用独占创建与随机后缀，不借用模型目录中的下载 .part。
 * 文件句柄在 finally 关闭，写完后 sync 再 rename，使正常退出能等待真实写入完成。
 * 串行链的错误恢复只允许下一次重试继续，当前调用的错误仍交给调用者处理。
 * 失败日志不能携带文件路径或请求内容，由上层输出固定模块错误。
 * 检查点的顺序约定：
 * 调用方在第一次网络请求前等待本函数，队列写入失败不能产生无法定位的新断点。
 * 服务器响应头到达后再次等待本函数，把强ETag或Last-Modified先于文件内容保存。
 * 下载进度的每个字节不需要再写JSON，因为.part自身就是已收到字节的持久化载体。
 * 暂停、失败、完成和移除触发后续快照，保留用户明确操作后的最终状态。
 * 正常关闭等待这些写入链结束，系统强杀只能恢复最后一份完整检查点。
 * 每次JSON字符串在调用时完成，因此后续task修改不能改变已经排队的内容。
 * 序列化也克隆task和公开请求，owned数组由manager先转换，不会包含可变Map。
 * 串行链按调用顺序提交，后来的完成状态必然在较早的下载中状态后写入。
 * 链首catch只为后续写入解除旧拒绝状态，不会把当前write返回值改成成功。
 * 上层既可以显式await捕获，也可以在事件路径记录固定io错误。
 * 这两个消费方式共享同一写入顺序，不需要页面额外维护保存版本。
 * 文件提交的约定：
 * 正式文件和.tmp处于同一目录，rename不跨卷，避免复制期间正式快照半新半旧。
 * 随机临时名避免不同进程或旧崩溃临时文件与本次写入同名。
 * wx拒绝覆盖已经存在的临时目标，不把未知文件当作可复用中转。
 * 父目录创建使用recursive，但绝不递归删除该目录。
 * 文件写入权限限定为当前用户读写，Windows实际ACL仍由Electron用户目录继承。
 * writeFile完成只保证数据提交给句柄，sync进一步等待文件内容刷入存储设备。
 * 关闭句柄先于rename，兼容Windows不允许重命名打开文件的行为。
 * finally仅删除本次生成的.tmp，不扫描并删除模型目录中的.part。
 * 若rename失败，原正式队列保持完整，下一次操作可以重新尝试提交。
 * 本实现不声称应对磁盘硬件完全故障，只保证正常文件系统上的原子替换语义。
 * 不会在失败后用空jobs回退写入，因为那会把暂时I/O错误变成永久历史丢失。
 * @param {SavedDownload[]} records
 */
function saveQueue(records) {
  const text = JSON.stringify({ version: 1, jobs: records.map(record => ({ ...record, request: publicRequest(record.request) })) }) + "\n";
  const write = pending.catch(() => undefined).then(async () => {
    const target = queueFile(), temporary = target + "." + require("crypto").randomUUID() + ".tmp";
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { const file = await fs.open(temporary, "wx", 0o600); try { await file.writeFile(text); await file.sync(); } finally { await file.close(); } await fs.rename(temporary, target); }
    finally { await fs.rm(temporary, { force: true }); }
  });
  pending = write; return write;
}
/**
 * 磁盘记录属于动态输入，不能仅靠 TypeScript 类型断言跳过格式检查。
 * 请求复用 IPC 的原生校验器，确保恢复后仍只允许已支持的模型下载地址。
 * 编号限定 UUID 形式，使临时文件名不能夹带目录穿越片段。
 * 任务名称必须与请求一致，防止恢复时把一个文件的断点用于另一个文件。
 * 文件与临时文件都必须是同一 folder 的直接子项，不能从快照指定任意删除目标。
 * 状态仅接受已有六态，字节数与 revision 都必须是非负安全整数。
 * owned 只允许模型、来源 sidecar 与封面三个已知目标，拒绝任意附加路径。
 * 真实目录、配置根目录及实际文件身份还会在恢复和继续时重新验证。
 * 本函数只检查 JSON 结构，不扫描目录、不读取模型字节、不发起网络请求。
 * 格式与删除边界：
 * 任务文件名由请求校验器确认无路径分隔符，随后拼接得到唯一最终目标。
 * temporary必须精确等于任务编号对应的隐藏.part，不能只检查后缀符合要求。
 * realFolder必须是绝对路径，后续checkFolder会比较当前实际realpath。
 * 任务速度不作为恢复依据，新进程会强制清零，避免保留旧运行速度。
 * error字段由恢复过程按实际磁盘状态更新，已完成任务不会重新执行网络动作。
 * removed读取时过滤，不把历史墓碑当作仍可继续的任务。
 * 旧记录没有运行期监听器，读取合法也不意味着已经开始传输。
 * 只有用户通过现有重试入口操作后才会打开文件和网络。
 * owned的身份字符串不直接授权删除，deleteArtifacts还会逐项比对当前文件身份。
 * 封面和来源sidecar可能已由用户修改，身份不符时必须保留。
 * 队列不包含IPC sender编号，避免跨进程复用恰好相同的WebContents数字。
 * 读取的请求依旧需要当前配置根目录授权，格式正确不等于路径仍然可写。
 * 公开下载地址只用于重新请求来源服务，不缓存带时效签名的最终重定向地址。
 * 请求参数白名单保留格式选择，续传仍指向原先选中的模型文件变体。
 * 修改API密钥后无需重写队列，恢复时会读取当前密钥服务结果。
 * 图片dataURL是可选请求内容，传输失败后的重试仍可保存用户所选封面。
 * 队列不会被渲染进程直接读取，页面只接收现有ModelDownloadTask快照。
 * 本地记录中的额外运行期字段不被序列化回公开任务之外的任意进程对象。
 * 版本验证发生在任何Map认领之前，错误格式不能部分恢复后再被保存覆盖。
 * 重复编号会破坏临时文件归属，因此整份记录拒绝，而不是保留最后出现的一条。
 * 这些校验不遍历模型目录，恢复成本主要取决于任务数量而不是模型文件体积。
 * @param {unknown} value @returns {value is SavedDownload}
 */
function isSavedDownload(value) {
  if (!value || typeof value !== "object") return false;
  const v = /** @type {SavedDownload} */ (value), t = v.task;
  if (validateDownload([v.request]) || !t || typeof t !== "object" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(t.id)) return false;
  if (t.fileName !== v.request.fileName || t.modelName !== v.request.modelName || !["downloading", "saving", "completed", "failed", "cancelled", "removed"].includes(t.status)) return false;
  if (![t.received, t.total, t.revision].every(n => Number.isSafeInteger(n) && n >= 0) || typeof t.logoWarning !== "boolean") return false;
  if (typeof t.folderPath !== "string" || !path.isAbsolute(t.folderPath) || t.filePath !== path.join(t.folderPath, t.fileName) || v.temporary !== path.join(t.folderPath, ".download-" + t.id + ".part") || typeof v.realFolder !== "string" || !path.isAbsolute(v.realFolder) || typeof v.validator !== "string" || v.validator.length > 4096) return false;
  return Array.isArray(v.owned) && v.owned.every(pair => Array.isArray(pair) && pair.length === 2 && [t.filePath, t.filePath + ".civitai.json", path.join(t.folderPath, "logo.png")].includes(pair[0]) && typeof pair[1] === "string");
}
/**
 * 读取前等待本进程已有写入，测试或窗口重新绑定不会读到写入中的旧快照。
 * ENOENT 是唯一允许回落空列表的错误，其余 I/O 或 JSON 错误显式报告 io。
 * 未知版本或任意非法条目使整份读取失败，避免下一次保存把未理解的任务擦除。
 * 重复任务编号也视为损坏，不能让后一个条目覆盖前一个文件归属。
 * removed 不应继续出现，兼容读取时过滤，不执行其文件删除动作。
 * 读取不修改原文件，恢复、正常退出或后续任务变化才会提交新快照。
 * 这能把队列损坏与真正没有下载记录区分开，方便保留文件后排查。
 * @returns {Promise<SavedDownload[]>}
 */
async function loadQueue() {
  await pending;
  try {
    const value = JSON.parse(await fs.readFile(queueFile(), "utf8"));
    if (value?.version !== 1 || !Array.isArray(value.jobs) || !value.jobs.every(isSavedDownload) || new Set(value.jobs.map((/** @type {SavedDownload} */ item) => item.task.id)).size !== value.jobs.length) throw new Error("io");
    return value.jobs.filter((/** @type {SavedDownload} */ item) => item.task.status !== "removed");
  } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []; throw new Error("io"); }
}
module.exports = { saveQueue, loadQueue };
