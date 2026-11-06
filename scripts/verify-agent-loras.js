/**
 * Agent LoRA 契约回归：临时真实目录、来源 JSON、真实工具与真实工作流构造器。
 * 运行 node scripts/verify-agent-loras.js，不需要启动 Electron 或本地 ComfyUI。
 * 文件仅包含夹具字节，不是有效模型权重，因此不验证实际 GPU 加载或画面效果。
 * 主进程扫描、授权、资料校验及工具转发都执行生产实现，不替换兼容性判断。
 * 渲染模块使用 TypeScript 自带转译器在内存加载，不将辅助产物写入源码目录。
 * 仅替换服务器清单与 i18n，工作流 JSON 及 LoRA 注入代码使用项目真实版本。
 * 服务清单包含不同目录的同名项，专门防止 basename 回落造成选错模型。
 * 查询视频系列仅确认分类与拦截，不把测试描述为 Agent 已能生成视频。
 * 所有写入只发生在 mkdtemp 创建的目录，成功或失败均清理本轮夹具。
 * 不读取用户设置、模型、凭据，不访问网络或用户实际生成图库。
 * 顶层 catch 明确设置退出码 1，断言失败不能以成功进程状态收场。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const ts = require("../apps/next/node_modules/typescript");
const { listLoras, prepareLoraGeneration } = require("../apps/electron/src/main/modules/agent/lora-tools");
const { hostToolSpecs, findHostTool, settleHostCall } = require("../apps/electron/src/main/modules/agent/host-tools");
// 新清单沿用本脚本的真实目录、来源夹具和失败退出机制。
// 与下面的生成测试共用扫描证据，不再维护第二套模型测试框架。
// 此入口只接受测试路径，不读取应用当前用户设置。
const { listModels } = require("../apps/electron/src/main/modules/agent/model-catalog");
// 真实临时文件用于覆盖扫描和 realpath，而不是让一个假的清单直接返回预期系列。
// searchPath 夹具按 ComfyUI 标准目录布局，单独路径夹具稍后另行验证。
// fixtureRoot 只存在于测试进程，不会被持久化为用户的模型路径设置。
// assertions 记录通过的检查组，任何未捕获异常都会让整轮失败。
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(),"ir-agent-loras-"));
const paths = {searchPath:fixtureRoot,lorasPath:"",checkpointPath:"",diffusionModelsPath:""};
let assertions = 0;
/**
 * 每个 fixture 都创建一个模型路径和可选的同名来源文件。
 * baseModel 缺省表示没有来源资料，用于验证目录证据与 unknown 分支。
 * 模型扩展名与生产扫描器一致，文件内容不具有张量级语义。
 * 来源版本使用当前正式格式，错误版本用例在创建后单独改写。
 * modelType 按目录生成，使正常夹具不会被类型冲突误拦截。
 * 触发词固定为 fixture-tag，用来断言目录结果确实读取了来源资料。
 * 不在测试中调用下载或补全，避免外网状态影响兼容性回归。
 */
function fixture(relative, baseModel) {
  const file = path.join(fixtureRoot,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,"fixture");
  if (baseModel) fs.writeFileSync(file+".civitai.json",JSON.stringify({version:1,baseModel,modelType:relative.startsWith("loras/")?"LORA":"Checkpoint",trainedWords:["fixture-tag"]}));
  return file;
}
/**
 * 检查组可以包含同步断言和异步拒绝，必须等待完成后才能递增通过数。
 * 失败不打印部分成功摘要后继续运行，直接由顶层 catch 统一处理退出状态。
 * 名称说明当前验证风险，便于失败输出直接定位输入或工具链环节。
 */
async function check(name, run) { await run(); assertions++; console.log(`PASS ${name}`); }
/**
 * 内存转译真实 TS 模块，保留其 import/require 的运行时路径。
 * 类型检查另由 pnpm typecheck 执行，此处只负责纯函数和参数流行为验证。
 * 路径别名只允许显式列出的生产依赖，遇到意外新增依赖会直接失败。
 * comfyui 替身只返回服务器模型清单，不伪造架构判据或生成成功结果。
 * imageWorkflow 引用真实工作流 JSON，避免仅断言手写的假节点结构。
 * cloneComfyPrompt 使用标准深拷贝，功能等同生产函数的 JSON 克隆语义。
 * 词条替身保留 key 及参数，用来检查错误类别，不假装验证完整 UI 文案。
 * new Function 仅编译仓库内固定文件，不接受工具或网络输入作为可执行代码。
 */
function loadTs(relative, dependencies) {
  const filename = path.join(__dirname,"..",relative), exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const requireFixture = name => { assert.ok(name in dependencies,`Unmocked dependency: ${name}`); return dependencies[name]; };
  new Function("require","exports",code)(requireFixture,exports);
  return exports;
}

/**
 * 独立输入矩阵覆盖 Anima、SDXL、视频、未知、冲突和同名歧义。
 * 源数据底模与文件目录分别控制，保证错误分支不是都由一个字符串触发。
 * 未知 LoRA 放在普通目录，不能靠其文件名猜成 SDXL。
 * conflict 放在 Anima 目录但声明 SDXL，验证目录不得覆盖已知来源。
 * ambiguous 同时创建两个不同目录中的同名文件，完整名必须能消歧。
 * video 主模型与 LoRA 均有来源，验证“同为视频”仍不代表版本可混用。
 * misplaced Anima 放入 checkpoints，验证家族匹配之外还有加载器约束。
 * 来源损坏用 JSON 解析错误，区别于完全没有来源资料的目录兜底。
 * 只写一次夹具，后续检查顺序执行，避免并发修改影响某项证据。
 */
