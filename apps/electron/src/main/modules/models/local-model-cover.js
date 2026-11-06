/**
 * 核验扫描器实际选中的封面：必须是可解码图片，不能仅凭文件名声称完成。
 * 图片读取最多 20 MiB，文件链接及越界路径不作为可用封面。
 * 不写入现有图片；下载与原子保存仍复用模型下载器。
 * 有效自定义 JPG/WebP 等封面也满足 logo 要求，保持原有封面命名习惯。
 * 同目录多个模型版本共用封面，但来源资料仍由各文件 sidecar 独立验证。
 * 批量依次检查，图片缓冲只存活于当前调用，不缓存整库封面字节。
 * 返回 false 不能被解释为模型在 C 站不存在，只说明当前封面不可用。
 * 下载失败、原文件损坏和远程没有预览分别由事务层给出可操作的原因。
 * 此检查不会读模型权重，因此已有完整资料和封面的版本可直接跳过哈希。
 */
const fs = require("node:fs/promises");
// 采用 Electron 原生解码器，与现有 logo 保存器处理同一组可展示格式。
// 不另引图片解析库，也不在 renderer 暴露任意文件读取能力。
// findIconInDir 只决定哪张图将被展示，这里的解码才决定它是否可用。
const { nativeImage } = require("electron");
const { findIconInDir } = require("./scanner");
const MAX_COVER_BYTES = 20 * 1024 * 1024;
// 20 MiB 与现有 remoteLogo 下载上限一致，避免本地验证接受下载器拒绝的超大图。
// 这个上限作用于压缩文件大小；解码像素还会单独受 40MP 判据限制。
// 缺少有效封面只代表本项尚未完成，不触发删除、重命名或自动覆盖。
/**
 * 使用同一扫描器选图规则，防止检查的图片与页面实际加载的图片不同。
 * 比如损坏的 logo.png 会优先遮掉其他 JPG，不能看到 JPG 就视为完成。
 * 只接受实际文件，不跟随用户放进目录的封面符号链接。
 * 检查句柄大小后按上限分配，不能对未知长度文件直接 readFile。
 * 返回 false 是缺失、损坏、不可读取或超过图片资源上限，不删除任何文件。
 * nativeImage 只负责本地解码，不执行图像推理，也不向外发送图片。
 * @param {string} folder 已授权模型的真实目录。
 */
async function hasLocalModelCover(folder) {
  // 模型目录通常只有几张封面候选，复用扫描器优先顺序可避免缓存不一致。
  // 不使用前端传入的 iconPath，用户可能在扫描后手动更换了目录图片。
  // 真实模型目录由调用者完成授权，本函数不扩大文件系统访问范围。
  const file = findIconInDir(folder);
  // 没有候选图片时不打开文件、不分配 Buffer，整个检查直接返回 false。
  // 字符串空值也作为不存在处理，兼容扫描器在目录不可读时的回退。
  // 后续恢复器可以因此尝试保存预览，不误判为已有 logo。
  if (!file) return false;
  let handle;
  // handle 在成功打开后才有所有权，finally 使用可选调用处理早期失败。
  // 每次调用独立打开并关闭，批量循环不保留上一个目录的图片句柄。
  // 不缓存解码结果，下一轮手动换图后能立即获得真实判定。
  try {
    // 最终组件是符号链接时拒绝，避免通过封面间接读取配置根之外的文件。
    // realpath 相等检查还能发现上级目录的链接变化。
    // lstat/realpath 的任何失败都归入 false，不把用户路径写入异常提示。
    if ((await fs.lstat(file)).isSymbolicLink() || await fs.realpath(file) !== file) return false;
    handle = await fs.open(file, "r");
    // 从打开的句柄读取 stat，使大小上限作用于实际将读取的文件。
    // 目录、空文件和超出上限文件都不能通过“存在”这一弱条件完成补全。
    // 失败保留原文件，后续 UI 会提示下载或解码未完成。
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size || stat.size > MAX_COVER_BYTES) return false;
    const bytes = Buffer.alloc(stat.size), { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    // 缓冲大小最多 20 MiB，不按未知 Content-Length 或模型权重大小分配。
    // 实际读取量与预期不同可能是外部截断或短读，宁可标记未完成。
    // 不将未填满缓冲中的零字节拼进一张看似正常的图片。
    if (bytesRead !== stat.size) return false;
    const image = nativeImage.createFromBuffer(bytes), { width, height } = image.getSize();
    // nativeImage.isEmpty 可以识别只有 .png 后缀但实际不是图片的占位文件。
    // 宽高必须为正，0×0 不能满足用户要求的可展示 logo。
    // 与保存器相同的 40MP 判据避免将异常巨大位图计为有效封面。
    return !image.isEmpty() && width > 0 && height > 0 && width * height <= 40000000;
  // 底层错误通常包含真实文件路径，返回布尔值而不跨 IPC 传播系统异常。
  // 无写权限、占用和解码失败都只改变完成判定，不改变已有图片内容。
  // 调用方将下载失败与没有远程预览分开解释，不在这里伪造模型不存在。
  } catch { return false; }
  finally { await handle?.close().catch(() => undefined); }
}
// 只向主进程事务导出可用性检查，不向页面返回图片字节或实际封面路径。
// 实际展示仍走本项目已有的图片读取桥接，维持进程边界。
// 单个补全和批量补全共同使用此函数，避免二者完成标准漂移。
module.exports = { hasLocalModelCover };
