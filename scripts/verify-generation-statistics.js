/**
 * 生成账本回归：运行真实 TypeScript 统计、Zustand store 与公共队列。
 * 使用隔离内存文档代替磁盘，不读取用户提示词、图库或账户凭据。
 * 只替换媒体服务与系统边界，不在测试里重新实现成功率计算。
 * 像检验收银机时使用测试小票：可以证明计数规则，不证明真实 GPU 出图。
 * 对应的 ComfyUI 返回值是夹具，不能把本脚本称作实机生图验证。
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("../apps/next/node_modules/typescript");
const root = path.resolve(__dirname, "..");
const modules = new Map();
const messages = [];
let disk = { version: 1, profile: { username: "kept" }, generationHistory: { version: 1, records: [] } };
let failSave = false;

// 文档适配器故意异步返回，才能覆盖 persist.setItem 尚未合并就 flush 的竞态。
// 保存时复制对象，防止内存变化在未真正调用保存时偷偷修改“磁盘”。
// failSave 只影响下一次写入，用来证明失败后 pending 标记仍然保留。
// Toast 只收集文案，不弹出系统界面，也不触发用户真实数据操作。
// 其他导入为最小无副作用边界，执行与终态归类仍然使用生产代码。
/**
 * 测试边界的逐项说明：
 * 文档加载器返回深拷贝，测试中的修改不能直接改变 disk。
 * 文档保存器同样深拷贝，只有真正调用保存才能改变 disk。
 * 这两个方向都复制，是为了捕获绕过保存接口的共享引用问题。
 * failSave 在写入入口抛异常，模拟磁盘不可写而不是模拟 ComfyUI 出错。
 * 错误只触发一次，让下一次显式 flush 能证明恢复能力。
 * Toast 保存词条键，断言关注错误类别而不是当前语言字面值。
 * 实际词条键的双语对应由项目语言门禁验证。
 * ComfyUI 取消接口在此不做远程工作，运行取消用本地阶段回调控制。
 * 图片 URL 释放接口是空边界，本组不声称测量浏览器图像内存。
 * 设置 store 不被通用 enqueueGenerationTask 读取，因此只需提供空模块。
 * 图库 store 同样不参与通用执行器，出现意外读取时测试会直接报错。
 * 通知 store 允许停止和失败收尾，通知本身不作为统计正确的证据。
 * 工作流构造器在这组队列测试中不执行，模型图另用纯函数输入验证。
 * 模型解析器也不会对用户目录发起扫描。
 * 输出目录工具不执行，夹具路径只是确认保存数量的身份。
 * 元数据构造器不执行，PNG 字节格式由既有 Meta 检查负责。
 * 媒体 IPC 不发生，避免测试意外向正在运行的 ComfyUI 提交任务。
 * 用户数据 IPC 不发生，测试不会接触真实 JSON 文件。
 * 这些替身只位于本脚本内存模块加载器中。
 * 测试没有修改 require.cache 的全局依赖，所以不会影响其他 Node 工具。
 * 同一边界被多个生产模块导入时，返回同一个替身对象。
 * 这样保存失败开关和消息数组才对应同一条实际调用链。
 * 替身中没有预设成功率，实际指标必须由生产汇总器计算。
 * 替身中没有预设模型数量，模型去重也必须由生产代码完成。
 * 替身中没有主动创建历史记录，终态记账必须经过真实状态迁移。
 * 因此丢掉失败记录、重复记账、提前 flush 都可以被后面的断言发现。
 */
const mocks = {
  "@/i18n": { t: key => key },
  "@/utils/userDataDocument": {
    loadUserDataDocument: async () => ({ data: structuredClone(disk) }),
    saveUserDataDocument: async data => {
      if (failSave) { failSave = false; throw new Error("fixture write failure"); }
      disk = structuredClone(data);
    },
  },
  "@/stores/useToastStore": { useToastStore: { getState: () => ({ show: message => messages.push(message) }) } },
  "@/api/comfyui": { cancelComfyGeneration: async () => {}, revokeComfyImages: () => {} },
  "@/stores/useSettingsStore": {},
  "@/stores/useHistoryFolderStore": {},
  "@/stores/useGenerationNoticeStore": { useGenerationNoticeStore: { getState: () => ({ dismiss() {}, fail() {} }) } },
  "@/utils/comfy/imageWorkflow": {},
  "@/utils/comfy/resolveComfyModels": {},
  "@/utils/buildGeneratedImageMeta": {},
  "@/utils/generatedImages": {},
  "@/utils/electronBridge": {},
  "@/utils/saveGeneratedImages": {},
};