function setupFixtures() {
  fixture("diffusion_models/Anima/base.safetensors","Anima");
  fixture("checkpoints/SDXL/base.safetensors","Illustrious");
  fixture("diffusion_models/Wan2.2/video.safetensors","Wan 2.2 I2V-A14B");
  fixture("checkpoints/Anima/misplaced.safetensors","Anima");
  fixture("loras/Anima/a.safetensors","Anima"); fixture("loras/Anima/b.safetensors");
  fixture("loras/SDXL/x.safetensors","Pony"); fixture("loras/Wan2.1/v.safetensors","Wan 2.1");
  fixture("loras/Wan2.2/v.safetensors","Wan 2.2 I2V-A14B"); fixture("loras/Unknown/unknown.safetensors");
  fixture("loras/Anima/conflict.safetensors","SDXL 1.0");
  fixture("loras/Anima/one/duplicate.safetensors"); fixture("loras/Anima/two/duplicate.safetensors");
  fixture("loras/Misc/from-metadata.safetensors","Anima");
  const corrupt = fixture("loras/Anima/corrupt.safetensors"); fs.writeFileSync(corrupt+".civitai.json","{");
}
/** 基础契约检查与拒绝矩阵分开，基础输入可加载后，负向结果才具有可解释性。 */
async function checkCore(args) {
  // 此组是失败矩阵的正向基准：扫描目录可用、资料可读、名称可以唯一匹配。
  // 如果这里失败，不能把后续所有拒绝都解释成兼容性护栏正确生效。
  // 工具声明从 hostToolSpecs 读取，确保测试的是 sidecar 实际看到的形状。
  // 不直接读取源码字符串寻找 loras 字样，因为注释里出现同名文字不代表工具可用。
  // 兼容列表由真实 listLoras 产生，不使用手写预期列表替换执行函数。
  // 数据中同时放入可兼容和不可兼容项，防止 compatible 恒真或恒假的实现通过。
  // 来源触发词的精确断言证明 readEntry 输出实际流入工具查询结果。
  // 生成准备函数仅返回规范参数，没有在这些成功检查里执行任何 GPU 任务。
  // 零权重与负权重一起验证，能发现常见的 truthy 默认值转换问题。
  // 新旧对象身份不同证明准备阶段没有就地改写上层保存的原始请求。
  // SDXL 衍生例使用 Illustrious 主模型与 Pony LoRA，只保证 SDXL 架构归类。
  // 查询 note 限制效果承诺，不将训练子系列不同说成一定能获得理想画面。
  // 声明必须真实传到 sidecar，不能只增加一段不可调用的内部实现。
  // 生成工具必须声明 loras 数组和名称必填，否则模型无法按约定组装参数。
  // 权重上下界与运行时一致，避免 Schema 允许、执行却静默改写的分叉。
  await check("sidecar 工具声明包含 LoRA 查询与权重参数",() => {
    const specs = hostToolSpecs(); assert.ok(specs.some(item => item.name === "list_loras"));
    const schema = specs.find(item => item.name === "generate_image").parameters.properties.loras;
    assert.equal(schema.type,"array"); assert.deepEqual(schema.items.required,["name"]); assert.equal(schema.items.properties.strength.minimum,-5);
  });
  // 查询带主模型：已补全来源和目录兜底应分别保留证据来源。
  // SDXL、视频、未知与冲突条目必须保持不兼容，不能仅因为目录是 loras 就放行。
  // trainedWords 应来自当前版本来源文件，不能丢成空列表。
  // searchPath 下查询 LoRA 必须可用，不能继续按旧工具的根 key 过滤而返回空集。
  await check("检索根下 LoRA 发现、兼容性原因及触发词",async () => {
    const result = JSON.parse(await listLoras({model:args.model},paths));
    assert.equal(result.series,"anima"); assert.equal(result.total,11);
    assert.equal(result.loras.find(item => item.name === "Anima/a.safetensors").compatible,true);
    assert.deepEqual(result.loras.find(item => item.name === "Anima/a.safetensors").trainedWords,["fixture-tag"]);
    for (const family of ["sdxl","wan2.1","wan2.2","unknown","conflict"]) assert.equal(result.loras.find(item => item.family===family).compatible,false);
  });
  // 显式输入零权重与负权重，断言结果不经真假值处理变成默认 1。
  // 输入系列省略，实际主模型证据应推导 Anima；数组顺序必须原样保留。
  // 整个结果是新对象，不能为规范化名称而破坏调用者的原始参数。
  await check("实际主模型推导系列，LoRA 顺序及零/负权重保留",async () => {
    const result = await prepareLoraGeneration(args,paths); assert.equal(result.series,"anima"); assert.deepEqual(result.loras,args.loras); assert.notEqual(result,args);
  });
  // SDXL 衍生模型沿用 SDXL 模板，家族相同不等价于宣称训练底模效果一致。
  // 权重缺省时才采用 1，不能要求每次调用都显式填写。
  await check("SDXL 主模型允许 SDXL 衍生 LoRA，缺省权重为 1",async () => {
    const result = await prepareLoraGeneration({model:"SDXL/base.safetensors",loras:[{name:"SDXL/x.safetensors"}]},paths);
    assert.equal(result.series,"sdxl"); assert.equal(result.loras[0].strength,1);
  });
}
/** 每个失败输入使用同一个已通过基础组的主模型，从而隔离具体拒绝条件。 */
async function checkFailures(args) {
  // 以下每项只改变一个关键输入，避免所有失败都来自“缺少主模型”。
  // 跨系列、未识别系列、冲突来源和坏来源都必须在 renderer send 之前停止。
  // 使用字符串数字是实际语言模型常见脏输入，不能按 parseFloat 悄悄接受。
  // 重复输入即使是绝对路径别名，也必须按实际文件身份去重。
  // 不存在的路径不能通过工具给出绝对位置来绕过本地扫描白名单。
  const failures = [
    // 负向：两个文件都存在且各自有可读来源资料，排除文件缺失造成的偶然失败。
    // 主模型位于 diffusion_models/Anima，baseModel 明确为 Anima。
    // LoRA 位于 SDXL，资料为 Pony，属于 SDXL 衍生架构。
    // 保留正确的主模型名称，仅把扩展替换为另一个图片系列。
    // 不显式传 series，使执行端必须从实际主模型推导系列。
    // 不设置 strength，缺省权重合法，不应是失败的触发条件。
    // 预期错误含“不兼容”，而不是来源文件缺失或模型未扫描到。
    // 这个检查防止工具把全部图片 LoRA 当作可共用的模型扩展。
    // 即使未来统一了模型选择界面，也不能取消执行入口的家族约束。
    // 不涉及 SDXL 衍生模型之间的画风效果评价，仅验证明显的架构边界。
    ["跨图片系列",{...args,loras:[{name:"SDXL/x.safetensors"}]},/不兼容/],
    // 负向：Wan2.2 与 Anima 都能被明确识别，因此不能用 unknown 解释拒绝。
    // 视频 LoRA 在标准 loras 类别目录中，具备正常的 safetensors 扩展名。
    // 主模型仍为基础成功组的 Anima UNet，其他参数全部保留。
    // 工具不能仅按文件扩展名相同就把视频权重交给图片 KSampler。
    // LoRA 的 baseModel 是 Wan 2.2 I2V-A14B，目录也没有冲突。
    // 预期明确报不兼容，不能先发送任务再等待 ComfyUI 张量尺寸错误。
    // 这项与后面的“视频主模型走生图”不同，此处主模型本身是可用图片模型。
    // 它覆盖扩展列表里混入一个视频模型的常见误选场景。
    // 不要求测试机器拥有视频节点或 GPU，拒绝发生在提交工作流前。
    // 真实加载视频模型的效果不在这条预检断言的证明范围内。
    ["视频误入图片",{...args,loras:[{name:"Wan2.2/v.safetensors"}]},/不兼容/],
    // 负向：未知项是真实扫描到的文件，不是不存在名称的错误替代。
    // 它没有来源 JSON，普通目录也没有明确的系列标记。
    // 文件名故意不带架构词，避免目录兜底与名字猜测混淆。
    // 主模型已确认 Anima，unknown 不允许作为与任何主模型都匹配的通配值。
    // 预期结果是拒绝，并建议用户补全模型资料或明确分类。
    // 不能用“本地没有资料”推导为“应该就是当前系列”。
    // 查询中这条仍需可见，使用户知道它被识别为文件但不能直接加载。
    // 这个检查不要求缺少资料的所有文件都失败，明确目录的成功组单独验证。
    // 若以后增加张量头识别，应更新夹具并证明新证据真实生效。
    // 当前不伪造权重头，也不宣称已经进行了模型内容识别。
    ["未知系列",{...args,loras:[{name:"Unknown/unknown.safetensors"}]},/不兼容/],
    // 负向：冲突来源为合法 JSON，不能与无法解析的坏文件合并测试。
    // 目录明确标记 Anima，但来源 baseModel 写明 SDXL 1.0。
    // 两种证据各自可识别，冲突不能靠任选其一消失。
    // 使用完整相对名，排除裸文件名歧义导致的提前失败。
    // 主模型、强度以及加载器配置都是合法输入。
    // 预期错误保留“冲突”原因，提示先核实分类而非自动改写资料。
    // 如果实现直接优先目录放行，这条会产生错误的成功结果。
    // 如果实现只优先资料但丢弃冲突，也会丢失需要人工纠正的信号。
    // 这组只读来源文件，测试后不能出现被工具修正的 baseModel。
    // 没有把模型目录搬迁作为测试的一部分，来源冲突状态由固定夹具保证。
    ["来源目录冲突",{...args,loras:[{name:"Anima/conflict.safetensors"}]},/冲突/],
    // 负向：同名 sidecar 确实存在，但内容只有左花括号，JSON 解析必然失败。
    // 模型位于 Anima 目录，因此如果错误地把 invalid 当 missing 就会被放行。
    // 与 unknown 用例不同，这里有明确目录证据，只是不能绕过损坏资料。
    // 模型文件本体仍然可被 scanner 正常发现。
    // 选择采用完整相对名，不借助任何目录推断来定位文件。
    // 预期消息指出资料不可用，便于用户选择重新补全或修复 sidecar。
    // 不要求坏 JSON 的解析堆栈传给 Agent，公开错误原因已经足够。
    // 读取器必须在解析失败时关闭文件句柄，不能妨碍随后清理临时目录。
    // 脚本 finally 清理成功也间接覆盖 Windows 文件未长期占用的行为。
    // 这条不能外推为所有磁盘故障都被模拟，只针对损坏来源文件。
    ["坏 JSON 来源",{...args,loras:[{name:"Anima/corrupt.safetensors"}]},/资料不可用/],
    // 负向：LoRA 数组来自已经通过成功组的合法输入。
    // 唯一缺少的字段是 model，prompt 是否存在不属于本模块的判断职责。
    // 带 LoRA 时不能沿用模板内机器相关的默认模型作为未经确认的实际底模。
    // 即使 LoRA 明确为 Anima，也不能据此自动挑选第一个 Anima 主模型。
    // 预期结果是要求明确指定主模型，而不是扫描后随机选一个文件。
    // 后面的旧请求成功组会证明不使用 LoRA 时仍可省略 model。
    // 因此这个约束只作用于需要做兼容性匹配的生成请求。
    // 它防止本地部署与模板作者机器的模型名称差异被隐藏。
    // 不需要实际访问 ComfyUI，主模型选择不明确应在宿主层立即暴露。
    // 用户可以先查询本地主模型，再使用完整名称重新发起请求。
    ["缺少主模型",{loras:args.loras},/必须明确/],
    // 负向：实际主模型与两个 LoRA 都是 Anima，不存在真正的跨系列选择。
    // 唯一改变是显式宣称 series=sdxl，模拟语言模型填错模板参数。
    // 主进程不能因为调用方宣称 SDXL 就改用另一套图片工作流。
    // 也不能静默删除用户输入的 series 后当作没有发生。
    // 预期结果明确指出 series 与实际主模型不一致。
    // 如果只检查 LoRA 的目录而信任 series，这条将错误进入 SDXL 加载器。
    // 基础成功组已验证 series 省略时能从真实模型推导。
    // 这条专门证明“缺省推导”与“显式冲突”是不同语义。
    // 断言检查错误类别，不依赖完整中文提示每个标点保持不变。
    // 未来加入其他模板时仍需保留实际主模型证据优先的原则。
    ["虚报 series",{...args,series:"sdxl"},/series/],
    // 负向：Anima 主模型本身有匹配的 baseModel 资料，家族识别可以成功。
    // 但该文件放在 checkpoints 根中，不是 diffusion_models 类别。
    // 现有 Anima 模板使用 UNETLoader，不应向 CheckpointLoader 的路径清单取替代项。
    // LoRA 数组仍然是正常 Anima，确保错误确实来自加载器目录约束。
    // 使用完整相对名区分 base.safetensors 与 misplaced.safetensors。
    // 预期错误含加载器，不能以家族相同作为所有模型结构都可加载的理由。
    // 不移动文件或修改模板来让请求通过，模型目录需要用户明确纠正。
    // 这项与张量内容识别不同，只确认当前工程加载器契约。
    // 如果未来允许另一种 Anima checkpoint 模板，应补对应的独立入口。
    // 本轮不对创建页原有模型列表筛选规则作额外迁移。
    ["错误加载器目录",{...args,model:"Anima/misplaced.safetensors"},/加载器/],
    // 负向：两个 duplicate.safetensors 都位于有效 Anima 子目录。
    // 两个文件都可扫描，不能将失败归结为不存在或无架构证据。
    // 调用只使用裸文件名，无法表达用户要 one 还是 two 版本。
    // 不允许按扫描顺序、字母排序或第一个匹配决定模型身份。
    // 预期明确提示歧义，要求使用完整相对名称。
    // 后续完整名成功组独立证明 one/duplicate 确实可选择。
    // 不把“两个都是同系列”作为可以随便选择其中一个的依据。
    // 同名不同训练版本可能带来不同角色或风格，选择必须准确。
    // 这个约束同样适用于主模型选择，不仅适用于 LoRA。
    // 测试不依赖文件系统遍历顺序，所以可跨平台重复执行。
    ["同名歧义",{...args,loras:[{name:"duplicate.safetensors"}]},/歧义/],
    // 负向：数组两项都指向同一个真实文件，第一项为相对名，第二项为绝对名。
    // 绝对名来自本轮扫描白名单，不是向任意用户目录发起读取。
    // 两个名字分别能唯一匹配，不能用“名称完全相同”的简单字符串去重替代。
    // 预期结果按真实文件身份检测重复，阻止不经意的双重权重叠加。
    // 每项的缺省强度合法，系列也与主模型一致。
    // 如果按输入字符串去重，这组会错误生成两个相同 LoRA 节点。
    // 不静默去重，因为那会改变用户请求的加载链和实际权重效果。
    // 用户需要明确选择一项或修改权重后重试。
    // 此处不检测硬链接 inode 身份，只覆盖扫描路径的别名选择。
    // 链接文件授权由已有 readEntry 策略负责，不在本条新增绕过规则。
    ["重复 LoRA",{...args,loras:[{name:"Anima/a.safetensors"},{name:path.join(fixtureRoot,"loras/Anima/a.safetensors")}]},/重复/],
    // 负向：把 loras 数组误写为一个模型名字符串，是常见的工具参数格式错误。
    // 不能把字符串当可迭代列表逐字符处理，也不能忽略它后无扩展生成。
    // 主模型仍合法，但此项应在任何目录扫描之前失败。
    // 预期提示 loras 必须是数组，不能显示成模型文件不存在。
    // 省略与空数组的兼容行为已经由独立成功用例覆盖。
    // 单项对象同样不等价于数组，调用方必须遵守正式工具契约。
    // 本条不需要修改 sidecar，因为模型输出本来就可能不服从 Schema。
    // 运行时检查保证工具描述之外还有实际约束。
    // 若此项意外放行，返回的生成结果将不包含用户要求的 LoRA。
    // 测试只检查拒绝语义，不把脏参数自动修复当成预期功能。
    ["无效数组",{...args,loras:"Anima/a.safetensors"},/数组/],
    // 负向：strength 输入字符串 "1"，数值含义看似正确但类型不符合契约。
    // 不允许 parseFloat 或 Number 自动转换后静默接受。
    // 空字符串和带单位字符串的隐式转换会使实际执行更难解释。
    // LoRA 名称与主模型都正确，因此应明确报 strength 参数错误。
    // 默认值只用于字段缺省，不用于纠正显式错误的参数类型。
    // 如果实现将字符串丢掉并回落 1，这条会暴露“输入与执行不一致”。
    // 主进程与渲染层都具有对应负向检查，防止内部调用绕过约束。
    // 权重按浮点数传给真实构造器，不应在转换层变成文本。
    // 本条不规定 UI 输入框如何解析人类文本，只约束 MCP JSON 协议。
    // 正常数字 1 的允许行为由缺省权重和成功链组共同覆盖。
    ["字符串权重",{...args,loras:[{name:"Anima/a.safetensors",strength:"1"}]},/strength/],
    // 负向：Infinity 属于 JavaScript number，但不能序列化为有效的有限采样参数。
    // 如果只检查 typeof，JSON.stringify 会把它变为 null，掩盖原始错误。
    // 预期在序列化或发送前拒绝，不让后端误以为使用默认权重。
    // 输入直接进入生产模块，验证 Number.isFinite 的真实作用。
    // 该值不会来自合法 JSON，但可能来自内部工具或计算后的调用参数。
    // 因此不能因为外部 JSON 不支持 Infinity 就省略防御。
    // LoRA 名称本身有效，不会抢先触发文件匹配错误。
    // 这里不模拟采样数值溢出，验证的是参数边界的非有限数拦截。
    // 负 Infinity 和 NaN 具有相同有限数约束，后续可作为额外矩阵输入。
    // 实际失败必须由 strength 错误表达，不能以普通未知工具错误代替。
    ["无限权重",{...args,loras:[{name:"Anima/a.safetensors",strength:Infinity}]},/strength/],
    // 负向：6 是有限数字，但超出当前工具声明的 [-5,5] 输入护栏。
    // 这项与 Infinity 不同，专门证明有限数校验之外还有范围校验。
    // 模型与 LoRA 都相容，不能依靠其他失败条件让测试偶然通过。
    // 预期错误明确指出 strength 范围，不把数值钳制为 5 后继续生成。
    // 静默钳制会使实际结果无法按照 Agent 原始参数复现。
    // 允许负权重的成功组与此项配对，避免实现粗暴拒绝所有非正权重。
    // Schema 下界另有断言，运行时范围必须和声明保持一致。
    // 这个上限是工程护栏，不代表每个模型在允许范围内都保证稳定输出。
    // 若项目调整范围，需要同时更新声明、两端解析和这条负向断言。
    // 不能只放大 Schema 允许值而保留不同的执行端限制。
    ["越界权重",{...args,loras:[{name:"Anima/a.safetensors",strength:6}]},/strength/],
    // 负向：名称包含独立的上级目录段，不能当作普通模型子目录处理。
    // 选择函数必须在尝试 basename 匹配前识别穿越写法。
    // 否则 ../a.safetensors 可能错误命中库里一个无关的 a 模型。
    // 输入没有提供新的扫描根，工具也不能据它发起库外磁盘读取。
    // 预期报名称无效，而不是尝试拼接后扫描父目录。
    // 主模型仍合法，错误局限于本项 LoRA 名称。
    // 成功组已经允许正常的嵌套子目录，所以不是禁用所有路径分隔符。
    // 已扫描的绝对路径别名也另有用例，不与相对路径穿越混为一谈。
    // 本条不创建外部文件，失败不依赖用户机器上是否碰巧存在 a 模型。
    // 目录授权服务还会做真实路径检查，这里是名称选择阶段的额外约束。
    ["上级路径",{...args,loras:[{name:"../a.safetensors"}]},/无效/],
    // 负向：主模型和 LoRA 都是 Wan2.2，家族相同本身并不足以调用 generate_image。
    // 两者都有正常来源资料，不是未知架构或目录冲突的问题。
    // 工具只提供两套图片模板，不能把视频模型交给图片生成图构造器。
    // 预期报当前生图不支持此系列，而不是假装新增了视频生成工具。
    // 与前面的“视频 LoRA 配 Anima”不同，此处扩展和主模型彼此同系列。
    // 视频查询成功组会证明这套模型不是被整个目录发现功能排除掉。
    // 未来实现 generate_video 时应由其独立工作流和槽位约束接受这类输入。
    // 不在本测试里伪造帧数、采样器或高低噪声分支来凑出视频成功结果。
    // 当前错误应发生在 renderer send 前，不产生实际 GPU 排队任务。
    // 这项明确限定了本轮功能的支持范围，避免查询能力被误读成生成能力。
    ["视频不能走生图",{model:"Wan2.2/video.safetensors",loras:[{name:"Wan2.2/v.safetensors"}]},/不支持/],
  ];
  for (const [name,input,error] of failures) await check(name,() => assert.rejects(prepareLoraGeneration(input,paths),error));
}
/** 查询选择与旧参数兼容分别验证，不能让新增强约束破坏不使用 LoRA 的调用。 */
async function checkCatalogOptions(args) {
  // 旧参数检查与新能力分开，避免新增主模型必填限制误伤不使用扩展的生图。
  // from-metadata 放入 Misc 目录，证明实现不要求用户必须按固定文件夹命名。
  // 无来源但位于 Anima 的 b 模型提供相反方向的目录兜底对照。
  // 这两个正向例共同说明来源与目录是可区分的证据，而非两个都必须存在。
  // 完整名消歧与前面的裸名失败使用相同夹具，仅改变名称精度。
  // 视频查询以 Wan2.2 主模型为基准，Wan2.1 必须保持 incompatible。
  // 若把所有视频 family 简化成 video，两项会都变成 compatible，此组就会失败。
  // 未选主模型时 null 代表没有判断依据，不应被界面当作 false 或 true 保存。
  // 独立根测试移除 searchPath，证明检索优先规则不会永久覆盖单独目录设置。
  // 直接配置到 Anima 子目录时，绝对目录证据仍需保留，不能只观察相对名称。
  // 此组不检测服务器部署路径与本地根是否相同，服务器精确名称另在渲染组验证。
  // 所有调用继续使用同一个临时根，不从系统设置获取任何替代路径。
  // 无 LoRA 的旧请求仍可省略 model，保证新护栏不改变原工具默认行为。
  // 资料正常且没有系列目录时也可加载，避免把目录命名当成唯一证据。
  // 完整相对名可以消除裸名歧义，不能在发现重名后把整个模型库禁用。
  await check("旧请求、资料单独识别及完整名消歧",async () => {
    assert.deepEqual(await prepareLoraGeneration({prompt:"cat"},paths),{prompt:"cat",loras:[]});
    for (const name of ["Misc/from-metadata.safetensors","Anima/one/duplicate.safetensors"]) assert.equal((await prepareLoraGeneration({...args,loras:[{name}]},paths)).loras[0].name,name);
  });
  // 视频版本使用不同底模和目录标记，同一个 v 文件名不允许跨版本当作兼容。
  // 只检查目录结果，不调用不存在的 generate_video，也不提交图片模板。
  // 查询参数不带主模型时 compatible 必须为 null，不能默认把所有项目标为可用。
  await check("视频主模型查询区分 Wan 2.1/2.2，未选模型不给兼容承诺",async () => {
    const result = JSON.parse(await listLoras({model:"Wan2.2/video.safetensors",query:"v.safetensors"},paths));
    assert.equal(result.loras.find(item => item.family==="wan2.2").compatible,true); assert.equal(result.loras.find(item => item.family==="wan2.1").compatible,false);
    const unbound = JSON.parse(await listLoras({query:"a.safetensors"},paths)); assert.ok(unbound.loras.every(item => item.compatible===null));
  });
  // 清空 searchPath 后必须从独立配置根继续发现相同的相对名称。
  // 单独根直接配置到系列目录，系列信息不能因相对名只剩文件名而消失。
  // 夹具全部仍在本轮临时目录，没有通过此分支访问任何真实设置。
  await check("独立路径及直接指向 Anima 子目录的配置",async () => {
    const direct = {searchPath:"",lorasPath:path.join(fixtureRoot,"loras/Anima"),checkpointPath:"",diffusionModelsPath:path.join(fixtureRoot,"diffusion_models/Anima")};
    assert.equal((await prepareLoraGeneration({model:"base.safetensors",loras:[{name:"b.safetensors"}]},direct)).series,"anima");
  });
}

