/**
* 模型目录与 LLLite 图结构回归：真实临时文件扫描，加实际 TypeScript 模块执行。
* 隔离 UI、持久化和翻译依赖，不访问用户模型目录、不启动 GPU 推理。
* 失败抛出断言并设置非零退出码，不能只打印错误后返回成功。
*/
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), assert = require('node:assert/strict'); const { createRequire } = require('node:module'), nextRequire = createRequire(path.resolve('apps/next/package.json')); const ts = nextRequire('typescript'), scanner = require("../apps/electron/src/main/modules/models/scanner"); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-control-models-')), cache = new Map(), scannedRoots = [];
// 只替换跨进程传输，扫描本身仍运行正式主进程 modelScanner。
// 零字节模型仅证明文件发现，不声称 safetensors 内容可加载。
// 持久化替换成内存空读写，测试不能改动真实账户和用户数据文件。
// 翻译返回 key，使可预期错误可以独立断言且不加载 React 语言状态。
// 外观只需要初始化解析默认值，与模型扫描及图连线无关。
// Zustand 本体和 persist 中间件使用项目安装版本，不模拟 store 的动作语义。
// 重叠扫描次数会被记录，用于检查未指定检索根时的父目录补扫范围。
// 路径断言仅在受控临时树中比较，最终成功输出不打印临时绝对目录。
const mocks = { '@/i18n': { t: key => key }, '@/utils/electronBridge': { isElectronEnvironment: () => true, scanLocalModels: async (dir, type) => { scannedRoots.push(dir); return scanner.scanModelsInDirectory(dir, type); } }, '@/utils/userDataStorage': { createUserDataSectionPersistStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }) }, '@/utils/appearance': { resolveColorPreset: () => 'default', resolveUiFont: () => 'auto' }, };
// 只给本脚本的 vm 模块安装路径解析，不改全局 require.extensions。
// 类型检查由 pnpm typecheck 独立执行，transpile 仅用于直接运行产品实现。
// @/ 别名优先 renderer，类型和纯数据缺省按项目规则回退 shared/src。
// JSON 通过 Node 正式解析，模板原始对象随后由产品构建器深克隆。
// 模块缓存先写再执行，类型导入被擦除后不产生构建器的运行时循环。
// 外部依赖从 Next 子包解析，避免依赖偶然出现在根 node_modules。
// 该加载器不注入自定义实现到 builder，断言观察其真实返回图。
// 异步队列和浏览器图像编解码由 Electron 冒烟另测，不在 Node 里假装完成。
// sourceURL 使用真实模块路径，失败栈可定位源码，而成功不打印用户资料。
// vm 上下文复用 Node 内置计时器和 structuredClone，不改变 Promise 顺序。
function load(file) { if (cache.has(file)) return cache.get(file).exports; if (file.endsWith('.json')) return require(file); const module = { exports: {} }; cache.set(file, module); const resolve = name => { if (mocks[name]) return mocks[name]; if (!name.startsWith('.') && !name.startsWith('@/')) return nextRequire(name); const bases = name.startsWith('@/') ? [path.resolve('apps/next/src', name.slice(2)), path.resolve('packages/shared/src', name.slice(2))] : [path.resolve(path.dirname(file), name)];
const target = bases.flatMap(base => [base + '.ts', base + '.json', base, path.join(base, 'index.ts')]).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()); if (!target) throw new Error('Missing fixture module: ' + name); return load(target); }; const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText; vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: file })(resolve, module, module.exports); return module.exports; }

// 生成独立的未知目录，避免修复只为 model_patches 特判仍能假通过。
// 深层子目录覆盖用户实际 Anima/其他文件夹的模型组织方式。
// 同目录两个补丁都应作为版本出现，不能因为文件夹已经建档就漏掉后一个。
// 仅图片、JSON、占位文本和真正空目录均不得产生默认分类。
// 大写扩展名和 GGUF 证明识别按模型格式而非固定文件名。
// checkpoint、LoRA 与 embedding 三类都留样，完整索引不应改变其类型推断。
// 重复扫描父目录与显式子目录时，模型文件只能计数一次。
// 所有文件创建在 mkdtemp 树，测试结束只删除已确认的那个绝对目录。
function prepare() { for (const file of ['model_patches/Anima/anima-lllite-inpainting-v2.safetensors', 'model_patches/other/anima-lllite-any-test-like-v2.safetensors', 'new_resource/nested/future.PTH', 'diffusion_models/Anima/base.GGUF', 'loras/Anima/Style/style.safetensors', 'embeddings/token.pt', 'images/cover.png', 'docs/config.json', 'placeholders/put_models_here.txt']) { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, ''); } fs.mkdirSync(path.join(root, 'empty')); }