// 模块转译使用项目自带 TypeScript，不引入测试框架或第二套编译依赖。
// 每次测试进程独立加载，缓存让循环 type/runtime 导入沿用 CommonJS 语义。
// 路径只接受源码别名或正常依赖，不执行用户 JSON 中提供的模块名称。
// shared 的 Zod 使用真实依赖，坏文档验证不是简单的类型断言。
// 使用生产模块的目录建立 require，保证 pnpm 的包解析与源码一致。
/**
 * 内存加载器的约定与原因：
 * 输入 filename 是仓库内固定路径，不来自用户提示词。
 * 先检查模块缓存，避免每次 import 都创建一个独立 Zustand store。
 * 模块尚未完成初始化就放进缓存，支持任务 store 与历史 store 的依赖关系。
 * 编译结果只在当前进程执行，不在源码旁生成一套临时 JS 文件。
 * TypeScript 转译会删除 type-only 导入，测试无需伪造纯类型模块。
 * 实际运行的函数体来自源码，不在脚本里复制一份统计算法。
 * 普通 npm 依赖通过生产文件位置的 createRequire 解析。
 * 这使 pnpm 的链接布局仍然生效，尤其是 Zod 与 Zustand。
 * 源码别名先找渲染目录，再找 shared 目录，顺序对应项目配置。
 * 相对导入以当前模块目录为起点，不假设进程 cwd 恰好在源码目录。
 * 仅列举 ts、tsx 和 json 三种本任务需要的源码形式。
 * 找不到依赖时抛出明确错误，不返回空对象让断言误通过。
 * JSON 依赖按原始数据读取，不把工作流文本当成可执行脚本。
 * TS 转译使用 CommonJS，new Function 接收到受控 require。
 * exports 与 module.exports 指向同一个初始对象，兼容两种导出写法。
 * 缓存按完整文件路径建键，两个同名源码不会共享导出。
 * 模块异常由 main 的 catch 接住，使整个验证以非零退出。
 * 本加载器不参与产品构建，真实 Next 编译仍必须单独运行。
 * 本加载器没有浏览器 DOM，图表和日期排版需要 Electron 另测。
 * 测试可以据此检验纯逻辑和状态，不可以据此声称页面可点击。
 * 生产存储实现仍被加载，只有最末端文档读写被替换。
 * 因此微任务合并顺序与 pendingSave 的行为仍然受测。
 * 生产队列实现仍被加载，所以两个任务确实竞争同一个 FIFO 槽。
 * 断言使用导出的状态查询，无法通过修改测试局部副本来“修正”产品结果。
 */
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const localRequire = createRequire(file);
  const requireSource = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith("@/") && !name.startsWith(".")) return localRequire(name);
    const bases = name.startsWith("@/")
      ? ["apps/next/src/", "packages/shared/src/"].map(base => path.join(root, base, name.slice(2)))
      : [path.resolve(path.dirname(file), name)];
    const target = bases.flatMap(base => [base + ".ts", base + ".tsx", base + ".json"]).find(candidate => fs.existsSync(candidate));
    if (!target) throw new Error("Missing fixture module: " + name);
    return target.endsWith(".json") ? localRequire(target) : load(target);
  };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(requireSource, module, module.exports);
  return module.exports;
}

// 这些引用都指向生产实现；夹具只提供普通的时间、模型和图片路径。
// 模型名保留子目录，使 basename 去重错误会直接影响后面的断言。
// now 固定到本机中午，跨日测试不会依赖运行脚本时恰好几点。
// 记录时间属于本地 JSON，统一使用毫秒，不经过服务器时区转换。
/**
 * 共享夹具的时间和身份约定：
 * now 选择本机十一月一日中午，让当天边界测试不依赖实际执行时间。
 * 成功记录开始与完成相差两秒，而提交更早，可区分执行与排队。
 * 主模型名字包含 Anima 目录，确保规范化不丢掉路径。
 * LoRA 名字包含 style 目录，确保不按一个全局 basename 集合去重。
 * 两个名字都有 safetensors 扩展名，检查真实文件标识而非展示标题。
 * 元数据中的 total 为一次请求，不预设这次到底保存几张图片。
 * 已保存路径采用 fixture 字样，不能被误当成用户真实图库文件。
 * 这些路径只作为普通字符串进入任务状态，不执行文件读取。
 * images 的最终数量必须来自 savedPaths.length，而不是 metadata.total。
 * 初始磁盘含有用户名 kept，用来反证新增分段覆盖其他用户资料。
 * 初始磁盘不预塞成功记录，第一次队列完成必须真正触发记账。
 * 消息数组开始为空，统计保存失败时必须由生产 catch 写入。
 * modules 缓存为当前进程独享，脚本重跑不会继承上一次的状态。
 * Date 与 Promise 使用 Node 的真实实现，验证真实微任务次序。
 * pause 只等待下一个主进程轮次，不为任务构造虚假的经过时间。
 * 测试里的 fixed now 只传给纯汇总器，不修改全局 Date.now。
 * 因此队列创建、执行与结束仍具有真实时间先后关系。
 * 跨日断言不需要用户修改电脑时间或时区。
 * 生产 store 方法引用由同一个内存模块图共享。
 * 这让普通任务更新能到达真正的历史记录 store。
 * 导出的 queue 来自原公共调度模块，不是测试编写的简化 FIFO。
 * 导出的 storage 来自原分段持久化模块，不是直接赋值的伪保存器。
 * 这些关系保证后面检查的是实际接线而不只是数学公式。
 */
const api = load(path.join(root, "apps/next/src/utils/generation-statistics.ts"));
const history = load(path.join(root, "apps/next/src/stores/use-generation-history-store.ts")).useGenerationHistoryStore;
const tasks = load(path.join(root, "apps/next/src/stores/useGenerationTaskStore.ts")).useGenerationTaskStore;
const queue = load(path.join(root, "apps/next/src/utils/image-generation-queue.ts"));
const storage = load(path.join(root, "apps/next/src/utils/userDataStorage.ts"));
const now = new Date(2026, 10, 1, 12).getTime();
const mainModel = { role: "main", loader: "unet", name: "Anima/base.safetensors" };
const loraModel = { role: "lora", loader: "loras", name: "style/detail.safetensors" };
const metadata = { prompt: "fixture", model: mainModel.name, width: 512, height: 512, total: 1, folderId: null };
const pause = () => new Promise(resolve => setImmediate(resolve));

