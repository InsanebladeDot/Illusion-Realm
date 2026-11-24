// 图片节点参数专项：直接比较 shared 与主进程的生产校验，不复制一份产品判定器。
// 与 Electron 回归分开，本脚本只证明纯数据、恢复形状和序列化签名。
// 不读取用户文档、不调用 ComfyUI、不加载模型权重，也不宣称人工操作通过。
// 每组先验证合法 golden，再以单个字段变化构造反例。
// 像用标准砝码校秤：先确认正常的一斤被接受，再放坏砝码确认会拒绝。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("../apps/next/node_modules/typescript");
const validate = require("../apps/electron/src/main/modules/canvas/project-validation");

// 转译钩子只存在当前验证进程，产品主进程仍然不运行时导入 shared TS。
// 真实源文件被转译，而不是读取测试中保存的旧 schema 副本。
// 失败直接抛出，命令返回非零退出，不会继续打印专项通过。
// CommonJS 与真实 require 相配，类型擦除不改变被测表达式。
// 不通过替换 validator 返回值伪造两端一致。
// 主进程校验器仍为手写生产代码，它与 shared 分别计算结论。
// 本脚本不建立第二种磁盘格式，也不向工程写入测试标记。
// 原参数被冻结或拍快照，序列化必须保持输入不变。
// 测试数据中的模型身份是夹具，只验证形状，不表示文件实际存在。
// 这和 Electron 中使用真实文件解码属于两类证据。
require.extensions[".ts"] = (module, file) => {
  module._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
};
const { InfiniteCanvasDocumentSchema: schema } = require("../packages/shared/src/schemas/infinite-canvas.schema.ts");
const { serializeCanvas } = require("../apps/next/src/view/infinite-canvas/canvas-model.ts");
const base = { kind: "image", title: "图片参数验证", prompt: "", content: "", ratio: "1/1" };
const document = data => ({ version: 1, name: "", nodes: [{ id: "image", position: { x: 0, y: 0 }, data }], edges: [] });
let checked = 0;

// 每个样本断言两端各自结果，不能只比较相等使“都拒绝”假实现过关。
// kind 保留在每次失败消息中，能定位错误归属而非只报告一个总数量。
// 合法输入还核对解析保留，防止 schema 漏字段却依靠自动剥离通过。
// JSON 只是比较纯数据，不用于预先抹掉内存请求中的非法 undefined 键。
// 参数省略与 null 分别测试，坏工程不应自动变成默认配置。
// 计数只有断言成功才增加，失败退出时不会产生虚假的总通过数字。
// 测试器自己不归一化坏值，期望只来自明确业务允许表。
// 一个样本只换目标字段，避免媒体错误提前遮住参数问题。
// 不给样本 media 引用，因此不依赖文件、编解码器或网络。
// 用户原有文件不会被扫描或覆盖，验证可以安全离线运行。
// 执行器是独立进程，require hook 随退出释放，不污染应用。
function check(patch, expected) {
  const value = document({ ...base, ...patch });
  const parsed = schema.safeParse(value);
  assert.equal(validate.document(value), expected, `main ${JSON.stringify(patch)}`);
  assert.equal(parsed.success, expected, `shared ${JSON.stringify(patch)}`);
  if (parsed.success) assert.deepEqual(JSON.parse(JSON.stringify(parsed.data)), JSON.parse(JSON.stringify(value)));
  checked++;
}