/**
* 先运行真实主进程递归扫描，再运行设置 store 的完整收集动作。
* 若只修主进程而 renderer 仍过滤 model_patches，本用例仍会失败。
* 搜索根优先规则保持：填写 searchPath 后不应扫描其他显式路径。
* 没有 searchPath 时标准 diffusion_models 可补扫整个 models 父目录。
* 自定义独立目录不扩扫父目录，避免把上层无关资源或磁盘扫描进来。
* 模型删除后的重扫必须替换索引，不能保留已经不存在的陈旧分类。
* 这里验证数据来源，空抽屉过滤仍由正式 LocalModelList 按实际文件聚合。
*/
async function checkScan() { const { useSettingsStore: store } = load(path.resolve('apps/next/src/stores/useSettingsStore.ts')); const paths = { searchPath: root, checkpointPath: '', lorasPath: '', diffusionModelsPath: '' }; store.setState({ paths }); await store.getState().scanAllModels(); let models = store.getState().models, categories = new Set(models.map(model => model.category)); assert.deepEqual([...categories].sort(), ['diffusion_models', 'embeddings', 'loras', 'model_patches', 'new_resource']); assert.equal(models.flatMap(model => model.versions).length, 6); assert.equal(scannedRoots.length, 1);
// LoRA 与 embedding 不能因保留全量结果被改成主模型。
// 新辅助目录仍作为完整索引显示，其是否可用于 UNet 由选择器限制。
// patch 路径必须包含用户真实子目录，不裁掉 Anima 或 other 层。
assert.equal(models.find(model => model.category === 'loras').type, 'lora'); assert.equal(models.find(model => model.category === 'embeddings').type, 'embedding'); assert.equal(models.filter(model => model.category === 'model_patches').length, 2);
// 显式子目录与父目录重叠，最终版本数量仍保持六个。
// 标准父目录的 category 优先，不能把 diffusion_models 误显示成 Anima。
// 补扫不靠 clip/vae/model_patches 名称枚举，未知目录必须同样出现。
store.setState({ paths: { ...paths, searchPath: '', diffusionModelsPath: path.join(root, 'diffusion_models'), lorasPath: path.join(root, 'loras') } }); await store.getState().scanAllModels(); assert.equal(store.getState().models.flatMap(model => model.versions).length, 6); assert(store.getState().models.some(model => model.category === 'new_resource'));
// 任意命名独立目录不向上扩大扫描范围，其模型仍可被直接发现。
// 这项范围负向对照保护没有标准 ComfyUI models 布局的用户。
// 删除最后一个辅助文件后不残留空分类，证明索引不是追加式历史清单。
const before = scannedRoots.length; store.setState({ paths: { ...paths, searchPath: '', diffusionModelsPath: path.join(root, 'new_resource') } }); await store.getState().scanAllModels(); assert.equal(scannedRoots.length, before + 1); assert.equal(store.getState().models.length, 1); fs.unlinkSync(path.join(root, 'new_resource/nested/future.PTH')); store.setState({ paths }); await store.getState().scanAllModels(); assert(!store.getState().models.some(model => model.category === 'new_resource')); }

