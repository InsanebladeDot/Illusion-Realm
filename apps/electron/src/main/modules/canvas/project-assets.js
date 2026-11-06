// 工程资产只写入已确认归属的目录；默认复制，明确选择移动才移除原视频。
// 归属标记像储物柜钥匙，同名文件夹只有标记匹配才可继续使用，否则新建独立目录。
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { constants } = require("node:fs");
const { EXTENSIONS } = require("./project-validation");
// 目录契约示例：画布“短片”首次导入视频会创建 user/短片/video。
// 同一工程之后导入图片使用同归属下的 Picture。
// 导入音频使用同归属下的 Audio，大小写按约定保留。
// 这些路径是资产目录，不是把每类文件放进另一份用户设置 JSON。
// 项目标题与根目录分开，默认 user 根来自现有路径服务。
// 不依赖 process.cwd，开发启动和打包后都能遵循同一用户根规则。
// 已配置的账户文档路径不由画布重新解释成任意资产目录。
// 初次名称冲突则创建带身份后缀的安全目录。
// 现有同名普通文件夹没有标记时不会被占用。
// 用户把工程改名后，下一份导入仍写原 folder。
// 这避免每次重命名都移动大视频并改写所有历史引用。
// 若用户删除 .canvas-owner，后续写入会明确失败。
// 不会因为找不到标记就默认该目录可供当前画布接管。
// 若用户只删某个媒体文件，预览报缺失但其他资产仍可正常读取。
// 若用户删除整个项目目录，新的导入不会悄悄重建并吞掉错误。
// 当前没有节点删除后自动清理资产的 GC。
// 这保护撤销、剪贴板与旧草稿可能仍需要的内容。
// 因此长期使用可能留下无引用副本，实施记录应说明容量边界。
// 工程导出不打包这些孤儿文件，只按当前节点引用收集。
// 项目包重新导入会创建新归属，旧目录保持不变。
// 这是用户可安全继续使用的独立副本，不是原目录的快捷方式。
// 外部来源默认保留；移动视频须等完整副本落盘后才尝试移除来源。
// 安全文件名保留原扩展，协议层可选择正确 MIME。
// 图片内容与节点文字保留各自身份，不按文件名推断提示词。
// 音频文件没有伪造波形副本，当前只保留原媒体正文。
// 视频没有自动转码副本，编码兼容问题仍由播放器准确提示。
const DIRECTORIES = { image: "Picture", video: "video", audio: "Audio" };

// 标题不是文件系统路径；Windows 保留名称、尾部点和特殊字符统一替换。
// 用户随后改标题只改显示名，已分配目录保持稳定，不制造失效引用。
/** @param {string} name */
// 用户标题像展签，不是系统文件路径。
// 替换非法字符保留可辨认的名称主体。
// 先去尾部点空格，避免 Windows 静默改名。
// trim 后可能变空，所以仍需要 Canvas 回落。
// 截到七十字符，为冲突后缀与资产名预留空间。
// CON、NUL 等是 Windows 设备名，不能原样当目录。
// 设备名即便带扩展也拒绝，CON.txt 仍有特殊语义。
// 大小写不能绕过设备名判断。
// 这里返回的是目录建议名，不是用户看到的新标题。
// 重命名作品只改文档，已经保存的目录不会同步搬家。
// 不因标题包含中文就转拼音，正常 Unicode 可以保留。
// 不把标题内容用进 shell 命令，因此没有命令拼接步骤。
function safeName(name) {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 70);
  return !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(clean) ? "Canvas" : clean;
}