// 缺数量兼容所有旧节点，显式数量只允许图片及一、二、四、六。
// 零、负数、小数和三张不是 UI 支持项，不能从手改工程绕过。
// 字符串“一”或数字字符串不会隐式转成合法数量。
// Infinity 与 NaN 可以来自恶意 IPC，即使普通 JSON 不能编码也必须拒绝。
// 对象、数组和布尔值检查主进程读取之前的类型保护。
// 所有节点类型都交叉覆盖，不能只验证 image 成功就遗漏跨类型泄漏。
// 文本、音频、视频、便签、导演台和合成节点都应保持旧数据兼容。
// old 文档没有新增字段时无需升级版本或批量补默认值。
// 测试不改变 base，同一个合法输入可反复用于不同单变量反证。
// 明确 null 与 undefined 区别，恢复不能靠回落掩盖坏数据。
// 一张显式值也必须留下，不应被 schema 丢掉后重开变成缺省。
// Infinity、NaN 的失败输出仅用于测试诊断，不进入用户文案。
// 这组不测调度六张图片，生成执行仍未接通。
// 数量矩阵的合法 golden：图片显式 1、2、4、6，解析必须逐值保留。
// 图片没有 batchSize 也合法，表示旧文档采用显示默认，而非需要迁移。
// 视频没有 batchSize 合法，旧视频不会因图片参数上线而被误拒绝。
// 音频没有 batchSize 合法，不能把“数量未提供”误读成非法零值。
// 文本没有 batchSize 合法，文字节点的已有草稿保持兼容。
// 场景没有 batchSize 合法，导演台保存不受图片数量字段影响。
// 便签没有 batchSize 合法，组织说明文字不需要伪造生成参数。
// 合成节点没有 batchSize 合法，本轮不把它扩大成批量生成器。
// batchSize=0 在图片也失败，因为 UI 没有零张任务意图。
// batchSize=3 在图片失败，防止主进程只验范围一到六却漏掉固定枚举。
// batchSize=-1 失败，不能把负值当作默认或特殊全部标记。
// batchSize=1.5 失败，数量是整数，不应由保存器自动舍入。
// batchSize="2" 失败，渲染侧应在受控选项边界正确转成数字。
// batchSize=null 失败，损坏值不能被视为省略字段。
// batchSize=NaN 失败，保护直接 IPC 而不仅是普通 JSON 文件。
// batchSize=Infinity 失败，防止非有限数被“范围比较”误放行。
// batchSize={} 失败，对象不能通过 valueOf 等隐式转换成数量。
// batchSize=[] 失败，空数组也不能因为宽松转换变成零或缺省。
// 音频带合法数字一仍失败，验证的是类型归属而非仅值域合法。
// 视频带合法数字六仍失败，没有实现的视频批处理不能借工程激活。
// 文本带合法数字四仍失败，文本节点没有这项已接通业务。
// 场景带合法数字二仍失败，导演台人物数量与图像生成张数无关。
// 这些矩阵分别调用两端真实校验，不以其中一端的结果作为另一端的期望。
// 因此一个端遗漏 kind 限制，即使数值白名单正确也会被矩阵发现。
function checkCounts() {
  for (const kind of ["image", "video", "audio", "text", "scene", "note", "composition"]) {
    for (const batchSize of [undefined, 1, 2, 4, 6, 0, 3, -1, 1.5, "2", null, NaN, Infinity, {}, []]) {
      check({ kind, ...(batchSize === undefined ? {} : { batchSize }) }, batchSize === undefined || kind === "image" && [1, 2, 4, 6].includes(batchSize));
    }
  }
}

