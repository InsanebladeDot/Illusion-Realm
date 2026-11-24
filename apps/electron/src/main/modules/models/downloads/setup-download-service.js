/** 手动指南的一键入口只补缺项；已有同名文件必须通过 SHA256，不能直接当作已安装。 */
const fs = require("node:fs/promises"), path = require("node:path");
const { setupAsset, setupRequest } = require("./setup-download-catalog");
const { setupFolder } = require("./setup-download-paths");
const { alreadyPresent } = require("./setup-download-files");
const { listDownloads, startDownload, retryDownload } = require("./model-download-manager");
const pendingOwners = new Set();

/** 只接受内置编号，调用者不能指定任意URL、SHA256或系统路径。 @param {unknown[]} args */
function validateSetupArgs(args) {
  const ids = args[0];
  return args.length === 1 && Array.isArray(ids) && ids.length > 0 && ids.length <= require("@illusion-realm/shared/src/data/setup-downloads.json").files.length && new Set(ids).size === ids.length && ids.every(id => typeof id === "string" && setupAsset(id)) ? null : "invalid";
}

/** 已在同一窗口队列的任务沿用编号；失败或暂停项从原断点继续，不新建重复行。
 * @param {Electron.WebContents} owner @param {import('@illusion-realm/shared').SetupDownloadId} id
 * @returns {Promise<import('@illusion-realm/shared').SetupDownloadItem>} */
async function addAsset(owner, id) {
  try {
    if (owner.isDestroyed()) throw new Error("io");
    const request = setupRequest(id), file = path.join(setupFolder(id), request.fileName);
    const task = listDownloads(owner.id).find(item => item.filePath.toLowerCase() === file.toLowerCase() && item.status !== "completed");
    if (task) return { id, status: "existing", task: ["failed", "cancelled"].includes(task.status) ? await retryDownload(owner.id, task.id) : task, error: null };
    if (await alreadyPresent(file, request.sha256)) {
      if (path.join(setupFolder(id), request.fileName) !== file) throw new Error("configuration");
      return { id, status: "present", task: null, error: null };
    }
    // 旧来源记录也不能覆盖；在大文件下载前发现冲突，避免白下载几GB。
    try { await fs.lstat(file + ".civitai.json"); throw new Error("exists"); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    if (owner.isDestroyed()) throw new Error("io");
    return { id, status: "added", task: startDownload(owner, request), error: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "io";
    const code = ["configuration", "invalid", "exists"].includes(reason) ? reason : "io";
    return { id, status: "failed", task: null, error: /** @type {import('@illusion-realm/shared').ModelDownloadError} */ (code) };
  }
}

/** 一个窗口一次处理一批，取消按钮由已有下载中心接管，关闭清单不会丢下载任务。
 * @param {Electron.WebContents} owner @param {import('@illusion-realm/shared').SetupDownloadId[]} ids */
async function downloadSetup(owner, ids) {
  if (pendingOwners.has(owner.id)) throw new Error("io");
  pendingOwners.add(owner.id);
  try {
    const items = [];
    for (const id of ids) items.push(await addAsset(owner, id));
    return { items };
  } finally { pendingOwners.delete(owner.id); }
}

module.exports = { downloadSetup, validateSetupArgs };