// 当前格式先做 golden 检查，再进入旧文档与坏输入用例。
// 有效记录旁边塞入无效项，验证局部损坏不会清空整份历史。
// 最后一个重复 ID 更新原任务，不增加总量，不保留未知 secret 字段。
// 时间倒置、负图片数与未知版本不得进入当前统计。
// 老文档根本没有这段时，应得到空账本，而不是加载异常。
/**
 * 格式用例的反证安排：
 * golden 先提供所有当前版本的必需字段。
 * 起止时间有序，保证正常记录不因其他错误而被偶然排除。
 * models 使用合法主模型身份，保证验证覆盖完整嵌套结构。
 * 额外的 secret 字段用于确认白名单输出，不能留到持久化快照里。
 * 同一个 ID 再提供 images 为三的版本，用来验证覆盖而非累加。
 * 如果错误地把两个 ID 相同的对象当成两次任务，length 断言会失败。
 * 如果错误地保留第一次快照，images 的三张断言会失败。
 * null 记录夹在正常数组中，验证单条损坏不清空其他记录。
 * bad 记录把结束时间改成早于提交，专门覆盖时间顺序 refine。
 * 该记录其他字段保持正确，所以不能把失败归因于缺少模型。
 * undefined 代表旧主文档完全没有生成分段。
 * null 代表字段被手动清空或旧导入器写空值。
 * 数组作为顶层代表结构混淆，不能当作合法账本处理。
 * 数值顶层保证动态访问前确实做了对象缩窄。
 * version 为二代表未来格式，不能按当前 v1 解释。
 * 未来格式里故意放入合法小票，防止版本检查被好数据绕过。
 * records 为 null 代表顶层版本正确但列表形状错误。
 * 每一种坏输入都必须返回独立空账本而不是抛异常。
 * 负图片数用独立用例检查，不能因过滤了 null 就以为计数合法。
 * 对象中保存时间使用普通数字，不靠 Date 实例参与验证。
 * 未知字段剔除使用 hasOwn 检查，不仅检查显示层没画出来。
 * 恢复结果的图片数量使用严格数字相等，字符串三不能误通过。
 * 这一组先于旧文档回落执行，符合先保护当前格式的顺序。
 * 如果当前格式读不回，后续队列测试即使运行也不能宣称迁移兼容。
 * 恢复函数没有文件 I/O，所以这些用例不会破坏用户数据。
 */
/**
 * 格式失败的定位方法：
 * 如果整个函数抛异常，先看顶层缩窄是否在访问 records 之前发生。
 * 如果 golden 被清空，先单独检查 GenerationRecordSchema 的 safeParse 结果。
 * 如果 ID 数量变成二，说明恢复器没有以任务 ID 建索引。
 * 如果 images 仍为二，说明重复 ID 取了第一条而没有取最后有效值。
 * 如果 secret 仍存在，说明恢复结果直接透传了原对象。
 * 这种透传不仅影响显示，还会在下一次保存时把未知内容继续传播。
 * 如果 bad 被保留，检查时间顺序 refine 是否真正参与了 parse。
 * 不要只检查 TypeScript 类型，因为 JSON 导入没有编译期类型保护。
 * 如果 future version 被接受，检查版本判断是不是仅判断字段存在。
 * 字段存在与字段等于当前支持版本不是一回事。
 * 如果负数被接受，检查图片数是否仍使用不带约束的 number。
 * 不要在测试中先过滤负数，否则无法证明生产恢复器会拦截。
 * 如果正常记录与坏记录一起消失，检查是否对整个数组做全有或全无校验。
 * 本产品要求局部坏记录可被剔除，其他正常历史继续可见。
 * 这些失败都属于本地格式契约问题，不需要连接 ComfyUI 才能排查。
 */
function checkFormat() {
  const record = { id: "golden", status: "completed", createdAt: now - 2000, startedAt: now - 1000, finishedAt: now, images: 2, models: [mainModel], secret: "strip" };
  const current = api.normalizeGenerationHistory({ version: 1, records: [record, { ...record, images: 3 }, null, { ...record, id: "bad", finishedAt: 0 }] });
  assert.equal(current.records.length, 1);
  assert.equal(current.records[0].images, 3);
  assert.equal(Object.hasOwn(current.records[0], "secret"), false);
  for (const input of [undefined, null, [], 3, { version: 2, records: [record] }, { version: 1, records: null }]) {
    assert.equal(api.normalizeGenerationHistory(input).records.length, 0);
  }
  assert.equal(api.normalizeGenerationHistory({ version: 1, records: [{ ...record, images: -1 }] }).records.length, 0);
}

// 图包含同名不同目录文件、重复 LoRA、零权重与负权重。
// VAE 和 CLIP 即使名字像主模型，也不能混入两类模型计数。
// Checkpoint 与 UNet 都是主要模型，LoRA 则有独立角色。
// 反斜杠应保留目录语义并归一为斜线，不能只剩末尾文件名。
// CLIP 权重非零的 LoRA 确实参与图，模型权重为零也不能漏记。
/**
 * 加载器矩阵的反证安排：
 * a 节点是 UNETLoader，文件标识使用 Windows 反斜杠。
 * b 节点是 CheckpointLoaderSimple，basename 与 a 相同但目录不同。
 * 这两项共同证明主模型不是只认可一个节点类别。
 * c 节点使用负 LoRA 权重，证明非正数不等于未启用。
 * d 节点与 c 同名但为正权重，证明重复加载只算一个身份。
 * e 节点权重为零，应从实际使用快照剔除。
 * f 节点是 VAE，文件名也叫 base，专门反证按名字猜类别。
 * g 节点是 CLIP，证明编码器不是用户要求的主要模型。
 * h 节点模型权重为零、CLIP 权重为一，仍然确实影响生成。
 * h 与 c 的 basename 都是 detail，但目录不同，应保留两个 LoRA。
 * 模型总数拆成 main 和 lora 分别检查，不能只检查四这个合计。
 * 否则错误地把 VAE 算主模型、再漏掉 CLIP LoRA 也可能碰巧得到四。
 * 首项名称检查完整目录，能捕获 basename 截断回归。
 * 纯加载器片段没有输出，用于检查身份预览的回落行为。
 * 接着补一个真正的 PreviewImage 输出，测试完整图的执行可达性。
 * 输出只连接 a，其他加载器全部留在原对象里但成为断开分支。
 * 回溯结果必须只剩一个主要模型，而不是继续统计四个资源。
 * 这条反证能捕获简单 Object.values 扫全图带来的旧节点误计数。
 * 连接使用节点 ID 和输出序号，符合 ComfyUI 原生链接形状。
 * 测试没有根据显示名做搜索，规范化必须来自生产函数。
 * 测试没有提供模型文件体积，分类不能依赖大小猜测。
 * 测试没有提供 SHA256，统计不能额外要求读取模型字节。
 * 测试不会真正加载模型，图的可执行性只检查所需的连接身份。
 * 实际 ComfyUI 节点兼容性由实机生成决定，不由这个矩阵断言替代。
 */
