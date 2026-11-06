// 工程格式反证使用真实磁盘与生产打包器；没有用返回值夹具代替复制或归档。
// 本脚本不启动 Electron，选择框、预览和快捷键另外由串行页面冒烟验证。
// 临时目录只属于本脚本，恶意包的路径测试不写入用户工程或原素材目录。
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const ts = require("../apps/next/node_modules/typescript");
const { importAssets } = require("../apps/electron/src/main/modules/canvas/project-assets");
const archive = require("../apps/electron/src/main/modules/canvas/project-archive");
const validate = require("../apps/electron/src/main/modules/canvas/project-validation");

// 只转译真实 shared schema，断言分别调用两端校验，不在测试中复制生产判定逻辑。
// 格式检查直接加载 shared 的真实 schema，而非测试重写的近似字段表。
// Node 当前不能直接解释这套 TS 引用，所以仅在本测试进程安装转译钩子。
// 转译目标固定为 CommonJS，与 require 调用方式一致。
// 转译没有生成持久构建文件，不会修改生产 shared 源码。
// 钩子随本次 Node 进程退出，不影响 Electron 产品运行时。
// 主进程生产校验器没有运行时依赖这份钩子或 Zod。
// 两端都接受 golden 值才算基础契约通过。
// 只测非法值可能让一个永远返回 false 的假实现也过关。
// 因此先放合法空图与正常文本图，再放非法值。
// 测试样本中有真实中文工程名，检查 Unicode 标题不会被误拒绝。
// 节点辅助构造只准备输入，不调用生产保存器伪造输出。
// 默认位置为有限值，为后面的 NaN 反证保留单一差异。
// 没有媒体时不加 media 字段，以真实覆盖旧草稿形态。
// 有媒体时 kind 跟随媒体类别，避免样本本身先违背基本契约。
// 本脚本的媒体正文故意是已知文本，不作为视频解码证据。
// 测试进程不启动浏览器，因此不能在日志里宣称播放通过。
// 输出中的临时目录供失败后检查真实文件，不是产品默认用户目录。
// 用户路径没有被用作测试 root，不会重命名用户自己的素材。
require.extensions[".ts"] = (module, file) => {
  const source = require("node:fs").readFileSync(file, "utf8");
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
};
const { InfiniteCanvasDocumentSchema } = require("../packages/shared/src/schemas/infinite-canvas.schema.ts");
const { CanvasImportMediaSchema, CanvasArchiveSchema } = require("../packages/shared/src/schemas/canvas-project.schema.ts");
// 格式与 UI 证据使用不同前提，报告中必须明确区分。
// 本脚本可以精确改写包字节，适合验证长度、摘要与路径边界。
// 它没有浏览器，因此不会给出媒体 ready 或 playback 结论。
// Electron 脚本能检查实际解码，但短样本不覆盖全部恶意清单组合。
// 两组互相补充，不能拿其中一组冒充另一组全部通过。
// 格式样本的文本正文使预期摘要可重复，减少编码器版本差异。
// 这种可重复性是格式测试工具，不是用户素材替身。
// 测试用根由 mkdtemp 提供，每次名称独立。
// 同名工程冲突只在这个隔离根中有意制造。
// 如果测试发生异常，临时证据保留，不清空用户工作区。
// 成功输出附带证据根，便于复查导出包和恢复文件。
// 断言失败不会删除日志再重跑到通过。
// 当前 schema 转译只发生在验证进程，不成为主进程生产依赖。
// 当真实字段变更时直接加载新版 schema，可发现手写校验滞后。
// 不能把测试中的旧 shape 常量复制成新的生产 schema。
// empty 文档刻意不带 workspace，覆盖从无归属作品开始的流程。
// 媒体导入后归属来自服务，后续 round trip 从服务结果取它。
// 这样不会用测试生成 UUID 掩盖目录分配错误。
// 坏包反证不需要用户拍摄视频，也不依赖网络资源在线。
// 因此外部网站不可用不会被误当本地工程格式失败。
// 运行前不要求登录，格式服务不接账户秘密。
// 相关导出不包含账户凭据，这一点是数据范围契约。
// 主进程日志使用固定业务错误，测试错误堆栈只留在隔离命令输出。
// 这些输出不作为用户可见消息直接渲染。
const empty = { version: 1, name: "测试工程", nodes: [], edges: [] };
const node = (id, media) => ({ id, position: { x: 20, y: 40 }, data: { kind: media?.kind || "text", title: id, prompt: "", content: "", ratio: "1/1", ...(media ? { media } : {}) } });

