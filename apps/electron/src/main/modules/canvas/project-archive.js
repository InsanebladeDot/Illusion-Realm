// .ircanvas 是有版本的流式容器：固定魔数、清单字节数、UTF-8 JSON、按序排列的素材字节。
// 不执行归档中的命令，不接受绝对路径、解压符号链接或隐含目录。
// 像按装箱单顺序装货：只缓存清单，每份大视频按流搬运，不把整个工程放进内存。
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { document: validDocument, EXTENSIONS } = require("./project-validation");
const { allocateWorkspace, DIRECTORIES } = require("./project-assets");
// 格式示例：空图也有十二字节前缀和非空 JSON 清单。
// 前缀中的 01 是魔数字符的一部分，不能把它解释成可变文本版本。
// 清单中 version 数字才是读取器明确检查的格式版本。
// 长度字段固定 UInt32LE，因此单个清单理论长度也有整数上限。
// 实际再限制十六 MiB，比理论上限小得多。
// 这个上限只约束清单，不把大型素材正文错误截成十六 MiB。
// 正文没有分隔符，资产边界完全由装箱单的 size 决定。
// 例如两份资产分别十字节与二十字节，第二份从第一份末尾继续。
// 不能在资产之间写换行，否则恢复偏移会整体错一字节。
// 清单采用 UTF-8，一个汉字可能多字节，因此必须按 Buffer.length。
// 媒体 name 可以中文，包内随机文件名仍可保持简单且唯一。
// 魔数不含文件路径、工程名或系统用户标识。
// 包里没有可执行安装脚本或解包后自动运行步骤。
// 未知额外 JSON 字段不会被读取器当作系统指令。
// 素材按原始压缩格式字节保存，没有隐式转码。
// 因此导出工程不能解决浏览器本来不支持的编码。
// 包恢复后仍用 localfile 协议读取，而非构造远程下载地址。
// 哈希覆盖二进制素材，不包含节点 UI 临时加载文字。
// 媒体内容不变时哈希稳定，卡片改标题不改变素材摘要。
// 工程位置与节点关系仍在 JSON，媒体字节不承担图身份。
// 同一素材被重复使用时装一份，多张卡在文档保留多份引用。
// 这和把多个视频拼成一条输出不是同一功能。
// 清单中不保存渲染层函数，工程可以在没有 React 的主进程校验。
// 跨电脑打开后，新路径由新机器根目录与新归属组合。
// 原电脑 user 目录是否存在不影响包内正文恢复。
// 导出文件本身独立于草稿，但不自动出现在画布工程列表中。
// 便携能力不等于多工程管理，当前仍只有一份用户草稿。
// 清单的字段顺序由序列化结果决定，读取不依赖对象键顺序。
// 资产数组顺序则不可随意调整，因为它决定正文顺序。
// 未来若增加压缩或索引表，需要升级格式而非偷偷改变现有含义。
// 第一版不内嵌缩略图缓存，浏览器从真实媒体加载首帧。
// 播放器错误与重试次数不入包，另一台机器重新尝试实际解码。
// Windows 源地址可能含反斜杠，但包内路径始终使用正斜杠。
// 解包时用 path.join 转回本平台地址，不手写双反斜杠替换。
// 导出不扫描整个工程目录，避免历史孤儿资产和无关文件被外带。
// 只有当前文档节点的 media 引用参与收集。
// 这也避免把 .canvas-owner 目录标记装进便携文件。
// 归属 UUID 由打开时重新创建，不信任包内宣称的本机所有权。
// 完整性失败不尝试“尽量打开”，避免用户误以为缺失内容已经恢复。
// 错误保留在打开请求边界，当前界面作品继续存在。
const MAGIC = Buffer.from("IRCNVS01");
const MAX_HEADER = 16 * 1024 * 1024;

// SHA256 是包的完整性校验，随导出流读取；不在日常选择节点时扫描大文件。
// 同一路径在清单中只打包一次，多节点引用不重复拷贝相同素材。
/** @param {string} file */
// 摘要只用于工程交换的完整性，不作为模型识别或日常节点去重规则。
// 读取流按块交给哈希器，上一块处理完就可释放其内存。
// 空文件也有确定摘要，不能把空文件当作没有校验值。
// 返回六十四位小写十六进制，清单读取方使用同一种格式比较。
// 读不到文件时 Promise 拒绝，由导出或导入的上层错误边界负责恢复。
// 此函数不记录文件路径，读取错误不会通过调试输出泄露用户目录。
// 哈希不能证明文件适合浏览器解码，包完整与编码兼容是两项独立检查。
// 哈希也不是数字签名，只能检验内容和装箱单是否一致。
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