/**
* 断言期望直接依据用户提供模板的 IMAGE/MASK 契约，不调用产品构建器生成期望。
* 两个模式都检查模型、提示词、种子和 LoRA 权重，不能只检查存在一个节点。
* 两次构建分别传不同文件名，确认模板没有被前一个请求永久污染。
* 蒙版必须取 LoadImage 的 MASK 输出一，边缘模式必须没有 mask 输入。
* 采样器必须经 Apply 再经 LoRA 接 UNet，否则仅“提交成功”不代表控制生效。
* 补丁名允许任意服务端子目录，但不存在或同名歧义必须拒绝。
* 精确路径存在时优先匹配，不因另一目录同名文件错误报歧义。
* 原文字编辑仍返回 Cosmos 参考链，不能被新模式替换掉。
* 图像 RGB/alpha 和真实上传文件名由 Electron UI 冒烟独立验证。
*/
function checkPrompts() { const { buildAnimaEditPrompt: build, resolveAnimaEditModels: resolve, ANIMA_EDIT_DEFAULTS: defaults } = load(path.resolve('apps/next/src/utils/comfy/anima-edit-workflow.ts')); const base = { ...defaults, instruction: 'new prompt', negative: '', seed: '42', steps: 23, cfg: 4.5, samplerName: 'heun', scheduler: 'karras', checkpointName: 'custom.safetensors', loras: [{ name: 'style.safetensors', strength: 0.37 }] };
for (const mode of ['edge', 'inpaint']) { const prompt = build({ ...base, controlMode: mode }, 'uploaded/sub/file.png'), nodes = Object.values(prompt), apply = nodes.find(node => node.class_type === 'AnimaLLLiteApply'), sampler = nodes.find(node => node.class_type === 'KSampler'); assert.equal(prompt['edit-source'].inputs.image, 'uploaded/sub/file.png'); assert.equal(apply.inputs.image[0], 'edit-source'); assert.equal(mode === 'inpaint' ? JSON.stringify(apply.inputs.mask) : apply.inputs.mask, mode === 'inpaint' ? JSON.stringify(['edit-source', 1]) : undefined);
assert.equal(prompt[apply.inputs.model[0]].class_type, 'LoraLoaderModelOnly'); assert.equal(prompt[apply.inputs.model[0]].inputs.strength_model, 0.37); assert.equal(prompt[sampler.inputs.model[0]].class_type, 'AnimaLLLiteApply'); assert.equal(sampler.inputs.steps, 23); assert.equal(sampler.inputs.seed, 42); assert.equal(sampler.inputs.sampler_name, 'heun'); assert.equal(prompt[sampler.inputs.positive[0]].inputs.text, 'new prompt'); assert.equal(prompt[sampler.inputs.negative[0]].inputs.text, '');
// 只提供新目录的模型清单，证明不是模板相对目录原样假通过。
// 缺补丁负向对照在同一图上先拒绝，再给出合法列表确认可成功解析。
// 解析只修改本次独立图，下一次构建仍应读取原模板的模型和上传名。
const patch = nodes.find(node => node.class_type === 'ModelPatchLoader').inputs.name.split(/[\\/]/).pop(); const lists = { checkpoints: [], loras: ['remote/style.safetensors'], diffusionModels: ['remote/custom.safetensors'], clips: ['remote/anima_baseV10_txt.safetensors'], vaes: ['remote/qwen_image_vae.safetensors'], modelPatches: [] }; assert.throws(() => resolve(structuredClone(prompt), lists), /modelMissing/); lists.modelPatches = ['nested/' + patch]; resolve(prompt, lists); assert.equal(Object.values(prompt).find(node => node.class_type === 'ModelPatchLoader').inputs.name, 'nested/' + patch);
const another = build({ ...base, controlMode: mode, loras: [] }, 'second.png'); const bare = Object.values(another).find(node => node.class_type === 'AnimaLLLiteApply'); assert.equal(another[bare.inputs.model[0]].class_type, 'UNETLoader'); assert.equal(another['edit-source'].inputs.image, 'second.png');
// 多目录同名只接受唯一或精确路径，不凭顺序随机挑一个补丁。
// 恢复模板默认路径再测歧义，避免上一轮解析出的精确名称改变测试前置。
// 精确匹配正向对照与歧义负向对照一起存在，防止实现无条件拒绝。
lists.modelPatches = ['a/' + patch, 'b/' + patch]; assert.throws(() => resolve(another, lists), /modelMissing/); const patchNode = Object.values(another).find(node => node.class_type === 'ModelPatchLoader'); lists.modelPatches.push(patchNode.inputs.name); resolve(another, lists); } assert(Object.values(build(base, 'original.png')).some(node => node.class_type === 'ApplyCosmosReferenceLatent')); }