// 先检查当前格式 golden，再查旧版、非法数字和嵌套对象，避免只测“什么都拒绝”。
// 这一组固定合法输入是当前格式的 golden baseline。
// empty 证明没有节点也可以保存或导出工程。
// 正常文本图证明校验器不仅仅认识空数组。
// 每个 golden 同时送入 shared 和主进程，发现接受范围分歧。
// 随后 null 检查所有读取属性前都做了对象保护。
// 数组反证防止 typeof object 使错误根形状漏过。
// version 99 验证未知格式不会被当成当前版本恢复。
// NaN 只替换一个位置字段，失败应来自数值边界。
// 这个值无法正常 JSON 编码，却可以由非法 IPC 直接传入。
// 因此不能只靠 JSON.parse 认为所有数值自然可靠。
// 坏 kind 使用不可字符串化对象，检查校验不能调用任意 toString。
// 如果这里抛异常，意味着参数验证会在统一 handler 捕获前失控。
// shared safeParse 必须返回失败而非生成半份节点。
// 这组结果没有修改原始样本，后续断言继续使用同一 golden。
// 重复节点身份的两张卡内容相同，不影响身份唯一性要求。
// 即便两张卡在同一位置，也不能靠位置来区分重复 id。
// 悬空边没有端点，主进程应拒绝而不是静默丢边。
// 循环反证使用两张正常文本卡，类型兼容不能掩盖方向环。
// 两条边的 id 不同，失败不是边身份重复造成的。
// 因此该断言能实际约束 Kahn 检查，而非只碰到早期重复过滤。
// 图语义检查只要求主进程拒绝，shared 结构层不冒称包含同一算法。
// 真实恢复前渲染 parseCanvasDocument 还有关系检查。
// 结构层、关系层、磁盘完整性层各自保留责任。
// 这组不验证节点能否执行生成任务，连线仍只是本地引用。
// 测试失败用 assert 抛出，最终 main.catch 保留非零退出。
// 不会只打印 bad case 后继续报格式全部通过。
function checkValidation() {
  for (const value of [empty, { ...empty, nodes: [node("text")] }]) {
    assert.equal(validate.document(value), true);
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(value).success, true);
  }
  for (const value of [null, [], { ...empty, version: 99 }, { ...empty, nodes: [{ ...node("text"), position: { x: NaN, y: 0 } }] }, { ...empty, nodes: [{ ...node("text"), data: { ...node("text").data, kind: { toString: null } } }] }]) {
    assert.equal(validate.document(value), false);
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(value).success, false);
  }
  // 图语义比结构更严格：重复身份、悬空边与循环不能成为正式工程。
  assert.equal(validate.document({ ...empty, nodes: [node("a"), node("a")] }), false);
  assert.equal(validate.document({ ...empty, edges: [{ id: "e", source: "missing", target: "missing" }] }), false);
  assert.equal(validate.document({ ...empty, nodes: [node("a"), node("b")], edges: [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "b", target: "a" }] }), false);
}