// root 只由主进程路径规则或测试夹具传入，渲染层不能指定任意资产根目录。
// 已有目录不被本函数清空；归属不符直接报错，不能悄悄接管别人的文件夹。
/** @param {string} root @param {import('@illusion-realm/shared').CanvasImportMediaRequest} request */
// root 来自现有用户数据默认路径的父目录。
// 渲染层只能传归属描述，不能另选资产根。
// mkdir root 的 recursive 只补既有根路径，不清理历史内容。
// 已有 workspace 使用 folder 定位已有目录。
// 目录若是符号链接就拒绝，避免被引向受管根之外。
// 归属文件的内容必须精确等于 workspace.id。
// 缺少标记不接管，宁可报错也不写进用户同名普通文件夹。
// 读取标记失败属于整批失败，不能回落成继续引用外部原文件。
// 已验证归属直接返回，不扫描其他工程来猜同名关系。
// 首次导入用随机 UUID 建立归属，与卡片 ID 分开。
// 目录首次尝试用安全化后的画布名。
// mkdir 不递归创建该项目目录，同名存在会明确产生冲突。
// 冲突只处理 EEXIST，权限或磁盘错误不能伪装成名字冲突。
// 同名存在时附加随机身份片段，不覆盖原目录。
// 极少数后缀仍碰撞的情况直接失败，不无界循环尝试。
// 新目录的 .canvas-owner 用 wx 写入，旧标记不可覆盖。
// 标记不是用户作品正文，不进入便携工程包。
// 返回 id 与实际 folder，之后的复制使用实际分配名。
// 因此显示名相同的两份工程仍有不同资产归属。
// 纯文字工程在第一次导入前不需要提前分配空目录。
async function allocateWorkspace(root, request) {
  await fs.mkdir(root, { recursive: true });
  if (request.workspace) {
    const directory = path.join(root, request.workspace.folder);
    if ((await fs.lstat(directory)).isSymbolicLink() || await fs.readFile(path.join(directory, ".canvas-owner"), "utf8") !== request.workspace.id) throw new Error("canvas-workspace-unavailable");
    return request.workspace;
  }
  const id = randomUUID();
  const name = safeName(request.name);
  let folder = name;
  try { await fs.mkdir(path.join(root, folder)); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    folder = `${name}-${id.slice(0, 8)}`;
    await fs.mkdir(path.join(root, folder));
  }
  await fs.writeFile(path.join(root, folder, ".canvas-owner"), id, { flag: "wx" });
  return { id, folder };
}

// 大文件使用内核异步复制，不经 IPC 传媒体正文，也不把整份视频读进内存。
// 目标总有随机身份，重名不会覆盖；复制失败的残片由本函数清理。
/** @param {string} directory @param {NonNullable<import('@illusion-realm/shared').UserDataInfiniteCanvas['nodes'][number]['data']['media']>} media */
// 原文件只作为来源读取，剪切节点也不会剪切磁盘文件。
// 后缀从 media.name 读取，统一转小写与允许集比较。
// 真正源地址必须是绝对路径，不能依赖主进程当前工作目录。
// realpath 取得实际源文件，文件快捷方式不被当作媒体正文复制。
// stat 确认它是普通文件而非目录。
// 大小取源文件 stat，不信任浏览器登记的旧数字。
// 目标类别目录由 kind 决定，不能由用户提供任意相对目录。
// Picture 的大写按约定保留，不在不同调用处变成 picture。
// 类别目录第一次使用才创建，不强制为纯视频建空音频目录。
// 类别目录若被换成符号链接就拒绝此次文件。
// 目标基本名包含完整随机 UUID，重名素材不会相互覆盖。
// 安全化原名只用于辅助识别，用户显示原名仍在 media.name。
// 后缀保留实际类别后缀，便于 localfile 协议返回适当 MIME。
// copyFile 使用异步系统复制，不把媒体正文放进 IPC 或 React。
// COPYFILE_EXCL 要求目标不存在，避免异常同名破坏其他资产。
// 复制失败会尝试清掉本项残片，不删除同批已成功素材。
// 错误向上统一成固定原因，源文件完整路径不写入 UI 消息。
// 返回新对象而不是修改调用方 media，旧历史引用仍保持原样。
// 新对象中的 path 指向受管副本，移动外部原文件不破坏这张卡。
// 受管目录本身若被用户手动删除，卡片仍会显示可重试错误。
// 普通导入不先计算全文哈希，避免为了看首帧多扫描整个视频。
// 同一来源再次导入会有新副本，当前没有全局内容去重仓库。
// 重名不等于重复内容，不能用基本名合并用户的不同版本。
// 节点复制则只复用受管文件地址，不触发这次磁盘复制。
// 删除节点不立即回收文件，因为撤销栈可能仍引用它。
// 工程导出只收集当前图引用，不会把目录里所有历史素材都装箱。
async function copyAsset(directory, media) {
  const extension = path.extname(media.name).slice(1).toLowerCase();
  const allowed = EXTENSIONS[media.kind];
  if (!allowed.includes(extension) || !path.isAbsolute(media.path)) throw new Error("canvas-invalid-media");
  const source = await fs.realpath(media.path);
  const info = await fs.stat(source);
  if (!info.isFile()) throw new Error("canvas-invalid-media");
  const targetDirectory = path.join(directory, DIRECTORIES[media.kind]);
  await fs.mkdir(targetDirectory, { recursive: true });
  if ((await fs.lstat(targetDirectory)).isSymbolicLink()) throw new Error("canvas-invalid-directory");
  const target = path.join(targetDirectory, `${randomUUID()}-${safeName(path.basename(media.name, path.extname(media.name)))}.${extension}`);
  try { await fs.copyFile(source, target, constants.COPYFILE_EXCL); }
  catch { await fs.rm(target, { force: true }); throw new Error("canvas-copy-failed"); }
  return { ...media, path: target, size: info.size };
}