// 清单在正文之前，所以导出先算摘要，再在实际写包时核对一次。
// 若用户在打包期间改动视频，当前包失败，不产生下一次必然打不开的假成功文件。
/** @param {import('node:fs/promises').FileHandle} output @param {string} source @param {{ size: number; sha256: string }} expected */
// 装箱单像预先称好的货物，装车时还要核对实物没有被调换。
// expected 是准备阶段记录的大小和摘要，不接受正文自行声明的新值。
// bytes 累加本轮实际读取的块，防止文件在准备后变长或变短。
// 哈希覆盖真正送入输出的字节，不是再去读取另一份可能变化的来源。
// 等待每块写完形成背压，慢磁盘不会导致整个视频堆在内存里。
// 流读取失败会跳出循环，外层负责关闭归档并删除未完成临时包。
// 正文长度与摘要任一不符都拒绝本次导出，不把变化静默写进旧清单。
// 检测变化不修改源文件，用户可等外部编辑完成后再次导出。
async function appendAsset(output, source, expected) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(source)) {
    bytes += chunk.length; hash.update(chunk);
    await writeChunk(output, chunk);
  }
  if (bytes !== expected.size || hash.digest("hex") !== expected.sha256) throw new Error("canvas-source-changed");
}

// 复用同一归档句柄而不反复 pipeline 到同一 WriteStream，避免累积错误监听。
// 一次系统写入可能只接受部分字节，必须写完这一块才能读取下一块。
/** @param {import('node:fs/promises').FileHandle} output @param {Buffer} chunk */
// 文件句柄保持自己的顺序写入位置，不需要从清单相信一个外部偏移。
// offset 是当前块已经写出的长度，与包内素材偏移不是同一个概念。
// 系统调用允许短写，不能把成功返回误认为整块都已接收。
// 下一次只递交剩余部分，防止重复写入已完成的字节。
// 返回零字节必须报错，否则循环将永远没有进展。
// 输出句柄的释放由调用方负责，块函数不能在中途关闭整份包。
// 本函数的 Buffer 来自文件读取流或有限清单，不接收渲染层任意二进制。
// 写入出错直接传播，不在中间吞掉后继续拼接下一份媒体。
async function writeChunk(output, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await output.write(chunk, offset, chunk.length - offset);
    if (!bytesWritten) throw new Error("canvas-project-write-stalled");
    offset += bytesWritten;
  }
}