// golden 包含零 CFG、空负面、空种子，防止真假值判断丢掉用户清空意图。
// model 两个身份保留，不能只验证显示名称或某个封面可读。
// 辅助覆盖使用真实形状的槽号与相对名，但不冒称已安装该模型。
// size 测自定义加一点五倍，能发现错误套用视频上限一倍。
// 每个反证仅替换对应字段，应该由这一个规则拒绝。
// steps 一百零一和 CFG 三十一覆盖公共 UI 的上界。
// seed 长度、非数字和模式覆盖半成品草稿的允许边界。
// 额外模型键、尺寸镜像键和未知参数验证 strict 对齐。
// null、数组、数字防止 typeof object 等宽松保护误收。
// 所有模板键都跑相同样本，不能只修 Anima 遗漏 SDXL 或编辑流。
// 未知模板名即使值 undefined 也必须拒绝，与 optional 语义区分。
// 空附表可保存，继承默认不会强制要求选择主模型。
// 视频带表必须失败，未来执行不能因为文件有字段就当成图片。
// Golden 先通过后运行反证，永远拒绝的实现不能骗过这一组。
// 上下界是既有字段范围，测试不为了通过而缩短素材或改业务预期。
// schema 解析后的字段还和输入比较，不能默默吞掉新参数。
// 附表不是播放结果，脚本不会生成截图或把纯数据当作视频验证。
// 参数 golden 的 cfg=0 验证保存器不能使用 || defaults 丢掉显式零值。
// negative="" 验证用户清空与继承模板默认是可区分状态。
// seed="" 验证编辑中的空种子草稿允许保存，而不是强制变成数字零。
// seedMode=random 与空种子一起合法，随机数只能在后续执行阶段生成。
// model.modelId 与 versionId 都存在，验证模型身份字段不会被 schema 剥离。
// modelOverrides 的槽号三和值 clip.safetensors 是纯形状夹具，未读取文件。
// size.mode=custom 验证自定义与预设两类状态之一能正确往返。
// customWidth=1280/customHeight=720 保留基础横屏尺寸，不用最终像素代替。
// scale=1.5 必须通过，图片不能错误套用视频 scale<=1 的业务限制。
// 每个模板同时测试空附表，证明可以完全继承原模板默认配置。
// 行为反证 null、数组和数字验证行对象的前置类型保护。
// extra:1 验证 row.strict 对未知属性的拒绝，不静默保留拼错参数。
// steps=101 专门约束一百步上界，不能只验正数。
// steps=1.5 专门约束整数，不能只验区间。
// cfg=31 专门约束原组件三十上界，避免 UI 与恢复接受范围不同。
// cfg=NaN 约束有限数，防止直接 invoke 绕过 JSON 编码限制。
// 4001 字负面词失败，四千字输入约定必须由保存边界再次守住。
// sampler="" 失败，选择器内部名称不能退成空选项。
// scheduler=null 失败，optional 仅允许缺省而非任意空值。
// seed="a" 失败，字符限制与十进制种子草稿保持一致。
// 三十三位种子失败，验证长度边界不是只验正则可匹配。
// seedMode=fixed 失败，不能借外部文件增加第三种运行模式。
// model.command 额外键失败，保护模型对象自身的 strict 边界。
// modelOverrides 的空槽号失败，不能给没有身份的加载槽写文件名。
// size.width 镜像字段失败，确认保存只接原选择器输入而非重复最终输出。
// customWidth=7 失败，图片最小八像素单位不允许恢复成零尺寸附近。
// customHeight=Infinity 失败，恢复后的几何不能扩展成不可计算大小。
// scale=0 失败，倍率必须至少零点一，不能产生空输出尺寸。
// 未知模板键值 undefined 失败，保护 strict 表键与 optional 行值的区别。
// imageParameters=null 失败，明确坏整表不应被当成继承模板。
// video+空参数表失败，验证字段出现本身就必须符合业务归属。
// 三套模板分别运行反例，某一模板漏登字段或使用不同校验会单独失败。
// 解析成功后的内容和原输入比较，数据被自动剥离也会触发反证。
// 这里没有图像像素，因此只把输出标为 pure-contract。
function checkParameters() {
  const golden = { model: { modelId: "local-checkpoint:main", versionId: "main.safetensors" }, modelOverrides: { "3": "clip.safetensors" }, negative: "", steps: 20, cfg: 0, sampler: "euler", scheduler: "simple", seed: "", seedMode: "random", size: { mode: "custom", aspectRatio: "16:9", customWidth: 1280, customHeight: 720, scale: 1.5 } };
  const bad = [null, [], 1, { extra: 1 }, { steps: 101 }, { steps: 1.5 }, { cfg: 31 }, { cfg: NaN }, { negative: "x".repeat(4001) }, { sampler: "" }, { scheduler: null }, { seed: "a" }, { seed: "1".repeat(33) }, { seedMode: "fixed" }, { model: { ...golden.model, command: "bad" } }, { modelOverrides: { "": "file" } }, { size: { ...golden.size, width: 1920 } }, { size: { ...golden.size, customWidth: 7 } }, { size: { ...golden.size, customHeight: Infinity } }, { size: { ...golden.size, scale: 0 } }];
  for (const workflow of ["anima", "sdxl", "anima-edit", "minimax-image-edit"]) {
    check({ imageParameters: { [workflow]: golden } }, true);
    check({ imageParameters: { [workflow]: {} } }, true);
    for (const value of bad) check({ imageParameters: { [workflow]: value } }, false);
  }
  check({ imageParameters: { unknown: undefined } }, false);
  check({ imageParameters: null }, false);
  check({ kind: "video", imageParameters: {} }, false);
}

