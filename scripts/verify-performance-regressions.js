/**
 * 性能改动的行为回归：执行生产扫描器、地址缓存和用户文档保存器。
 * 磁盘样本只在本脚本创建的 Temp 根内，不读取用户模型或配置。
 * TypeScript 仅擦除类型，没有复制被测的业务算法。
 * 浏览器/Electron 环境检测是明确替身，因此本脚本不是实机图片解码证明。
 * 扫描与保存真正访问文件系统，失败会非零退出，不输出用户路径。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("../apps/next/node_modules/typescript");
const repository = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ir-perf-regression-"));

// 执行前不需要启动 ComfyUI，所有生产服务依赖都限制在本地只读或临时写入。
// 不引用用户路径配置，不会因当前设置指向 F 盘而扫描实际模型库存。
// 临时根每次随机创建，前一次运行的错误残留不能让这次少做文件操作。
// 仓库路径由 __dirname 定位，命令从其他工作目录执行也不会写错工程。
// 测试使用 Node 自带 assert，断言错误不是自定义布尔标记，无法被日志覆盖。
// fs.rmSync 只用于测试结束清理，不是产品保存或扫描的处理机制。
// Python、GPU、网络站点与账号不属于本脚本前置，离线也可以复现这些契约。
// 如果 TypeScript 包缺失，模块加载立即失败，不能以跳过转译当作通过。
// 当前不以随机种子生成期望，所有文件内容和版本值是可追踪的固定输入。
// 不测启动速度来判通过，机器忙碌与否不会使正确性断言变得宽松。
// 整组成功标记只有 main 末尾一处，不能部分通过就提前输出最终成功。
// source 夹具使用 localfile 链接只是验证协议参数，不会真的读取 C:/fixture。
// Node 不注册 Electron 协议；此处验证地址规则，实际媒体读取另由 Electron 验证。
// 生产 URL helper 的别名递归由同一 loader 解析，实际编码变化会影响断言。
// 返回结果检查同时覆盖值和身份，不能用一个复制数组掩盖重复扫描。
// 保存读取走真实 UTF-8 文本，未在 fs mock 中直接把对象作为最终文件返回。
// Promise.finally 的清理完成才结束各组，测试不在 pending 仍活跃时删除根。
// 同一进程内三组共享 root 但各自子路径不同，模型文件不会被保存组覆盖。
// 断言出错后的 catch 仅设置退出码，不启动重试掩盖第一次失败。
// 功能通过只说明这些回归边界守住，人工验收与未知 BUG 不因此自动清零。

// 按完整源码加载，避免正则截取函数时漏掉真实缓存和队列变量。
// 每次调用创建独立 module，两个缓存测试不能偷偷共享前一组状态。
// alias 只指向本仓库固定源码，未授权的第三方导入仍正常失败。
// override 只替换外部边界；fs 的原有异步实现仍由下方包装器真正调用。
// 模块中的 require 不借用用户运行中的 Electron 实例。
// JSON 文档路径解析器在测试中指向 Temp，不迁移或覆盖本机设置。
// TypeScript 的编译目标只影响类型擦除和模块格式，算法仍来自生产源码。
// 这里不加载 React 组件，所以不能把这个测试算作键盘或焦点验收。
// 缓存只在被测模块实例里存在，Node 退出后没有额外持久化文件。
// 未知依赖不会返回空对象，依赖丢失应让脚本明确失败。
function load(relative, overrides = {}) {
  const filename = path.join(repository, relative);
  const text = fs.readFileSync(filename, "utf8");
  const source = filename.endsWith(".ts") ? ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText : text;
  const module = { exports: {} };
  const resolve = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith("@/") ? load(`apps/next/src/${name.slice(2)}.ts`, overrides) : require(name);
  new Function("require", "module", "exports", source)(resolve, module, module.exports);
  return module.exports;
}

// 夹具中的权重是几字节文本，只用于证明扩展名和目录聚合，不用于推理。
// 同目录的两份版本必须聚合，嵌套目录则必须作为另一份模型返回。
// 非模型 txt 不应进入结果，即使内容碰巧像模型名也不能被识别。
// logo.PNG 刻意使用大写扩展名，继续覆盖原封面命名的大小写兼容。
// 不把封面字符串解码成图片，这组只验证扫描选择哪一个文件。
// scanner 的权限/目录边界仍与生产原先的读取规则一致。
// 原同步调用一旦被执行就抛错，空结果不能蒙混成“异步扫描通过”。
// 断言还检查数量、版本与大小，防止所有读取失败恰好没有触发同步接口。
// 像检查文件柜目录卡，查书有几本并不等于读了书里的全部内容。
// 没有给 mock 提供 hash 函数，测试不要求扫描读取模型张量。
// 同时发两个请求，结果应共享同一轮读取后的只读数组。
// 第二次在第一轮完成后扫描则要读取磁盘，不能永久缓存已删除的文件。
// 目录枚举计数的分母由固定夹具结构给出，不从产品返回反推。
// fs 包装器只记录调用，没有提前返回目录或伪造文件属性。
// 模型类型按调用参数检查，文件名不能改变它的官方类别。
// 名称仍是文件去后缀，不允许为提速改用目录名代替版本名。
// 目录状态变化发生在两轮之间，不把并发外部移动当成稳定磁盘快照。
async function scannerChecks() {
  // 把函数声明成 async 却继续 readdirSync，会立即触发包装器异常。
  // 只把 stat 换异步但封面又同步枚举，也会触发同一异常。
  // 把所有读取异常吞成 []，固定两组模型的断言仍会失败。
  // 为每个目录重复读取封面名单，reads 会超过固定的三次。
  // 两个同时请求未合并时，reads 会翻倍且两个返回数组身份不同。
  // 永久缓存已完成 Promise 时，删除 second 后仍会错误返回两份版本。
  // 扩展名判断遗漏 gguf 时，Nested 模型组会消失。
  // 只按 safetensors 判断时，ckpt 对应版本和六字节大小会缺失。
  // 把图片或 notes.txt 也当模型时，目录或版本数量会超出期望。
  // 把嵌套目录并入父版本时，模型组名称不再是 A 与 Nested。
  // 使用文件大小作版本 ID 时，同大小文件后续会歧义；本组仍读真实路径。
  // 本组没有制造两个同大小文件，不把这条风险当作额外通过项。
  // 三个目录是 root、A、A/Nested，由夹具直接创建。
  // 每个目录只枚举一次，因此两次同时请求的读数应是三。
  // 第二轮显式扫描再枚举三个目录，累计数应为六。
  // 模型分组 A 排在 Nested 前，使用原 zh-CN 名称规则。
  // one 与 two 的名称顺序是固定不同值，不依赖磁盘创建顺序。
  // one 的字节串是 ASCII one，编码后严格为三字节。
  // second 同理为六字节，不以文件分配簇大小作为权重容量。
  // third 仅证明 gguf 枚举，不声称它是有效的量化模型。
  // logo.PNG 的大写 PNG 与原优先名称按不区分大小写规则命中。
  // 这张 cover 不能用于像素验收，真实图片解码由后续 Electron 覆盖。
  // fs.promises.stat 保持真实实现，可发现返回类型或字段写错。
  // 文件读内容 API 没有成为扫描依赖，体积大的权重仍不被读取。
  // 根目录不存在的检查放在正常夹具之后，不能只证明空目录分支。
  // 不存在根按原接口容错返回空列表，不当成一次资料补全失败。
  // 同步找封面仍给单目录调用保留，但批量扫描不得调用那个枚举分支。
  // symlink 和 junction 的安全规则沿用原扫描器，不在此组伪造跨盘链接。
  // 它们由现有模型分类与资料读取回归负责，当前仅验证本轮的非链接扫描。
  // stats 返回的时间来自操作系统，本组不硬编码 Date.now 避免时间精度脆弱。
  // 不用扫描耗时小于几毫秒作断言，CI 磁盘速度变化不应造成假失败。
  // 吞异常回空数组不是性能优化，本组必须首先证明实际枚举出有效文件。
  // 同轮共享身份只是去重证据，跨轮身份无需相同且不得被当成稳定缓存。
  // 调用方不应原地排序共享快照，模型库已有 slice 后比较契约。
  // 并发请求的模型类型刻意相同，不能据此宣称验证了所有参数组合。
  // 不同类别的实际入口仍通过 existing model-categories 回归检查。
  // 测试失败时临时根会清理，但断言本身仍通过非零退出保留失败事实。
  // 没有把生产 scanner 替换成预期数组，故包装层检查能覆盖真实 I/O 机制。
  // 模块仅从固定路径加载，不读取下载目录或配置里的真实模型位置。
  // 目录名 A/Nested 不含用户模型名称，日志不会泄露用户本机库存。
  // 不在本组生成大文件做压力测试，避免用磁盘写入压过正在验证的读盘收益。
  // 大目录性能应另用相同数据前后对照，本组定位的是功能与异步机制回归。
  // 通过后可说明扫描不再使用同步枚举，不能直接外推某个固定提速百分比。
  const root = path.join(temporary, "models");
  fs.mkdirSync(path.join(root, "A", "Nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "A", "one.safetensors"), "one");
  fs.writeFileSync(path.join(root, "A", "two.ckpt"), "second");
  fs.writeFileSync(path.join(root, "A", "logo.PNG"), "cover");
  fs.writeFileSync(path.join(root, "A", "Nested", "three.gguf"), "third");
  fs.writeFileSync(path.join(root, "notes.txt"), "ignored");
  let reads = 0;
  const promises = { ...fs.promises, readdir: (...args) => { reads += 1; return fs.promises.readdir(...args); } };
  const syncRead = () => { throw new Error("Synchronous filesystem read during scan"); };
  const scanner = load("apps/electron/src/main/modules/models/scanner.js", { fs: { ...fs, promises, readdirSync: syncRead, statSync: syncRead } });
  const [first, second] = await Promise.all([scanner.scanModelsInDirectory(root, "lora"), scanner.scanModelsInDirectory(root, "lora")]);
  assert.equal(first, second);
  assert.equal(reads, 3);
  assert.deepEqual(first.map(item => item.name), ["A", "Nested"]);
  assert.deepEqual(first[0].versions.map(item => [item.name, item.bytes]), [["one", 3], ["two", 6]]);
  assert.equal(first[0].type, "lora");
  assert.equal(path.basename(first[0].iconPath), "logo.PNG");
  fs.unlinkSync(path.join(root, "A", "two.ckpt"));
  assert.equal((await scanner.scanModelsInDirectory(root, "lora"))[0].versions.length, 1);
  assert.equal(reads, 6);
  assert.deepEqual(await scanner.scanModelsInDirectory(path.join(root, "missing"), "lora"), []);
}

// 临时文档通过原生产 writeUserData 写入，读取真实 JSON 来判读结果。
// 路径帮助器是测试边界，只固定默认路径，保存算法仍执行生产源码。
// fs 包装器保留真实 mkdir、writeFile 和 rename，不假造“保存成功”。
// 用多个并发请求检验排队，不把串行 await 调用当成并发时序证明。
// 同时统计正在进行的写入，最多一项才说明队列真正限制了并发。
// 最后读取的 revision 固定为 11，不能拿任何已完成请求当最终结果。
// 失败注入在 rename，模拟临时文件已写好但最终替换失败。
// 旧文件必须保持上一轮成功数据，不能只根据拒绝 Promise 判断安全。
// 失败之后还要再保存，防止队列被一个 rejected Promise 永久堵住。
// 临时文件检查独立于返回值，失败也不得留下半写文件误当成工程。
// 这里没有测试断电和 fsync，不把单文件替换说成断电数据绝不丢失。
// 文档允许未知字段，样本加入扩展字段确认没有缩减或重新格式化 schema。
// 返回值仍包含原 data，IPC 现有消费者不因异步化突然拿不到字段。
// 所有文件位于同一测试根，rename 真实跨卷行为不属于这个用例。
// 同步写入包装器直接抛错，防止实现退回主线程 writeFileSync 而测试不知情。
// JSON 序列化仍真实执行，因此非法循环对象要在碰磁盘前失败。
// 失败后的恢复不靠固定延时，等待的是实际保存 Promise。
// 根目录删除在全部 Promise 完成后，不能靠清理中断还在进行的保存。
async function storageChecks() {
  // 所有写入成功时，最后提交的 revision 必须是最终磁盘版本。
  // 前一项已经完成再开始后一项，不能出现两个 writeFile 同时活跃。
  // 初始目录缺失时主进程必须可创建保存目标，不能要求用户手工先建目录。
  // 全部未知字段在第一轮落盘保留，不能用精简数据提高表面速度。
  // 返回 data 与文件内容分别核对，单看返回原参数并不能证明写盘。
  // rename 失败时不能返回成功，也不能把目标替换成半份或空文档。
  // 已写出的临时文件需要清理，避免后续导入误把它当工程备份。
  // 失败后的下一个正常请求必须成功，队列不能保留永远失败的链头。
  // 循环对象应明确拒绝，不能以 {} 代替无法序列化的数据。
  // 循环错误之后旧文件仍完整，异常不能发生在目标已经被清空之后。
  // Array.from 在同一轮事件循环中提交全部请求，没有逐项 await。
  // 因此测试确实要求产品队列处理竞争，而不是由测试替它排队。
  // Promise.all 只等待全部结束，不改变请求登记的原始顺序。
  // 最后请求是 revision 11，明确预期不能从完成数组的最后值动态反推。
  // maximum 记录真实 writeFile 未完成区间，不以队列变量的源码名字判断。
  // finally 减少 active，即使一次写入失败也不让测试的计数永远卡住。
  // 包装器将所有参数原样交给真实 fs，保留编码、文件名和权限语义。
  // 它发生在临时内容已经写完后，覆盖比“写前直接抛错”更危险的边界。
  // 此阶段原文件应仍是 revision 11，而不是待失败的 revision 12。
  // 错误文本是本地固定夹具，不包含操作系统返回的真实用户名或路径。
  // 注入关闭后保存 revision 13，证明下一项并不复用旧的临时文件。
  // 这里没有模拟跨卷重命名，因为生产临时路径就是目标所在目录。
  // mkdir/writeFile 本身的磁盘故障没有逐一注入，不能把该项写成已实测。
  // JSON.parse 读取实际磁盘文本，而不是主进程缓存中的对象引用。
  // extra.kept 必须保留，代表主进程不删除当前类型表之外的向前兼容字段。
  // 版本字段本组取 1，不暗示改变了用户文档格式版本。
  // 本组不依赖 JSON 对象键顺序，使用深比较验证业务内容。
  // 美化缩进与换行仍由生产保存器负责，不以去掉空格作为主要优化收益。
  // 临时文件扩展名统一检查 .tmp，文件 UUID 不参与业务期望。
  // 旧临时文件恢复策略不在本轮新增，不能声称已有异常启动恢复系统。
  // 主进程返回结构没有精简，已有 preload 消费者依然取得 filePath 和 data。
  // 保存器没有增加第二个文件入口，默认路径仍由原路径助手提供。
  // 路径助手用测试替身只是隔离用户数据，不能用于证明真实自定义路径验收。
  // 所有断言在 finally 删除夹具之前完成，不能因清理后文件不存在而误判保存。
  // 异步拒绝需要 await assert.rejects，遗漏等待会使测试提前打印通过。
  // 程序自然退出，未处理异常不能被 app.quit 或 exit(0) 吞掉。
  // 不把保存失败映射为 ComfyUI 任务失败，生成与文档副作用仍应分别判断。
  // renderer 的 pending 恢复由现有 generation-statistics 测试另外覆盖。
  // 主进程串行顺序不解决不同窗口基于旧文档的业务合并冲突。
  // 因此不把这一组通过解释为实现了数据库级多窗口事务。
  // 共享 renderer 文档合并继续使用原 userDataStorage，不在这里重建 schema。
  // 异步写入只是释放磁盘等待，JSON.stringify 的 CPU 仍是本进程工作。
  // 测试不据此宣称几十 MiB JSON 的序列化也已经移到了后台线程。
  // 读回时仍等待所有写入回执，符合原调用方先保存再读取的时序要求。
  // 不在写入中间不停轮询读文件，避免把读测试本身变成主线程额外开销。
  // 故障后重新保存使用同一模块实例，重建模块会掩盖被拒绝队列的残留问题。
  // 多路径保存顺序复用同一主进程队列，本组没有访问或切换真实用户路径。
  // 性能结论限于无同步写盘与顺序保持，不给出未经测量的节省毫秒数。
  const filePath = path.join(temporary, "storage", "document.json");
  let active = 0, maximum = 0, failRename = false;
  const writeFile = async (...args) => { active += 1; maximum = Math.max(active, maximum); try { return await fs.promises.writeFile(...args); } finally { active -= 1; } };
  const rename = (...args) => failRename ? Promise.reject(new Error("fixture rename denied")) : fs.promises.rename(...args);
  const storage = load("apps/electron/src/main/storage/user-data.js", { fs: { ...fs, promises: { ...fs.promises, writeFile, rename }, writeFileSync: () => { throw new Error("Synchronous document write"); } }, "./user-data-paths": { getDefaultUserDataPath: () => filePath, resolveUserDataPath: value => value || filePath } });
  const writes = Array.from({ length: 12 }, (_, revision) => storage.writeUserData({ version: 1, revision, extra: { kept: true } }));
  const results = await Promise.all(writes);
  assert.equal(maximum, 1);
  assert.equal(results[11].data.revision, 11);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")), { version: 1, revision: 11, extra: { kept: true } });
  failRename = true;
  await assert.rejects(storage.writeUserData({ revision: 12 }), /fixture rename denied/);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).revision, 11);
  assert.equal(fs.readdirSync(path.dirname(filePath)).filter(name => name.endsWith(".tmp")).length, 0);
  failRename = false;
  await storage.writeUserData({ revision: 13 });
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).revision, 13);
  const cycle = {}; cycle.self = cycle;
  await assert.rejects(storage.writeUserData(cycle), /circular/i);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).revision, 13);
}

// 缓存模块在真实 JS 执行环境中运行，仅替换 Electron 环境探测。
// readLocalImage 一旦调用就抛错，确保桌面显示不再先读取整图 Base64。
// URL 生成器使用生产 localFileUrl，不复制百分号转义算法作为期望。
// 输入包含中文、空格、百分号和井号，反解 path 后必须逐字相同。
// 否则普通英文图片可能正常，用户真实文件名却会在协议阶段丢失。
// 两个观察者关注不同路径，只允许完成路径的监听计数增加。
// 同路径重复加载要拿到同一个 Promise，不能只是返回相同字符串。
// 多实例共享加载与实例独立退订同时验证，不能二者只满足其一。
// 在有观察者时冲刷三百个地址，活跃封面不应因为缓存限额消失。
// 这里没有浏览器图像解码，所以仅验证地址表有界，不推断 GPU 内存。
// 被淘汰的地址可在下一次加载时重建，不要求永久记录所有浏览路径。
// 空路径是合法无操作，不该生成指向当前目录的 localfile 地址。
// 失效后必须有新地址，原文件同路径覆盖时不能继续沿用旧缓存键。
// 其他路径观察者保持零通知，用来反证全局图片广播被真正移除。
// 最后退订两条路径，使测试不会把活跃监听当成有意遗留缓存。
// 地址只读，测试不靠设置 src 修改文件或调用主进程任意写入接口。
// Date.now 和随机后缀只用于媒体身份，不作为工程数据或素材 ID。
// 观察者回调不发请求，加载与通知两个阶段仍由生产缓存统一协调。
// 淘汰断言检查最早未订阅的条目，不用“总数看起来不大”替代行为验证。
// 刷新通知允许空地址阶段存在，它对应真实的旧缓存失效过程。
// 无关路径不能在刷新时被误认为加载失败，也不能被清空。
async function imageCacheChecks() {
  // 桌面缓存必须返回 localfile 地址，不能因为旧接口还在而继续读取 Base64。
  // URL 中 path 反解一次就应等于原字符串，防止百分号变成第二次路径转义。
  // 源字符串中的井号必须留在 path 参数里，不能变成 URL fragment。
  // 空格与中文都来自固定夹具，不依赖当前 Windows 用户名或编码环境。
  // 读到地址后第一个监听只通知一次，避免重复 then 分支同时发布。
  // 另一路径从未加载，其监听始终为零，不能发生全局广播。
  // 相同路径的两个调用发生在微任务完成前，真正覆盖 pending 去重。
  // 完成后再请求可直接复用缓存，但这与 pending 身份断言是两个阶段。
  // 三百个地址的选择：
  // 它超过当前二百五十六的闲置预算，能强制触发淘汰分支。
  // 若只生成十个地址，即使完全没有淘汰实现也会通过，所以不足以反证。
  // 第一个未订阅地址应消失，证明不是只限制 Map 的统计数字。
  // 正在订阅的 source 必须保留，避免限额清理把当前预览突然清空。
  // 这里没有下载三百张图片，只发布地址，不把测试误称作大图库实测。
  // 真实 Chromium 解码缓存、显存与进程 RSS 需要单独采样。
  // 清理掉 JS 地址不保证浏览器同步归还所有解码页，报告必须区分两者。
  // 失效测试的时序：
  // source 已完成第一次加载，invalidate 才开始删除并重新建立地址。
  // 旧地址与新地址必须不同，同路径换封面不能被浏览器当成原资源。
  // 不用固定 sleep 等随机 URL，直接等待实际 invalidate Promise。
  // 另一路径在删除旧值和发布新值两个阶段都不能收到通知。
  // 本组不硬编码 firstNotices 的失效总次数，允许真实空态阶段按协议通知。
  // 空路径 Promise 返回 null，缓存不能把 undefined 字符串编码成磁盘路径。
  // 两个 off 都是各自实例的函数，不通过清空整个监听表结束测试。
  // 生命周期的边界：
  // 活跃条目允许临时超过缓存限额，以保持正在显示的全部图片。
  // 因此本组不把固定条数上限解释为所有情况下强制丢图。
  // 请求完成和 img 解码事件不同，本组只验证前者。
  // 文件被外部删除时图片控件应进入缺图态，这需要真实浏览器回归覆盖。
  // URL 版本仅影响媒体缓存，素材的文件路径身份始终保持原值。
  // 网络图片的 src 仍由调用方决定，不通过此缓存伪装本机文件。
  // 旧 EXIF API 仍能读取字节，不因为显示改地址就失去元数据解析。
  // 路径缓存不能充当模型匹配依据，名称与 JSON 哈希契约仍独立。
  // 浏览器兼容分支继续存在，但本组刻意令 isElectronEnvironment 为 true。
  // 不能把桌面分支通过写成普通浏览器桥接也已实测通过。
  // 不测 Date.now 的实际值，时间后缀只是失效机制，不是可见日期。
  // 随机后缀不是密码或安全令牌，不承担任何文件权限证明。
  // 生产本地协议仍负责读取存在性、MIME 和 Range，不由 renderer 模拟。
  // 先检查参数正确再验证淘汰，避免缓存功能通过但 URL 自身已经指错文件。
  // 先检查正常发布再检查失效，避免一个始终返回 null 的实现假通过。
  // 请求失败应可重试的浏览器分支未在本组制造故障，报告不冒称覆盖。
  // 快照不返回新对象，useSyncExternalStore 才能准确判断地址是否变化。
  // 文件路径不被打印，失败断言只在测试本地显示固定夹具信息。
  // 不预取真实用户历史，脚本执行不会访问最近打开的私人作品。
  // 清理操作只释放测试 Temp 根，不对缓存里这些示意路径调用删除。
  // 缓存条数检查不是全项目内存证明，旧蒙版历史占用仍是独立优化项。
  // 通知次数下降也不等于每张卡片帧率提升，实际 React 录制仍需另测。
  // 这组测试允许实现细节调整，但共享加载、隔离通知和失效语义不能退化。
  // 如果预算以后正式调整，三百个地址的测试规模应跟随审查后的契约更新。
  const cache = load("apps/next/src/utils/localImageSrcCache.ts", { "@/utils/electronBridge": { isElectronEnvironment: () => true, readLocalImage: () => { throw new Error("Base64 read for image display"); } } });
  const source = "C:/fixture/中文 100%#cover.png";
  let firstNotices = 0, otherNotices = 0;
  const off = cache.subscribeLocalImageSrc(source, () => { firstNotices += 1; });
  const otherOff = cache.subscribeLocalImageSrc("other", () => { otherNotices += 1; });
  const first = cache.loadLocalImageSrc(source);
  assert.equal(first, cache.loadLocalImageSrc(source));
  const url = await first;
  assert.equal(new URL(url).searchParams.get("path"), source);
  assert.equal(firstNotices, 1);
  assert.equal(otherNotices, 0);
  for (let index = 0; index < 300; index++) await cache.loadLocalImageSrc(`C:/fixture/${index}.png`);
  assert.equal(cache.getCachedLocalImageSrc("C:/fixture/0.png"), null);
  assert.equal(cache.getCachedLocalImageSrc(source), url);
  await cache.invalidateLocalImageSrc(source);
  assert.notEqual(cache.getCachedLocalImageSrc(source), url);
  assert.equal(otherNotices, 0);
  assert.equal(await cache.loadLocalImageSrc(null), null);
  off(); otherOff();
}

// 三组串行，文件计数与失败开关不受另一组正在进行的异步工作干扰。
// 任一失败都保留原断言异常并设置非零退出，不打印假成功标记。
// temporary 来源于 mkdtemp 的绝对结果，清理前再次核实没有越出系统 Temp。
// 只删除本轮自己的目录，不扫描、移动或删除用户已有素材。
// finally 在所有等待的工作结束后执行，释放磁盘夹具而不是强制终止进程。
// Node 的自然退出仍可发现未处理拒绝，测试不靠 process.exit(0) 掩盖尾部失败。
// 成功输出列明范围，不冒称验收了资源管理器拖入、音频或显卡性能。
// 实机像素、主题与相机继续由独立的串行 Electron 冒烟覆盖。
async function main() {
  try {
    await scannerChecks();
    await storageChecks();
    await imageCacheChecks();
    console.log("PERFORMANCE_REGRESSIONS_OK: async scan, cache isolation, ordered atomic writes");
  } finally {
    assert.ok(temporary.startsWith(path.join(os.tmpdir(), "ir-perf-regression-")));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