// 所有异步拒绝都进入最终 catch，测试失败必须影响命令退出码。
// 清理在 finally 中发生，成功或失败都不把夹具留在用户可扫描目录。
// 删除目标严格等于本脚本创建的绝对临时树，不接受调用方传入目录。
// 不递归清理仓库、不清理其他 Electron 进程，也不操作真实模型。
// Node 验证结束不意味着 GPU 推理成功，最终交付需明确这一边界。
// 模板基准与参数草稿先于网络清单检查，失败时能区分构建与代理问题。
// 所有新检查仍抛断言到 main.catch，失败不会被日志吞掉返回成功。
// 真实 GPU 质量不在这些结构和参数对照的结论范围内。
// 辅助覆盖检查实际构建后的图，不能只看到面板里多了下拉框就算接通。
// 这组纯构建对照复用现有 TS 加载器，不再维护第二个扫描器或模板副本。
async function main() { try { prepare(); await checkScan(); checkPrompts(); checkTemplateDefaults(); checkControlParameters(); checkModeDrafts(); checkAuxiliaryModels(); await checkRemoteLists(); console.log('PASS: template defaults, custom control ranges, isolated mode drafts, auxiliary loader overrides, model scan and original edit compatibility'); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
main().catch(error => { console.error(error); process.exitCode = 1; });

/**
 * 给单张真实图改辅助文件，再检查图的实际加载节点和默认恢复。
 * 像按插座号更换电器，检查的是最后插在哪里，而不是配置表写了什么。
 * 路径故意使用多层目录，能发现提交端错误截断 basename 的回归。
 * 槽位预期为 CLIP 与 VAE 各一，音频内部占位值不算可选择的文件。
 * 期望来自固定类别和输入字段，不把产品返回图反过来当作正确答案。
 * 模板快照比较覆盖原始节点连接、采样和输出，检查构建没有污染原件。
 * 同一 builder 再传空覆盖必须恢复默认，排除模板被上次构建原地改写。
 * 主模型节点不能通过辅助参数覆盖，否则原有目录和系列校验会被绕过。
 * 绝对路径、盘符和父目录穿越分别提供负向输入，不能靠 UI 不展示来兜底。
 * 结果只是图结构验证，没有加载真实模型或使用 GPU。
 */
// 测试输入矩阵：合法值 Renamed/Nested/clips.safetensors 应完整进入 clip_name。
// 合法 VAE 值使用同层 vaes.safetensors，不能因为目录相同而误写成 CLIP。
// 路径里的两层目录要求原样相等，endsWith 断言不足以发现路径被截断。
// 两个文件分别按 slot.input 读取，VAE 若错写到 clip_name 也会失败。
// 对每个槽都重新调用 builder，不沿用上一份已经更改的输出图。
// 每次 build({}) 是独立请求，期待 defaultName 而不是空字符串。
// 默认值从未经更改的模板提取，不从刚产生的自定义图读取。
// ../outside 的拒绝对应模型根目录外的父层，不属于可接受的模型相对名。
// /outside 的拒绝对应 POSIX 绝对根，不能只检测 Windows 盘符。
// C 盘路径的拒绝对应 Windows 绝对位置，不能误当成文件夹里的冒号字符。
// 三个负例都套用相同的合法节点 id，确保失败原因是路径而非找不到槽。
// assert.throws 同时检查 invalid 错误标记，不接受任意 unrelated TypeError。
// UNet 负例使用模板真正存在的 UNETLoader，不能用随机未知键碰巧被拒绝。
// 主模型文件名本身是合法相对名，负例只针对辅助设置权限边界。
// 模板 before 在调用 builder 前冻结成深副本，避免只比对同一对象地址。
// 模板污染断言检查整张图，不仅检查 CLIP 或 VAE 的一个字段。
// 测试先验证合法路径成功，再测非法路径，不能让全部构建一概失败仍全绿。
// slots 的类别排序只为了忽略节点遍历顺序，不会忽略重复类别的数量。
// 期待值有两个条目，因此额外出现第二个 VAE 也会让当前单图用例失败。
// 视频的双 VAE 不使用这组双槽断言，视频专属数量由页面冒烟覆盖。
// 本工具拿实际 API 图作结果，不读取 UI 标题或格式化后的模型前缀。
// 测试不要求用户磁盘存在 Renamed 文件夹，校验目标是发送参数而非资源可用性。
// 所以合法路径测试通过后仍不能声称对应模型文件确实能被服务端加载。
// 不存在 GPU/OOM 的重试分支，断言失败应直接定位构建器而非网络环境。
function checkAuxiliaryCase(template, build, slots) {
  const before = structuredClone(template);
  assert.deepEqual(slots.map(slot => slot.category).sort(), ['clips', 'vaes']);
  const modelOverrides = Object.fromEntries(slots.map(slot => [slot.id, `Renamed/Nested/${slot.category}.safetensors`]));
  const graph = build(modelOverrides);
  for (const slot of slots) {
    assert.equal(graph[slot.id].inputs[slot.input], modelOverrides[slot.id]);
    assert.equal(build({})[slot.id].inputs[slot.input], slot.defaultName);
    for (const name of ['../outside.safetensors', '/outside.safetensors', 'C:\\outside.safetensors']) {
      assert.throws(() => build({ [slot.id]: name }), /invalid/);
    }
  }
  assert.deepEqual(template, before);
  const unet = Object.keys(template).find(id => template[id].class_type === 'UNETLoader');
  assert.throws(() => build({ [unet]: 'Renamed/base.safetensors' }), /invalid/);
}

/**
 * 图片、文字编辑、蒙版、边缘与两份音频图都走真实构建器。
 * 默认参数从各自既有入口获取，不能把文字编辑的节点号套到控制图。
 * 图片只测试 Anima 的独立加载器；SDXL 另测 checkpoint 内置边界。
 * Role TTS 的两个模板使用不同节点前缀，两者必须各自成功覆盖。
 * 音频占位 VAE 应保持 pixel_space，不能为了统一 UI 改写它。
 * 模板读取返回副本，测试的修改不能污染导入 JSON 或后续用例。
 * 所有文件名都是本例的相对名称，不读取本机私人模型目录。
 * 构建输入使用有效指令和种子，非法路径必须由路径校验真实拒绝。
 * 编辑参考名是合法占位 input 名，未执行实际上传，也没有伪造成功产物。
 * 多个模式在同一进程连续构建，能暴露共享模板对象被写坏的情况。
 */
// 六种构建场景共用同一组路径负例，避免只给某一个新入口加保护。
// 场景一调用文生图 buildImagePrompt，覆盖普通图片生成的参数出口。
// 场景二调用文字编辑 buildAnimaEditPrompt，覆盖它转交基础图的参数透传。
// 场景三通过 edge 模式走专用控制图，节点 id 从边缘模板提取。
// 场景四通过 inpaint 模式走蒙版图，不能只测试另一种相似图后推定通过。
// 场景五不传 referenceName，应使用音频无参考分支的 153 前缀。
// 场景六传 input.wav，应使用参考分支的 157 前缀。
// 音频两种场景都用 seed=42，随机差异不能干扰默认文件比较。
// 参考文件名只是工作流输入名，不代表测试真的创建或上传了音频文件。
// 音频模型覆盖由普通输入字段进入 builder，未直接调用赋值函数伪造最终图。
// 控制默认参数从 getAnimaControlDefaults 读取，能维持各模板合法采样输入。
// 文字编辑的 instruction 明确非空，避免默认空指令校验抢先拒绝路径负例。
// 图片构建没有强行指定其他主模型，辅助更改与主模型选择逻辑保持解耦。
// Anima 返回的 template 也供文字编辑比较默认，二者本来共用基础加载图。
// 控制模式必须重新取 graph；如果误套基础图 id，合法覆盖断言会立即失败。
// 音频 pixel_space 通过最终图的 VAELoader 输入检查，不能只检查 UI 没显示它。
// 两份音频图分别检查这个内部占位，不能从无参考结果推断参考模式也安全。
// SDXL 的正例期待空槽数组，说明 checkpoint 输出不应伪装为独立加载节点。
// SDXL 的负例向 id=1 提供假文件，即使 id 数字存在也没有辅助槽权限。
// 这能发现前端没有下拉框、构建器却仍偷偷接受无效覆盖的边界分叉。
// SDXL 没有额外调用单图双槽助手，否则预期数量本身就错误。
// 测试使用同一个模块缓存，后续默认恢复更容易暴露共享 JSON 被改写的问题。
// 各构建器的异步上传不在本文件模拟，覆盖功能不依赖浏览器 File API。
// load 仍转译真实源码，辅助函数没有被替换成简单的返回输入替身。
// 因此类目过滤、槽存在性和路径校验都由产品代码实际执行。
// 这组结果与 UI 冒烟互补：一组证明值能进图，一组证明用户能在入口选择。
// 它没有覆盖不同权重格式是否被 ComfyUI 接受，格式兼容需真实服务验证。
// 它也不评价更换 CLIP 后的画质，图结构正确不是模型搭配质量证明。
function checkAuxiliaryModels() {
  const image = load(path.resolve('apps/next/src/utils/comfy/imageWorkflow.ts'));
  const edit = load(path.resolve('apps/next/src/utils/comfy/anima-edit-workflow.ts'));
  const control = load(path.resolve('apps/next/src/utils/comfy/anima-control-workflow.ts'));
  const audio = load(path.resolve('apps/next/src/utils/comfy/audio-workflow.ts'));
  const { getWorkflowAuxiliarySlots: slots } = load(path.resolve('apps/next/src/utils/comfy/video-workflow-models.ts'));
  const template = image.getImageWorkflowTemplate('anima');
  checkAuxiliaryCase(template, modelOverrides => image.buildImagePrompt('anima', { modelOverrides }), slots(template, 'image'));
  checkAuxiliaryCase(template, modelOverrides => edit.buildAnimaEditPrompt({ ...edit.ANIMA_EDIT_DEFAULTS, instruction: 'edit', modelOverrides }, 'input.png'), slots(template, 'image'));
  for (const mode of ['edge', 'inpaint']) {
    const graph = control.getAnimaControlTemplate(mode);
    checkAuxiliaryCase(graph, modelOverrides => edit.buildAnimaEditPrompt({ ...control.getAnimaControlDefaults(mode), instruction: 'edit', modelOverrides }, 'input.png'), slots(graph, 'image'));
  }
  for (const reference of [false, true]) {
    const graph = audio.audioWorkflowTemplate(reference);
    const build = modelOverrides => audio.buildAudioPrompt({ prompt: 'A quiet voice', seed: 42, referenceName: reference ? 'input.wav' : undefined, modelOverrides });
    checkAuxiliaryCase(graph, build, slots(graph, 'audio'));
    assert(Object.values(build({})).some(node => node.class_type === 'VAELoader' && node.inputs.vae_name === 'pixel_space'));
  }
  assert.deepEqual(slots(image.getImageWorkflowTemplate('sdxl'), 'image'), []);
  assert.throws(() => image.buildImagePrompt('sdxl', { modelOverrides: { '1': 'fake.safetensors' } }), /invalid/);
}

/**
 * 正式主进程代理必须真的请求 model_patches，不能只改 renderer 的类型字段。
 * 启动本地 HTTP 假服务，记录请求URL并返回深层相对路径。
 * 其他类别返回空列表，避免旧模型清单碰巧提供同名文件掩盖缺失请求。
 * 数组中的非字符串值应被既有响应校验剔除，不能进入资源匹配器。
 * 用真实 listComfyModels 执行 fetch，未替换其内部 fetchModelList。
 * 不运行 Electron 或 GPU，与页面冒烟可独立执行。
 * 监听范围仅127.0.0.1，端口由系统分配，不抢占用户ComfyUI端口。
 * 服务器始终在finally中关闭，失败不能留下监听进程或悬挂计时器。
 * 临时模型名仅用于fixture，不代表这些文件已经安装在用户环境。
 * 成功只证明HTTP资源契约，真实自定义节点执行仍需实际服务验证。
 */
async function checkRemoteLists() {
  const http = require('node:http'), seen = [], patch = 'arbitrary/subfolder/anima-lllite-inpainting-v2.safetensors';
  const server = http.createServer((req, res) => { seen.push(req.url); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/models/model_patches' ? [patch, 123, null] : [])); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { const lists = await require("../apps/electron/src/main/modules/comfy/proxy").listComfyModels('127.0.0.1:' + server.address().port); assert(seen.includes('/models/model_patches')); assert.deepEqual(lists.modelPatches, [patch]); assert.deepEqual(lists.checkpoints, []); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

/**
 * 独立图签名展开所有输入连线，只忽略节点编号和纯显示 _meta。
 * 因此重命名 LoadImage 不影响比较，改变潜变量、CLIP 或分块解码会失败。
 * 每个连线保留输出槽位，IMAGE 零与 MASK 一不能互换。
 * 所有节点均参与签名，不仅比较最终可达子图，避免偷偷添加额外 LoRA。
 * 内置模板是无环 API 图，递归展开不会接受任意外部工作流作为输入。
 * 签名与产品构建器无依赖，避免由同一个转换函数构造预期和实际。
 * 输入键排序消除 JSON 属性顺序差异，数值与字符串类型仍严格保留。
 * 数组只有匹配真实图内 id 的两项引用才按连线处理，普通输入原样保留。
 * 模型路径、编码器类型、采样数值和解码选项都不能被比较器忽略。
 */
function graphSignature(prompt) {
  // 标量保留原类型，字符串种子与数字种子不能在比较时混为相同。
  // 输出槽位保留在展开对象内，即使两个节点恰好拥有相同类型也不抹除通道差异。
  // 整个节点签名排序只忽略原文件中的排列顺序，不丢弃重复节点数量。
  // 例如新增一份孤立预览仍会改变签名列表，不能假装与原图完全一致。
  // 该比较器没有服务端模型路径映射步骤，比较的是执行前的原始模板参数。
  const node = id => ({ kind: prompt[id].class_type, inputs: Object.fromEntries(Object.entries(prompt[id].inputs).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, Array.isArray(value) && value.length === 2 && prompt[value[0]] ? { node: node(value[0]), slot: value[1] } : value])) });
  return Object.keys(prompt).map(id => JSON.stringify(node(id))).sort();
}

/**
 * 用原始两个 JSON 作为独立 golden，不用产品默认值构造期望图。
 * 只替换用户提示词与上传文件名；模板历史示例不会作为实际输入发送。
 * 默认采样、模型、控制强度、时间区间、尺寸链与解码选项必须逐项一致。
 * 预期节点集合没有 LoRA，能发现文字编辑的 AnimeEditV2 意外注入。
 * 默认 seed 保持模板固定值，随机模式必须由用户明确启用。
 * 每轮比较后重新读取原 JSON，证明 builder 没有污染共享模板对象。
 * 用完整图签名检查，而不是只断言存在一个 AnimaLLLiteApply 节点。
 * 该正向对照通过后才检查自定义参数，先确保真正的默认基准成立。
 * 输入原图实际字节和 alpha 方向由 Electron 冒烟另行验证。
 * 未连接真实 ComfyUI，不把模板结构一致描述为真实生成画质一致。
 */
function checkTemplateDefaults() {
  // 比较时两图使用相同受控上传名，原 JSON 中的历史本地图片不参与请求。
  // 正向文本替换为明确测试值，避免包含模板里人物示例的意外内容。
  // 负向文本不覆盖期望图，产品若套用文生图长负面词会被直接发现。
  // 模型路径必须原样相等，唯一 basename 回退属于另一组资源解析测试。
  // 两个模板的 seed 各不相同，不能共用一个写死的种子默认值假通过。
  // 普通文字流已经由 checkPrompts 验证，不在这里把其 Cosmos 链当作控制图期望。
  const { getAnimaControlDefaults: defaults } = load(path.resolve('apps/next/src/utils/comfy/anima-control-workflow.ts')), { buildAnimaEditPrompt: build } = load(path.resolve('apps/next/src/utils/comfy/anima-edit-workflow.ts'));
  for (const mode of ['inpaint', 'edge']) {
    const name = mode === 'inpaint' ? 'image_anima_lllite_image_inpainting.json' : 'image_anima_lllite_any_control_to_image.json', original = require(path.resolve('apps/next/src/data/comfy/utillswWorkflower', name)), serialized = JSON.stringify(original), expected = structuredClone(original), values = defaults(mode);
    const sampler = Object.values(expected).find(node => node.class_type === 'KSampler'); expected[sampler.inputs.positive[0]].inputs.text = 'template baseline'; Object.values(expected).find(node => node.class_type === 'LoadImage').inputs.image = 'uploaded.png';
    assert.deepEqual(graphSignature(build({ ...values, instruction: 'template baseline' }, 'uploaded.png')), graphSignature(expected)); assert.equal(JSON.stringify(original), serialized); assert.equal(values.loras.length, 0);
  }
}

/**
 * 自定义强度与区间必须进入实际 Apply 节点，不能只更新界面显示。
 * 同时测试零强度、两个相等端点、零结束点及完整区间的合法边界。
 * 负值、超范围、NaN、Infinity 和倒序区间都应在构建阶段失败。
 * 独立调用公共 build 入口，覆盖离线导出和实际队列共用的校验路径。
 * 老快照缺新字段时回退模板，不能因新增可调参数破坏历史调用者。
 * 显式零值不能被默认一覆盖，这正是空值回退与真值回退的差别。
 * 每次构建读取新的模板克隆，自定义值不应污染下一次默认任务。
 * 两种控制流均检查，防止仅蒙版 UI 生效而边缘流遗漏赋值。
 * 这里不模拟补丁的内部采样行为，只检查发给服务端的精确参数。
 * 拒绝非法参数必须抛异常到上层，不能静默夹取后假称使用了用户值。
 */
function checkControlParameters() {
  // 第一组使用非端点小数，可发现 UI 或构建器把比例错误取整。
  // 第二组的三项零值检测 truthy 默认回退，零不能被无声替换为一。
  // 第三组覆盖最大强度与百分比一，证明不是所有输入都被一概拒绝。
  // 倒序负向样本两端各自合法，能单独发现缺少顺序校验的问题。
  // NaN 与 Infinity 各在不同字段出现，确保检查覆盖所有控制数字。
  // legacy 构建刻意传 undefined，与用户显式输入零的语义分开验证。
  const { getAnimaControlDefaults: defaults } = load(path.resolve('apps/next/src/utils/comfy/anima-control-workflow.ts')), { buildAnimaEditPrompt: build } = load(path.resolve('apps/next/src/utils/comfy/anima-edit-workflow.ts'));
  for (const mode of ['inpaint', 'edge']) {
    const base = { ...defaults(mode), instruction: 'control values' };
    for (const [strength, start, end] of [[0.65, 0.2, 0.8], [0, 0, 0], [10, 1, 1]]) { const apply = Object.values(build({ ...base, controlStrength: strength, controlStart: start, controlEnd: end }, 'input.png')).find(node => node.class_type === 'AnimaLLLiteApply'); assert.deepEqual([apply.inputs.strength, apply.inputs.start_percent, apply.inputs.end_percent], [strength, start, end]); }
    for (const patch of [{ controlStart: -0.1 }, { controlEnd: 1.01 }, { controlStart: 0.9, controlEnd: 0.2 }, { controlStrength: -1 }, { controlStrength: 10.01 }, { controlStrength: NaN }, { controlStart: Infinity }, { controlEnd: NaN }]) assert.throws(() => build({ ...base, ...patch }, 'input.png'), /invalidParameters/);
    const apply = Object.values(build({ ...base, controlStrength: undefined, controlStart: undefined, controlEnd: undefined }, 'legacy.png')).find(node => node.class_type === 'AnimaLLLiteApply'); assert.deepEqual([apply.inputs.strength, apply.inputs.start_percent, apply.inputs.end_percent], [1, 0, 1]);
  }
}

/**
 * 使用真实 Zustand 和领域动作，隔离加载器仅替换无关的持久化与翻译。
 * 文字草稿故意设为不同步数并携带扩展，控制模式仍必须保持 JSON 初值。
 * 模式切换后恢复各自参数，确认不是每次挂载又重置成默认一、零、一。
 * 通过共用函数式 setter 改变端点，验证最新值合并而非闭包覆盖。
 * 正反提示词按原设计共用，改控制模式提示词应同步文字编辑输入。
 * UNet 和 LoRA 选择独立保留，控制默认空列表不能被文字预载扩展污染。
 * seedMode 也必须独立，文字随机不能让首次蒙版偏离固定模板种子。
 * 测试不启动队列或创建 File，参数隔离不能新增第二份生成生命周期。
 * finally 恢复测试前的 store，后续用例不能继承本用例故意制造的参数。
 * 不比较对象地址推断数值相同，关键字段使用显式断言。
 */
function checkModeDrafts() {
  // text-only 与 mask-only 是隔离标签，不依赖任何用户实际模型路径。
  // 这里不调用模型目录解析器，资源存在性由已有扫描与远端清单测试承担。
  // 两次函数式设置分别改起点和终点，若第二次使用旧状态会撤销第一次设置。
  // edge 草稿在这些更新后仍为十五步且无选择，能发现模式 key 写错。
  // 恢复使用真实 store.setState，不销毁模块，模拟页面保持挂载的生命周期。
  // 全局任务字段未被 patch，测试不通过清空 taskId 掩盖队列状态问题。
  const { useAnimaEditStore: text } = load(path.resolve('apps/next/src/stores/use-anima-edit-store.ts')), { useAnimaControlStore: control, getAnimaEditDraft: get, patchAnimaEditDraft: patch, editDraftSetter: setter } = load(path.resolve('apps/next/src/stores/use-anima-control-store.ts')), oldText = text.getState(), oldControl = control.getState();
  try { text.setState({ settings: { ...oldText.settings, steps: 43 }, extensions: [{ extensionId: 'text-only', weight: 1 }], seedMode: 'random' }); assert.equal(get('inpaint').settings.steps, 15); assert.deepEqual(get('inpaint').extensions, []); assert.equal(get('inpaint').seedMode, 'custom');
    setter('inpaint', 'settings')(previous => ({ ...previous, instruction: 'shared instruction', controlStart: 0.23 })); setter('inpaint', 'settings')(previous => ({ ...previous, controlEnd: 0.76 })); patch('inpaint', { selectedModel: { modelId: 'mask-unet', versionId: 'v1' }, extensions: [{ extensionId: 'mask-only', weight: 0.4 }] }); control.getState().setFormMode('text'); control.getState().setFormMode('inpaint');
    assert.equal(get('inpaint').settings.controlStart, 0.23); assert.equal(get('inpaint').settings.controlEnd, 0.76); assert.equal(get('text').settings.steps, 43); assert.equal(get('text').settings.instruction, 'shared instruction'); assert.equal(get('edge').settings.steps, 15); assert.equal(get('edge').selectedModel, null); assert.deepEqual(get('edge').extensions, []); assert.equal(get('text').extensions[0].extensionId, 'text-only'); assert.equal(get('inpaint').extensions[0].extensionId, 'mask-only');
  } finally { text.setState(oldText); control.setState(oldControl); }
}