/**
 * 模型失败的定位方法：
 * 若主要模型数量多出一项，优先检查 VAE 是否被错误纳入。
 * 若主要模型数量少一项，核对 CheckpointLoaderSimple 是否在白名单。
 * 若 LoRA 数量多一项，查看零权重 off 是否漏掉了过滤。
 * 若 LoRA 数量少一项，查看只作用于 CLIP 的 h 是否被误判未使用。
 * 若 LoRA 数量因 c 和 d 变为三，检查是否按节点 ID 而非模型身份去重。
 * 若名称只剩 base.safetensors，检查是否在快照阶段使用了 basename。
 * 若输出回溯仍返回多项，检查输出节点是否作为遍历起点。
 * 若输出回溯返回零项，核对链接第一个元素是否按字符串 ID 比较。
 * 图的节点键与文件名不同，不能用文件名称查 prompt 对象。
 * 排查时查看节点 class_type 与对应输入字段即可，无需读取模型文件。
 * 不要为让测试通过把这些加载器改成同一假节点类型。
 * 不要用最终数组总长度替代两类各自的长度断言。
 * 这会让不同类别的漏项与多项互相抵消。
 * 不要为了修复长路径把所有名称统一取最后一段。
 * 那会掩盖用户两个目录里同名模型的真正区别。
 */
function checkModels() {
  const graph = {
    a: { class_type: "UNETLoader", inputs: { unet_name: "Anima\\base.safetensors" } },
    b: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "SDXL/base.safetensors" } },
    c: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "style/detail.safetensors", strength_model: -0.5 } },
    d: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "style/detail.safetensors", strength_model: 0.5 } },
    e: { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "off.safetensors", strength_model: 0 } },
    f: { class_type: "VAELoader", inputs: { vae_name: "base.safetensors" } },
    g: { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors" } },
    h: { class_type: "LoraLoader", inputs: { lora_name: "clip/detail.safetensors", strength_model: 0, strength_clip: 1 } },
  };
  const models = api.generationModelsFromPrompt(graph);
  assert.equal(models.filter(model => model.role === "main").length, 2);
  assert.equal(models.filter(model => model.role === "lora").length, 2);
  assert.equal(models[0].name, "Anima/base.safetensors");
  // 加上输出连接后，断开的 Checkpoint 与 LoRA 不应继续参与实际任务统计。
  // 连接链只通向 a，重复访问或环路不能造成无限递归。
  graph.out = { class_type: "PreviewImage", inputs: { images: ["a", 0] } };
  assert.equal(api.generationModelsFromPrompt(graph).length, 1);
}

// 一单成功两张、另一单异常前成功一张，再放入一单用户停止。
// 取消单即使已经有十张文件，也按用户规则整体排除所有统计。
// 成功率为一半，平均耗时只取成功任务的两秒，不混入等待时间。
// 不同目录的同名主模型必须算两个，再加一个 LoRA，共三个模型。
// 老于七天的任务在七天窗口排除，在三十天窗口仍然能找到。
// 未来任务不属于当前统计，不能因为与今天同日就提前算进来。
/**
 * 指标矩阵的反证安排：
 * ok 任务成功保存两张，提交与开始之间故意留出等待。
 * failure 任务保存一张后异常，代表批次部分成功。
 * stop 任务手动停止，故意留下十张保存数量。
 * 十张这个大值使停止泄漏进总数时差异明显，不能靠舍入掩盖。
 * old 任务位于二十天前，应该被七天窗口排除。
 * old 的创建和开始也同步提前，保证它仍是合法时间顺序。
 * future 任务在 now 之后一秒完成，但仍位于同一日历日。
 * 因此仅按日期过滤的错误实现会把它提前算入，attempts 断言能发现。
 * 七天统计只应保留 ok 和 failure 两条尝试。
 * 总产图为三，不能只统计成功任务的两张。
 * 尝试次数为二，不能把三张图片当成三次尝试。
 * 成功率为百分之五十，不能使用图片数量计算成三分之二。
 * 平均成功耗时为两秒，不能从提交时间开始计算成八秒。
 * 失败任务耗时不混入成功任务平均值。
 * 两个主要模型 basename 相同但目录不同，必须算两个模型身份。
 * 同一 LoRA 在成功任务的两张图里记两次使用。
 * 该 LoRA 不出现在 failure 任务里，因此不能记第三次。
 * 最终模型总数应是两个主要模型加一个 LoRA。
 * 用户停止任务的模型不能再贡献一个虚假的使用次数。
 * 小时图相加必须等于三张，反证某一张被分配到两个小时。
 * 日期图相加同样必须等于三张，反证批次图片被漏掉。
 * 第一天没有尝试，其成功率应为空而不是零。
 * 切换三十天以后，old 应回来，future 仍然留在窗口之外。
 * 三十天 attempts 因而比七天多一，而不是简单扩大日期轴却保持旧数据。
 * 空账本的成功率要是 null，不能因为分母保护写成零。
 * 比较均使用原始数值，不依赖图表 tooltip 的显示格式。
 * 这能在 ECharts 未挂载时就发现真实统计口径错误。
 * 图表截图负责验证接线，不能替代本组独立算术反证。
 */