// 这里造的是资产字节而非可播放媒体，用来验证复制、包格式和校验和。
// 解码证据由 Electron 中真实 PNG/MP4/WAV 场景提供，不把这段文本假称为视频。
// 素材样本写进本用例随机临时目录。
// 名字中含中文，后缀为 MP4，但正文是格式测试用的已知字节。
// 这里故意不声称后缀等于有效媒体编码。
// request 同时包含画布名和一项来源描述。
// 首先核对请求 schema 与主进程接受同一输入。
// 连续两次没有 workspace 的导入代表两个同名新工程。
// 两次 folder 不相同才证明没有按标题接管已有目录。
// 只比较 id 不足以排除写入同一目录，所以断言实际 folder。
// 读取目标父目录名为 video，检查用户要求的分类路径。
// 读取目标正文与已知字符串一致，排除只创建空文件的假复制。
// 再次读取原文件，证明导入没有执行剪切或覆盖来源。
// 原 source 与受管 media.path 应属于不同用途。
// 只检查 exists 不能保证复制完整，因此使用内容相等断言。
// 下一项把第一份 folder 和第二份 id 混合成伪归属。
// 两部分各自形状合法，失败必须来自归属核对。
// assert.rejects 等待实际读标记过程，不能只测试字符串格式。
// 这个反证防止“目录名看起来合法就能写入”的权限漏洞。
// 部分失败批次包含一个可读文件与一个不存在路径。
// 不存在路径没有真正创建，不需要伪造 fs 返回值。
// media.length 为一证明有效项仍被成功复制。
// rejected.length 为一证明失败项有准确反馈。
// 若实现把整批回滚或直接忽略失败，这两项预期都会被破坏。
// 同批结果复用已有 workspace，覆盖继续往工程目录追加的路径。
// 返回第一份受管媒体供后续归档，不重新构造一个预期地址。
// 因此后续 round trip 必须读取真实生产 importAssets 的输出。
// 这组没有系统框参与，不把它算作系统选择框人工验证。
// 每项 I/O 都 await，测试结束不会抢在复制之前读取结果。
// 没有用固定用户目录清空环境，历史用户数据不受影响。
// 文件大小在生产服务中 stat，返回值不只相信测试输入 size。
// 测试样本短小，不代表长视频复制性能已得到验证。
async function checkAssets(root) {
  const source = path.join(root, "原始素材.mp4");
  await fs.writeFile(source, "known asset bytes");
  const media = { kind: "video", path: source, name: "原始素材.mp4", size: 17 };
  const request = { name: "同名画布", files: [media] };
  assert.equal(CanvasImportMediaSchema.safeParse(request).success, true);
  assert.equal(validate.importRequest(request), true);
  const first = await importAssets(path.join(root, "user"), request);
  const second = await importAssets(path.join(root, "user"), request);
  assert.notEqual(first.workspace.folder, second.workspace.folder);
  assert.equal(path.basename(path.dirname(first.media[0].path)), "video");
  assert.equal(await fs.readFile(first.media[0].path, "utf8"), "known asset bytes");
  assert.equal(await fs.readFile(source, "utf8"), "known asset bytes");
  // 目录归属标记不符时拒绝接管，防止路径看起来合法却写入别人的同名工程。
  await assert.rejects(importAssets(path.join(root, "user"), { ...request, workspace: { ...first.workspace, id: second.workspace.id } }));
  const partial = await importAssets(path.join(root, "user"), { ...request, workspace: first.workspace, files: [media, { ...media, path: path.join(root, "missing.mp4") }] });
  assert.equal(partial.media.length, 1); assert.equal(partial.rejected.length, 1);
  return { media: first.media[0], workspace: first.workspace };
}