/**
 * 检查按依赖顺序执行：夹具、基础成功路径、失败矩阵、查询与配置、工具转发、图构造。
 * 基础成功路径先通过，可排除整个扫描库不可用导致负向用例全部假通过。
 * 每组都等待后再进入下一组，不并发改变 settings 环境变量与服务器列表。
 * 所有组共享只读模型夹具，唯一可变服务列表限制在渲染组内部。
 * 主流程本身不吞异常，让顶层非零退出码准确代表失败。
 */
async function main() {
  setupFixtures();
  const args = {model:"Anima/base.safetensors",loras:[{name:"Anima/a.safetensors",strength:0},{name:"Anima/b.safetensors",strength:-0.4}]};
  await checkCore(args); await checkFailures(args); await checkCatalogOptions(args);
  await checkHostForwarding(args); await checkRendererWorkflow(args);
  // 先完成原有固定数量断言，再新增分页数据，避免改变旧测试前置条件。
  // 两组查询检查不加载 GPU，生成参数流继续由前面真实工具转发覆盖。
  // 末尾才添加跨根重名夹具，不让歧义污染已验证的正向模型。
  await checkStructuredCatalog(); await checkCompactCatalog(args); await checkCatalogPaging();
}

/**
 * 同一真实目录分别请求详细与摘要，检查精简的是解释字段而非校验条件。
 * 主模型摘要必须仍能直接填入生成参数；不能再次要求模型猜扩展名和子目录。
 * LoRA 摘要保留兼容结论和触发词，防止减小体积后失去可用性依据。
 * 错放模型是负向对照，确保摘要不是把所有失败原因一起裁掉。
 * 此组在跨根重名夹具加入前执行，正常主模型保持唯一可选择。
 * 文件只含夹具字节，不将 usable 解释为真实 GPU 加载成功。
 * 摘要开关来自正式查询器，两种模式使用相同扫描与本地预检代码。
 * 比较序列化长度仅证明这组回执缩小，不代表所有目录都有固定压缩率。
 * 返回总数与下一偏移仍需保留，小页摘要不能让剩余模型永久不可见。
 * 参数类型错误必须拒绝；字符串 false 不能被 JavaScript 当作真值开启摘要。
 * 最后核对实际对外工具声明，防止实现支持了参数但模型根本看不到。
 */