/** @param {import('@illusion-realm/shared').UserDataInfiniteCanvas} input */
// 工程交换使用序列化文档的副本，正在编辑的图不会被相对路径替换。
// workspace 是当前机器的储物柜身份，寄给另一台机器时必须摘掉。
// 包内地址像纸箱编号，不是原电脑的盘符；打开时重新分配本机位置。
// assets 是装箱单，sources 是本机取货地址，两者按相同顺序排列。
// sources 不进入清单，避免工程包泄露源文件的完整目录结构。
// seen 以当前路径为键，只合并明确相同的引用，不猜测同名文件内容。
// 两个不同路径即使同名、同大小也分别打包，避免错配用户的版本。
// 一个素材被多张卡引用只占一份正文，但每张卡仍保留自己的节点身份。
// 没有 media 的空卡照常导出；不能因尚未选文件就抹掉提示词与连接。
// 导出时的路径必须是本机绝对路径，不能把包内相对路径再次当成本机地址。
// 后缀与媒体类别在读取前对应检查，防止手改文档把任意程序当视频打包。
// stat 确认读取的是文件；文件夹不能被错误当作零字节媒体装箱。
// 大小以当前磁盘信息为准，导入时登记的旧大小不能代替实际字节数。
// 摘要先完整读取源文件，因此大视频导出需要额外的一遍顺序读取。
// 这一步只缓存摘要与清单，不缓存整段视频，内存不随视频体积线性增长。
// 随机包内名避免平台重名、中文路径编码和特殊字符造成覆盖。
// 包内名称不作为卡片标题，用户看到的原文件名仍保留在 media.name。
// 同一引用重新出现时复用其包内地址，也复用装箱单中的实际大小。
// 媒体尺寸、播放进度和解码状态不属于此归档层，不在这里猜测或补造。
// 返回的 sources 只给写包过程使用，不跨 IPC 返回到渲染层。
async function prepareArchive(input) {
  const document = structuredClone(input);
  delete document.workspace;
// prepareArchive 的临时数组一一对应，不在异步回调中并行重排。
// seen 命中意味着本轮已经记录过这个源地址。
// 第一次记录时确定正文顺序，之后重复引用不会再次追加。
// 后缀来自实际 media.path，而非卡片自定义标题。
// 同源节点可有不同标题，正文归属仍指向相同包内资产。
// 记录的 sources 与清单相同下标，写包器按下标核对 expected。
// 没有 useState 或全局缓存，连续两次导出各自重新准备。
// 因此第一次导出失败的半份清单不会被第二次继续复用。
// 用户导出期间改源文件，第二遍摘要能发现内容变化。
// 大小变了即使摘要读取未完成，也会在最后一致性检查失败。
// 内容变了但长度未变，哈希仍能提供反证。
// 如果外部文件只改名导致读取失败，整包不产生完成路径。
// 界面不会因为部分素材成功读取就宣称完整工程已导出。
// stat 与 digest 都是异步 I/O，不同步锁住 Electron 事件循环。
// 大量小文件仍会有总耗时，本实现不声称零成本导出。
// 源文件没有被更名或锁成只读，其他软件仍可使用它。
// 代价是需要一致性检查，而非以抢占文件权限保证静态快照。
// 随机包内地址只用于本次导出，不承诺两次包逐字节相同。
// 格式回归检查逻辑等价，不以包哈希确定性作为产品契约。
// 不因为文件体积相同就跳过内容校验。
// 同一地址多引用去重是路径去重，不是全局内容寻址存储。
// 两个不同路径内容相同仍可能装两份，这是明确的性能边界。
  const assets = [];
  const sources = [];
  const seen = new Map();
  for (const node of document.nodes) {
    const media = node.data.media;
    if (!media) continue;
    if (!path.isAbsolute(media.path) || !EXTENSIONS[media.kind].includes(path.extname(media.path).slice(1).toLowerCase())) throw new Error("canvas-invalid-media");
    let relative = seen.get(media.path);
    if (!relative) {
      const info = await fs.promises.stat(media.path);
      if (!info.isFile()) throw new Error("canvas-asset-missing");
      relative = `${DIRECTORIES[media.kind]}/${randomUUID()}${path.extname(media.path).toLowerCase()}`;
      assets.push({ path: relative, size: info.size, sha256: await digest(media.path) });
      sources.push(media.path); seen.set(media.path, relative);
    }
    node.data.media = { ...media, path: relative, size: assets.find(asset => asset.path === relative)?.size ?? media.size };
  }
  return { manifest: { format: "illusion-realm-canvas", version: 1, document, assets }, sources };
}

// 同目录临时文件完成并关闭后才替换目标，取消或失败不留下假工程。
// 二进制不压缩，图片和视频本已压缩；避免大项目压缩时占用大量 CPU。
/** @param {string} target @param {import('@illusion-realm/shared').UserDataInfiniteCanvas} document */
// 写包分为准备、写临时包、落盘、替换目标四个阶段。
// 准备失败发生在创建临时文件之前，因此不会碰用户选择的旧工程。
// 清单使用 UTF-8 字节长度，不能用中文字符串的字符数代替。
// 头部上限限制需要一次分配的内存，也限制损坏大图造成的清单膨胀。
// 魔数占前八字节，接着四字节无符号小端整数保存清单长度。
// 固定十二字节前缀让读取方先知道需要读取多少 JSON，而非猜分隔符。
// 临时包与目标在同一目录，最终 rename 不跨磁盘搬运半个视频。
// 临时名称带随机身份，多个导出任务不会争抢一个固定的 temp 文件。
// wx 要求新建，意外同名也不能覆盖其他任务已经写出的内容。
// 每份资产顺序追加，下一份必须等上一份的实际写入完成。
// 不向同一个 WriteStream 反复安装 pipeline 的收尾监听。
// 文件句柄只有这次写包拥有，出错由 finally 尝试关闭。
// sync 请求系统把已写内容落盘，随后关闭句柄再替换目标。
// Windows 对已打开文件的替换更严格，不能先 rename 再等句柄释放。
// 替换目标前的任何失败都保留旧目标文件，用户不会得到半个有效工程。
// finally 删除的是随机临时文件，绝不递归清空用户选择的输出目录。
// 成功后临时路径已经不存在，force 允许收尾清理仍然安全执行。
// 关闭句柄的二次尝试忽略已关闭错误，不掩盖主体写入是否成功。
// 导出没有压缩层，因此不能把 ircanvas 改后缀后当 ZIP 解压。
// 已有图片和视频通常已经压缩，再压缩会增加 CPU 而收益很小。
// 包的体积主要等于媒体总大小，界面不会承诺节省磁盘空间。
// 只有 rename 完成 IPC 才返回成功，选好保存位置不等于导出完成。
async function writeArchive(target, document) {
  const { manifest, sources } = await prepareArchive(document);
  const header = Buffer.from(JSON.stringify(manifest), "utf8");
  if (header.length > MAX_HEADER) throw new Error("canvas-project-too-large");
  const prefix = Buffer.alloc(12); MAGIC.copy(prefix); prefix.writeUInt32LE(header.length, 8);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const output = await fs.promises.open(temporary, "wx");
  try {
    await writeChunk(output, prefix); await writeChunk(output, header);
    for (const [index, source] of sources.entries()) await appendAsset(output, source, manifest.assets[index]);
    await output.sync(); await output.close();
    await fs.promises.rename(temporary, target);
  } finally {
    await output.close().catch(() => undefined);
    await fs.promises.rm(temporary, { force: true });
  }
}