// 只在随机临时目录测试剪切，不对用户目录进行任何删除操作。
// 正文是已知字节，适合验证搬运完整性，不作为实际视频可播放证据。
// 缺省模式已经在 checkAssets 验证保留原件，这里补显式复制与移动的区别。
// 两个校验器均接受 copy、move 和省略，保证桥接两端的契约相同。
// 非法枚举包含 null、布尔和大小写错误；不能把任何真值都当成允许删除。
// 每个拒绝值只进校验，不传入文件服务，验证非法参数没有文件副作用。
// 显式复制后内容相同、来源存在，不能只以目标出现判断复制正确。
// 显式移动后目标内容相同、来源不存在，不能用复制冒充移动。
// 移动结果继续保留原基本名与受管路径，这两个字段用途不同。
// 随后将受管结果作为新来源，模拟用户再次导入画布自己持有的视频。
// 该请求必须拒绝，且文件正文依旧存在，保护其他节点与历史记录。
// 因此“用户选了移动”不等于可搬走任何工程内部资产。
// 错误扩展名只改来源描述，不改磁盘正文，让失败来自生产白名单检查。
// 拒绝后读取原内容，证明不是删了源之后才发现文件类型不支持。
// 图片即便批次传 move 也必须复制，因为确认框只授权移动视频。
// 没有实际 Windows 文件锁或权限注入，不能据此宣称所有 unlink 故障已实测。
// 真实跨盘大文件速度也不由这组小文件格式断言覆盖。
// 本组执行生产 copyFile/unlink，不替换这些函数的成功返回值。
// 失败由 assert 提交非零退出码，不吞掉拒绝后继续打印无条件成功。
// 文件回读直接来自磁盘，避免只比较服务返回的 path 字符串。
// 同名请求每次可分配新目录，不应清空前一个工程来腾地方。
// 测试保留产物便于检查，清理由外部临时文件管理负责。
async function checkImportModes(root) {
  // 样本最初没有归属标记，才能进入允许移动的外部来源分支。
  // 临时根与生产 user 根不同，任何 unlink 都局限在本轮创建的已知路径。
  // 预先写入的正文使目标内容可精确断言，不能只检查文件大小凑巧相同。
  // 把浏览器 size 设成已知字节数，但生产服务仍以 stat 返回值决定结果。
  // 同一 request 在各模式间复用，只有 mode 改变，避免其他参数掩盖差异。
  // undefined 以显式对象字段进入校验，覆盖 IPC 可省略字段的兼容分支。
  // null 是另一种真实 IPC 值，不应被视为省略或自动切换默认。
  // false 检查实现没有用简单的真假判断来解释删除权限。
  // MOVE 检查枚举大小写严格，不默默接纳未定义的操作码。
  // delete 检查本接口不能变成独立任意删除入口。
  // 两端比较只在测试中进行，产品主进程仍不运行 Zod。
  // 枚举坏值检测发生在任何 importAssets 之前，不会产生新的工程目录。
  // copy 请求明确传模式，区别于 checkAssets 中旧版省略 mode 的合法输入。
  // 拷贝后回读源和目标两份内容，发现误把复制实现为重命名的情况。
  // move 请求仍使用原 source，确保来源不是第一份受管副本。
  // 如果误用 copied.media 当来源，会先撞到工程保护而测不到正常移动。
  // 目标路径必须来自服务结果，不按测试猜测的安全文件名读取。
  // ENOENT 要求源确实消失，不能把权限异常误当作移动完成。
  // 移动结果的正文与原样本完全相同，截断或空目标都会使断言失败。
  // managed 请求把已移动视频再次作为来源，但没有复用旧 workspace。
  // 这模拟另一个工程试图搬走资产，验证保护不只限于当前工程目录。
  // rejected 应精确包含原名，拒绝不能表现成静默少导入一项。
  // 读回受保护的视频证明拒绝没有清空正在被其他节点引用的文件。
  // 之后重新创建外部 source，作为失败分支的独立前提。
  // bad.exe 不修改源路径，区分文件名后缀检查与路径不存在两类失败。
  // 返回 media 空数组和源内容保留必须同时满足，不能只有错误消息。
  // 最后以 image 类型提交同一已知字节，单测的是文件搬运类别规则。
  // 这张 picture.png 的正文不是 PNG，测试不会把它称为图片解码成功。
  // 图片结果存在但原件保留，说明 move 批次没有越界删除其他媒体。
  // 真实 PNG 解码由 Electron 场景承担，与此处格式正文测试分开。
  // 测试中的虚构视频后缀也不用于播放，避免错误的功能验收结论。
  // 函数按顺序执行，不并发改写同一个 source 制造不稳定的竞争。
  // 任何一次失败都中止后续断言，由 main.catch 保留非零结果。
  const source = path.join(root, "move-source.mp4");
  await fs.writeFile(source, "move mode bytes");
  const video = { kind: "video", path: source, name: "move-source.mp4", size: 15 };
  const request = { name: "移动验证", files: [video] };
  for (const mode of [undefined, "copy", "move", null, false, "MOVE", "delete"]) {
    assert.equal(validate.importRequest({ ...request, mode }), mode === undefined || mode === "copy" || mode === "move");
    assert.equal(CanvasImportMediaSchema.safeParse({ ...request, mode }).success, validate.importRequest({ ...request, mode }));
  }
  const copied = await importAssets(path.join(root, "user"), { ...request, mode: "copy" });
  assert.equal(await fs.readFile(source, "utf8"), "move mode bytes");
  assert.equal(await fs.readFile(copied.media[0].path, "utf8"), "move mode bytes");
  const moved = await importAssets(path.join(root, "user"), { ...request, mode: "move" });
  await assert.rejects(fs.stat(source), { code: "ENOENT" });
  assert.equal(await fs.readFile(moved.media[0].path, "utf8"), "move mode bytes");
  const managed = await importAssets(path.join(root, "user"), { ...request, mode: "move", files: moved.media });
  assert.deepEqual(managed.rejected, [video.name]);
  assert.equal(await fs.readFile(moved.media[0].path, "utf8"), "move mode bytes");
  await fs.writeFile(source, "keep on failure");
  const invalid = await importAssets(path.join(root, "user"), { ...request, mode: "move", files: [{ ...video, name: "bad.exe" }] });
  assert.equal(invalid.media.length, 0);
  assert.equal(await fs.readFile(source, "utf8"), "keep on failure");
  const image = await importAssets(path.join(root, "user"), { ...request, mode: "move", files: [{ ...video, kind: "image", name: "picture.png" }] });
  assert.equal(image.media.length, 1);
  assert.equal(await fs.readFile(source, "utf8"), "keep on failure");
}