async function checkCompactCatalog(args) {
  // 使用已有的唯一主模型作为基准，先确认详细查询能够正确找到文件。
  // 随后只改变 summary 一个输入，避免把筛选差异误认为摘要造成的差异。
  const query = { kind: "diffusion", series: "anima", query: "base.safetensors" };
  const full = JSON.parse(await listModels(query, paths));
  // 详细模式仍是缺省，已有磁盘统计或诊断调用不必添加新参数。
  // 成功项的字段精简不是通过减少本地校验步骤获得的“快速通过”。
  const small = JSON.parse(await listModels({ ...query, summary: true }, paths));
  // 对详细结果做独立字段投影是契约对照，不替换生产扫描器或选择器。
  // name 直接比较完整相对名，basename 截断会在这里产生可观察的失败。
  // kind 与 series 仍存在，防止把精简后的 LoRA 和主模型重新混在一起。
  assert.deepEqual(small.models, full.models.map(({ name, kind, series, usable }) => ({ name, kind, series, usable })));
  // 字段正确还不够，若完整证据被塞进另一字段，长度检查也应暴露问题。
  // 夹具根摘要相同，长度差只能来自模式有关的返回内容。
  assert.ok(JSON.stringify(small).length < JSON.stringify(full).length);
  // 总量和续页信号不随摘要变化，调用者仍能判断是否需要下一页。
  // 当前是唯一模型，这一正向对照不依赖后面新增的分页夹具。
  assert.deepEqual([small.total, small.nextOffset], [full.total, full.nextOffset]);
  // 错放目录的 Anima 主模型原本会被加载器约束拦截，摘要也必须保留拦截。
  // 真实文件存在，失败不能解释为临时目录缺失或关键词没有命中。
  // 单独读取负例，避免正向页里的第一个成功条目遮盖失败条目的字段缺失。
  const invalid = JSON.parse(await listModels({ kind: "checkpoint", query: "misplaced", summary: true }, paths));
  assert.equal(invalid.models[0].usable, false);
  // 不限定具体错误措辞，但失败必须有可读原因供用户修正目录。
  // 只剩 usable=false 的匿名失败无法指导 Agent 停止猜文件名。
  assert.ok(invalid.models[0].reason);
  // Anima/a 的来源资料含真实格式的触发词，覆盖摘要不应删掉的生成信息。
  // 传入同一个已选择主模型，兼容结果不能因 summary 被省成 null。
  // 两次查询都通过正式 listLoras，并非从主模型清单里取同名条目伪装结果。
  const loras = JSON.parse(await listLoras({ model: args.model, query: "a.safetensors", summary: true }, paths));
  // LoRA 与主模型使用同一个 summary 参数名，但必要字段按各自用途分别保留。
  // trainedWords 是生成提示词的一部分，不能像 bytes 一样当作纯诊断信息删除。
  const detailed = JSON.parse(await listLoras({ model: args.model, query: "a.safetensors" }, paths));
  // success 路径保留四个必要字段，字节、证据和完整旁车不应继续输出。
  // compatible=true 与触发词同时比较，不能只证明模型文件名还在。
  // 这里只检验同系列，不把应用支持的全部系列兼容规则重复写一遍。
  assert.deepEqual(loras.loras, detailed.loras.map(({ name, family, compatible, trainedWords }) => ({ name, family, compatible, trainedWords })));
  // SDXL/x 是已经存在的不同系列 LoRA，不能因摘要变成可用的 Anima 扩展。
  // 通过名称收窄查询，避免另一个兼容文件影响这个负向断言。
  // 此处没有调用生成工具，错误类型是选择前的兼容性提示。
  const rejected = JSON.parse(await listLoras({ model: args.model, query: "SDXL/x", summary: true }, paths));
  assert.equal(rejected.loras[0].compatible, false);
  // 不兼容原因保留，让使用者知道需要换系列而不是反复改文件路径。
  // 原详细查询证据再长，也不能成为摘要把失败说明整个省略的理由。
  assert.ok(rejected.loras[0].reason);
  // 两个入口共享查询校验器，但分别调用才能发现某一入口忘记接入校验。
  // 字符串与数字分别覆盖两种常见错误类型，不只测试缺省值。
  // assert.rejects 等待异步边界，错误未发生时会让脚本以失败结束。
  // 类型失败发生在扫描前，不要求测试制造不存在的磁盘目录来凑报错。
  await assert.rejects(listModels({ summary: "true" }, paths), /summary/);
  await assert.rejects(listLoras({ summary: 1 }, paths), /summary/);
  // schema 是新模型调用的必填约束；旧内部适配器仍保留历史缺省模型兼容。
  // 因此不把这一断言误写成“所有旧调用缺主模型时都会运行期拒绝”。
  // 工具本体来自正式注册表，避免测试另写一份声明后自己检查自己。
  assert.ok(findHostTool("generate_image").parameters.required.includes("model"));
  // 验证的是 Agent 首次发现工具时看到的版本，未依赖旧聊天中的工具描述缓存。
  // 旧模板回落行为继续在 checkCatalogOptions 单独检查，两个契约并未混为一谈。
  // Agent 新查询只广告本地来源，不能在无结果时改为扫描云端角色站点。
  // 旧内部 online 兼容入口仍由原有网络测试覆盖，这里检查新发现契约。
  assert.deepEqual(findHostTool("search_characters").parameters.properties.source.enum, ["local"]);
  // 真实生图请求的服务器名称复核仍由原生成组执行，不因摘要测试通过而省略。
  // 两组共同保护“返回可直接使用的名称”与“执行前仍要再核实”这两个边界。
}

/**
 * JSON 清单的核心契约：分类、全相对名、精确字节、证据与本地预检层级。
 * 使用原有七字节模型，不创建另一套可与生产输出相互迎合的扫描替身。
 * 旧夹具已有未知、冲突、错放加载器和视频系列，用于检查 usable 不是恒真。
 * 此处的 true 只代表本地预检，不证明夹具含可加载权重或远端编码器存在。
 * 公共摘要不应包含私人根目录，云端模型只需知道类别与相对名称。
 * 辅助目录单独增加一项，证明名字带 Anima 的 VAE 不会冒充主模型。
 * 旧生成测试继续保护目录兼容与完整服务器名称，避免此处重复搭建转发器。
 */