// 故意把模板键、附表键和尺寸键以不同顺序填写，再交给真实序列化器。
// 固定顺序签名要和 schema 恢复后的结果相同，否则保存后会一直假脏。
// model 和 size 冻结，原地规范化会立即抛错或在最后快照检查被发现。
// 序列化后的内存对象先经过主进程验证，再做 JSON 比较。
// 不能依赖 JSON 先抹掉坏归属键来绕过内存请求的实际校验。
// Anima 和 SDXL 同时存在，空表、空文本和零 CFG 均应保留。
// 显式 batchSize 六张与参数一起保存，不能只验证 UI 标签改变。
// 最后比较原输入，整理键序不能改变仍在编辑中的节点对象。
// 不重新实现 serializeCanvas，直接 require 当前生产模块。
// type-only 依赖在转译时擦除，图标依赖来自项目真实安装包。
// 解析保持版本一，证明旧格式新增可选字段不要求变更整个工程版本。
// 新函数不访问用户路径，也不借助假 IPC 写回成功响应。
// 这是格式签名检查，实际保存与页面刷新还由 Electron 回归覆盖。
// 如果任何一个断言失败，后面的通过日志不会输出。
// 函数不使用延时等待，不存在偶发失败后自动重试。
// 输入故意以 sdxl 在前、anima 在后，序列化必须规范成 schema 的稳定顺序。
// 附表又故意以 seedMode 在前、cfg 在后，覆盖第二层对象的键序问题。
// 模型对象故意以 versionId 在前，验证不能只整理外层表就结束。
// 尺寸对象故意以 scale 在前，验证最深一层也不应制造假保存签名变化。
// 这种逆序输入模拟用户真实填写顺序，不是故意构造一个非法工程。
// 固定列顺序后的内容必须和 schema.parse 输出逐字一致。
// model 与 size 的冻结对象允许只读访问，不允许 serializer delete 或赋值。
// 比较 original 快照还能捕获未冻结的父对象被修改。
// batchSize=6 与两份附表共同存在，验证新增字段白名单全部接通。
// 主进程先验内存对象，防止 JSON 先删掉不允许字段而掩盖请求层问题。
// 空 SDXL 附表保持空，不能被序列化器自动填入 Anima 默认。
// cfg=0 和 negative="" 保留，签名整理不能顺带改用户意图。
// 测试没有设置媒体文件，归档媒体路径失败不会提前遮住参数签名故障。
// 通过此项仅说明保存形状稳定，不等于模型文件已复制或任务已执行。
// 在代码回归报告中与真实磁盘保存、完整页面刷新分别列出证据。
function checkSerialization() {
  const data = { ...base, batchSize: 6, imageParameters: { sdxl: {}, anima: { seedMode: "custom", cfg: 0, negative: "", model: Object.freeze({ versionId: "main", modelId: "local" }), size: Object.freeze({ scale: 1.5, customHeight: 720, customWidth: 1280, aspectRatio: "16:9", mode: "custom" }) } } };
  const original = JSON.stringify(data);
  const value = serializeCanvas(document(data));
  assert.equal(validate.document(value), true);
  assert.equal(JSON.stringify(schema.parse(value)), JSON.stringify(value));
  assert.equal(JSON.stringify(data), original);
  checked++;
}
// 视频只新增模型加载覆盖，不能把图片采样或尺寸参数硬塞进视频节点。
// 先验证两个真实工作流键可共存，再逐个用坏值作独立反证。
// 主进程和 shared 都要接受合法输入，避免“两边都拒绝”被误判成一致。
// 非视频节点即使携带空表也应拒绝，这与图片专用参数的归属规则一致。
// 空模型名合法，表示原组件清除覆盖；空 loader 身份则无法定位节点，必须失败。
// 同一行最多六十四槽，超过边界不能静默截掉最后一项。
// 未知工作流和 Wan 都没有这套原选择能力，不能通过手改工程额外放开。
// 数字、null、数组不应被当作文件名或覆盖对象。
// 测试模型名是参数夹具，不证明该文件已安装、已加载或能推理。
// 两端解析保留检查同时覆盖撤销快照和本地用户文档的稳定序列化。
// 序列化之后 JSON 的键顺序必须仍与 schema 一致，避免保存后持续显示未保存。
// 原创作页不读这个表，画布修改不能改变其默认工作流参数。
// 旧文档省略新增字段继续被接受，不为这次UI接线升级格式版本。
// 非法输入在进入磁盘保存之前被拒绝，不能用回落默认掩盖损坏配置。
// undefined 表示模板继承，与显式 {} 都合法，但不自动生成新的覆盖值。
// 缺键在 JSON 输出中省略；这里对比纯数据，不保留 JavaScript 原型。
// 名称上限兼容现有长路径，超过上限失败，不能把整张模型封面塞进名字。
// 测试不打开网络，也不通过 DOM 注入“选择成功”的假提示。
function checkVideoModels() {
  const valid = { minimax: { "12": "custom.safetensors", "14": "" }, "minimax-reference": {} };
  for (const [value, expected] of [[valid, true], [undefined, true], [{}, true], [null, false], [[], false], [{ "wan2.2": {} }, false], [{ minimax: { "": "a" } }, false], [{ minimax: { "12": 1 } }, false], [{ minimax: [] }, false], [{ minimax: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [String(i), "a"])) }, false]]) {
    check({ kind: "video", videoModelOverrides: value }, expected);
  }
  for (const kind of ["image", "audio", "text", "scene", "note", "composition"]) check({ kind, videoModelOverrides: valid }, false);
  const value = serializeCanvas(document({ ...base, kind: "video", videoModelOverrides: valid }));
  assert.deepEqual(schema.parse(value).nodes[0].data.videoModelOverrides, valid);
  assert.equal(JSON.stringify(schema.parse(value)), JSON.stringify(value));
}
// 视频输出与时长单独构造合法和非法数据，两个生产校验器都必须给出明确预期。
// 宽高用1080覆盖图片八倍数容易误伤的视频边长，先验证合法样本不被拒绝。
// 每个反例只改变一项，避免错字段提前失败掩盖实际需要检查的条件。
// 额外键、null、数组、零、奇数和字符串都不能静默恢复成默认视频规格。
// 整表省略对所有类型兼容，显式配置只属于视频，不把空对象当省略。
// 序列化后与schema逐字一致，检测字段漏存及键顺序导致的假脏。
// 测试不调用视频服务或编码器，1920×1080合法仅表示可恢复配置。
// 这组与真实Electron菜单验证互补，不能用纯数据接受代替实际菜单交互。
// 省略videoOutput合法，明确null非法，防止把恢复默认和损坏文件混在一起。
// 1920×1080是横屏1080p的golden；最小2×2验证边界，不代表推荐生成这种视频。
// 空对象缺两个必需维度，应当拒绝而不是自动补上720p。
// 数组同样是JavaScript对象，但不能当成带width和height的尺寸记录。
// 1921只比合法样本多一像素，用来准确定位偶数约束。
// 字符串1920不得隐式转换，主进程与shared都必须保留严格输入类型。
// 高度零即使宽度合法也拒绝，单边正确不能成为整对尺寸正确的替代。
// extra字段验证strict，与主进程手写Object.keys白名单形成配对。
// 时长0.1验证小数下界，2、3.5、10分别覆盖整数、小数和预设上档。
// 2.34不是一位小数，不得由校验器私自舍入成2.3。
// 负时长和零时长都不是合法空配置，省略才代表采用界面默认。
// NaN与Infinity无法出现在标准JSON但可能通过IPC传入，仍需反证拒绝。
// 六种非视频kind逐个带入合法视频配置，证明归属检查没有遗漏类型。
// 每一项沿用check函数同时断言两端结果与解析后的原样保留，不只比两边相等。
// 最后的JSON字符串比较还能发现字段插入次序与规范序列化不一致的假脏回归。
// 没有从用户数据中抽取样本，测试不会泄露真实文件名、提示词或服务密钥。
// FPS用正整数独立矩阵，24.5不能借用时长的一位小数规则通过。
// 省略默认、有效48、零、负数、字符串与非有限值均有明确预期。
// 跨类型附带合法48也应失败，不只测试数值而遗漏字段归属。
// 精度上界与schema同步检查，保存没有隐式转换或默认回填。
function checkVideoOutput() {
  // 旧工程可省略步数。新值只允许视频节点使用，且必须是范围内的整数。
  for (const [videoSteps, expected] of [[undefined, true], [1, true], [100, true], [0, false], [101, false], [2.5, false], ['4', false], [null, false]]) {
    check({ kind: 'video', videoSteps }, expected);
  }
  check({ kind: 'image', videoSteps: 4 }, false);
  for (const [videoFps, expected] of [[undefined,true],[24,true],[48,true],[0,false],[-1,false],[24.5,false],['24',false],[null,false],[NaN,false],[Infinity,false]]) check({kind:'video',videoFps},expected);
  for (const kind of ['image','audio','text','note','scene','composition']) check({kind,videoFps:48},false);
  for (const [videoOutput, expected] of [[undefined,true],[{width:1920,height:1080},true],[{width:2,height:2},true],[null,false],[{},false],[[],false],[{width:1921,height:1080},false],[{width:'1920',height:1080},false],[{width:1920,height:0},false],[{width:1920,height:1080,extra:true},false]]) check({kind:'video',videoOutput},expected);
  for (const [videoDuration, expected] of [[undefined,true],[0.1,true],[2,true],[3.5,true],[10,true],[0,false],[-1,false],[2.34,false],['5',false],[null,false],[NaN,false],[Infinity,false]]) check({kind:'video',videoDuration},expected);
  for (const kind of ['image','audio','note','text','scene','composition']) { check({kind,videoOutput:{width:1920,height:1080}},false); check({kind,videoDuration:5},false); }
  const value=serializeCanvas(document({...base,kind:'video',videoSteps:14,videoDuration:3.5,videoOutput:{width:1440,height:1080}}));
  assert.equal(JSON.stringify(schema.parse(value)),JSON.stringify(value));
  assert.deepEqual(value.nodes[0].data.videoOutput,{width:1440,height:1080});
  assert.equal(value.nodes[0].data.videoSteps, 14);
}
// 菜单来源使用生产静态表，存储两端必须接受其中每一项，不能只扩展UI。
// 同时给出独立八项基准，防止来源意外少项时测试跟着少验而假通过。
// 原四种比例仍在基准内，不需要迁移已有工程的斜杠格式。
// 4/5不属于创作页清单，即使数学上可计算也不能从手改JSON绕过菜单契约。
// 冒号只供显示，存储误写冒号应拒绝，而不是在保存边界悄悄修正。
// 两端都拒绝并不足以说明正确，因此合法项也分别断言接受和解析保留。
// 图片和视频都执行同一组数据，不用图片通过代替视频兼容。
// 这里只验证参数契约，没有把静态表中的分桶像素当作视频输出尺寸。
// 八项基准来源是任务指定的创作页公共参数，独立写明可以发现静态源被误改。
// 1:1覆盖最旧图片缺省保存值，兼容基准不能只跑新比例。
// 16:9覆盖最旧视频默认值，视频入口不应该因扩展清单打不开旧文件。
// 9:16覆盖原竖屏值，仍应接受并原样保留。
// 4:3也是原清单成员，新增3:4不能替换掉它。
// 2:3与3:2互为方向，分别接受可发现只新增竖屏的遗漏。
// 3:4与4:3同样都需存在，不能按无向分数去重。
// 5:6是旧画布没有的近方形选项，能反证确实换成完整创作页清单。
// 每个preset仅转换分隔符，不从分桶宽高计算一个近似比值。
// 例如创作页2:3训练分桶不严格等于数学2:3，身份仍必须按id保存。
// 图片kind接受新值，才能保证页面保存和工程导入都不会拒绝。
// 视频kind接受同一新值，证明不是只更新图片schema而漏掉视频。
// 主进程与shared分别接受，不能拿shared结果直接作为main的期望。
// check还比较解析后的对象与输入，防止schema吞掉ratio后假通过。
// 4/5数学上正常但不在静态表，作为业务白名单反例。
// 2:3展示上正常但磁盘格式不对，作为格式兼容反例。
// 空字符串不等于采用默认，损坏工程不应该被静默恢复1/1。
// null不是optional，显式空值与省略的含义不能混淆。
// 数字二不能被隐式转成字符串或比例，保护直接IPC入口。
// 所有反例都只替换ratio，不混入其他坏字段提前触发失败。
// 样本不带真实媒体，因此编解码器缺失不会掩盖校验结论。
// 不依赖网络请求或模型目录，离线也能确定重现。
// 主进程手写白名单与shared数据未来漂移时至少一项必须失败。
// 测试器不自动同步更新手写允许集，不能把同一个错误复制到两个期望里。
// 当前合法格式先验证通过，再执行反例，永远拒绝的实现无法骗过。
// 旧工程没有版本升级，八项扩展仍在既有version:1中合法。
// 静态表导入经现有转译钩子，产品主进程依然不require共享TS。
// 它不证明供应商支持这些尺寸，远端能力限制继续由原适配层处理。
// 验收只扩大本地比例身份，不把该结果写成所有模型已实测支持八比例。
function checkRatios() {
  const presets = require('../packages/shared/src/data/imageSizes.ts').IMAGE_SIZE_PRESETS;
  assert.deepEqual(presets.map(preset => preset.id), ['1:1','2:3','3:2','3:4','4:3','5:6','9:16','16:9']);
  for (const kind of ['image','video']) {
    for (const preset of presets) check({kind,ratio:preset.id.replace(':','/')},true);
    for (const ratio of ['4/5','2:3','',null,2]) check({kind,ratio},false);
  }
}
// 十档面积是视频专用纯数值，旧文档省略仍合法，非法档位不能混入配置JSON。
function checkMegapixels() {
  for (const value of [undefined, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) check({ kind: 'video', videoMegapixels: value }, true);
  for (const value of [null, '0.1', 0, -1, 0.15, 1.1, NaN, Infinity]) check({ kind: 'video', videoMegapixels: value }, false);
  for (const kind of ['image', 'audio', 'text', 'note', 'scene', 'composition']) check({ kind, videoMegapixels: 1 }, false);
  const value = serializeCanvas(document({ ...base, kind: 'video', videoMegapixels: 0.1, videoOutput: { width: 320, height: 320 } }));
  assert.equal(JSON.stringify(schema.parse(value)), JSON.stringify(value));
  assert.equal(value.nodes[0].data.videoMegapixels, 0.1);
}
checkMegapixels();
checkRatios();
checkVideoOutput();
checkVideoModels();
checkCounts();
checkParameters();
checkSerialization();
// 两端都要保留关闭的 false 和空 LoRA 列表，其他工作流不能保存 SLG。
for (const slg of [true, false]) {
  const patch = { workflow: 'moss', imageParameters: { moss: { slg } }, workflowLoras: { moss: [] } };
  check(patch, true);
  const data = serializeCanvas(document({ ...base, ...patch })).nodes[0].data;
  assert.equal(data.imageParameters.moss.slg, slg);
  assert.deepEqual(data.workflowLoras.moss, []);
}
check({ workflow: 'moss', kind: 'video' }, false);
check({ imageParameters: { moss: { slg: 'false' } } }, false);
check({ imageParameters: { anima: { slg: true } } }, false);
// 超分只属于画面媒体；两端必须保留合法配置，拒绝非整数、未知模型和夹带字段。
for (const kind of ["image", "video"]) for (const scale of [2, 3, 4]) {
  check({ kind, mode: "upscale", upscale: { enabled: false, model: "seedvr2_7b", scale } }, true);
  check({ kind, upscale: { enabled: true, model: "seedvr2_7b", scale } }, true);
}
for (const upscale of [null, {}, { enabled: true, model: "other", scale: 2 }, { enabled: "true", model: "seedvr2_7b", scale: 2 }, { enabled: true, model: "seedvr2_7b", scale: "2" }, { enabled: true, model: "seedvr2_7b", scale: 1.5 }, { enabled: true, model: "seedvr2_7b", scale: 2, extra: true }]) check({ upscale }, false);
for (const kind of ["audio", "scene", "text", "note", "composition"]) check({ kind, upscale: { enabled: false, model: "seedvr2_7b", scale: 2 } }, false);
console.log("CANVAS_IMAGE_PARAMETERS_OK", { checked, evidence: "pure-contract" });
