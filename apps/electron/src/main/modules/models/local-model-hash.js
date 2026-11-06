/**
 * 对已经授权的模型增量计算 SHA-256，不把 GB 级模型装入 Buffer。
 * 打开句柄覆盖整个识别事务，使网络请求后的复核仍能检查同一个文件。
 * 返回的 release 由调用者放进 finally；本模块不查询网络或写模型。
 */
const fs = require("node:fs/promises");
// SHA-256 使用 Node 内置实现，不额外引入模型解析或加密依赖。
// 与 PowerShell Get-FileHash 相同，输入是磁盘字节而非文件路径字符串。
const { createHash } = require("node:crypto");
/**
 * 同时检查内容修改与路径替换；只比较 size 会漏掉等长覆盖。
 * ctime 用于发现读取过程中改写后又恢复 mtime 的情况。
 * inode/dev 用于发现同路径被替换，最终的 realpath 授权仍由服务层负责。
 * @param {import('node:fs').Stats} a 初次打开时的文件状态。
 * @param {import('node:fs').Stats} b 读取后或提交前的文件状态。
 */
function unchanged(a, b) {
  // b.isFile 排除外部替换成目录等特殊文件的情况。
  // size 是完整性条件，不能单独证明内容未发生变化。
  // mtime/ctime 的组合用于检测普通写入及元数据更改。
  // dev/ino 与路径 stat 组合检查文件身份，不比较文件名。
  // 文件系统时间戳有精度限制，这不是对恶意并发改写的完整快照保证。
  return b.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino && a.dev === b.dev;
}
/**
 * 固定 1 MiB 缓冲逐块读取，哈希不依赖扩展名、文件名或模型格式。
 * await read 会让出事件循环，避免同步读取卡住窗口与其他 IPC。
 * signal 同时限制本地读取时间；每块之间检查终止状态。
 * 限定初始长度可避免外部程序不断追加文件导致任务永不结束。
 * 不接受空文件，避免把未下载完成的占位文件送去反查。
 * 返回摘要统一小写，远程比较也采用大小写无关的十六进制。
 * @param {string} filePath 服务层已经检查真实路径的模型文件。
 * @param {AbortSignal} signal 整体识别操作的超时信号。
 */
async function openModelHash(filePath, signal) {
  // 授权与读取分离，方便来源读取和摘要计算共享同一权限策略。
  // 只以 r 打开，异常或用户取消不会截断文件。
  // 不把输入路径写入错误消息，服务层会将系统错误收敛为稳定原因。
  const handle = await fs.open(filePath, "r");
  try {
    // 固定分配一次缓冲，后续块只使用视图而不复制整段内容。
    // hash.update 在下一次 read 之前消费当前字节，缓冲可安全复用。
    // before 来自打开的句柄，避免路径状态与文件身份在读取前不一致。
    const before = await handle.stat(), hash = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
    // 下载临时空文件没有可识别的模型内容；拒绝它可避免无意义联网。
    // 这项检查不试图验证模型内部格式，摘要识别不需要解析权重。
    // 扩展名权限已经由外层 authorizedModel 检查。
    if (!before.isFile() || !before.size) throw new Error("invalid");
    // 读取长度取初始 size，外部追加不会把循环边界无限向后推。
    // 实际读取位置由 offset 指定，不依赖共享文件句柄的隐式游标。
    // 遇到短读仍按 bytesRead 递进，不能假定每次读满整个缓冲。
    for (let offset = 0; offset < before.size;) {
      // 取消在块边界生效，避免一次性处理完整个大型模型才响应超时。
      // 正在进行的单次磁盘 read 不强制中止，以便安全释放文件句柄。
      // 最大等待粒度对应固定大小块，内存使用不随文件长度增长。
      if (signal.aborted) throw new Error("timeout");
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      // 初始 size 之前遇到 EOF 表示被截断，不能拿残缺摘要继续查询。
      // subarray 排除最后一块未填充的旧缓冲内容。
      // 只有实际读到的字节进入 SHA-256，算法与 Get-FileHash 一致。
      if (!bytesRead) throw new Error("changed");
      hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
    }
    // 网络期间模型可能变化，所以这里与提交前各检查一次。
    // 句柄状态验证写入；路径状态验证替换与删除。
    // 任何变化都要求重新识别，不能将旧摘要关联到新文件。
    const verify = async () => {
      // handle.stat 检查原文件的当前状态，fs.stat 检查该路径当前指向。
      // 路径删除等系统异常同样会阻止外层提交，不伪装成匹配成功。
      // 每次 verify 都重新读取，不能复用哈希刚结束时的旧检查结果。
      if (!unchanged(before, await handle.stat()) || !unchanged(before, await fs.stat(filePath))) throw new Error("changed");
    };
    // 先证明本次读取期间文件稳定，再把句柄所有权交给事务服务。
    // digest 只能取一次，返回字符串避免调用方继续修改内部 hash 状态。
    // release 的调用责任随返回值转移，调用方必须在 finally 收尾。
    await verify();
    return { sha256: hash.digest("hex"), verify, release: () => handle.close() };
  // 尚未返回时句柄仍属于本函数，错误不能留下打开的模型文件。
  // 错误原样交给服务内部收敛，不从这里直接穿过 IPC。
  // 成功路径不在此关闭，因为提交前 verify 还需要原文件句柄。
  } catch (error) { await handle.close(); throw error; }
}
// 只导出事务需要的能力，不把文件状态或缓冲暴露给渲染进程。
// 与测试共用真实实现，避免另写只适用于小文件的摘要工具。
// 本模块可以独立验证，不依赖 Electron 窗口生命周期。
module.exports = { openModelHash };