async function checkStructuredCatalog() {
  // 查询结果必须能直接 JSON.parse，展示文字夹杂在结果中会在这里报错。
  // Anima 默认模型来自 diffusion_models，查询 diffusion 不再因 search 根而空。
  // 夹具确切内容为 ASCII fixture，因此精确大小应为七字节。
  // name 保留目录与扩展，后面的 listLoras/generate_image 可原样使用。
  // 同文件在旧兼容测试已成功选择，两个工具不应提供不一致身份。
  // 根路径不能泄漏到返回 JSON，文件名中的正常子目录仍必须保留。
  // 判断 validation 防止 usable 被误读成已完成 GPU 试载。
  // evidence 来自版本来源，不能只返回没有依据的 series 标签。
  // 本组尚未添加同名主模型，因此正常 Anima 必须给出本地预检通过。
  await check("JSON清单保留分类、精确字节与完整可传递名称",async () => {
    const result = JSON.parse(await listModels({kind:"diffusion",series:"anima",query:"base.safetensors"},paths));
    const model = result.models[0];
    // 默认 limit 足以容纳唯一命中，total=1 不依赖当前页长度上限。
    // 关键词是带后缀的完整文件名，查到的是版本文件而非分组标题。
    assert.equal(result.total,1);
    // 期望相对根是 diffusion_models，因此不应再给名称加 diffusion_models/ 前缀。
    // 末尾 safetensors 是真实扩展，不是给界面显示的无后缀版本名。
    assert.equal(model.name,"Anima/base.safetensors");
    // ASCII 夹具按文件字节计数，不以字符个数或格式化 MB 字符串代替。
    // 明确选择小于一 KB 的文件，若先四舍五入为显示大小将无法得到七。
    assert.equal(model.bytes,7);
    // 同根既有 Anima 也有 Wan，类别与系列需要分别保留而非合并成一个值。
    // 该身份决定后续应走 UNetLoader，不能与 checkpoint 加载入口互换。
    assert.equal(model.kind,"diffusion");
    // 来源字段的 Anima 需规范化成小写工具枚举，不能把原宣传名直接返回。
    // 查询传 series 本身不应赋予该标签，识别结果来自原有正式目录读取器。
    assert.equal(model.series,"anima");
    // 模型在已授权临时根内且非空，正向用例应通过静态前置检查。
    // 夹具不是张量，故此值不能当作真实加载或推理成功的结论。
    assert.equal(model.usable,true);
    // 这个层级让消费方知道还需要服务端模型名校验与实际执行。
    // 若未来增添试加载层级，应另设值而非改变 local_precheck 的含义。
    assert.equal(model.validation,"local_precheck");
    // 只核对来源事实的关键字，不把说明语气或标点当作机器协议。
    // 这样友好解释可以改写，但不能省掉它从哪个底模资料得出系列。
    assert.match(model.evidence,/Anima/);
    // 对整个 JSON 检查，防止根摘要安全却在新增的某个字段泄漏绝对路径。
    // 此处不是禁止合法相对文件名，前面的 name 精确断言保护了子目录。
    assert.ok(!JSON.stringify(result).includes(fixtureRoot));
  });
  // unet 和历史拼写是输入类别别名；输出类别仍统一叫 diffusion。
  // 两个别名都使用同一已存在主模型，避免只测 schema 不测真实扫描。
  // VAE 没有来源旁车，分类应靠标准目录，不凭名称中的 Anima 推断用途。
  // 错加载器的 Anima 已在 checkpoints 中，输出须解释为不可用于当前生图。
  // 所有这些条件只改变查询，不向 renderer 发送任何生成请求。
  await check("目录别名可查询，辅助模型与错放主模型不冒充可用",async () => {
    // 本测试未配置单独的 unet 目录，别名应映射同一 diffusion 候选集合。
    // 若仍按 resolveScanRoots 的 search 键过滤，此处将读到空结果而失败。
    // 旧拼写仅是兼容输入，响应不能因此创造名为 diffrent_models 的类别。
    for (const kind of ["unet","diffrent_models"]) assert.equal(JSON.parse(await listModels({kind,query:"base.safetensors"},paths)).models[0].kind,"diffusion");
    fixture("vae/Anima/audio.safetensors");
    assert.equal(JSON.parse(await listModels({kind:"vae"},paths)).models[0].usable,false);
    assert.equal(JSON.parse(await listModels({kind:"checkpoint",query:"misplaced"},paths)).models[0].usable,false);
  });
}

/**
 * 只新增分页所需数据，复用旧夹具写入与清理，不复制临时设置及宿主回执。
 * 四十五项形成四十加五两页，可以暴露旧 MAX_ENTRIES 提前终止计数的问题。
 * 使用专有关键词隔离已有十一项 LoRA，使分页分母是可独立计算的固定值。
 * 按完整 name 比较唯一性，页长相加正确不等于没有重复或漏项。
 * 本轮目录保持不变；分页不承诺跨用户增删文件形成稳定快照。
 * 测完分页才制造跨根同名，验证分类筛选不能藏掉选择歧义。
 */
async function checkCatalogPaging() {
  // page- 前缀与旧扩展夹具不同，不改变原 a/b 的兼容转发路径。
  // LoRA 名称有扩展，不能用去后缀的显示名代替实际可提交身份。
  // 所有新增旁车沿用真实 LORA 元数据格式，不把系列结果手工塞入响应。
  for (let index = 0; index < 45; index++) fixture(`loras/Anima/page-${String(index).padStart(2,"0")}.safetensors`,"Anima");
  // 用 nextOffset 续读，不由测试自行计算后恰好碰到第二页。
  // 第一页 total 必须是四十五，不能等读到第二页才知道总数。
  // 第二页 nextOffset 为 null，Agent 才有明确停止条件而非一直查询空页。
  // 合并后的集合验证完整性，检查关键词末项能发现先切页再筛选的错误。
  // list_loras 同步使用同一分页器，但其兼容结论仍保持独立语义。
  // 没有选择主模型时 compatible 是 null，series 过滤不能冒充兼容验证。
  // 这里不读取磁盘占用的近似文本，精确 bytes 已由前一组独立保护。
  // 目录扫描结果按名称稳定排序，两个查询间没有夹具写入。
  // 旧工具限制为四十时，会在 total 或第二页返回数量断言上明确失败。
  // 超尾 offset 保留其值，不自动回首页，否则 Agent 可能不断重复第一页。
  // 临时库此时实际有五十六项 LoRA，命中总数四十五专指 page- 子集。
  // roots.files 是全根数，不应直接拿它与筛选后的 total 比较。
  // 双位序号保证命名清楚；断言不依赖系统目录创建顺序。
  // 这里的名称集合区分完整目录，不能用 basename 去重后隐藏不同版本。
  // 默认页长四十与最大允许一百是两个约束，本组特意不覆盖默认 limit。
  await check("四十五项完整分页，LoRA专用查询与总清单一致",async () => {
    const first = JSON.parse(await listModels({kind:"lora",query:"page-"},paths));
    // 首次响应提供的偏移作为第二次输入，是 Agent 无需算术猜测的续页方式。
    // 两次调用共享设置但各自真实扫描，未用缓存或手写数组提供第二页。
    const second = JSON.parse(await listModels({kind:"lora",query:"page-",offset:first.nextOffset},paths));
    // returned 与 limit 不同：第一页恰好满四十，第二页只剩五项。
    // total 必须在两页保持不变，不能错误统计成“当前页匹配数”。
    assert.deepEqual([first.total,first.returned,first.nextOffset],[45,40,40]);
    assert.deepEqual([second.total,second.returned,second.nextOffset],[45,5,null]);
    assert.equal(new Set([...first.models,...second.models].map(model => model.name)).size,45);
    // 只筛系列而不传 model，允许发现属于 Anima 的 LoRA，但尚未确定兼容对象。
    // LoRA 专用工具仍使用 loras 字段，不强迫旧消费者改读总清单的 models。
    // 页尾与总清单一致，防止一个入口已分页而另一个仍最多截四十条。
    const loras = JSON.parse(await listLoras({series:"anima",query:"page-",offset:40},paths));
    assert.deepEqual([loras.total,loras.loras.length,loras.nextOffset],[45,5,null]);
    assert.ok(loras.loras.every(model => model.compatible === null));
  });
  // 空配置不得扫描工作目录，正常返回 not_configured 引导设置。
  // 负偏移、小数、字符串上限与未知类别均应显式拒绝，而非回退 all。
  // 主模型跨目录重名时，即使只查 diffusion 也不能把结果标为可用。
  // 加入 SDXL 候选还可证明 series=anima 不会隐掉另一个实际匹配文件。
  // 这不是权重损坏结论，仅是工具不能唯一确定要加载哪份文件。
  // 没有移动或删除原夹具，测试只在私有临时根增加明确命名的文件。
  // 末项检查后 suite 结束，finally 会清理所有原有和新增夹具。
  // 上面的正常查询先通过，才能把这里的 false 解释为歧义护栏生效。
  await check("空设置及非法输入可解释，筛选不能隐藏跨根同名",async () => {
    // 显式给完整设置形状且每项空串，与 readSettingsPaths 的缺省输出一致。
    // 不是给一个不符合内部路径契约的空对象来误测另一个 TypeError。
    // not_configured 是正常业务状态，消费方可引导设置而非猜测磁盘目录。
    assert.equal(JSON.parse(await listModels({},{searchPath:"",checkpointPath:"",lorasPath:"",diffusionModelsPath:""})).status,"not_configured");
    // limit 的字符串用例与超上限数字并列，防止只有范围校验而无类型校验。
    // offset 小数必须失败，不能靠 slice 的隐式取整造成重页或漏页。
    // bad 类别是错误调用，绝不能默认扫 all 后假装满足了分类查询。
    for (const args of [{offset:-1},{offset:1.5},{limit:101},{limit:"40"},{kind:"bad"}]) await assert.rejects(listModels(args,paths));
    // 新建的是 checkpoints 下同一完整相对名，区别于仅 basename 重名。
    // SDXL 资料与 Anima 目录故意冲突，另一根候选不能被 series 过滤抹掉。
    // 不向工具提供 rootId 消歧参数，因为当前生成契约只接受完整相对 name。
    fixture("checkpoints/Anima/base.safetensors","SDXL 1.0");
    // 正常模型内容未改，仅新增另一个候选；失败原因应来自名称选择边界。
    // 此后不再测试生成成功，避免重复夹具让原正向用例产生预期外失败。
    assert.equal(JSON.parse(await listModels({kind:"diffusion",series:"anima",query:"base.safetensors"},paths)).models[0].usable,false);
  });
}