/**
 * 汇总失败的定位方法：
 * 总量若为十三，通常意味着停止任务的十张没有被排除。
 * 总量若为二，通常意味着失败批次已经保存的一张被错误抹掉。
 * 尝试若为三，先检查停止和未来记录哪一条泄漏进了窗口。
 * 成功率若接近百分之六十七，检查是否拿产图张数当了任务分母。
 * 平均值若接近八秒，检查是否错误使用 createdAt 当执行起点。
 * 模型总数若只有二，查看两个目录中的 base 是否按 basename 合并。
 * LoRA 用量若超过二，查看停止任务是否贡献了模型使用次数。
 * 小时合计与日期合计不一致时，检查两个分组是否使用了不同图片字段。
 * 小时图不应按任务数累计，而日期图按图片数累计。
 * 七天和三十天尝试相同，说明周期只是改变了横轴而没有筛选历史。
 * 首日成功率为零，说明“没有尝试”被混同于“尝试全部失败”。
 * 这些差异可以由返回对象直接定位，无需等待图表截图。
 * 修复时保留固定 now，不依赖测试执行当天恰好还有哪些日期。
 * 不要把期望值改成生产结果，否则独立反证会失去作用。
 * 不要先手工移除 stop 再调用汇总，那会绕过本组最重要的过滤规则。
 */
function checkSummary() {
  const base = { id: "ok", status: "completed", createdAt: now - 9000, startedAt: now - 3000, finishedAt: now - 1000, images: 2, models: [mainModel, loraModel] };
  const records = [base, { ...base, id: "failure", status: "failed", images: 1, models: [{ ...mainModel, name: "other/base.safetensors" }] }, { ...base, id: "stop", status: "cancelled", images: 10 }, { ...base, id: "old", createdAt: now - 20 * 86400000, startedAt: now - 20 * 86400000, finishedAt: now - 20 * 86400000 }, { ...base, id: "future", finishedAt: now + 1000 }];
  const result = api.summarizeGenerationHistory({ version: 1, records }, 7, now);
  assert.equal(result.total, 3);
  assert.equal(result.attempts, 2);
  assert.equal(result.successRate, 50);
  assert.equal(result.averageMs, 2000);
  assert.equal(result.modelCount, 3);
  assert.equal(result.usage.lora[0].value, 2);
  assert.equal(result.hours.reduce((sum, value) => sum + value, 0), result.total);
  assert.equal(result.counts.reduce((sum, value) => sum + value, 0), result.total);
  assert.equal(result.rates[0], null);
  assert.equal(api.summarizeGenerationHistory({ version: 1, records }, 30, now).attempts, 3);
  assert.equal(api.summarizeGenerationHistory({ version: 1, records: [] }, 7, now).successRate, null);
}

// 生成执行器用受控回调模拟真实阶段；公共任务状态机与记账都不替换。
// 完成回包后再补一条 completed，确认不会重复记账或重置结束时间。
// 旧文档其他分段必须保留，新增账本不能覆盖个人资料。
// 异常执行必须拒绝调用 Promise，同时在持久化账本里留下 failed。
// 音频共用队列时依旧有卡片时钟，但不能给图片统计增加一次任务。
/**
 * 成功与异常生命周期的反证安排：
 * 执行器由真实公共队列调用，不手动拼一条完成记录放进账本。
 * 第一步进入 generating，让生产 store 设置真实 startedAt。
 * 第二步进入 saving，验证时钟不会在保存阶段重新开始。
 * 第三步同时发布 completed 与两个保存路径。
 * metadata.total 仍是一，反证统计使用请求数量而不是实际文件数。
 * 任务 Promise 完成后等待一个微任务轮次，允许统计刷盘完成。
 * 随后再更新相同 completed，模拟重复通知或 UI 补字段。
 * 结束时间必须保持首次终态的值，不能因重复更新而延长耗时。
 * 账本中相同 ID 必须只有一条，不能把重复通知变成两次成功。
 * 磁盘夹具的 images 必须为二，不能只在内存中更新了卡片。
 * 初始 username 必须仍是 kept，反证分段写入覆盖整份用户资料。
 * 开始时间不得早于创建，结束时间不得早于开始。
 * 这些比较使用任务自己的时间，不能拿测试固定 now 混入队列时钟。
 * 失败执行器真正抛出 Error，而不是直接给 task.status 赋 failed。
 * 公共 catch 必须拒绝 Promise，调用方不能误收到一个成功结果。
 * 失败状态还必须进入磁盘账本，不能只变成临时红色卡片。
 * 失败记录没有 savedPaths，因此不会增加模型使用次数。
 * 音频执行器也通过同一个公共 FIFO，避免使用另一个专门测试的队列。
 * 音频先进入 generating 再 completed，证明它确实经历了终态边界。
 * 音频有实际保存字符串，不能靠零结果恰好绕过图片统计。
 * 历史账本不应找到音频 ID，表明媒体过滤发生在记账入口。
 * 卡片时钟与统计范围是独立契约，音频不入图片账本不影响时钟。
 * 整个过程没有关闭页面，所以路由恢复另由 Electron 专项覆盖。
 * 本组验证产品状态与持久化接线，不使用 mock 统计结果作为期望。
 */
/**
 * 完成阶段失败的定位方法：
 * 若 Promise 已完成而 disk 没有记录，检查统计写入是否只停留在内存。
 * 若内存有记录但 disk 缺少最后一项，检查 flush 是否早于分段 setItem。
 * 若第二次 completed 改变结束时间，检查终态判断是否以旧任务状态为准。
 * 只检查 patch.status 会让每次 completed 都重设时钟。
 * 若用户名丢失，检查分段 storage 是否用小票对象覆盖了完整文档。
 * 若记录图片数为一，检查是否误用了请求 total。
 * 若记录图片数为零，检查终态发布与 savedPaths 更新是否分成两次。
 * 若 failed.promise 没有拒绝，检查公共 job.run 是否吞掉了执行器错误。
 * 若卡片失败但 disk 中没有 failed，检查终态记账入口是否只接受成功。
 * 若音频进入了图片账本，检查 mediaKind 条件是否放在调用方而遗漏共享入口。
 * 这里用的是音频真实字段，而不是以文件扩展名判断媒体类型。
 * 若异常变成未处理拒绝，检查测试是否已经等待相应 Promise。
 * 产品调用方也需要消费拒绝，任务 store 的红色状态不能替代 Promise 边界。
 * 若时钟关系反转，查看系统时间保护与 startedAt 首次设置条件。
 * 不要依赖测试中人为 sleep 增加一秒来修复时间顺序断言。
 */