// 主进程与 shared 一样限制清单字段；长度来自实际文件，不能被包声明欺骗。
// 先验证完整图和所有相对路径，再创建目标目录，坏包不会污染用户工程。
/** @param {unknown} value @param {number} payloadSize @returns {value is import('@illusion-realm/shared').CanvasArchive} */
// 这里检查外部工程的完整结构，不能因为文件扩展名正确就信任内容。
// format 区分画布工程与用户设置 JSON，避免误导入账户文档。
// version 只接受已实现的第一版，不尝试猜测未来版本字段含义。
// document 复用图校验，非法连线不能绕过正式打开工程的入口。
// assets 数量设上限，清单不能声明无限个空素材拖垮恢复过程。
// Map 同时作为重复检查与节点地址索引，避免节点查找逐项扫描正文。
// 每个地址必须只包含一级类别目录和一个基本名。
// 斜杠只能出现在类别之后，不能夹带第二级目录或路径穿越。
// 盘符中的冒号不在允许集，Windows 绝对路径无法藏进包内地址。
// 反斜杠也不允许，不能利用 Windows 与 POSIX 的分隔符差异逃出目录。
// 控制字符、通配符和设备分隔符在创建任何文件前就被拒绝。
// 尾部点和空格在 Windows 上可能被规范化，拒绝它们避免别名覆盖。
// 路径长度限制是包契约，不声称系统一定允许更长的本地完整路径。
// 重复地址必须失败，否则正文顺序与 Map 覆盖后的记录可能不一致。
// size 必须是非负安全整数，负数或精度丢失会破坏下一项正文的边界。
// sha256 必须是规范的小写十六进制，不能接受不完整校验值。
// 总大小也检查安全整数，很多合法单项相加仍可能超过精确表示范围。
// payloadSize 来自实际文件长度减去前缀与清单，而非外部 JSON 的声明。
// 所有资产大小之和必须刚好等于正文长度，截断和多余尾巴都不允许。
// 每张媒体卡的地址必须能在清单找到，缺失资产不能伪装成可移植工程。
// 节点保存的大小必须对应资产条目，恢复后不会展示与包内容矛盾的数据。
// image 只能引用 Picture，video 只能引用 video，audio 只能引用 Audio。
// 类别目录之外再核对后缀，video/bad.exe 不能因为放对目录就混过去。
// 空媒体卡没有引用，因此不强迫它拥有一份不存在的二进制文件。
// 清单可能包含未被节点使用的合法资产；它们不会自动创建额外节点。
// 这一层不启动解码器，完整但无法解码的视频仍由卡片给出真实错误。
function validManifest(value, payloadSize) {
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== "illusion-realm-canvas" || !("version" in value) || value.version !== 1) return false;
  if (!("document" in value) || !validDocument(value.document) || !("assets" in value) || !Array.isArray(value.assets) || value.assets.length > 5000) return false;
  const assets = new Map();
  let size = 0;
  for (const asset of value.assets) {
    if (!asset || typeof asset !== "object" || typeof asset.path !== "string" || !/^(video|Picture|Audio)\/[^<>:"/\\|?*\x00-\x1f]+$/.test(asset.path) || asset.path.length > 300 || /[. ]$/.test(asset.path) || assets.has(asset.path)) return false;
    if (!Number.isSafeInteger(asset.size) || asset.size < 0 || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) return false;
    assets.set(asset.path, asset); size += asset.size;
  }
  if (!Number.isSafeInteger(size) || size !== payloadSize) return false;
  return value.document.nodes.every(node => !node.data.media || assets.has(node.data.media.path) && node.data.media.size === assets.get(node.data.media.path).size && node.data.media.path.startsWith(`${DIRECTORIES[node.data.media.kind]}/`) && EXTENSIONS[node.data.media.kind].includes(path.extname(node.data.media.path).slice(1).toLowerCase()));
}

// 限制清单读取尺寸，后续素材逐份流出；截断、尾随字节和版本错误都拒绝。
/** @param {string} file */
// 读取工程先打开只读句柄，格式判断不会修改用户选择的包。
// 先取文件实际大小，再读固定前缀，过短文件不能进入 JSON 分配阶段。
// 魔数比较是逐字节的，不根据文件名、语言或大小写猜测格式。
// 清单长度为零不合法，空图仍需要包含 version、nodes、edges。
// 长度超过上限先拒绝，不尝试分配外部声明的超大 Buffer。
// 文件总长必须容得下完整清单，避免把素材正文错误当成 JSON。
// 读取返回的 bytesRead 必须满足请求长度，读取到一部分不算成功。
// JSON 解析失败属于坏工程，由 handler 的统一业务错误收敛。
// JSON 解析成功只说明语法正确，随后仍要检查字段、图与正文长度。
// 返回的 offset 指向第一份素材字节，而不是第一份素材在清单中的位置。
// 读取清单结束立即关闭句柄，解包阶段独立按范围读取正文。
// finally 同时覆盖正常返回与异常，坏包不会泄漏打开的文件句柄。
// 这里不创建目标工程目录，失败时不需要猜测哪些目录可以删除。
// 不把 JSON 中的任意字段执行成代码，工程包不是插件或工作流脚本。
async function readManifest(file) {
// 读取方的文件长度由打开句柄 stat 得到。
// 包内 size 总数不能要求读取超出实际文件尾部。
// 前缀不足十二字节说明格式不完整，不能当旧版 JSON 尝试打开。
// 魔数错误也不会回退导入用户设置，以免读取敏感无关文档。
// 清单中的转义字符只按 JSON 解析，不再次执行 URI 或脚本解码。
// 不能先把路径 URL decode 再验，否则编码形式会改变规范判断对象。
// 路径中的百分号只是文件名字符，不当作隐藏目录分隔符。
// 范围提取始终使用清单原相对地址经过已验证规则后的 path.join。
// 没有用户提供的 start/end 偏移表，偏移只从尺寸累计计算。
// 每次 pipeline 只打开对应资产范围，不需要把整个包放进内存。
// 素材结束后流释放文件句柄，再进入下一份素材。
// 解包的暂存目录是最终新工程目录，但文档直到全量成功才返回。
// 用户看不到半恢复图，失败回滚后仍留在原图。
// 摘要检查逐项进行，损坏第一项不会浪费时间继续解后面大视频。
// 回滚范围已经明确验证，不依赖外部包提供删除路径。
// 包内清单即使合法也不能指定 root 或其他工程目录。
// 工程名仅用作新目录建议名，设备名与冲突仍受分配器保护。
// 同名项目的存在不会使打开操作覆盖原有媒体。
// 用户可以删除外部 ircanvas 包而保留已经恢复的受管副本。
// 反之，只删除受管副本仍会让草稿缺图，包不是自动在线挂载来源。
  const input = await fs.promises.open(file, "r");
  try {
    const info = await input.stat();
    const prefix = Buffer.alloc(12);
    if ((await input.read(prefix, 0, 12, 0)).bytesRead !== 12 || !prefix.subarray(0, 8).equals(MAGIC)) throw new Error("canvas-invalid-project");
    const length = prefix.readUInt32LE(8);
    if (!length || length > MAX_HEADER || info.size < 12 + length) throw new Error("canvas-invalid-project");
    const header = Buffer.alloc(length);
    if ((await input.read(header, 0, length, 12)).bytesRead !== length) throw new Error("canvas-invalid-project");
    const value = JSON.parse(header.toString("utf8"));
    if (!validManifest(value, info.size - 12 - length)) throw new Error("canvas-invalid-project");
    return { manifest: value, offset: 12 + length };
  } finally { await input.close(); }
}

// 新导入总分配新归属，不覆盖同名工程。只有整包校验与复制完成才返回新文档。
// 包内文件名只用于逐项目标；没有通用“解压任意路径”能力。
/** @param {string} file @param {string} root */
// 读包像按装箱单卸货：先验单，再开新仓库，最后逐件放到固定格子。
// 清单验证发生在目录分配之前，大部分坏包不会产生任何工程目录。
// allocateWorkspace 不复用旧归属，导入同名项目也获得独立身份。
// 新目录只由主进程决定，包里的 workspace 身份不能指定本机目标。
// resolved directory 再次核对是 root 的直接子目录，为失败回滚划定边界。
// 这项包含检查必须位于任何递归删除之前，不能靠“随机名应该安全”替代。
// initial 来自清单实际字节长度，正文第一项没有用户自定义偏移。
// 每份素材的读取范围从累计偏移计算，起终点均来自已经验证的整数。
// 流的 end 是包含端点，因此非空资产的终点需要减一。
// 零字节资产单独新建空文件，不能构造 end 小于 start 的读取流。
// wx 防止包内重复路径或意外文件覆盖，即使此前检查发生疏漏仍有保护。
// pipeline 等待输入和输出都完成，再读取落盘文件的摘要。
// 校验失败立即终止，后续素材不继续写入，文档也不会返回到界面。
// 摘要比较发生在实际写入之后，不能只相信清单自报的校验和。
// 所有素材完成后才把相对路径改成本机新目录下的绝对引用。
// 同一资产被多张卡引用时都映射到同一个新文件，没有额外复制正文。
// workspace 与引用一起返回，后续新导入会继续写入这份工程的目录。
// 返回只表示文件恢复完成，浏览器是否支持媒体编码仍需实际加载。
// 失败回滚只删除本调用刚创建的目录，旧工程和外部原文件都不在其中。
// 回滚之后重新抛错，不能因清理成功而向用户报告工程导入成功。
// 用户离开页面时主进程可能仍完成解包，渲染会话负责忽略迟到结果。
// 已完整恢复但未被页面接收的目录不会被当作损坏工程随意清除。
// 当前没有垃圾收集任务，避免误删其他仍被草稿或历史引用的资产。
// 包中不包含撤销栈；导入完成作为新的作品基线，而不是重放旧电脑动作。
async function readArchive(file, root) {
  const { manifest, offset: initial } = await readManifest(file);
  const workspace = await allocateWorkspace(root, { name: manifest.document.name || "", files: [] });
  const directory = path.resolve(root, workspace.folder);
  // 回滚只允许 root 的直接子目录；此检查在任何递归删除之前执行。
  if (path.dirname(directory) !== path.resolve(root)) throw new Error("canvas-invalid-workspace");
  let offset = initial;
  try {
    for (const asset of manifest.assets) {
      const target = path.join(directory, asset.path);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (asset.size) await pipeline(fs.createReadStream(file, { start: offset, end: offset + asset.size - 1 }), fs.createWriteStream(target, { flags: "wx" }));
      else await fs.promises.writeFile(target, "", { flag: "wx" });
      if (await digest(target) !== asset.sha256) throw new Error("canvas-project-checksum-failed");
      offset += asset.size;
    }
    const document = manifest.document;
    document.workspace = workspace;
    for (const node of document.nodes) if (node.data.media) node.data.media.path = path.join(directory, node.data.media.path);
    return document;
  } catch (error) {
    // directory 刚刚由本调用独占创建，且位于 root 内；只回滚自己的导入资产。
    await fs.promises.rm(directory, { recursive: true, force: true });
    throw error;
  }
}
// 只导出明确的归档与清单能力，不提供任意目录解压工具。
// 调用者不能从模块取得已打开文件句柄或内部随机临时路径。
// writeArchive 的成功以完成目标替换为准，而非开始写入。
// readArchive 的成功以全量文件摘要通过为准，而非单纯 JSON 可解析。
// readManifest 供格式回归与诊断读取，不修改磁盘资产。
// validManifest 保持纯检查，可以在创建任何用户目录前运行。
// 这四个入口的资源所有者各自清楚，不依赖页面存活清理文件句柄。
// 它们没有模块级当前工程变量，两个窗口的请求不共享图状态。
// 大文件处理是顺序 I/O，内存主要受单块缓冲和清单上限约束。
// 没有压缩线程池，性能主要受磁盘吞吐与两遍摘要读取影响。
// 多次请求的界面互斥由调用方 Hook 管理，服务不冒充全局任务调度器。
// 将来若做取消或进度，需要另立明确作业契约，不能伪造当前百分比。
module.exports = { writeArchive, readArchive, readManifest, validManifest };
