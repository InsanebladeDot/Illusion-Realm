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
// 用临时文件验证真实扫描与 realpath，不改用户模型设置。
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
  // 先跑正向基准：真实工具声明可调用，目录扫描、触发词和权重传递正常。
  // 同时放入不兼容项，防止兼容判断恒真或恒假也通过；此处不运行 GPU 推理。
  await check("sidecar 工具声明包含 LoRA 查询与权重参数",() => {
    const specs = hostToolSpecs(); assert.ok(specs.some(item => item.name === "list_loras"));
    const schema = specs.find(item => item.name === "generate_image").parameters.properties.loras;
    assert.equal(schema.type,"array"); assert.deepEqual(schema.items.required,["name"]); assert.equal(schema.items.properties.strength.minimum,-5);
  });
  // 同查兼容、不兼容、未知和冲突项，触发词须来自实际版本资料。
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
  // 每项只改一个关键输入，须在发送生成请求前拒绝，不能靠其他错误碰巧通过。
  const failures = [
    // 文件及资料均有效，只把 Anima 扩展换成 SDXL/Pony，须报架构不兼容。
    ["跨图片系列",{...args,loras:[{name:"SDXL/x.safetensors"}]},/不兼容/],
    // 图片主模型配视频 LoRA，须在提交前拒绝，不等后端报张量错误。
    ["视频误入图片",{...args,loras:[{name:"Wan2.2/v.safetensors"}]},/不兼容/],
    // 文件存在但没有系列证据，不能默认它与当前主模型兼容。
    ["未知系列",{...args,loras:[{name:"Unknown/unknown.safetensors"}]},/不兼容/],
    // 合法资料写 SDXL，目录写 Anima：两种证据冲突，不能任选其一放行。
    ["来源目录冲突",{...args,loras:[{name:"Anima/conflict.safetensors"}]},/冲突/],
    // 资料损坏不同于资料缺失，即使目录明确为 Anima 也不能绕过。
    ["坏 JSON 来源",{...args,loras:[{name:"Anima/corrupt.safetensors"}]},/资料不可用/],
    // 带 LoRA 必须明确主模型；不带 LoRA 的旧请求另验可省略。
    ["缺少主模型",{loras:args.loras},/必须明确/],
    // 实际模型是 Anima，却声明 series=sdxl，须指出冲突。
    ["虚报 series",{...args,series:"sdxl"},/series/],
    // 系列正确但目录错误：UNETLoader 不能用 checkpoints 清单里的同系列文件代替。
    ["错误加载器目录",{...args,model:"Anima/misplaced.safetensors"},/加载器/],
    // 两个同名文件均有效，裸名有歧义；后面用完整相对名验证可以选中。
    ["同名歧义",{...args,loras:[{name:"duplicate.safetensors"}]},/歧义/],
    // 相对名和绝对名指向同一文件，须拒绝重复加载；不覆盖硬链接身份。
    ["重复 LoRA",{...args,loras:[{name:"Anima/a.safetensors"},{name:path.join(fixtureRoot,"loras/Anima/a.safetensors")}]},/重复/],
    // 字符串不能冒充数组，须报参数格式错，而非继续扫描或忽略扩展。
    ["无效数组",{...args,loras:"Anima/a.safetensors"},/数组/],
    // 显式字符串权重不能被转换或丢弃后回落默认值。
    ["字符串权重",{...args,loras:[{name:"Anima/a.safetensors",strength:"1"}]},/strength/],
    // Infinity 也是 number，须在序列化变成 null 前拒绝。
    ["无限权重",{...args,loras:[{name:"Anima/a.safetensors",strength:Infinity}]},/strength/],
    // 有限但越界的权重须报错，不静默夹到上限；合法负权重另有正向对照。
    ["越界权重",{...args,loras:[{name:"Anima/a.safetensors",strength:6}]},/strength/],
    // 先拒绝上级目录段，再匹配文件名，避免 ../a 误命中库内 a。
    ["上级路径",{...args,loras:[{name:"../a.safetensors"}]},/无效/],
    // 主模型与 LoRA 同属 Wan2.2，也不能交给图片生成工具。
    ["视频不能走生图",{model:"Wan2.2/video.safetensors",loras:[{name:"Wan2.2/v.safetensors"}]},/不支持/],
  ];
  for (const [name,input,error] of failures) await check(name,() => assert.rejects(prepareLoraGeneration(input,paths),error));
}
/** 查询选择与旧参数兼容分别验证，不能让新增强约束破坏不使用 LoRA 的调用。 */
async function checkCatalogOptions(args) {
  // 配对验证资料识别与目录兜底、裸名歧义与完整名消歧，以及不带 LoRA 的旧请求。
  // Wan2.1 和 Wan2.2 仍须区分；未选主模型时 compatible=null，表示尚无判断依据。
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
  // 两个查询入口分别验非法类型，防止某一入口漏接共同校验器。
  await assert.rejects(listModels({ summary: "true" }, paths), /summary/);
  await assert.rejects(listLoras({ summary: 1 }, paths), /summary/);
  // schema 是新模型调用的必填约束；旧内部适配器仍保留历史缺省模型兼容。
  // 因此不把这一断言误写成“所有旧调用缺主模型时都会运行期拒绝”。
  // 工具本体来自正式注册表，避免测试另写一份声明后自己检查自己。
  assert.ok(findHostTool("generate_image").parameters.required.includes("model"));
  // 检查 Agent 实际发现的本地工具声明，不以旧聊天缓存作证。
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
  // 结果须是可解析 JSON，保留完整可传递名称、七字节大小和系列证据，不泄漏根目录。
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
  // 输入类别别名须查到真实模型；辅助模型和错目录主模型不能冒充可用底模。
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
  // 按真实 nextOffset 读完 45 个匹配项，尾页必须明确结束；超尾不能回首页。
  // 根内共 56 项，筛选后 total 与全根数量不同；无主模型时兼容结论仍为 null。
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
  // 空设置不扫描当前目录；筛选也不能隐藏跨根同名导致的加载歧义。
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
  // 调真实宿主入口，验证不兼容请求未被转发，成功请求保留全部 LoRA 参数。
  // 仅用微任务模拟回执结束 Promise，不证明真实生成；finally 恢复原环境变量。
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
  // 用真实渲染解析器和图构造器，服务清单由替身提供：核对完整路径、零/负权重和实际采样链。
  // 服务器原名可含反斜杠，缺失或规范化后重名都须拒绝，不能按 basename 猜。
  // 夹具没有真实权重，不验证 GPU、图库落盘、PNG Meta 或推理性能；转译也不代替类型检查。
  const t = (key,values) => key+JSON.stringify(values||{});
  const lists = {checkpoints:["SDXL/base.safetensors"],diffusionModels:["Anima\\base.safetensors"],loras:["Anima\\a.safetensors","Anima\\b.safetensors"]};
  const renderer = loadTs("apps/next/src/utils/agent-loras.ts",{"@/api/comfyui":{fetchComfyModelLists:async () => lists},"@/i18n":{t}});
  const workflows = loadTs("apps/next/src/utils/comfy/imageWorkflow.ts",{
    "@/data/comfy/imageWorkflower/Anima/标准anima生成流.json":require("../apps/next/src/data/comfy/imageWorkflower/Anima/标准anima生成流.json"),
    "@/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json":require("../apps/next/src/data/comfy/imageWorkflower/SDXL/标准SDXL生成.json"),
    "@/i18n":{t},"@/utils/comfy/workflowToApi":{cloneComfyPrompt:structuredClone},"@/utils/comfy/comfyModelPath":{},
  });
  // 再经真实宿主验证不带扩展的分支，防止它回落到旧模型解析器；结束后恢复清单。
  await checkAgentModelHost(renderer, workflows, lists, t);
  await check("LoRA 实际进入 Anima UNet→LoRA→LoRA→KSampler 链",async () => {
    const params = await renderer.resolveAgentLoraParams({series:"anima",checkpointName:args.model,loras:renderer.readAgentLoras(args.loras)},"fixture");
    const graph = workflows.buildImagePrompt("anima",params), loader = Object.entries(graph).find(([,node]) => node.class_type==="UNETLoader");
    assert.equal(loader[1].inputs.unet_name,"Anima\\base.safetensors");
    assert.deepEqual(graph["100"].inputs.model,[loader[0],0]); assert.deepEqual(graph["101"].inputs.model,["100",0]);
    assert.equal(graph["100"].inputs.strength_model,0); assert.equal(graph["101"].inputs.strength_model,-0.4);
    assert.equal(graph["100"].inputs.lora_name,"Anima\\a.safetensors"); assert.deepEqual(Object.values(graph).find(node => node.class_type==="KSampler").inputs.model,["101",0]);
  });
  // 渲染侧也拒绝错误类型、空名称及模糊服务器匹配，且不改写原请求。
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
  // 请求替身只记录生产构造器提交的图；最小结果用于走完清理，不代表 ComfyUI 真生成。
  const api = { fetchComfyModelLists: async () => lists, generateWithComfy: async graph => { submitted.push(graph); return { promptId: "fixture", images: [{ nodeId: "fixture", objectUrl: "blob:fixture" }] }; }, revokeComfyImages: () => {} };
  // 原路径模块也加载生产实现，修复前确实会发生 basename 截断。
  // 如果用一个直接返回完整名称的替身替换它，本次根因将无法被测试发现。
  // 类型专用 import 转译后消失，路径模块没有运行时外部依赖。
  const modelPaths = loadTs("apps/next/src/utils/comfy/comfyModelPath.ts", {});
  // 保留旧解析器作对照，若宿主选错分支，模型路径断言必须失败，夹具不替它补救。
  const resolver = loadTs("apps/next/src/utils/comfy/resolveComfyModels.ts", { "@/types/settings": { EMPTY_SETTINGS_PATHS: {} }, "@/utils/comfy/comfyModelPath": modelPaths, "@/api/comfyui": api });
  // 只在本次内存转译中替换依赖，不改全局模块缓存；未列出的依赖直接拒绝。
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
// 无论成败都只清理本次 mkdtemp 目录，失败保留非零退出码。
main().then(() => console.log(`AGENT LORAS OK: ${assertions} groups`)).catch(error => {console.error(error);process.exitCode=1;}).finally(() => fs.rmSync(fixtureRoot,{recursive:true,force:true}));