async function checkCompletion() {
  const job = queue.enqueueGenerationTask(metadata, async id => {
    tasks.getState().update(id, { status: "generating", models: [mainModel, loraModel] });
    tasks.getState().update(id, { status: "saving" });
    tasks.getState().update(id, { status: "completed", savedPaths: ["fixture-a.png", "fixture-b.png"], completed: 1 });
  });
  await job.promise;
  await pause();
  const task = tasks.getState().tasks.find(item => item.id === job.id);
  tasks.getState().update(job.id, { status: "completed" });
  assert.equal(tasks.getState().tasks.find(item => item.id === job.id).finishedAt, task.finishedAt);
  assert.equal(history.getState().data.records.filter(item => item.id === job.id).length, 1);
  assert.equal(disk.generationHistory.records.find(item => item.id === job.id).images, 2);
  assert.equal(disk.profile.username, "kept");
  assert.ok(task.startedAt >= task.createdAt && task.finishedAt >= task.startedAt);
  const failed = queue.enqueueGenerationTask(metadata, async id => { tasks.getState().update(id, { status: "generating" }); throw new Error("ComfyUI fixture error"); });
  await assert.rejects(failed.promise);
  await pause();
  assert.equal(disk.generationHistory.records.find(item => item.id === failed.id).status, "failed");
  const audio = queue.enqueueGenerationTask({ ...metadata, mediaKind: "audio" }, async id => { tasks.getState().update(id, { status: "generating" }); tasks.getState().update(id, { status: "completed", savedPaths: ["fixture.wav"] }); });
  await audio.promise;
  await pause();
  assert.equal(history.getState().data.records.some(item => item.id === audio.id), false);
}

// 第一项占住执行槽，第二项仍在等待，此时撤回第二项不能创建开始时间。
// 正在执行的第一项也由用户停止，但不发送无目标的远端 interrupt。
// 只有执行器释放后 drain 才能继续，防止停止后立刻重叠提交远端任务。
// 两个 Promise 都要消费拒绝，验证取消不会泄漏成未处理异常。
// 停止前后的任务统计分母相同，两条停止小票只保留审计，不进入指标。
/**
 * 主动停止的反证安排：
 * 先读取停止前的 attempts，后面只检查分母保持不变。
 * 这避免依赖前一组到底生成几次，测试组顺序可以调整。
 * gate 是显式阻塞的执行阶段，用来稳定制造一项运行、一项排队。
 * 第一项进入 generating 后等待 gate，真正占住公共队列。
 * 第二项的执行器一旦运行就抛出 must not execute。
 * 因此撤回排队任务如果仍然运行，不会被忽略而是明确失败。
 * 两个任务的 Promise 在点击停止前就注册 rejects 断言。
 * 这样拒绝不会先成为未处理异常，测试环境与产品调用方的职责一致。
 * 先撤回第二项，确认没有远端生成需要停止。
 * 再停止第一项，其 remote 回调明确返回 false。
 * 这模拟本地准备阶段，不发送可能打断别的客户端的全局 interrupt。
 * 停止后释放 gate，让原执行器自己读取 AbortSignal。
 * 不能在取消时强行清掉执行槽，否则旧执行器还可能继续提交。
 * 执行器调用 throwIfAborted，公共失败收尾应把它识别为取消。
 * Promise 取消和 task.cancelled 必须同时成立，不能只修改卡片文案。
 * 第二项没有真正开始，所以它的 startedAt 应保持缺失。
 * 第一项的账本状态必须为 cancelled，不能误归类成普通失败。
 * 统计 attempts 与停止前相同，证明两种停止都从分母排除。
 * 记录本身仍可留在账本，排除统计不等于删除用户已经保存的文件。
 * 测试没有固定执行耗时，等待 gate 的时间不作为指标断言依据。
 * 取消规则由公共模块实现，不在测试里直接过滤 task 数组后假装生效。
 * 如果队列提前释放导致第二执行器运行，must not execute 会暴露这个问题。
 * 如果 DOMException 被当成一般 Error，failed 会泄漏进尝试次数。
 * 如果仅排队停止被排除，第一项仍会让最终 attempts 增加。
 * 这三种错误分别对应调度、错误分类和统计范围，不能只测一个 UI 按钮。
 */
/**
 * 取消阶段失败的定位方法：
 * 若第二执行器运行，查看 cancelPending 是否确实把 job 从 pending 移除。
 * 只把 status 改为 cancelled 不能阻止已经排好的执行闭包。
 * 若停止第一项后 Promise 一直等待，确认 gate 已释放以及 signal 已传入执行器。
 * 取消信号只表示请求停止，不会自动终止任意 JavaScript Promise。
 * 生产执行器必须在异步边界主动检查 signal。
 * 若第一项被记为 failed，检查 DOMException 的 AbortError 是否保留原类型。
 * 把取消包装成普通 Error 再传给队列会丢掉这种类别证据。
 * 若第二项获得 startedAt，检查时钟是否错误地在 add 时设置。
 * 若 attempts 增加，查看 cancelled 是在汇总前排除还是只在某张图表排除。
 * 本组只读公共汇总结果，所以能发现图表之间过滤不一致的根源。
 * 若远端取消接口被调用，核对 remote 回调是否在每次停止时重新读取。
 * 远端可用性不能冻结成提交时的状态。
 * 若后续任务与第一项重叠，检查取消时是否提前删除了运行槽引用。
 * 释放 gate 之前不得将 drain 当作已经结束。
 * 取消分支的问题属于时序和状态契约，不能靠提高最大工具轮数解决。
 */