/**
 * 真实注册工具运行，sender 仅捕获消息，不执行假的兼容性判断。
 * 错误输入应在消息发出之前拒绝，send 次数为零证明没有下发生成任务。
 * 正常输入用 settleHostCall 模拟渲染回执，覆盖 pending Promise 的完成路径。
 * 测试不等待十分钟超时，也不把一个未结算调用遗留到下一组。
 * 设置文件通过既有测试环境变量隔离，结束后恢复原值避免进程内污染。
 * 断言捕获的 arguments 是规范后的实际参数，而不是只检查返回文字。
 */
async function checkHostForwarding(args) {
  // 宿主生成入口必须真实执行 prepareLoraGeneration，而不能只在列表查询时检查。
  // 如果只展示警告但仍发送消息，不兼容请求的 sent.length 将大于零。
  // 失败调用结束后再发成功请求，避免同时存在的 pending Map 条目互相干扰。
  // sender.send 的 channel 不用于判断兼容性，它只是记录发生了转发这一事实。
  // 模拟回执用 payload.callId，不能硬编码固定 ID，否则可能没有结算正确请求。
  // queueMicrotask 模拟异步响应，不需要睡眠等待一个猜测的固定时长。
  // 返回的 fixture 结果只用来结束宿主 Promise，不能当作真实生成成功证据。
  // sent[0].arguments 检查两项 LoRA 都存在，不能只验证主模型名称正确。
  // 测试 settings 文件包含本轮路径快照，工具仍按生产 readSettingsPaths 读取。
  // 原环境变量可能被外部测试器设置，finally 必须恢复而非一律删除。
  // 不修改 HOST_TOOLS 的 run 实现，所以兼容性失败不能被测试替身伪造。
  // 这组覆盖主进程转发形状，真正渲染执行链在下一组用真实图构造器补充。
  const previous = process.env.ILLUSION_AGENT_USER_DATA, settings = path.join(fixtureRoot,"settings.json"), sent = [];
  fs.writeFileSync(settings,JSON.stringify({settings:{paths}})); process.env.ILLUSION_AGENT_USER_DATA=settings;
  const ctx = {runId:"fixture",sender:{send:(channel,payload) => {sent.push(payload);queueMicrotask(() => settleHostCall({callId:payload.callId,ok:true,result:"fixture",images:[]}));}}};
  try {
    await check("不兼容 LoRA 不向渲染层发送；正常请求携带全部权重",async () => {
      await assert.rejects(findHostTool("generate_image").run({...args,loras:[{name:"SDXL/x.safetensors"}]},ctx),/不兼容/); assert.equal(sent.length,0);
      await findHostTool("generate_image").run(args,ctx); assert.equal(sent.length,1); assert.deepEqual(sent[0].arguments.loras,args.loras);
    });
  } finally { if(previous===undefined)delete process.env.ILLUSION_AGENT_USER_DATA;else process.env.ILLUSION_AGENT_USER_DATA=previous; }
}

/**
 * 清单替身提供真实 API 形状，分别填写 checkpoints、diffusionModels 和 loras。
 * Anima 与 SDXL 主模型同名，但位于不同类别，断言正确选用 UNet 清单。
 * 工作流节点来自真实构造器，检查两级 LoRA 链接和采样器的最终 model 输入。
 * 不仅检查数组存在，确保参数真正进入 LoraLoaderModelOnly 的名称与权重槽。
 * 最后故意只留另一个目录的同名 LoRA，必须拒绝而不能 basename 回落。
 * 使用生产 TS 模块但没有通过 Electron IPC；真实 IPC 注册另由项目 verify 校验。
 * 本组不验证图片保存、任务队列或模型运行速度，这些不属于兼容性预检。
 */
async function checkRendererWorkflow(args) {
  // ComfyUI 清单里的 Anima 主模型使用反斜杠，工具参数使用正斜杠。
  // 允许这一平台差异应不影响完整目录匹配，返回节点仍采用服务器原名。
  // 另一个 SDXL/base 出现在 checkpoints 清单，不得作为 Anima UNet 的替代。
  // 第一 LoRA 权重为零，第二为负，节点输入必须与请求严格相等。
  // loader 节点通过 class_type 定位，不把 Anima 模板的主模型 ID 写死在断言里。
  // 动态 LoRA 节点 ID 100/101 是项目构造器的现有约定，此处检查串联方向。
  // KSampler 指向最后一项，能发现“节点存在但没有接到实际采样链”的假成功。
  // 第一个 LoRA 必须连接真实 UNet 输出，不能错误使用 CLIP 或默认模板旧链接。
  // 真实模型字段名是 unet_name，这个断言能识别错写 ckpt_name 的实现。
  // 测试不会修改内置 JSON 文件，构造器克隆后的图只存于本次内存对象。
  // 参数校验的错误检查使用 key，词条具体语言由生产 i18n 门禁独立校验。
  // fake serverAddress 仅被清单替身接收，不解析为网络 URL 或启动 HTTP 服务。
  // 当清单只剩 SDXL/a 时，完整名称不匹配应失败，basename 相同不能补救。
  // 当两种分隔符分别列出同一个规范名时，匹配数量为二，必须拒绝歧义。
  // 这两条负向清单用例共享同一个合法主模型，错误不会来自 UNet 缺失。
  // 清单修改发生在正向节点图断言结束后，不会污染已经通过的模型选择。
  // readAgentLoras 从真实渲染代码加载，不能用测试中的数组常量代替其校验行为。
  // 若未来图构造器改为其他合法节点类型，应同步更新链路断言及功能约定。
  // 这里没有模拟 saveGeneratedImages，因而不能证明图库归档、PNG Meta 落盘或通知行为。
  // 运行时间仅反映小文件与纯函数处理，不外推实际 ComfyUI 推理性能。
  // TypeScript 转译不是类型检查替代，本轮还要独立执行整个 monorepo typecheck。
  // 测试失败会带出原 assert 堆栈供本地定位，不通过 IPC 发送给渲染用户。
  // 不截获主进程日志，也不向测试输出写入原用户模型或密钥路径。
  // 本轮夹具没有真实权重，所有通过结论限制在参数流和兼容性决策层。
  const t = (key,values) => key+JSON.stringify(values||{});
  const lists = {checkpoints:["SDXL/base.safetensors"],diffusionModels:["Anima\\base.safetensors"],loras:["Anima\\a.safetensors","Anima\\b.safetensors"]};
  const renderer = loadTs("apps/next/src/utils/agent-loras.ts",{"@/api/comfyui":{fetchComfyModelLists:async () => lists},"@/i18n":{t}});
  const workflows = loadTs("apps/next/src/utils/comfy/imageWorkflow.ts",{
    "@/data/comfy/imageWorkflower/Anima/标准anima生成流.json":require("../apps/next/src/data/comfy/imageWorkflower/Anima/标准anima生成流.json"),
    "@/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json":require("../apps/next/src/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json"),
    "@/i18n":{t},"@/utils/comfy/workflowToApi":{cloneComfyPrompt:structuredClone},"@/utils/comfy/comfyModelPath":{},
  });
  // 原有带 LoRA 测试只直接调用严格解析器，未经过宿主根据扩展有无选分支。
  // 此处新增同一真实宿主的无扩展场景，使默认生成策略也受到最终节点断言保护。
  // 检查安排在原成功图之前，夹具会恢复清单，因此后续 LoRA 链还必须继续通过。
  // 无需另起 Electron 窗口，生产 TS 模块经已有转译器执行，浏览器专属 I/O 被替换。
  // 这与静态检查“包含某个函数名”不同：选错旧分支会真正提交错误节点并失败。
  await checkAgentModelHost(renderer, workflows, lists, t);
  await check("LoRA 实际进入 Anima UNet→LoRA→LoRA→KSampler 链",async () => {
    const params = await renderer.resolveAgentLoraParams({series:"anima",checkpointName:args.model,loras:renderer.readAgentLoras(args.loras)},"fixture");
    const graph = workflows.buildImagePrompt("anima",params), loader = Object.entries(graph).find(([,node]) => node.class_type==="UNETLoader");
    assert.equal(loader[1].inputs.unet_name,"Anima\\base.safetensors");
    assert.deepEqual(graph["100"].inputs.model,[loader[0],0]); assert.deepEqual(graph["101"].inputs.model,["100",0]);
    assert.equal(graph["100"].inputs.strength_model,0); assert.equal(graph["101"].inputs.strength_model,-0.4);
    assert.equal(graph["100"].inputs.lora_name,"Anima\\a.safetensors"); assert.deepEqual(Object.values(graph).find(node => node.class_type==="KSampler").inputs.model,["101",0]);
  });
  // 数字字符串与空名称在渲染端也要报错，不能靠 TypeScript 声明假定数据可靠。
  // 服务端缺少同目录名称时必须失败，即使另一个系列里恰好有相同文件名。
  // 同一规范名映射到多个实际服务名称也是歧义，不能依赖数组顺序。
  // 一个对象被解析后会生成新对象，不会改动最初的 settings 或 tool arguments。
  await check("渲染端输入校验及完整服务器名称拒绝模糊回落",async () => {
    assert.throws(() => renderer.readAgentLoras([{name:"a",strength:"1"}]),/invalidLoras/);
    assert.throws(() => renderer.readAgentLoras([{name:""}]),/invalidLoras/);
    lists.loras=["SDXL/a.safetensors"];
    await assert.rejects(renderer.resolveAgentLoraParams({series:"anima",checkpointName:args.model,loras:args.loras},"fixture"),/loraModelUnavailable/);
    lists.loras=["Anima/a.safetensors","Anima\\a.safetensors"];
    await assert.rejects(renderer.resolveAgentLoraParams({series:"anima",checkpointName:args.model,loras:[args.loras[0]]},"fixture"),/loraModelUnavailable/);
  });
}