// 原文件和受管副本都移开后再导入工程；成功才说明包真正包含了媒体正文。
// 同源两节点只装一份资产，节点 ID 和卡片几何则各自保留。
// 归档输入直接采用上一步生产导入返回的媒体地址。
// 两张节点引用同一份受管文件，用来约束包正文去重。
// 节点 id 分别为 a 和 b，检查去重不能把节点也合并。
// 第一张添加 custom 卡片尺寸，确认项目不只恢复媒体路径。
// 第二张不设 card，覆盖新旧可选字段共存。
// writeArchive 写真实二进制包，不使用成功返回值夹具。
// readManifest 通过生产读取器查看刚落盘的头部。
// shared safeParse 校验实际清单，而非测试预先拼出来的 JSON。
// assets.length 为一说明同源两节点没有装两份正文。
// workspace 应被剥离，另一台电脑不能沿用原目录归属。
// 相对路径断言避免旧盘符藏进工程交换文件。
// 随后把外部原文件和受管副本都改名。
// 只移动原文件不够，因为实现仍可能从受管副本假恢复。
// 只移动受管副本也不够，因为实现仍可能偷偷回退外部原路径。
// 两条旧路径同时失效，才能有力证明包带着媒体正文。
// 测试只移动自己创建的明确文件，没有递归移动用户目录。
// restored 使用另一个根，相当于换一处本机存储位置。
// 恢复后卡宽仍是 432，说明参数没有被默认布局覆盖。
// 两个节点恢复后的 path 相同，证明相同资产引用仍保持一致。
// 读取恢复文件的真实字节，排除只有文档路径转换而没有解包。
// 源文件已经不在原处，内容相等不能依赖此前的缓存。
// 截断包只少最后一个字节，仍有完整合法清单。
// 因此应由正文长度或读取完整性拒绝，不能只检查魔数。
// corrupt 包保持长度不变，仅翻转正文一字节。
// 这一步排除实现只比总大小却不验 SHA256 的漏洞。
// 翻转发生在资产正文末尾，不破坏 JSON 来降低断言强度。
// 校验失败的新目录必须回滚，bad 根最终为空。
// 若留下 .canvas-owner 或半媒体，readdir 的空数组预期会失败。
// 两种坏包都不能覆盖已经成功恢复的另一份工程。
// 测试不会缩短素材或修改预期来迁就错误摘要。
// 归档字节读取只用于小型格式反证，不是生产导出的内存策略。
// 生产实现仍按流处理媒体，不能把测试 fs.readFile 误当产品流程。
// round trip 验证的是可移植存储，不是跨版本任意升级承诺。
// 视频解码的真实证据在 Electron helper 中独立报告。
async function checkRoundTrip(root, imported) {
  const document = { ...empty, workspace: imported.workspace, nodes: [node("a", imported.media), node("b", imported.media)] };
  document.nodes[0].data.card = { style: "custom", width: 432, height: 216 };
  const file = path.join(root, "portable.ircanvas");
  await archive.writeArchive(file, document);
  const { manifest } = await archive.readManifest(file);
  assert.equal(CanvasArchiveSchema.safeParse(manifest).success, true);
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.document.workspace, undefined);
  assert.equal(path.isAbsolute(manifest.document.nodes[0].data.media.path), false);
  await fs.rename(path.join(root, "原始素材.mp4"), path.join(root, "原始素材.mp4.away"));
  await fs.rename(imported.media.path, `${imported.media.path}.away`);
  const restored = await archive.readArchive(file, path.join(root, "restored"));
  assert.equal(restored.nodes[0].data.card.width, 432);
  assert.equal(restored.nodes[0].data.media.path, restored.nodes[1].data.media.path);
  assert.equal(await fs.readFile(restored.nodes[0].data.media.path, "utf8"), "known asset bytes");
  // 截断与正文篡改都必须失败；失败的新导入目录回滚，不留下半工程。
  const bytes = await fs.readFile(file);
  await fs.writeFile(path.join(root, "truncated.ircanvas"), bytes.subarray(0, bytes.length - 1));
  await assert.rejects(archive.readArchive(path.join(root, "truncated.ircanvas"), path.join(root, "bad")));
  bytes[bytes.length - 1] ^= 1;
  await fs.writeFile(path.join(root, "corrupt.ircanvas"), bytes);
  await assert.rejects(archive.readArchive(path.join(root, "corrupt.ircanvas"), path.join(root, "bad")));
  assert.deepEqual(await fs.readdir(path.join(root, "bad")), []);
}