async function checkCancellation() {
  const before = api.summarizeGenerationHistory(history.getState().data, 7).attempts;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = queue.enqueueGenerationTask(metadata, async (id, signal) => { tasks.getState().update(id, { status: "generating" }); await gate; signal.throwIfAborted(); }, () => false);
  const second = queue.enqueueGenerationTask(metadata, async () => { throw new Error("must not execute"); });
  const firstRejected = assert.rejects(first.promise);
  const secondRejected = assert.rejects(second.promise);
  await queue.cancelImageGeneration(second.id);
  await queue.cancelImageGeneration(first.id);
  release();
  await Promise.all([firstRejected, secondRejected]);
  await pause();
  assert.equal(tasks.getState().tasks.find(item => item.id === second.id).startedAt, undefined);
  assert.equal(disk.generationHistory.records.find(item => item.id === first.id).status, "cancelled");
  assert.equal(api.summarizeGenerationHistory(history.getState().data, 7).attempts, before);
}

// 写入失败发生在任务终态之后，必须单独提示统计保存错误。
// 生成卡片已经成功，不能为了统计文件失败把真实图片改成生成失败。
// 手动 flush 重试后能恢复，证明失败没有清掉 pendingSave。
// 随后清空内存账本再从文档水合，确认记录确实可跨重载恢复。
// 重载不应依赖原任务卡仍然存在，因此同时清空内存队列。
/**
 * 保存故障与恢复的反证安排：
 * failSave 只设在已完成前面各组之后，故障目标是这一次统计写入。
 * 执行器成功保存一张的结果在状态层明确发布。
 * 随后的统计 flush 才触发文档保存错误。
 * 因此生成结果已经成功，不能改成生成失败来掩盖统计错误。
 * 消息数组应收到 historySaveFailed 这一统计专用词条。
 * 用词条键比直接检查某句中文更能隔离语言变化。
 * 任务终态必须仍是 completed，反证保存错误被错误传播到生成 Promise。
 * 主文档内存缓存仍应包含新记录，不能在 catch 中清空它。
 * 显式调用 flushUserDataSave 重试，而不是再次运行生成器。
 * 这证明恢复不需要重复消耗一次模型推理。
 * 写入边界只故障一次，所以第二次保存应正常完成。
 * 如果失败时已经清掉 pendingSave，第二次 flush 会什么都不保存。
 * 后续磁盘快照必须带着新记录，因此会检测到这个丢失。
 * 重载前先复制磁盘账本，不能把当前 store 当作恢复来源。
 * 然后清空 history store，模拟页面或进程内存不再持有历史。
 * 同时清空任务 store，确认统计不依赖卡片数组重新推算。
 * 重新 prime 同一用户文档，再调用真正的 persist.rehydrate。
 * 恢复后的 data 与磁盘快照完整相等，不只比较条数。
 * 完整比较包含时间、状态、图片数和模型列表。
 * 所以即使恢复了数量却丢掉 LoRA 身份，也无法通过。
 * 恢复调用没有创建新任务，不应增加 attempts 或 finishedAt。
 * 本测试模拟重新加载数据，不把 Node 内存重置宣称为真实进程重启。
 * Electron 专项还会实际重新加载路由，检查渲染层从 IPC 文档恢复。
 * 两者分别保护纯数据契约与真实页面接入，证据不能互相替代。
 */
/**
 * 写盘阶段失败的定位方法：
 * 若消息数组为空，检查统计保存 catch 是否指向了实际 Toast 边界。
 * 若任务变为 failed，说明统计错误逃逸到了生成结果的失败通道。
 * 若第二次 flush 没有新记录，检查 catch 是否恢复 pendingSave。
 * 只在 console 打印错误并清掉 pending 会造成用户误以为统计已保存。
 * 若恢复后小票少了一条，比较 snapshot 与内存 store 的具体 ID。
 * 不要只检查 records.length，因为重复记录也可能保持相同总长度。
 * 若模型字段丢失，查看 schema 输出与用户分段是否保存了同一种形状。
 * 若时间字段变成字符串，检查是否经过了不匹配的日期迁移。
 * 若清空任务 store 后统计也消失，说明仍在从临时卡片推算历史。
 * 若 prime 后读到旧缓存，检查 storage 的 loadPromise 与 documentCache 是否同步更新。
 * 本组以同一文档快照重建，是为了把缓存错误与磁盘写入错误分开定位。
 * 不应通过直接给 history store 填 snapshot 来替代 persist.rehydrate。
 * 那会跳过正式恢复校验，也无法证明用户文档分段已接通。
 * 不应通过重新生成一张图来重试统计保存，那会改变本次成功计数。
 * 保存错误修复应恢复同一张小票，不额外创建第二个任务 ID。
 */
async function checkPersistence() {
  failSave = true;
  const job = queue.enqueueGenerationTask(metadata, async id => { tasks.getState().update(id, { status: "generating" }); tasks.getState().update(id, { status: "completed", savedPaths: ["saved.png"] }); });
  await job.promise;
  await pause();
  assert.ok(messages.includes("profile.ui.historySaveFailed"));
  assert.equal(tasks.getState().tasks.find(item => item.id === job.id).status, "completed");
  await storage.flushUserDataSave();
  const snapshot = structuredClone(disk.generationHistory);
  history.setState({ data: { version: 1, records: [] } });
  tasks.setState({ tasks: [] });
  storage.primeUserDataDocument({ ...disk, generationHistory: snapshot });
  await history.persist.rehydrate();
  assert.deepEqual(history.getState().data, snapshot);
}

