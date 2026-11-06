/**
 * MiniMax 音频契约回归：执行真实 TS 构建器、共享 FIFO 和 HTTP 主进程代理。
 * 服务端仅模拟 ComfyUI，不加载模型、不使用 GPU，也不产生付费请求。
 * 所有音频使用受控字节，路径和文档均隔离在临时目录。
 * 断言失败设置非零退出，不能只打印检查结果而给 CI 返回成功。
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createRequire } = require('node:module'), nextRequire = createRequire(path.resolve('apps/next/package.json')), ts = nextRequire('typescript'), { setTimeout: delay } = require('node:timers/promises');
const proxy = require("../apps/electron/src/main/modules/comfy/proxy"), generation = require("../apps/electron/src/main/modules/comfy/comfy-generation"), root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-audio-contract-')), cache = new Map();
let server, address, held = false, uploadCount = 0, lists = null, failSave = false, failRemote = false; const submissions = [], downloads = [], bytes = Buffer.from('fLaC-audio-contract');

// 运行实际 Zustand，替换的只是账户持久化、设置和其他生成模式的外围依赖。
// 队列本身不替换，FIFO 排序、任务状态和撤回行为都由正式模块决定。
// 翻译返回 key，让错误断言不受当前用户语言影响。
// 无 GPU 的伪音频不验证声学质量，字节断言只验证传输与落盘契约。
// 快照时读取受控服务地址，真正请求仍经过正式主进程 HTTP 实现。
// 固定输出目录避免写入用户实际作品目录。
// 图片元数据构造在本用例不会执行，仅隔离不相关的 PNG 依赖。
// buildImagePrompt 替身若被误调用会立即失败，防止音频走错图片链路。
// 单一 cache 模拟应用模块生命周期，切页不重新创建全局队列或音频草稿。
// 所有 mock 都局限于本脚本加载器，不覆盖 Node 全局 require。
const mocks = {
  '@/i18n': { t: key => key }, '@/data/videoForm': { isMinimaxWorkflow: id => id === 'minimax' },
  '@/stores/useSettingsStore': { useSettingsStore: { getState: () => ({ comfyServerUrl: address, paths: {}, outputPath: root }) } },
  '@/stores/useHistoryFolderStore': { useHistoryFolderStore: { getState: () => ({ outputMode: 'fixed', fixedOutputPath: null, selectedFolderId: 'default' }) }, getSelectedFolderDirPath: () => null },
  '@/stores/useToastStore': { useToastStore: { getState: () => ({ show() {} }) } },
  '@/utils/electronBridge': { isElectronEnvironment: () => true, resolveEffectiveOutputPath: async () => root },
  '@/utils/generatedImages': { isPathWithinOutputRoot: () => true, resolveSaveOutputPath: () => root },
  '@/utils/comfy/imageWorkflow': { buildImagePrompt: () => { throw new Error('audio used image builder'); } },
  '@/utils/comfy/resolveComfyModels': {}, '@/utils/buildGeneratedImageMeta': {}, '@/utils/saveGeneratedImages': {},
};

// transpile 仅为 Node 直接执行 TS，严格类型检查由 pnpm typecheck 单独完成。
// 正式 @/ 路径先搜索 renderer，再按项目约定回退 shared/src。
// JSON 使用原始用户模板，不用 builder 的返回值反过来生成期望。
// 模块先缓存再执行，保证 Zustand 单例在所有适配层共享。
// 所有网络请求使用主机本地随机端口，不读取用户配置中的 ComfyUI 地址。
// 动态 import 不在被测模块中使用，CommonJS 包装保留正常依赖顺序。
// source filename 保留源码位置，错误可以定位而无需输出私人文件内容。
// 第三方依赖从 Next 的包环境解析，不依赖根目录的偶然提升。
function load(file) {
  if (cache.has(file)) return cache.get(file).exports; if (file.endsWith('.json')) return require(file);
  const module = { exports: {} }; cache.set(file, module);
  // shared 包公开的是 TS 源码，Node 直接 require 会漏掉目录和类型导出的编译。
  // 测试继续执行真实 shared 模块，只复用这里已有的转译与模块缓存。
  // 子路径同样按包公开源码定位，不能另造一份简化 schema 让验证假通过。
  // 测试加载器像按收件地址送包裹：依赖在哪个包声明，就从那个包的环境找它。
  // pnpm 的隔离安装不会保证 zod 也出现在 Next 的 node_modules 中。
  // 因此 shared 的依赖必须用 shared 源文件位置创建 require。
  // 这样删除偶然的依赖提升后，测试仍能反映真实包边界。
  // 新的模型加载器引用共享类型与 schema，使原来隐藏的解析前提暴露出来。
  // 修复解析入口比添加额外 mock 更可靠，因为后者可能掩盖真实字段校验。
  // shared 的包根入口对应 index.ts，不能把包名直接拼成一个没有扩展名的路径。
  // shared 子路径从公开子路径后缀定位，不把 renderer 的 @ 别名规则套到包名。
  // 转译后导出的对象仍缓存在原文件键下，重复导入不会制造第二套 schema 实例。
  // 先缓存再执行保留循环依赖处理能力，不能每次嵌套 require 都重跑模块。
  // 外部包继续使用其原 CommonJS 导出，不用本测试的转译器改写第三方依赖。
  // 相对导入仍从当前源文件目录解析，不能从仓库根误找同名模块。
  // 既有 @ 别名依次查 renderer 和 shared，与本项目兼容路径约定一致。
  // 真实 shared barrel 可能继续导出其他模块，加载器应递归处理它们而非截断导出。
  // 这保留了队列所用 schema 与产品版本的一致性。
  // 被测构建器不靠测试脚本补字段，缺必要值仍会触发真实参数错误。
  // 翻译替身保留稳定错误 key，因此路径负向断言不依赖操作系统语言。
  // 模块加载失败会由主回归入口报告失败，不静默切换到简化对象。
  // 本修改没有更新产品编译选项，生产代码的 strict 检查继续由独立命令执行。
  // 测试运行时转译不等于类型检查通过，两种验证必须分别记录。
  // 受控外部依赖解析不接触网络，没有在测试中临时安装缺少的依赖。
  // 缺包时直接失败能暴露 lockfile 或包声明问题，不返回空模型清单假装成功。
  // 加载器仍局限在这个 Node 进程，不改用户 Electron 的模块加载机制。
  // 这里没有开放渲染层 require，页面仍通过原 preload 调用系统能力。
  // 通过完整音频回归后才能判断修复没有破坏 FIFO、取消或批量冻结。
  // 单独成功加载文件不足以证明整个音频生成参数链路仍然正确。
  // 受控服务的请求与字节断言继续运行，没有因加载边界修复而跳过。
  // 如果参数类型演化，加载真实 shared 的方式会更早暴露测试前提不一致。
  // 临时目录、服务器和任务状态的清理仍沿用原 main 的 finally。
  // 这段适配不读取真实密钥、账户设置或用户的音频参考文件。
  const sharedFile = name => path.resolve('packages/shared/src', name === '@illusion-realm/shared' ? 'index.ts' : name.slice('@illusion-realm/shared/'.length) + '.ts');
  // 第三方依赖从实际源文件所属包解析，shared 的 Zod 不依赖 Next 偶然提升。
  // 别名和受控替身仍走原规则，不给生产模块注入另一套 schema 实现。
  // 这修正测试环境解析，不改项目依赖或真实运行时的加载行为。
  const resolve = name => { if (mocks[name]) return mocks[name]; if (name === '@illusion-realm/shared' || name.startsWith('@illusion-realm/shared/')) return load(sharedFile(name)); if (!name.startsWith('.') && !name.startsWith('@/')) return createRequire(file)(name); const bases = name.startsWith('@/') ? [path.resolve('apps/next/src', name.slice(2)), path.resolve('packages/shared/src', name.slice(2))] : [path.resolve(path.dirname(file), name)]; const target = bases.flatMap(base => [base + '.ts', base + '.json', path.join(base, 'index.ts'), base]).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()); if (!target) throw new Error('Missing test dependency: ' + name); return load(target); };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(resolve, module, module.exports); return module.exports;
}
const product = name => load(path.resolve('apps/next/src', name)), json = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

// /prompt 保存实际提交图，检查输入不只停留在页面参数对象。
// /history 返回 PreviewAudio 的 audio 数组，而非伪装成 images。
// 文件属于 temp/preview 子目录，用例可发现代理错把临时文件当 output 的问题。
// 上传回包特意返回不同子目录，确保 LoadAudio 使用真实响应路径。
// 受控 held 模式使第一项停留在生成中，后续项必须保持排队。
// /view 检查完整查询参数，下载端不能忽略 type 或 subfolder。
// HTTP 路由不实现视频输出，误走视频图无法从本用例得到合法期望。
// 服务端错误会销毁响应，客户端必须失败，不以空输出作为成功。
async function serve(req, res) {
  if (req.url === '/upload/image') { let body = ''; for await (const chunk of req) body += chunk.toString('latin1'); assert.match(body, /filename="ir_audio_[a-z0-9-]+\.flac"/); assert(!body.includes('filename="??')); uploadCount++; return json(res, { name: 'accepted.flac', subfolder: 'references', type: 'input' }); }
  if (req.url === '/prompt') { let body = ''; for await (const chunk of req) body += chunk; submissions.push(JSON.parse(body).prompt); return json(res, { prompt_id: String(submissions.length) }); }
  if (req.url.startsWith('/history/')) { const id = req.url.split('/').pop(); return json(res, held ? {} : { [id]: { status: { completed: true }, outputs: { out: { audio: [{ filename: 'generated.flac', subfolder: 'preview', type: 'temp' }] } } } }); }
  if (req.url.startsWith('/view?')) { const query = new URL(req.url, `http://${address}`).searchParams; assert.equal(query.get('type'), 'temp'); assert.equal(query.get('subfolder'), 'preview'); downloads.push(query.get('filename')); res.writeHead(200, { 'Content-Type': 'audio/flac' }); return res.end(bytes); }
  res.writeHead(404); res.end();
}

// Promise 拒绝即刻消费，稍后撤回不能触发 Node 的未处理拒绝退出。
// wait 有有限上限，找不到提交事件时明确失败，不能无限卡住套件。
// state 返回真正任务 store 的快照，不通过页面文字猜测已经排队。
// check 输出只包含用例名称，不泄漏音频、模型绝对路径或用户设置。
const consumed = promise => promise.then(value => ({ value }), error => ({ error }));
async function wait(test) { for (let i = 0; i < 200; i++) { if (test()) return; await delay(10); } throw new Error('Audio contract timed out'); }
let passed = 0;
async function check(name, test) { await test(); passed++; console.log('PASS', name); }

/**
 * 模板基准先于用户覆盖：默认模型、连接和数值必须与用户 JSON 一致。
 * 仅 prompt/seed 是必选替换，默认加速 LoRA 链在未编辑时保持原样。
 * 同时检查 text/reference 两条图，不能用一个模板的默认值代替另一个。
 * 参考音频连接保留其输出索引，避免接口能提交却没有实际条件音频。
 * 中文对白保持原文，编码处理仅作用于上传名称和模板文件名。
 * 空扩展明确移除整条 LoRA 链，采样器仍必须接到有效 UNet。
 * 非 MiniMax LoRA 和非法种子必须在网络副作用前被拒绝。
 * 无效输入负向对照确保构建器不是无条件返回模板的恒真实现。
 */