// 移动像搬家先搬完再退租：新家没有完整文件时，绝不删除旧家文件。
// 复用 copyAsset 的后缀、普通文件、归属目录和不覆盖检查，不另开文件写入入口。
// 不把整个视频装进内存；copyFile 交给系统，跨盘也遵循相同顺序。
// 返回前完成 unlink，来源删除失败就撤掉本次副本并报失败，不假称已移动。
// 回滚只针对刚创建的随机目标，不动旧节点引用的文件或其他批次成功项。
// 源是链接时拒绝移动，避免 realpath 解析后误删链接指向的实际媒体。
// 来源在复制期间被替换时不能删除替代文件，先比较文件身份、大小与修改时间。
// 这能拦住常见的并行编辑；不是对其他程序的独占锁，极端竞争仍须用户避免。
// 已受管素材可能被撤销栈和另一节点引用，移动它会破坏工程，所以只允许复制。
// 检查来源祖先的归属标记，不因来源位于另一工程或另一盘就绕过这项保护。
// 图片和音频不走此函数，批次“移动”只针对确认框明确说明的视频。
/** @param {string} directory @param {Parameters<typeof copyAsset>[1]} media */
async function moveAsset(directory, media) {
  // 先用 lstat 看用户给出的入口，而不是先 realpath 后失去链接身份。
  // 符号链接本身即使指向合法视频也不是本次允许剪切的普通源文件。
  // 目录、设备和其他非普通文件在任何目标创建之前拒绝。
  // copyAsset 会再检查实际解析后的来源，不能把本次预检当作永久文件锁。
  // 两次检查之间来源可能变化，复制后的身份对照是另一个独立保护。
  // 这里不按文件名相同推断同一个文件，因为不同目录可有同名不同内容。
  // 原媒体的 size 只是浏览器快照，身份比较采用主进程刚读取的 stat。
  // dev 与 ino 组合描述磁盘上的对象，路径相同但对象被替换不能直接 unlink。
  // size 与 mtime 补充内容改动检测，防止复制期间常见的外部保存覆盖。
  // 不为每次搬运计算全视频哈希，避免将大文件额外读两遍。
  // 这不是内容校验和协议，时间戳被伪造的极端并发修改不在完整性承诺内。
  // 目标存在完整副本后才开始来源核对，所以目标写失败不会先损坏来源。
  // unlink 成功才返回 media，渲染层收到结果意味着真实移动已结束。
  // unlink 失败不能降级显示“移动成功但原件保留”，那会违背模式的含义。
  // 回滚失败仍按异常上报，可能遗留目标副本，但不会清空原工程来掩盖错误。
  // 刚创建的 target 带随机身份，不可能凭原文件名删除另一次导入的资产。
  // 已有节点的删除与本函数无关，图节点 Delete 仍不删除磁盘文件。
  // 新视频移动完成后的撤销仅撤回节点，不再次执行反向文件迁移。
  // 因而用户必须在确认前理解原位置消失，不能靠图层撤销代替文件备份。
  // 混合批次逐项执行，前一个视频已移动后下一个失败，不擅自把前一个搬回去。
  // 结果通过 media/rejected 精确区分已完成与被拒绝，不是全批磁盘事务。
  // 主进程只向 UI 返回基本名与新引用，不把文件系统异常堆栈塞进提示。
  // 主进程自己的错误边界仍由已注册的 handler 承担，没有另建裸 IPC。
  const before = await fs.lstat(media.path);
  if (!before.isFile() || await isManagedSource(media.path)) throw new Error("canvas-move-source-unavailable");
  const copied = await copyAsset(directory, media);
  try {
    const after = await fs.lstat(media.path);
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("canvas-source-changed");
    await fs.unlink(media.path);
  } catch {
    await fs.rm(copied.path, { force: true });
    throw new Error("canvas-move-failed");
  }
  return copied;
}