/**
 * 宿主执行夹具复用真实参数转换、模型解析和工作流构造，不跳过出错的分支选择。
 * 只替换 ComfyUI 传输与图片落盘：本轮不需要真实模型权重或用户输出目录。
 * 两个加载器故意放同名文件，能够发现 Anima 误用 checkpoints 清单的问题。
 * 旧的无模型请求仍调用原解析器，防止修复把历史模板回落也一并删除。
 * submitted 保存真实构造器交给传输层的图，断言比只看解析器返回值更接近故障位置。
 * meta 保存正式落盘编排收到的参数，确保记录与节点里的模型名一致。
 * 目录设置保持空，证明工具提供的完整相对名称不依赖本机绝对路径推导。
 * 所有状态属于此夹具，不向真实 Zustand 仓库写入测试生成通知。
 * 这里的完整链路限定为渲染宿主执行端，不包含 Python 模型推理或跨进程事件传输。
 * 主进程已在其他检查中覆盖发送形状，此处专门补上当时漏测的 renderer 分支。
 * 请求参数通过正式 toWorkflowParams 转换，因此模型名在转换阶段丢失也会被检测。
 * 工作流构造器收到的 series 仍来自正常参数读取，不根据夹具文件名偷选模板。
 * 两种解析器都可运行，测试不会以旧解析器永远抛异常来强迫新的分支通过。
 * 服务列表替身不替模型名做任何映射，路径是否完整完全依赖产品逻辑。
 */
/**
 * 公共队列接入后的夹具调整：
 * 原测试只关心严格模型名称与最终工作流是否一致。
 * 现在宿主增加公共调度依赖，测试必须显式声明该边界。
 * 夹具调度器立即调用执行器，以保留原来的模型解析反证范围。
 * 它给出独立的 requestId，避免生产代码退回无会话生成。
 * AbortSignal 为正常未取消信号，不在路径测试中引入停止竞争。
 * 生产 FIFO、取消和账本另由 verify-generation-statistics 使用真实实现验证。
 * 这里不复制一套 FIFO，否则两个脚本可能各自维护不同规则。
 * 任务 store 更新是无副作用替身，路径测试不会写入用户生成历史。
 * 模型提取也是隔离边界，不把它返回空列表当成模型统计正确的证据。
 * 主模型加载器断言仍检查 submitted 的真实工作流输入。
 * Meta 断言仍检查传给正式保存编排的已解析参数。
 * 因此新增统计依赖不会削弱原有完整子目录保护。
 * 原来空 images 只为了省略像素依赖，现在生产代码正确拒绝空生成结果。
 * 夹具提供最小图片身份，让成功分支继续运行到 Meta 校验。
 * 该图片身份没有实际像素，测试不会宣称真实出图。
 * 保存边界返回 fixture.png 代表确认路径，用来满足正式成功条件。
 * 这个字符串不会触发真实磁盘写入，也不会出现在用户图库。
 * 如果继续返回空保存列表，正确产品实现就应当报告保存失败。
 * 因此调整夹具是匹配新增成功判定，不是让失败数据冒充真实保存。
 * 没有列出的依赖仍由加载器拒绝，新增重要边界不会被自动忽略。
 */
function createAgentHostFixture(renderer, workflows, lists, t) {
  // submitted 像快递的实际面单，记录发到传输层的节点，而不是 Agent 最初口述的地址。
  // meta 单独记录保存编排收到的参数，避免只修正执行值却让二创数据丢失目录。
  // 两个数组只在这个夹具中累积，不共享上一个测试组的生成结果。
  const submitted = [], meta = [];
  // 传输替身不再自行处理模型名，生产图构造器写入什么就被原样记录。
  // 返回一个合法的最小生成结果，让正式 try/finally 与落盘分支继续走完。
  // images 只提供最小图片身份，像素和 Blob 不参与本例模型路径断言。
  // promptId 仅为夹具标识，不代表 ComfyUI 已分配真实任务。
  // 获取清单的函数供原解析器使用，严格解析器也通过传入的生产 renderer 工作。
  // 两条分支面对同一 lists，因此不能用不同服务返回值掩盖选错清单的事实。
  const api = { fetchComfyModelLists: async () => lists, generateWithComfy: async graph => { submitted.push(graph); return { promptId: "fixture", images: [{ nodeId: "fixture", objectUrl: "blob:fixture" }] }; }, revokeComfyImages: () => {} };
  // 原路径模块也加载生产实现，修复前确实会发生 basename 截断。
  // 如果用一个直接返回完整名称的替身替换它，本次根因将无法被测试发现。
  // 类型专用 import 转译后消失，路径模块没有运行时外部依赖。
  const modelPaths = loadTs("apps/next/src/utils/comfy/comfyModelPath.ts", {});
  // 保留旧 resolver 真实代码，唯一假的依赖是请求边界与空设置默认对象。
  // 它只读取 checkpoints 的现有行为会在旧分支里把 Anima 路径截断。
  // 本轮不顺便修改所有创建页调用方的路径策略，测试应明确隔离 Agent 分支修复。
  // 若宿主仍调用旧分支，详细的主模型断言会失败，不会由夹具自动补救。
  const resolver = loadTs("apps/next/src/utils/comfy/resolveComfyModels.ts", { "@/types/settings": { EMPTY_SETTINGS_PATHS: {} }, "@/utils/comfy/comfyModelPath": modelPaths, "@/api/comfyui": api });
  // require 替换仅发生在内存转译器内，不修改 Node 的全局模块缓存或正式导出。
  // 因此本例结束后，其他检查继续使用真实应用模块，不会继承假的用户状态。
  // 未列出的依赖由 loadTs 拒绝，模块未来新增重要边界时不能被静默忽略。
  // 引用生产 agentHostTools，检查的正是是否附带 LoRA 的分支，而非另写同样判断。
  const host = loadTs("apps/next/src/utils/agentHostTools.ts", {
    // 获取清单与提交工作流两个传输入口都在同一 API 模块边界替换。
    // 这里不启动 HTTP 服务，不能据此声称线上 ComfyUI 可连接。
    "@/api/comfyui": api,
    // 调度器的真实状态、停止与记账由 verify-generation-statistics 单独验证。
    // 此夹具只检查 Agent 参数是否正确进入实际工作流，不写入全局用户状态。
    // 给执行器一个独立会话和信号，不能再依赖旧的未关联生成请求。
    "@/utils/image-generation-queue": { enqueueGenerationTask: (_task, execute) => ({ promise: execute("fixture", new AbortController().signal) }) },
    // 图的模型提取已由账本回归覆盖；这里只观察最终提交与 Meta 的路径一致性。
    // store 更新为无副作用边界，不能让模型名回归改变正在运行客户端的任务卡。
    "@/utils/generation-statistics": { generationModelsFromPrompt: () => [] },
    "@/stores/useGenerationTaskStore": { useGenerationTaskStore: { getState: () => ({ update() {} }) } },
    // 文案替身返回词条 key，错误断言不受当前用户选择中文还是英文影响。
    // 这不代替正式双语键一致性检查，后续仍要运行该门禁。
    "@/i18n": { t },
    // 选中目录只供落盘编排读取，不访问真实图库或持久化用户设置。
    // refresh 是空操作，避免测试让当前客户端的列表发生无关刷新。
    "@/stores/useHistoryFolderStore": { getSelectedFolderDirPath: () => null, useHistoryFolderStore: { getState: () => ({ selectedFolderId: "all", refreshGeneratedImages: () => {} }) } },
    // 状态通知接口保持正式形状，成功和失败都能走完生产收尾。
    // 本例不以通知成功代替提交图正确，真正的判断对象是 submitted。
    "@/stores/useGenerationNoticeStore": { useGenerationNoticeStore: { getState: () => ({ start: () => {}, succeed: () => {}, fail: () => {} }) } },
    // 空 paths 模拟 Agent 已拿到相对名称的情况，不需要再提供磁盘绝对路径。
    // fixture 地址不会被解析为真实网络目标，任何意外网络请求都会暴露依赖错误。
    "@/stores/useSettingsStore": { useSettingsStore: { getState: () => ({ comfyServerUrl: "fixture", outputPath: "fixture", paths: {} }) } },
    // 截获元数据构造输入，检查参数与实际节点使用同一个已解析名称。
    // 不生成真实 PNG，字节级内嵌协议仍由现有 Meta 回归独立验证。
    "@/utils/buildGeneratedImageMeta": { buildGeneratedImageMeta: value => { meta.push(value); return {}; } },
    // 模板与填槽函数来自生产 imageWorkflow，而不是测试写一个 UNETLoader 结果。
    // 真正的 LoRA 注入器也在此模块内，原有带扩展回归仍覆盖同一个构造器。
    "@/utils/comfy/imageWorkflow": workflows,
    // 原 resolver 不应被无条件禁用；没有明确模型的历史调用仍有兼容意义。
    // 这个依赖真实存在才能证明测试涵盖新旧分支选择，而非假模块永远抛错。
    "@/utils/comfy/resolveComfyModels": resolver,
    // 本例直接调用正式 runAgentHostTool，没有挂订阅，所以不需要伪造 IPC 事件。
    // 空桥对象确保测试不会意外订阅用户窗口，也不会写回真实宿主回执。
    "@/utils/electronBridge": {},
    // 输出位置只作内存字符串，不创建临时目录之外的任何文件。
    // 同目录选择与权限规则并未由这个替身证明，不能扩大本次测试的覆盖声明。
    "@/utils/generatedImages": { resolveSaveOutputPath: () => "fixture" },
    // 仅提供确认落盘的夹具路径，不实际写 PNG；空结果现在应被生产代码拒绝。
    // 这能继续走成功分支核对 Meta，但不能当作真实保存或出图证明。
    "@/utils/saveGeneratedImages": { saveGeneratedImagesToDisk: async () => ["fixture.png"] },
    // 严格解析器使用真实实现，只在创建它时替换过请求清单的 I/O。
    // 主模型与 LoRA 共用此实现，避免测试为无扩展另写一个总能通过的解析函数。
    "@/utils/agent-loras": renderer,
  });
  // 返回明确的可观察记录，不将 require 替身或用户路径暴露给生产代码。
  // 没有后台任务、事件订阅或真实连接需要此夹具在结束时额外关闭。
  return { host, submitted, meta };
}

