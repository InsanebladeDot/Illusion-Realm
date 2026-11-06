/**
 * 重启后的断点校正：依据磁盘实际字节恢复进度，不把旧内存计数当作写入成功。
 * 恢复只检查已有文件，不创建目录、不访问网络，也不自动并发重启所有任务。
 * 未完成任务回到已有 cancelled 状态，界面使用原有继续按钮恢复同一个任务。
 * 完成记录继续保留；模型已提交但封面未完成时，不重复下载已验证模型。
 * 恢复失败保留任务并显示错误，不能因为外接盘暂时不可用就把任务从队列删除。
 */
const fs = require("fs/promises"), path = require("path");
const { checkFolder, fileIdentity } = require("./model-download-files");
const { downloadTarget, isInside } = require("./model-download-paths");
/** @typedef {import("./model-download-persistence").SavedDownload} SavedDownload */
/**
 * 继续和清理前重新验证当前配置根目录，磁盘快照不是任意文件操作的授权。
 * 模型布局固定为 root/category/model，目标必须恰好处于这两层子目录中。
 * 不能仅比较字符串前缀，否则 Root-other 也可能被当作 Root 内部目录。
 * checkFolder 还验证原 realpath，目录被换成 junction 或被移动后必须拒绝写入。
 * 未更改配置的合法断点保持原路径，不重新创建一个新目录来隐藏旧文件。
 * 配置失效返回 configuration，旧任务仍可保留供用户恢复路径后继续。
 * @param {SavedDownload["request"]} request @param {string} folder @param {string} realFolder
 */
function authorizeResume(request, folder, realFolder) {
  const root = downloadTarget(request).rootPath;
  if (!isInside(root, folder) || path.dirname(path.dirname(folder)) !== path.resolve(root)) throw new Error("configuration");
  checkFolder(folder, realFolder);
}
/**
 * 磁盘缺失与其它I/O失败分开处理，不能把权限错误假装成零字节文件。
 * fileIdentity 负责拒绝符号链接与非普通文件，stat只读取经过验证的文件。
 * 返回空表示文件确实不存在，任务可以在恢复后从头下载同一个目标。
 * 这里不删除任何文件，错误交给校正入口转为可见的失败状态。
 * @param {string} file
 */
async function inspectFile(file) {
  try { const identity = fileIdentity(file); return { identity, size: (await fs.stat(file)).size }; }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null; throw error; }
}
/**
 * 新任务对象与原快照分离，读取过程不会修改尚未确认的磁盘记录。
 * revision 增加一次，使渲染层按既有新旧事件规则接收恢复后的状态。
 * 传输速度必须清零；上次退出前的采样时钟不能跨进程沿用。
 * 只有普通断点文件的实际大小才是有效 received，旧快照可能晚于或早于最后写入。
 * HTTP验证器保留，让继续请求能够发送Range与If-Range。
 * 若断点文件已经不存在，清空验证器，后续按完整文件重新开始。
 * 最终文件与临时文件身份相同，说明原无覆盖hard-link提交已成功。
 * 或最终文件身份匹配owned记录，也足以确认任务已提交。
 * 这覆盖退出发生在提交模型与保存封面之间的窗口，不能再尝试覆盖成品。
 * 成品确认后只移除同身份断点链接，不删除模型或其它来源文件。
 * 可选封面尚未完成时保留logoWarning，模型完成与封面成功分开表达。
 * 发现其它已存在目标不能直接宣称完成，保持failed/exists防止误认无关文件。
 * 从未完成任务恢复为cancelled，使已有继续/移除控件无需新增状态分支。
 * 已失败或手动暂停的任务保持原状态与错误，不自动消耗网络流量。
 * 配置或目录异常保留记录，用户恢复原目录后仍能通过原任务重试。
 * 没有尝试扫描并认领升级前的孤立.part，缺失下载URL时不能安全猜测来源。
 * 恢复状态的对应关系：
 * completed表示历史传输已经完成，文件后续被用户移动不应使历史记录消失。
 * downloading没有跨进程存活的请求，必须转换成用户可以主动继续的状态。
 * saving可能已经提交模型，只是可选封面还未完成，需要先确认成品身份。
 * failed和cancelled都可以通过同一个重试入口重新校验目标再传输。
 * removed在读取层已经过滤，这里不会重新创建删除中的任务。
 * received取.part实际长度，total保持已知服务器总长，未知总长仍为零。
 * 不把未知total强行设成received，否则未完成任务看上去会已达百分之百。
 * 恢复revision只负责同一任务的UI新旧合并，不作为HTTP内容版本验证器。
 * HTTP内容是否变化仍由原ETag、Last-Modified或完整SHA-256判断。
 * 当服务器忽略Range时，既有writeModel会按200响应重新从零写，避免重复拼接。
 * 当服务器回206时，既有responseRange会验证offset与完整Content-Range边界。
 * 这些传输保护不会因为恢复了本地队列而绕过。
 * 文件身份的对应关系：
 * fileIdentity包含设备、inode、创建时间、大小与修改时间，不只比较路径文本。
 * 原模型提交用hard-link，成品与.part的身份相同可证明两者指向同一已提交文件。
 * 普通无关目标即使长度相同也不能当作本任务完成。
 * owned身份匹配覆盖临时链接已经删除但成品还存在的情况。
 * 仅在确定成品归属后才允许去掉临时链接，模型本身必须继续保留。
 * 恢复函数没有递归删除操作，目录缺失也不会改成清理父目录。
 * 如果目录换成符号链接，checkFolder拒绝，后续不读取该链接指向的数据。
 * 如果原配置换了根路径，authorizeResume先失败，不能把旧任务偷偷迁移到新位置。
 * 用户恢复原路径后，失败任务仍可从原任务编号再次执行重试。
 * 异常与用户可见状态：
 * 权限或普通I/O异常统一显示io，不把底层堆栈或磁盘路径带进任务error。
 * 配置根不匹配显示configuration，帮助区分无法定位目录与网络下载失败。
 * 已有其它最终文件显示exists，保留原文件而不是执行覆盖。
 * 没有.part时仍保留任务请求，继续可从头下载；这与整条记录丢失不同。
 * 错误不抛出并中止整个列表，单条目录不可用不能吞掉其它可恢复任务。
 * 外层仍会原子保存校正结果，使下一次列表与重启读到同样的状态。
 * 任务是否恢复完成由调用方逐条await，没有后台未完成的文件检查逃逸到UI之后。
 * @param {SavedDownload} record @returns {Promise<SavedDownload>}
 */
async function recoverRecord(record) {
  const task = { ...record.task, revision: record.task.revision + 1, bytesPerSecond: 0 }, next = { ...record, task };
  if (task.status === "completed") return next;
  try {
    authorizeResume(record.request, task.folderPath, record.realFolder);
    const partial = await inspectFile(record.temporary), final = await inspectFile(task.filePath);
    task.received = partial?.size || 0; if (!partial) next.validator = "";
    if (final && (record.owned.some(([file, identity]) => file === task.filePath && identity === final.identity) || partial?.identity === final.identity)) {
      task.status = "completed"; task.received = final.size; task.total = final.size; task.error = null; task.logoWarning = true;
      if (partial?.identity === final.identity) await fs.unlink(record.temporary);
    } else if (final) { task.status = "failed"; task.error = "exists"; }
    else if (["downloading", "saving"].includes(task.status)) { task.status = "cancelled"; task.error = null; }
  } catch (error) { task.status = "failed"; task.error = error instanceof Error && error.message === "configuration" ? "configuration" : "io"; }
  return next;
}
module.exports = { authorizeResume, recoverRecord };