// 归属标记属于文件夹，不属于单张卡；从来源目录向上查到盘根即可识别已有资产。
// 不扫描兄弟目录，也不计算视频哈希，因此检查成本只与目录层级有关。
// 先 realpath 父目录，避免通过链接目录导入来绕过已有工程保护。
// 标记存在就保守拒绝移动，不需要把标记正文或用户路径传回渲染层。
// ENOENT 表示本层无标记；权限等其他错误向上传递，不能当成“无归属”。
// 盘根的父目录等于自己，明确结束循环，不靠人为深度截断漏掉祖先。
// 此检查只保护移动；普通复制已有素材依旧可用，不破坏历史调用。
/** @param {string} source */
async function isManagedSource(source) {
  // 举例：user/工程A/video/a.mp4 往上会命中工程A/.canvas-owner。
  // 它即使作为工程B的来源出现，也只能复制，不能搬走工程A仍引用的正文。
  // 来源目录嵌套得更深仍会命中相同祖先，不靠固定“向上两层”猜路径。
  // 普通下载目录没有归属标记，检查会到盘根后正常结束。
  // 使用 lstat 探测标记是否存在，不需要读取任何其他工程的作品 JSON。
  // 即便标记内容损坏，也按已有归属保守保护，不趁损坏时允许剪切。
  // 来源权限不足时不能把 EACCES 当 ENOENT，否则可能绕过保护继续删除。
  // 相对 source 不会被用来扫描任意当前目录，copyAsset 仍要求绝对地址。
  // realpath 在本函数只解析目录链，不把源正文链接偷偷视为普通文件。
  // 没有向 renderer 暴露这个目录检查作为任意文件系统浏览能力。
  // 开发与打包都依赖同一资产服务，检查不使用启动命令的当前工作目录。
  // 默认复制也不依赖这个探测成功，用户可通过复制继续引用已有受管视频。
  let directory = await fs.realpath(path.dirname(source));
  for (;;) {
    try { await fs.lstat(path.join(directory, ".canvas-owner")); return true; }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

// 每项独立失败，同批有效文件仍可进入工程；反馈只回基本名，不暴露系统目录。
// 目录归属失败属于整批失败，不能回落原路径伪装成资产已进入工程。
/** @param {string} root @param {import('@illusion-realm/shared').CanvasImportMediaRequest} request */
// 目录归属先检查，失败时不逐项猜测其他目录继续写。
// 同一批成功与失败分开登记，错误文件不会撤销其他真实复制。
// media 数组只放已完成复制的结果。
// rejected 只回基本名，完整系统路径不进入批量提示。
// 顺序处理避免二百个大视频同时竞争磁盘与文件句柄。
// 这不是并行解码队列，预览加载由节点自己的媒体元素负责。
// 所有文件都失败时仍返回归属，界面保留既有作品并显示拒绝项。
// 不回传虚构的成功数量，界面按返回的实际 media 计算。
// 此函数不创建节点，节点身份仍由渲染编辑事务产生。
// 它也不保存用户 JSON，文件复制与草稿确认是不同步骤。
// 页面离开后已复制文件不擅自删除，避免与迟到保存发生竞争。
// 导入没有自动上传能力，网络状态不会改变本地复制规则。
async function importAssets(root, request) {
  const workspace = await allocateWorkspace(root, request);
  const media = [];
  const rejected = [];
  for (const file of request.files) {
    // 模式缺省永远复制，显式 move 也只迁移视频，其他类型仍保留原文件。
    // 每项完成才登记新地址；被拒绝的移动不会在图上留下一个失效来源。
    // 同批部分成功保留，拒绝项回基本名，由现有反馈明确列出。
    try { media.push(await (request.mode === "move" && file.kind === "video" ? moveAsset : copyAsset)(path.join(root, workspace.folder), file)); }
    catch { rejected.push(file.name); }
  }
  return { workspace, media, rejected };
}
module.exports = { allocateWorkspace, copyAsset, importAssets, DIRECTORIES };