/**
 * 还原用户日志：完整嵌套 Anima 名称、不带 LoRA，提交节点也必须保留完整路径。
 * 这次通过正式 runAgentHostTool 进入，旧测试只测严格 LoRA 解析器而漏掉实际分支。
 * 正反斜杠、缺省与空 LoRA 分别调用，防止把平台差异当成两种模型身份。
 * checkpoints 放入同名 basename 作为反证，不能因为错误清单恰好为空才通过。
 * 主模型路径还应出现在 Meta 参数中，避免生成正确而记录仍然只剩文件名。
 * 第二组只保留错误类别或重复精确名，应在任何提交发生前拒绝。
 * 网络与 GPU 仍为替身，这里验证的是最终提交参数，不是图像质量或推理速度。
 * 相对模型名没有盘符，输入与完整服务器目录在比较阶段只允许分隔符形式不同。
 * Checkpoint 中的裸文件名故意看似更短更方便，但不能作为 UNet 的候选源。
 * 输入模型存在于正确分类，因此成功用例不依赖无匹配后的任意回退策略。
 * 空数组并不触发 readAgentLoras 错误，这个场景尤其容易绕过原来的严格分支。
 * 缺省数组则由参数转换器产生空列表，和显式空数组在后续流程应保持一致。
 * 对每次结果马上检查节点，不能只看第四次恰好正确就宣称四种组合都正确。
 * 夹具没有给定 width、steps 或 cfg，现有工作流默认参数仍由真实模板填入。
 * 正向生成完成后再检查缺失和歧义，证明拒绝不是整个执行器原本就无法工作。
 * submitted 条数应与成功次数严格对应，失败时不能产生已经入队再撤销的伪成功。
 * 缺失与歧义都读取相同名称，只有服务端清单变化，错误来源可以独立判读。
 */
async function checkAgentModelHost(renderer, workflows, lists, t) {
  // 原始列表需要恢复，后续现有 LoRA 测试仍以 Anima/base 作为可用主模型。
  // 深拷贝保存各分类数组，避免本组替换后丢失原来 SDXL 与 LoRA 夹具。
  // finally 即使遇到断言失败也恢复，失败不会污染同进程其他排查输出。
  const original = structuredClone(lists);
  // 目录层级与用户报错一致，不能用只含文件名的正向夹具掩盖截断问题。
  // 这里不是硬编码生产默认模型，只是固定复现输入的测试样本。
  const name = "Anima/anima_aestheticV11/anima_aestheticV11.safetensors";
  // 返回服务器原分隔符是契约，不能因比较时规范化就把提交名称也换成显示名。
  // 预期与传入 name 独立保留，可以发现最终节点仍采用输入而非服务端原文。
  const serverName = name.replaceAll("/", "\\");
  try {
    // diffusionModels 有正确完整路径，Checkpoint 只有同 basename 的错误替代项。
    // 旧实现会优先拿到这个裸名，这比 Checkpoint 空列表更能锁定清单选择错误。
    // SDXL 模型同时保留，用于下面独立证明另一个工作流类别没有受损。
    lists.diffusionModels = [serverName];
    lists.checkpoints = ["anima_aestheticV11.safetensors", "SDXL/base.safetensors"];
    // 四次正向调用共享一个宿主实例，检验省略和空数组都能进入同一严格分支。
    // 宿主之外没有脚本替它修正 params，生产参数转换依然需要自行保留输入。
    const fixture = createAgentHostFixture(renderer, workflows, lists, t);
    await check("无 LoRA 的实际 Agent 提交保留 Anima 完整嵌套路径", async () => {
      // 正反斜杠在规范化时等价，空 LoRA 和未填 LoRA 在业务上也都不应削弱主模型校验。
      // 使用笛卡尔组合覆盖四种输入，不能只测最容易通过的正斜杠加非空扩展。
      // 英文风景提示词保证本例不引入角色库、翻译或云端检索等额外变量。
      for (const model of [name, serverName]) for (const loras of [undefined, []]) {
        await fixture.host.runAgentHostTool("generate_image", { model, prompt: "anime distant landscape", series: "anima", loras });
        // 从真实图里按 class_type 找主加载器，不把模板节点 ID 写死为用户日志里的 7。
        // 对最终提交输入做完整相等比较，含目录、扩展名和服务器分隔符。
        assert.equal(Object.values(fixture.submitted.at(-1)).find(node => node.class_type === "UNETLoader").inputs.unet_name, serverName);
        // Meta 的参数也必须是解析后名称，二创不应重新遇到同一次 basename 截断。
        // 只证明传给元数据构造器的数据正确，PNG 写入本身在这个夹具里不发生。
        assert.equal(fixture.meta.at(-1).params.checkpointName, serverName);
      }
      // 每个工具请求只提交一次，不能通过内部自动重试碰巧得到正确的最后一次值。
      // 数量与四种输入对应，不把收到通知或正常函数返回当作提交次数。
      assert.equal(fixture.submitted.length, 4);
    });
    await checkAgentModelCompatibility(fixture, workflows);
    await check("无 LoRA 主模型缺失或歧义时不得错误提交", async () => {
      // 空 UNet 清单不能回退到 Checkpoint 的同名条目，分类是加载器契约的一部分。
      // 两种分隔符的同一规范名都被列出时，精确匹配有两个候选，应要求用户消歧。
      // 负向输入仍是已验证的完整名称，失败原因不是用户忘记提供目录。
      for (const models of [[], [serverName, name]]) {
        lists.diffusionModels = models;
        await assert.rejects(fixture.host.runAgentHostTool("generate_image", { model: name, prompt: "landscape", series: "anima" }), /loraModelUnavailable/);
      }
      // SDXL 和旧模板各贡献一次成功提交，此后的失败不能产生第七次提交。
      // 校验失败发生在发往 ComfyUI 之前，而非服务器拒绝之后再告诉用户。
      assert.equal(fixture.submitted.length, 6);
    });
  } finally { Object.assign(lists, original); }
}

/**
 * 修复的反向对照：SDXL 无扩展仍走 Checkpoint，未选模型的旧内部请求保留模板默认。
 * 与 Anima 成功用同一个宿主夹具，证明不是全局强行把所有模型改走 UNETLoader。
 * 此组不传 LoRA，也不读取用户本地目录，保持与当前缺陷相同的必要输入范围。
 * 模板默认值从真实构造器取得，只保护历史缺省行为，不在测试里重复维护默认模型名。
 * 旧请求不是新 Agent 的推荐调用，新的工具 Schema 仍要求明确 model。
 * 两项兼容操作也走传输替身，后续负向组按六次成功总数核对不会误算。
 * SDXL 选择完整 Checkpoint 相对路径，不是通过另一个同名 UNet 恰好生成成功。
 * 旧模板的主模型名字可随工程模板更新，测试只要求省略时尊重当前默认值。
 * 没有比较随机种子或输出图片字节，避免与本轮名称修复无关的随机变化干扰结论。
 * 本例不模拟图像下载，因此默认请求能走完只说明参数兼容，不证明推理一定成功。
 * 新旧请求都复用同一生产生成入口，避免为保留兼容另加绕过工具校验的测试接口。
 */
async function checkAgentModelCompatibility(fixture, workflows) {
  // Checkpoint 清单里确有这条完整名称；Anima 的 UNet 清单里没有 SDXL 条目。
  // 若修复误把所有请求都送去 diffusionModels，这个正向对照会提前失败。
  // series 显式给出，排除缺省为 Anima 的其他行为干扰当前分类检查。
  await fixture.host.runAgentHostTool("generate_image", { model: "SDXL/base.safetensors", prompt: "landscape", series: "sdxl" });
  // 按节点类型找到实际 SDXL 主加载器，其名称不能被错误地写进 UNet 输入槽。
  // 这里比较完整相对名，而不是只检查构造器输出中有没有某个字符串。
  // graph 来自传输边界，已经经过宿主的参数转换与解析分支。
  assert.equal(Object.values(fixture.submitted.at(-1)).find(node => node.class_type === "CheckpointLoaderSimple").inputs.ckpt_name, "SDXL/base.safetensors");
  // 历史内部调用没有明确 model，保留模板兼容而不是新增必填异常。
  // 这不允许明确输入的错误模型回退，只有没有选择模型才享有旧行为。
  // 主进程假模型与部分 CLI 夹具依赖这一边界，不能被本次局部修复打断。
  await fixture.host.runAgentHostTool("generate_image", { prompt: "legacy landscape" });
  // 使用真实默认图定位预期值，不将作者机器上的模型名称复制成另一份常量。
  // 没有模型参数时，解析器不应该凭 Checkpoint 同名项覆盖模板已有的默认加载值。
  // 这是兼容性保证，不宣称默认模型一定存在于当前用户的 ComfyUI 中。
  const defaultName = Object.values(workflows.buildImagePrompt("anima")).find(node => node.class_type === "UNETLoader").inputs.unet_name;
  assert.equal(Object.values(fixture.submitted.at(-1)).find(node => node.class_type === "UNETLoader").inputs.unet_name, defaultName);
}
// 清理仅递归删除本脚本 mkdtemp 的返回目录，不接受外部路径作为删除目标。
// finally 无论通过或失败都执行，避免测试留下看似真实模型的冗余夹具。
// catch 设置非零状态，脚本可以独立作为回归检查接入后续门禁。
// Promise 完成前进程由文件操作与宿主回执保持，不另起后台 Electron 子进程。
main().then(() => console.log(`AGENT LORAS OK: ${assertions} groups`)).catch(error => {console.error(error);process.exitCode=1;}).finally(() => fs.rmSync(fixtureRoot,{recursive:true,force:true}));