// 正文长度由实际文件对照清单，路径穿越即使摘要正确也不能成为可解包工程。
// 这里构造零字节资产，使正文长度差异容易精确判断。
// sha256 是真实空内容摘要，先建立一个合法清单基准。
// 合法资产允许暂时没有节点使用，不会自动变成新节点。
// 先确认基准为 true，再逐项替换路径，避免无效样本互相掩盖。
// 父目录路径检查最常见的 ../ 逃逸。
// 嵌套 traversal 检查类别前缀不能成为免检通行证。
// 盘符路径覆盖 Windows 绝对地址注入。
// 反斜杠路径覆盖平台分隔符差异。
// video/.. 检查尾部父级别名也被拒绝。
// Audio/name. 空格检查 Windows 尾部规范化风险。
// 每个非法路径都送两端，确保 shared 与主进程边界一致。
// 路径坏值在解包前拒绝，本组没有实际写逃逸文件。
// disguised 把 exe 放在 video 目录，路径形状本身仍合法。
// 节点声明 video，但后缀不在视频允许集，必须进一步拒绝。
// 这条断言避免只验目录类别而忘了媒体扩展检查。
// 重复清单两项路径完全相同，总大小仍为零。
// 因此拒绝来自重复地址，不是简单正文长度不匹配。
// 最后实际 payload 设为一，而清单总数仍是零。
// 这检查多余尾随字节同样不能被静默接受。
// 所有反证返回 false，不能依靠解包失败碰运气保障路径安全。
// 本组只检查元数据，不替代真实损坏包的磁盘回滚用例。
// 未来修改格式时需要先保住合法基准，再扩展反证。
// 不能通过放宽路径校验让新包变得“更兼容”。
// 也不能删掉合法基准后把一律拒绝当作安全通过。
function checkHostileManifest() {
  const sha256 = createHash("sha256").update("").digest("hex");
  const base = { format: "illusion-realm-canvas", version: 1, document: empty, assets: [{ path: "video/valid.mp4", size: 0, sha256 }] };
  assert.equal(archive.validManifest(base, 0), true);
  for (const relative of ["../escape.mp4", "video/../../escape.mp4", "C:/escape.mp4", "video\\escape.mp4", "video/..", "Audio/name. "]) {
    const value = { ...base, assets: [{ path: relative, size: 0, sha256 }] };
    assert.equal(archive.validManifest(value, 0), false);
    assert.equal(CanvasArchiveSchema.safeParse(value).success, false);
  }
  const disguised = { ...base, document: { ...empty, nodes: [node("bad", { kind: "video", name: "bad.mp4", path: "video/bad.exe", size: 0 })] }, assets: [{ path: "video/bad.exe", size: 0, sha256 }] };
  assert.equal(archive.validManifest(disguised, 0), false);
  assert.equal(archive.validManifest({ ...base, assets: [...base.assets, ...base.assets] }, 0), false);
  assert.equal(archive.validManifest(base, 1), false);
}

// 临时根由系统 mkdtemp 分配，不拼一个固定可覆盖用户目录。
// 先跑纯校验，失败时不继续创建无关资产。
// 再跑真实复制，随后用复制结果执行完整归档恢复。
// 阶段之间串行依赖，不把尚未完成写盘的路径提前交给下一步。
// 最终 OK 只在所有 await 和 assert 都完成后打印。
// 异常在唯一 catch 设置 exitCode，不用成功退出掩盖断言。
// 保留临时产物便于诊断，不进行无法复核的自动清场。
// 本 Node 检查不会占 Electron 单实例锁。
// 它可以和纯类型检查并行，但 Electron 窗口回归另行串行执行。
// 日志路径与回归结果会写入实施记录，不能只记一句已测试。
async function main() {
  // 引用与复杂度反证直接执行生产 reducer；它不充当实机拖动或媒体解码证明。
  // 模型先失败就停止后续格式检查，避免仍打印一个无条件的总成功结果。
  // 与真实归档用例串行执行，没有额外启动 Electron 或读取用户工程。
  require("./lib/check-canvas-drag-model").checkCanvasDrag();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ir-canvas-project-"));
  checkValidation(); checkHostileManifest();
  const imported = await checkAssets(root);
  await checkImportModes(root);
  await checkRoundTrip(root, imported);
  console.log("CANVAS_PROJECT_FORMAT_OK", root);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