// 无参考图的输出节点应仍为 PreviewAudio，不新增 SaveImage 或视频拼接。
// 无参考图的音频解码应仍连接 VAEDecodeAudio，而非通用图像 VAEDecode。
// 无参考图的图像 VAE 名称为 pixel_space，该值必须原样保留。
// 无参考图的音频 VAE 路径从模板读取，不替换成普通视频 VAE。
// 无参考图的采样器为 res_multistep，builder 不能使用图片页当前采样器。
// 无参考图的 scheduler 为 simple，builder 不能继承用户视频页的上次选择。
// 无参考图的 denoise=1，不因音频参考设置而自动改成较小数值。
// 无参考图的 UNet 权重类型 fp8_e5m2 不能在重建时丢失。
// 无参考图的 CLIP 类型 minimax 不能被图像文本编码器设置覆盖。
// 无参考图的 CLIP device=default 保留，不在客户端猜测 GPU 分配。
// 无参考图的长度表达式保留完整字符串，不用重新计算的常量替代。
// 无参考图的 PrimitiveFloat 默认 4 秒，通过整图比较保护这个数值。
// 参考图的 PrimitiveFloat 默认 5 秒，通过同一整图对照独立保护。
// 参考图的采样步数为 8，不与无参考图 10 步混为一个公共默认值。
// 参考图的 ref_image_size=match 是模板条件输入，不能因为只生成音频而删掉。
// 参考图的 ref_audios.ref_audio_1 端口保留精确名称，索引不能平移成零。
// 参考图的 LoadAudio 输入替换为服务器响应名，模板原 1.flac 不应残留。
// 参考图的 audio_vae 连接与解码器 VAE 同源，整图对照会发现断开引用。
// 两份图的 _meta 数据被保留，节点标题不能成为 builder 的查找依赖。
// 整图期望只对 prompt、noise_seed、LoadAudio 三类值做明确替换。
// 不删除默认 LoRA 时原节点 id 和模型链必须完全保持。
// 传空数组时删除 LoRA 节点，检查所有引用仍指向存在节点。
// 这项引用遍历能发现 scheduler 或 guider 仍引用被删除节点的问题。
// 固定 seed=0 的移除 LoRA 用例同时覆盖合法零值，不允许 truthy 回退。
// 负 seed 用例必须抛错，防止把特殊 -1 当成音频图约定的随机哨兵。
// 小数 seed 用例必须抛错，不能在 builder 内静默 floor。
// NaN seed 用例代表输入转换失败，不能被 JSON 序列化成 null 后送出。
// 超安全整数用例防止 JavaScript 数值精度丢失后仍使用错误固定种子。
// 空白描述用例必须失败，不能生成模板样例对白。
// Anima 路径用例是跨 UNet 系列的负向对照，不只是检查文件扩展名。
// 所有这些图测试都不调用网络，失败发生时 uploadCount 应仍为初始值。
// 第二次获取原始模板要与第一次相等，检测共享 import 被修改的副作用。
async function graphs() {
  const builder = product('utils/comfy/audio-workflow.ts');
  for (const reference of [false, true]) { const original = builder.audioWorkflowTemplate(reference), graph = builder.buildAudioPrompt({ prompt: '温柔地说：你好', seed: 42, referenceName: reference ? 'references/accepted.flac' : undefined }); const expected = structuredClone(original); for (const node of Object.values(expected)) { if (node.class_type.startsWith('MiniMaxH3')) node.inputs.prompt = '温柔地说：你好'; if (node.class_type === 'RandomNoise') node.inputs.noise_seed = 42; if (node.class_type === 'LoadAudio') node.inputs.audio = 'references/accepted.flac'; } assert.deepEqual(graph, expected); assert.deepEqual(builder.audioWorkflowTemplate(reference), original); }
  const removed = builder.buildAudioPrompt({ prompt: 'test', seed: 0, loras: [] }); assert(!Object.values(removed).some(node => node.class_type === 'LoraLoaderModelOnly')); for (const node of Object.values(removed)) for (const value of Object.values(node.inputs)) if (Array.isArray(value)) assert(removed[value[0]], 'dangling graph link');
  for (const seed of [-1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => builder.buildAudioPrompt({ prompt: 'test', seed })); assert.throws(() => builder.buildAudioPrompt({ prompt: ' ', seed: 0 }));
  assert.throws(() => builder.buildAudioPrompt({ prompt: 'test', seed: 0, loras: [{ id: 'bad', name: 'Anima/wrong.safetensors', strength: 1 }] }));
}

/**
 * 主模型与步数使用真实模板：无参考十步，有参考八步。
 * 期望节点 id 直接取用户 JSON 的已知端口，不从返回图反推期望。
 * 先比较默认值，再测试显式覆盖，避免把默认和用户输入混为一谈。
 * 重命名后的文件仍位于 Minimax 系列目录，并保留任意合法子目录。
 * 只允许 UNet 与 BasicScheduler 变化，其余节点用整图比较保护。
 * 两份图都覆盖，以发现参考切换后错误使用旧节点 id 的问题。
 * 覆盖步数十七不是任一模板默认值，可以识别控件仅改显示的错误。
 * 原始模板再次获取后保持不变，构建过程不能污染后续默认值。
 * 非法步数覆盖零、超上限、小数和 NaN，均应同步失败。
 * UNet 的跨系列、目录穿越和绝对路径沿用共享安全校验。
 * 本组不访问服务端，因此不以真实模型推理描述测试结论。
 * 单独构建失败也不能引发参考音频上传或队列副作用。
 */
async function controls() {
  // 参数缺省时与用户提供的原始 JSON 保持一致，不依赖 UI 初始 state。
  // 返回的 unetName 保留模板反斜杠，路径规范化留给正式解析器。
  // 参考图存在性分别作为 false/true 传入，不能只验证默认 false 分支。
  // 节点号的区别能发现 UI 将无参考覆盖值直接用于参考图的问题。
  // 预期图从未覆盖图克隆，避免把错误构建结果作为覆盖参数的期望。
  // 未修改字段全部参与 deepEqual，包括音频长度与两个 VAE。
  // 默认加速 LoRA 链必须保留，替换 UNet 不意味着删除加速器。
  // 模型名的 Renamed 子目录与默认目录不同，不能仅替换 basename。
  // 安全失败以 throws 观察，不接收把非法步数静默截断后的成功返回。
  // NaN 在真实输入转换失败时可能出现，必须先于 JSON 序列化被拒绝。
  // 路径穿越用例即使有合法系列前缀仍须失败，系列过滤不能代替路径校验。
  // Anima 用例路径格式合法，只检验模型家族限制是否仍生效。
  const builder = product('utils/comfy/audio-workflow.ts'), name = 'Minimax/Renamed/renamed-audio.safetensors';
  for (const reference of [false, true]) {
    const defaults = builder.audioWorkflowDefaults(reference), original = builder.audioWorkflowTemplate(reference), id = reference ? '157:6' : '153:6', scheduler = reference ? '157:9' : '153:9';
    assert.equal(defaults.unetId, id); assert.equal(defaults.unetName, original[id].inputs.unet_name); assert.equal(defaults.steps, reference ? 8 : 10);
    const input = { prompt: 'override', seed: 42, referenceName: reference ? 'accepted.flac' : undefined }, expected = builder.buildAudioPrompt(input); expected[id].inputs.unet_name = name; expected[scheduler].inputs.steps = 17;
    assert.deepEqual(builder.buildAudioPrompt({ ...input, unetName: name, steps: 17 }), expected); assert.deepEqual(builder.audioWorkflowTemplate(reference), original);
    // 两份模板分别验证默认秒数，防止 UI 初始化把参考图也锁成四秒。
    // 使用 7.5 作为覆盖值，它不同于两个默认值，也不是整数。
    // 默认图与覆盖图做整图比较，唯一额外变化应是秒数来源节点。
    // 若改成直接写 core.length，连线将改变，这条对比会失败。
    // 表达式与音频 VAE 均包含在 expected 中，不只检查数字存在。
    // 再次读取模板证明构建器没有污染共享 JSON 导入。
    // 固定节点号来自两份独立原始模板，而非生产查找函数的返回值。
    // 此组只证明参数传递，不证明生成音频能精确裁剪到 7.5 秒。
    assert.equal(defaults.durationSeconds, reference ? 5 : 4);
    expected[reference ? '157:111' : '153:111'].inputs.value = 7.5;
    assert.deepEqual(builder.buildAudioPrompt({ ...input, unetName: name, steps: 17, durationSeconds: 7.5 }), expected);
  }
  for (const steps of [0, 101, 1.5, NaN]) assert.throws(() => builder.buildAudioPrompt({ prompt: 'invalid', seed: 0, steps }));
  for (const unetName of ['Anima/wrong.safetensors', 'Minimax/../wrong.safetensors', 'C:/wrong.safetensors']) assert.throws(() => builder.buildAudioPrompt({ prompt: 'invalid', seed: 0, unetName }));
  // 上下边界应接受，避免把客户端范围意外实现成开区间。
  // NaN 与无穷值不能通过“不是负数”这类不完整数值检查。
  // 字符串虽可转为数字，也不是运行期契约接受的 number 类型。
  // 越界必须在上传前抛出明确时长错误，不能悄悄钳制后继续生成。
  // 本脚本的 HTTP 服务虽然已启动，此组始终不提交远端任务。
  // 负向断言检查错误 key，防止其他无关错误导致假通过。
  for (const durationSeconds of [0.1, 60]) assert.equal(builder.buildAudioPrompt({ prompt: 'bounds', seed: 0, durationSeconds })['153:111'].inputs.value, durationSeconds);
  for (const durationSeconds of [0, -1, 60.1, NaN, Infinity, '5']) assert.throws(() => builder.buildAudioPrompt({ prompt: 'invalid', seed: 0, durationSeconds }), /invalidDuration/);
}

/**
 * 同时执行正式视频与音频转换器，证明共享 UI 的预览不是另一套手写替换。
 * 使用乱序且不连续的素材编号，官方标签仍按每种类型的当前顺序从一开始。
 * 无需真实媒体字节，引用身份只由 kind、number、id 决定。
 * 音频图整图检查已在 graphs 中保护；本组补充引用文字确实进入 core.prompt。
 * 文件删除后必须报错，而非将 @audio1 当作普通对白送进文生音频。
 * 禁用图像与视频引用在纯构图层再次把关，不能仅靠隐藏 UI 菜单。
 * 这些检查不调用付费模型，也不评价参考音频音色是否被真实模型遵循。
 */
async function references() {
  const shared = product('utils/comfy/video-reference-media.ts'), builder = product('utils/comfy/audio-workflow.ts');
  // image7 与 video3 是稳定 UI 编号，输出 Picture/Video 必须各自从一开始。
  // audio1 已是连续编号，同时验证手动有空格的 @audio 1 别名。
  // 名称使用固定英文，不能以文件名中的数字推断参考位置。
  // 素材不需要 src，因为这个纯转换过程不读取或播放 URL。
  // 三项故意按音频、视频、图片入数组，排除按混合数组位置给所有类型统一编号的错误。
  const media = [{id:'a',kind:'audio',number:1},{id:'v',kind:'video',number:3},{id:'i',kind:'image',number:7}].map(item => ({...item,name:'fixture',src:''}));
  // expected 严格采用技能的大小写与空格，不能接受 <Picture1> 等近似格式。
  // 原文中非引用部分保留一个普通空格，转换不得重写用户对白。
  // 与固定期望比较，不用生产 formatter 生成测试期望而形成恒真对照。
  assert.equal(shared.normalizeVideoReferences('@image 7 @video3 @audio 1',media),'<Picture 1> <Video 1> <Audio 1>');
  // 参考工作流已有唯一 LoadAudio 槽；prompt 转换不能额外增加音频端口。
  // 断言的是最后发往 ComfyUI 的节点字段，不是只读预览的临时字符串。
  // 有参考则 @audio1 合法，保留用户的声音描述原文。
  const graph = builder.buildAudioPrompt({prompt:'Follow @audio 1',seed:0,referenceName:'accepted.flac'});
  assert.equal(Object.values(graph).find(node => node.class_type === 'MiniMaxH3ReferenceToVideo').inputs.prompt,'Follow <Audio 1>');
  // 直接输入官方 Audio 标签也要核对素材存在，不能绕过别名转换校验。
  // 无参考、编号越界及错误媒体种类分别验证，拒绝并非只靠一个场景触发。
  // 错误 key 来自现有共享词条，确保失败指向缺失引用而非无关参数。
  // 所有 seed/prompt 基础条件有效，排除其他验证错误导致负向假通过。
  // 用户仍可不用任何引用写普通文字，graphs 中的原默认请求会独立通过。
  for (const prompt of ['@audio1','<Audio 1>']) assert.throws(() => builder.buildAudioPrompt({prompt,seed:0}), /videoReferences.missing/);
  for (const prompt of ['@audio2','@image1','@video1']) assert.throws(() => builder.buildAudioPrompt({prompt,seed:0,referenceName:'accepted.flac'}), /videoReferences.missing/);
}

/**
 * 真实 renderer 适配器通过假的 contextBridge 接口调用真实主进程代理。
 * 桥接替身只包装 IpcResult，不替换上传、提交、下载或字节解码。
 * 保存替身把收到的 base64 写入受控临时目录，再读回比较原始字节。
 * 这不是正式 files handler 的端到端验证；Electron 冒烟会独立使用正式 handler。
 * 列表不可用时模拟离线模型枚举，图仍使用模板相对路径供服务端校验。
 * 第二阶段提供完整模型列表，验证 pixel_space 内置 VAE 不需要磁盘模型。
 * requestId 经过桥接传给正式 generation 服务，取消身份不能在音频适配中丢失。
 * 不把媒体字段名 videos 当成文件类型，真实 audio 内容必须被筛选出来。
 */
function bridge() {
  global.window = { electronAPI: {
    comfyUploadImage: async (serverAddress, input) => ({ success: true, data: await proxy.uploadImageToComfy(serverAddress, input) }),
    comfyListModels: async () => lists ? { success: true, data: lists } : { success: false, error: 'fixture lists unavailable' },
    comfyGenerate: async (graph, serverAddress, id) => { if (failRemote) return { success: false, error: 'fixture disconnected', code: 'COMFY_DISCONNECTED' }; return { success: true, data: await generation.generate(1, graph, serverAddress, id) }; },
    saveGeneratedImages: async (directory, files) => { if (failSave) return { success: false, error: 'fixture save failure' }; const paths = files.map(file => { const output = path.join(directory, file.filename); fs.writeFileSync(output, Buffer.from(file.dataBase64, 'base64')); return output; }); return { success: true, data: paths }; },
  } };
}

// 基准用真实中文参考名，最终 multipart 必须使用英文 UUID 名称。
// 无参考先跑，证明不上传时不会落回模板作者的 1.flac。
// 有参考随后跑，检查 LoadAudio 和 MiniMaxH3ReferenceToVideo 的真正连接。
// 保存后比较磁盘字节，避免只有“路径数组不为空”的假成功。
// 播放 Blob 的内容同时比对，不能因保存正确而忽略界面解码损坏。
// 加速 LoRA 用户覆盖后权重必须进入图，不能只是 UI 卡片显示改变。
// 内置 pixel_space 槽从真实 VAE 解析中排除，音频 VAE 仍必须存在于列表。
// 每个任务总数固定一项，音频不能使用图片页上次保留的数量。
// 第一轮 reference=null，应没有任何 upload/image 请求。
// 第一轮图应该包含 MiniMaxH3ImageToVideo，而非参考条件节点。
// 第一轮提示词是调用者传入的 spoken words，不能沿用模板作者对白。
// 第一轮种子为 123，图中 RandomNoise 应使用这个快照。
// 第一轮结果不是 images 数组，主进程应把 audio 文件放入非图片输出集合。
// 第一轮实际 /view 请求需要 type=temp，否则临时文件将无法读取。
// 第一轮 /view 请求需要 subfolder=preview，不能只拼文件 basename。
// 第一轮保存扩展名必须为 flac，不能沿用视频默认 mp4。
// 第一轮 Blob MIME 必须为 audio/flac，播放器解码不应被伪装成 image/png。
// 第二轮参考名为中文，上传包 filename 应只包含 ASCII UUID 和后缀。
// 第二轮服务端回包名称与上传随机名不同，最终图必须采用 accepted.flac。
// 第二轮服务端指定 references 子目录，最终 LoadAudio 不可丢掉这一层。
// 第二轮依旧只提交一次 prompt，上传本身不构成生成任务。
// 两轮完成后的上传次数恰好为一，自动选图不能多上传无参考输入。
// 两轮下载结果都逐字节检查，不以 MIME、后缀正确替代内容比较。
// 两轮保存读取磁盘后比较，能够发现 base64 主体提取偏移错误。
// 保存文件的英文前缀防止直接使用服务器文件名造成覆盖。
// 服务端响应原临时名可以复用，但本地 UUID 名称必须不同。
// 模板默认扩展随任务提交，应保留同一 MiniMax 加速模型及其权重。
// 模型清单用真实 loader 字段提取，但 pixel_space 故意排除。
// 解析后的 pixel_space 输入应仍存在，不能为了通过列表校验删除节点。
// 模型列表不可用回退不等于不做类型匹配，纯构建已经限制 LoRA 系列。
// 模型名称包含反斜杠和中文子目录，测试证明它们不应被粗暴转成英文。
// 上传别名英文不影响内容字节，声音文件不在客户端被重新编码。
// 这个测试不验证网络认证代理或远端 HTTPS，因为项目 ComfyUI 地址契约是 host:port。
// 播放器实际解码由 Electron 冒烟验证，Node Blob 比较不冒充播放成功。
// 正式 save handler 的安全契约由 Electron 用例验证，这里只测适配器编码。
// HTTP 回包缺 audio 时应在产品模块抛错，而不会进入此成功分支。
async function roundTrip() {
  const queue = product('utils/audio-generation-queue.ts'), builder = product('utils/comfy/audio-workflow.ts');
  for (const reference of [null, new File([bytes], '中文参考.flac', { type: 'audio/flac' })]) { const result = await queue.enqueueAudioGeneration({ prompt: 'spoken words', seed: 123, loras: builder.defaultAudioLoras() }, reference).promise; assert.equal(result.outputs[0].blob.type, 'audio/flac'); assert.deepEqual(Buffer.from(await result.outputs[0].blob.arrayBuffer()), bytes); assert.deepEqual(fs.readFileSync(result.savedPaths[0]), bytes); assert.match(result.savedPaths[0], /IR_audio_.*\.flac$/); }
  assert.equal(uploadCount, 1); assert.equal(submissions[0]['153:9'].inputs.steps, 10); assert.equal(submissions[1]['157:9'].inputs.steps, 8); assert.equal(submissions[1]['164'].inputs.audio, 'references/accepted.flac');
  const graph = builder.buildAudioPrompt({ prompt: 'model test', seed: 1 }); const names = Object.values(graph); lists = { checkpoints: [], diffusionModels: names.filter(n => n.class_type === 'UNETLoader').map(n => n.inputs.unet_name), clips: names.filter(n => n.class_type === 'CLIPLoader').map(n => n.inputs.clip_name), vaes: names.filter(n => n.class_type === 'VAELoader' && n.inputs.vae_name !== 'pixel_space').map(n => n.inputs.vae_name), loras: builder.defaultAudioLoras().map(n => n.name) }; await builder.resolveAudioModels(graph, address); assert.equal(graph['153:11'].inputs.vae_name, 'pixel_space');
}

// held 第一项运行期间第二项不能提交，证明音频使用共享 FIFO。
// 第三项在排队中撤回，它的参考音频连上传都不能发生。
// 修改原 loras 数组不应改变已排队快照，避免生成使用最新草稿而非点击时参数。
// 用公共 cancelImageGeneration 撤回音频，验证没有另造无法停止的队列入口。
// 放行第一项后第二项才能提交；等待成功必须包含音频保存完成。
// 保存错误要成为 failed，不能让任务卡片显示已完成且没有文件。
// 断开错误码要清除后续待执行项，而不是继续向失联服务提交。
// 全部完成以后仅删除本脚本新建的临时目录，不扫描或清理用户目录。
// 第一项的 held 只影响假服务历史，不改变正式客户端 FIFO 实现。
// 第二项在第一项运行时进入 store，状态应维持 queued 而不是 generating。
// 等待 50ms 不是推进队列的条件，只用于给错误并发提交足够暴露机会。
// 真正放行依据前一执行 Promise 完成，断言通过提交次数观察它。
// 第三项故意带参考音频，可以发现排队撤回仍发生上传的副作用。
// 撤回调用公共 cancelImageGeneration，验证音频任务没有绕开统一 id 表。
// 撤回的 Promise 已被 consumed 包装，拒绝不会触发无关未处理异常。
// 撤回后 uploadCount 保持原值，证明不只是没发 prompt，而是连素材也没上传。
// 第二项 LoRA 权重先为 0.4，排队后把原对象改成 0.9。
// 最终图仍需包含 0.4，证明深克隆隔离了嵌套扩展数组。
// 如果只浅拷贝外层 settings，这个用例会变成 0.9 并失败。
// 第一项和第二项都等待完整保存，不能只等 ComfyUI history completed。
// 保存错误回包故意为 IpcResult 失败，任务必须成为 failed。
// 失败任务不能增加 completed，也不能返回一个空 savedPaths 的成功值。
// 保存失败后恢复 flag，确保下一个断连场景不是由保存错误污染。
// 断连场景让首项请求回包带 COMFY_DISCONNECTED，保留原错误分类。
// 随后已排队项必须变成 AbortError，不能继续提交到假服务器。
// 该策略与实际 ComfyUI 请求库断连处理组合，网络专项另测真实 socket 断开。
// 测试不通过把服务器 held 永远留住来制造超时绿灯。
// 脚本的 finally 即使断言失败也关闭全部自建 HTTP socket。
// 临时目录由 mkdtemp 创建，只删除已知的这个目录本身。
// 音频保存失败可能部分写入的文件也留在受控目录中，不接触用户数据。
// 调度器的 jobs 清理和 pending 清理使用正式实现，不由测试手工清空。
// 最后一个任务结果已消费，套件结束不遗留悬空 Promise。
// 这里未运行真实模型，因此不把结果描述为“已验证音频生成效果”。
// 测试仅证明工作流选择、参数、传输、调度与保存契约可解释地成立。
// 用例名称按三组命题报告，不把循环中的每一条等式夸大成独立端到端案例。
async function ordering() {
  const queue = product('utils/audio-generation-queue.ts'), common = product('utils/image-generation-queue.ts'), tasks = product('stores/useGenerationTaskStore.ts').useGenerationTaskStore;
  held = true; const before = submissions.length, uploads = uploadCount, a = queue.enqueueAudioGeneration({ prompt: 'first', seed: 1 }, null), ap = consumed(a.promise); await wait(() => submissions.length === before + 1);
  const loras = [{ id: 'chosen', name: 'Minimax/custom.safetensors', strength: 0.4 }]; lists = null; const b = queue.enqueueAudioGeneration({ prompt: 'second', seed: 2, loras }, null), bp = consumed(b.promise), c = queue.enqueueAudioGeneration({ prompt: 'cancelled', seed: 3 }, new File([bytes], '中文.flac')), cp = consumed(c.promise); loras[0].strength = 0.9;
  await delay(50); assert.equal(submissions.length, before + 1); await common.cancelImageGeneration(c.id); assert.equal((await cp).error.name, 'AbortError'); assert.equal(uploadCount, uploads); held = false; assert((await ap).value); assert((await bp).value); assert.equal(submissions.at(-1).ir_video_lora_0.inputs.strength_model, 0.4);
  failSave = true; const bad = queue.enqueueAudioGeneration({ prompt: 'save failure', seed: 4 }, null); assert((await consumed(bad.promise)).error); assert.equal(tasks.getState().tasks.find(t => t.id === bad.id).status, 'failed'); failSave = false;
  failRemote = true; const disconnected = queue.enqueueAudioGeneration({ prompt: 'disconnect', seed: 5 }, null), dp = consumed(disconnected.promise), next = queue.enqueueAudioGeneration({ prompt: 'must stop', seed: 6 }, null), np = consumed(next.promise); assert.equal((await dp).error.code, 'COMFY_DISCONNECTED'); assert.equal((await np).error.name, 'AbortError'); failRemote = false;
}

/**
 * 点击层真实 store 一次提交三项，而不是直接调用队列三次冒充数量生效。
 * 使用正式 IMAGE_COUNT_OPTIONS 中存在的三，遵守公共数量菜单约定。
 * 复用前面已经就绪的真实 HTTP 代理和主进程生成服务。
 * 服务端只提供受控字节，不执行真实 MiniMax 模型。
 * 第一项被 held 挂起，再修改草稿，观察已排队三项是否冻结参数。
 * 所有项必须保留点击时的模型和十七步，不能读到后改的二十三步。
 * 固定种子四十二只用于首项，其余两项遵循图片批次的随机规则。
 * 随机断言只检查安全范围，不依赖随机结果必然互不相等。
 * 三项必须有三个独立公共任务身份，每项 total=1。
 * 等待所有音频保存，再比较实际落盘数与播放器结果数。
 * queue 的 completed 表示已保存，不以请求成功代替落盘成功。
 * task.model 必须显示真实改名 UNet，不保留硬编码 MiniMax 引擎名。
 * 修改草稿后不再发出第二次 submit，用请求增量检查没有幽灵任务。
 * 随后恢复 held 并消费 store 已安装的 catch，不产生未处理拒绝。
 * 本组不验证重启恢复；测试范围是同一进程中的快照与批次行为。
 * Blob URL 由正式 store 创建，验证完成后逐一释放测试资源。
 * 临时文件统一由 main.finally 删除，不触碰用户输出目录。
 */
async function batching() {
  // 在进入本组前上一组已恢复断连和保存错误开关，不继承失败场景。
  // 模型列表为空表示远端枚举不可用，使用正式模板路径回退分支。
  // 每项 settings 都由正式 enqueueAudioGeneration 克隆，测试不自行冻结对象。
  // prompt=batch 用于区分本组任务，不依赖公共历史数组的排序。
  // 任务总数通过公共 store 观察，不仅凭提交循环次数推断。
  // 在第一项已经提交时改草稿，第二、三项仍等待 FIFO 放行。
  // 这样能同时检验立即执行项和排队项的参数隔离。
  // first seed 的比较定位 RandomNoise，避免假定显示标题或非采样节点。
  // savedPaths.length=1 与 total=1 对应，一个按钮批次分成三个独立任务。
  // 结果 state 等于三说明异步 then 全部执行完，随后才能安全回收 URL。
  // 比较磁盘字节同时检查结果路径确实存在，不接受仅内存播放器成功。
  // 模型摘要按点击时的相对名保存，不受后改草稿字段影响。
  // 文件的随机 UUID 保证三项不会覆盖同名输出，保存专项已有路径后缀断言。
  const store = product('stores/use-audio-create-store.ts').useAudioCreateStore, tasks = product('stores/useGenerationTaskStore.ts').useGenerationTaskStore, before = submissions.length, name = 'Minimax/Renamed/renamed-audio.safetensors';
  // 三项排队后立刻改成两秒，服务端仍应收到点击时的 7.5 秒。
  // 第一项已执行，后两项尚未放行，因而同时覆盖两种参数冻结时机。
  // 此操作经过正式 store.submit，不在测试里提前克隆参数代替生产逻辑。
  held = true; store.getState().patch({ prompt: 'batch', random: false, seed: '42', unetName: name, steps: 17, durationSeconds: 7.5 }); store.getState().submit(3);
  await wait(() => submissions.length === before + 1); const ids = tasks.getState().tasks.filter(task => task.prompt === 'batch').map(task => task.id); assert.equal(ids.length, 3);
  // 修改只影响下一批，不能在 FIFO 放行时从当前草稿重新取秒数。
  // 服务回包是固定夹具，长度验证针对实际提交图而非假音频播放长度。
  // 保留原有模型和步数变更，防止新增字段破坏其他快照参数。
  store.getState().patch({ unetName: 'Minimax/later.safetensors', steps: 23, seed: '99', durationSeconds: 2 }); held = false;
  await wait(() => ids.every(id => tasks.getState().tasks.find(task => task.id === id).status === 'completed') && store.getState().results.length === 3);
  assert.equal(submissions.length, before + 3); assert.equal(Object.values(submissions[before]).find(node => node.class_type === 'RandomNoise').inputs.noise_seed, 42);
  for (const graph of submissions.slice(before)) { assert.equal(graph['153:6'].inputs.unet_name, name); assert.equal(graph['153:9'].inputs.steps, 17); const seed = Object.values(graph).find(node => node.class_type === 'RandomNoise').inputs.noise_seed; assert(Number.isSafeInteger(seed) && seed >= 0); }
  // 检查真实 HTTP /prompt 捕获图，而非 enqueue 的输入对象。
  // 三项都检查，避免第一项正确但等待中的后两项读到新草稿。
  // 表达式仍接在秒数后面，实际帧数转换继续交给原图。
  for (const graph of submissions.slice(before)) assert.equal(graph['153:111'].inputs.value, 7.5);
  for (const task of tasks.getState().tasks.filter(task => ids.includes(task.id))) { assert.equal(task.total, 1); assert.equal(task.model, name); assert.equal(task.savedPaths.length, 1); }
  for (const result of store.getState().results) { assert.deepEqual(fs.readFileSync(result.path), bytes); URL.revokeObjectURL(result.url); }
}

// 每组使用独立命题，模板对比通过不能代替实际传输或调度验证。
// HTTP 回调异常会使请求失败，最终 check 或看门狗必须给出非零退出。
// finally 始终关闭本地监听端口和 socket，不影响用户 ComfyUI 服务。
// 清理目标是 mkdtemp 返回的已知绝对路径，不使用用户输入计算删除范围。
// 正式文档和模型目录不在本脚本的写入范围。
// 输出只报告分组数，不把组内断言数夸大成独立场景数。
async function main() {
  server = http.createServer((req, res) => { void serve(req, res).catch(error => { console.error(error); res.destroy(); }); }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); address = `127.0.0.1:${server.address().port}`; bridge();
  // 新引用检查先于任何生成 HTTP 副作用，错误标记不能上传后才被发现。
  // 原有五组保持原顺序，参考解析不会替代队列、保存与默认图验证。
  // 摘要分母同步增加，不能执行六组却仍打印旧的五组成功结论。
  try { await check('template defaults, links and invalid inputs', graphs); await check('UNet and step defaults, overrides and invalid inputs', controls); await check('shared H3 reference labels and audio-only validation', references); await check('reference upload, temp audio download and save', roundTrip); await check('FIFO, frozen LoRA, queued cancellation and failures', ordering); await check('shared quantity, fixed seed and frozen batch parameters', batching); console.log(`Audio contract: ${passed}/6 groups passed`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