// 界面只留四十条历史卡片，账本必须保存更早任务而不是跟着卡片被裁掉。
// 此组用五十次真实 store 状态迁移验证，不能只检查 retention 常量。
// 时间和结果属于当前测试进程，模型、提示词与文件并不来自用户目录。
// 运行后从账本点名最早那条，证明“条数够多”不是重复写入造成的假通过。
/**
 * 历史保留的反证安排：
 * 五十项超过原有四十条卡片上限，保证确实触发 UI retention。
 * 每项都有独立 ID，不能靠重复相同任务 ID 凑成五十次。
 * 每项都从 queued 到 generating，再到 completed。
 * 这意味着写入账本仍经过真实任务时钟和终态边界。
 * 不直接调用 history.record 塞入五十条预设历史。
 * 保存路径可以相同，因为本组检查任务保留而不是文件内容去重。
 * 每个任务的 images 都表示它这一次确认保存的数量。
 * 被清理卡片没有预览 URL，避免 Node 环境依赖浏览器图像对象。
 * 原实现清理卡片时调用 URL.revokeObjectURL 的其他分支不在本组测量范围。
 * 完成全部迁移后等待异步记账轮次，再读取最终状态。
 * 任务卡应严格保留四十条，避免为了保留统计而取消原 UI 清理策略。
 * 账本的 retained 前缀任务应严格有五十条。
 * 这两个断言一起证明卡片保留与历史保留已拆开。
 * 随后点名 retained-0，确保最早任务真的存在。
 * 只检查总数可能被重复项或其他组记录碰巧补足，所以还需要点名。
 * 按前缀计数可避开其他测试组的成功任务数量。
 * 所有 ID 只属于本测试进程，不会与用户 UUID 相撞。
 * 统计查询仍可选择七天或三十天，保留历史不意味着界面一次渲染全部历史。
 * 本组没有删除旧记录的产品入口，不会在验证时迁移用户真实文件。
 */
/**
 * 保留阶段失败的定位方法：
 * 卡片超过四十条时，查看原 add 清理终态列表的逻辑是否被统计改动破坏。
 * 账本恰好只剩四十条时，查看是否误把卡片裁剪数组写进了历史段。
 * 账本少于五十但超过四十时，查看是否还有异步终态写入未完成。
 * 因此本组在读取前等待一个实际事件循环轮次。
 * 最早 ID 缺失但条数正确时，优先排查重复 ID 覆盖或不正确的窗口裁剪。
 * 同一毫秒内多个任务不能共享 ID，时间戳不能代替任务身份。
 * 文件路径相同也不能作为任务去重键，因为用户允许重用输出文件名规则。
 * 只有公共队列的 task.id 才是本轮终态幂等依据。
 * 如果新任务追加后旧历史消失，检查记录动作是否拿空默认 data 覆盖已水合状态。
 * record 的过滤条件应只替换相同 ID，而不是替换同一天的所有任务。
 * 不要提高卡片上限到五十来让账本检查通过。
 * 那只隐藏 UI 与历史耦合，并没有解决长期累计的根因。
 * 不要给本组账本预塞五十条记录，必须让状态机自己生成它们。
 * 这组验证不涉及真实模型加载，故障定位应先看内存状态和文档段。
 * 模型 GPU 缓存是否释放属于另一项媒体资源能力，不由此处条数判断。
 */
async function checkRetention() {
  for (let index = 0; index < 50; index++) {
    const id = "retained-" + index;
    tasks.getState().add({ ...metadata, id, status: "queued", completed: 0, createdAt: Date.now(), previewUrl: null, savedPaths: [], error: null });
    tasks.getState().update(id, { status: "generating" });
    tasks.getState().update(id, { status: "completed", completed: 1, savedPaths: ["fixture.png"] });
  }
  await pause();
  assert.equal(tasks.getState().tasks.length, 40);
  assert.equal(history.getState().data.records.filter(record => record.id.startsWith("retained-")).length, 50);
  assert.ok(history.getState().data.records.some(record => record.id === "retained-0"));
}

// 所有组串行，避免同一个公共 FIFO 的夹具互相抢占运行槽。
// 任一断言或异步错误都以非零退出，不能只打印错误后仍报告通过。
// 结束前刷写的是隔离内存文档，不会接触本机真实 illusion-realm.json。
// 输出仅说明本地统计契约通过，不声称真实模型推理已通过。
/**
 * 执行顺序与交付证据：
 * 先验证当前格式，再验证工作流身份和指标数学。
 * 随后验证执行成功、执行异常与主动停止的真实公共队列分支。
 * 持久化恢复放在最后几组，避免它清空任务内存影响前面的断言。
 * retention 在恢复之后运行，证明新任务仍能正常追加到已水合账本。
 * 最后显式 flush 只保存隔离文档，确保异步尾声没有遗留未消费的失败。
 * 成功标记在所有 await 之后输出，不能先打印通过再等待出错。
 * 顶层 catch 设置非零退出码，使 CI 或人工执行能准确判读失败。
 * 脚本没有 app.quit 路径，不需要借 Electron 退出覆盖 Node 断言结果。
 */
/**
 * Promise 与事件循环的观察边界：
 * 执行器返回的 Promise 先给业务调用方回传生成结果。
 * 统计记录的异步保存可以在该结果回传后继续完成。
 * 因此测试使用 pause 等待实际微任务，而不是要求它同步写入。
 * setImmediate 会让已排队的 Promise continuation 先获得执行机会。
 * 这里没有用 setTimeout 编造任务耗时或生成百分比。
 * 产品记录的两个时间戳仍由真实状态边界读取。
 * 如果环境出现慢写盘，本机端到端验证应等待文档回执，而不是改大图片耗时。
 * 脚本结束前的显式 flush 负责收尾，不用 process.exit 强行截断异步工作。
 * process.exitCode 只标记失败，允许 Node 完成必要日志输出。
 * 测试日志不包含图片原字节、用户真实提示词或密钥。
 * 成功标记列出的是契约范围，不能解释为在线中转站已经通过审核。
 * 其他验证脚本可以独立执行，不依赖本脚本遗留的临时全局变量。
 */
async function main() {
  checkFormat();
  checkModels();
  checkSummary();
  await checkCompletion();
  await checkCancellation();
  await checkPersistence();
  await checkRetention();
  await storage.flushUserDataSave();
  console.log("GENERATION_STATISTICS_OK: format, workflow models, metrics, queue, cancellation, persistence");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
