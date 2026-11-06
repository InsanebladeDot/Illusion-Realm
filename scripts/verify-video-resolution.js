/**
 * MiniMax H3 尺寸回归：运行真实尺寸算法、默认值读取和提交参数写入。
 * 验证重点是 32 像素对齐、缩放基准和旧草稿不能绕过约束。
 * 不需要启动 Electron、下载模型、读取用户数据或访问 ComfyUI。
 * TypeScript 在内存中转译，源码和构建产物均不会被测试修改。
 * i18n 是唯一替身，只返回 key，方便断言参数错误的类别。
 * 模板和尺寸预设使用仓库真实 JSON / TS，不能由测试重新编造。
 * 页面交互另由 smoke-minimax-workflow 验证，这里不替代浏览器检查。
 * 任何断言失败均返回非零状态，不能只打印错误后继续报告通过。
 */
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const ts = require("../apps/next/node_modules/typescript"), cache = new Map();
// 固定别名边界只加载本次纯函数及其生产依赖，不运行完整应用入口。
// 找不到模块立即失败，防止新增依赖被无声替换为空对象。
// 类型检查由 pnpm typecheck 单独负责，转译不会冒充 TS 校验。
// 模块缓存保持单例语义，避免循环引用导致测试环境无限递归。
// JSON 直接按原字节解析，保留模板的实际宽高和节点类型。
// 不加载 renderer 的 Electron bridge，也不注入 window 对象。
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const module = { exports: {} }; cache.set(file, module);
  // 相对引用仍以当前模块为基准，避免依赖测试启动目录碰巧命中。
  // shared 兜底覆盖已迁移的数据别名，与应用 tsconfig 的方向一致。
  // 翻译只回传 key，不会绕过真实的尺寸校验分支。
  // 源码只在本地可信仓库读取，不允许网络内容进入 Function 编译。
  // .ts 后缀仅用于寻找代码文件，JSON 不参与 TypeScript 转译。
  // 模块解析失败只打印模块标识，不读取用户配置中的路径或凭据。
  const resolve = (name) => {
    if (name === "@/i18n") return { t: (key) => key };
    const bases = name.startsWith("@/") ? ["apps/next/src/", "packages/shared/src/"].map((root) => path.resolve(__dirname, "..", root, name.slice(2))) : [path.resolve(path.dirname(file), name)];
    const target = bases.flatMap((base) => [base + ".ts", base + ".json"]).find((candidate) => fs.existsSync(candidate));
    assert.ok(target, `Missing production dependency: ${name}`); return load(target);
  };
  // 同步纯函数无需浏览器事件或计时器，保留 Node 原生异常传播。
  // 不吞掉模块初始化错误，失败统一交由顶层 catch 处理退出码。
  // 转译目标与现有 Node 回归脚本一致，允许现代对象展开等语法。
  // 通过 require 注入生产模块，而不是复制尺寸算法到测试中。
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(resolve, module, module.exports); return module.exports;
}

// 自定义草稿保存的是原始边长；每次缩放都必须以这个基准开始。
// 400 是最初报错相关的尺寸，编码后的 25 边长无法拆分 2×2 patch。
// 1500 覆盖产品历史上限，防止新的取整操作输出越界的 1504。
// 负数与非有限值只用于表单规范化；提交层对损坏的最终参数应拒绝。
// 预期值为独立列出的固定案例，不能用产品函数生成自己的期望。
// 小于下限或超出上限时，规范化输出必须保持在当前表单支持范围。
const custom = (size, scale = 1) => ({ mode: "custom", aspectRatio: "1:1", customWidth: size, customHeight: size, scale });
function checkSelection(api) {
  // 400→416：16 倍压缩后边长从奇数 25 变成偶数 26。
  // 513→512：紧挨合法边界的值向最近的 32 倍数收敛。
  // 1500→1472：上限必须向内限制，不能取到表单不支持的 1504。
  // 63→64：最小边界附近仍需满足当前表单下限。
  // -1→64：非法草稿回填到可显示的范围，不能产生负宽度。
  // NaN→64：空输入转数值或损坏草稿不能向受控 input 传播 NaN。
  // Infinity→64：不把非有限值当成“非常大的合法尺寸”。
  // 两边使用同一案例，便于区分单边处理缺失和整体取整错误。
  // 此处验证表单规范化的宽容行为；提交层另测严格拒绝非法最终值。
  // 固定结果不使用 VIDEO_SIZE_STEP 常量推导，防止常量被误改后测试同错。
  for (const [input, expected] of [[400, 416], [513, 512], [1500, 1472], [63, 64], [-1, 64], [NaN, 64], [Infinity, 64]]) {
    const result = api.createVideoSizeSelection(custom(input)); assert.equal(result.width, expected); assert.equal(result.height, expected);
  }
  // 0.2 倍是双重舍入的反例：268.8 应直接取 256。
  // 先按图片规则取 272 再按视频规则取整，会错误得到 288。
  // 0.1 倍同时验证高度应为 64，而不是旧链路的 96。
  // 恢复到 1 倍时，必须还原模板的 1344×768，不累计缩放。
  // 先生成一个小尺寸再将其传回，模拟受控组件保存返回草稿的行为。
  // 两个断言共同防止修复只对预设切换有效，对连续缩放失效。
  // 缩小状态仍保留 preset 模式及原始比例，否则恢复会拿小图作基准。
  // 0.1 和 0.2 均位于滑条支持区间，不使用 UI 无法设置的倍率。
  // 恢复过程中复用上一次返回对象，模拟父状态保存的真实数据形状。
  // 没有额外传入原始 1344，测试不能靠手动恢复基准掩盖产品错误。
  // 宽高分别断言，保留竖向舍入与横向舍入不同的边界。
  // 不以面积相等替代两条边的匹配，避免交换宽高也能假通过。
  const preset = { ...custom(400), mode: "preset", aspectRatio: "16:9", scale: 0.2 };
  const small = api.createVideoSizeSelection(preset); assert.deepEqual([small.width, small.height], [256, 160]);
  const minimum = api.createVideoSizeSelection({ ...small, scale: 0.1 }); assert.deepEqual([minimum.width, minimum.height], [128, 64]);
  const restored = api.createVideoSizeSelection({ ...minimum, scale: 1 }); assert.deepEqual([restored.width, restored.height], [1344, 768]);
}

// 图片倍率放开后，需要同时证明像素仍是整数、视频仍保留原范围。
// 测试运行生产算法，不在这里复制四舍五入或 8 像素对齐的实现。
// 16:9 预设为真实仓库数据 1344×768，固定期望可发现隐藏的倍率截断。
// 1.26 先确认到 1.3，再计算像素；不能先乘 1.26 却只改显示文字。
// 2.1 和 3.9 覆盖 1 倍以上，也覆盖无法直接得到整数像素的乘积。
// 每一边的预期独立写明，不从生产返回结果反推“正确答案”。
// 同一尺寸对象再改回 1 倍，必须还原原始尺寸，不能累计缩放。
// 本组不分配真实图片或 GPU，只验证选择器和生成共用的参数计算。
  // 运行环境中没有 window，能防止尺寸纯逻辑意外依赖 DOM 或 preload。
  // 图片和视频使用相同输入形状，比较的是各自业务边界而非类型名称。
  // 返回的 scale 是业务数值，显示层的 × 单位不参与计算或持久化。
function checkImageScale(image, video) {
  const preset = { ...custom(400), mode: "preset", aspectRatio: "16:9" };
  // 默认倍率与旧文档缺字段是同一条兼容路径，不要求先操作滑条。
  // 非有限值也回到默认，不能让损坏数据产生 NaN 或 Infinity 像素。
  // 0.1 下界继续保留，已有缩小倍率不会因为允许放大而失效。
  // 归一化函数也由 store 恢复逻辑使用，放大值不能在水合时又被截成 1。
  // 上限是视频显式注入的参数，不应成为图片隐藏的默认上限。
  // 旧文档 undefined 与损坏文档 NaN 分开检查，不能只保护缺字段场景。
  // 0.01 的回落采用固定期望 0.1，不直接调用生产函数生成 expected。
  assert.equal(image.clampSizeScale(undefined), 1); assert.equal(image.clampSizeScale(NaN), 1);
  assert.equal(image.clampSizeScale(Infinity), 1); assert.equal(image.clampSizeScale(0.01), 0.1);
  // 两段比例的变化用不同 expected 表示，避免只检查格式不检查实际值。
  // 第一个数组值是确认后的倍率，后两项是最终输出像素。
  // 普通 Number.isInteger 与取模断言独立于产品 clamp，防止小数偷偷传下去。
  // 两边各自验证，不能用面积相同掩盖宽高互换或单边漏校正。
  // 原始 preset 对象保留原值，后续回退测试拿的是上次返回对象。
  // 恢复测试复用结果中的原始模式和比例，不手工补回基准尺寸掩盖错误。
  // 在每轮内检查恢复，确保小倍率和大倍率都不会污染下一次计算。
  // 无需真实模型即可抓到浮点像素进入参数的问题，不以画面观感替代断言。
  for (const [scale, expected] of [[1.1, [1.1, 1480, 848]], [1.26, [1.3, 1744, 1000]], [2.1, [2.1, 2824, 1616]], [3.9, [3.9, 5240, 2992]]]) {
    const result = image.createSizeSelection({ ...preset, scale });
    assert.deepEqual([result.scale, result.width, result.height], expected);
    assert([result.width, result.height].every((side) => Number.isInteger(side) && side % 8 === 0));
    assert.equal(image.clampSizeScale(result.scale), result.scale);
    assert.deepEqual([image.createSizeSelection({ ...result, scale: 1 }).width, image.createSizeSelection({ ...result, scale: 1 }).height], [1344, 768]);
  }
  // 自定义图片采用自己的基准，不能固定拿 16:9 预设计算放大结果。
  // 视频对照使用完全相同的大倍率，依然只允许 1 倍且输出原分桶尺寸。
  // 这证明公共倍率函数的默认放开，没有改变 H3 现有业务限制。
  // 完整模板写入仍由后面的 28740 组用例覆盖，不在这里伪造视频任务成功。
  // 4096×2160 的双倍是独立整数期望，不需要读取图片文件才能验证参数。
  // 图片自定义分支与预设分支都覆盖，不能只允许预设放大而把手填尺寸截断。
  // 视频仍检查最终两边，避免只把倍率标签改回 1 但留下放大后的宽高。
  const doubled = image.createSizeSelection({ ...custom(4096, 2), customHeight: 2160 }); assert.deepEqual([doubled.width, doubled.height], [8192, 4320]);
  const limited = video.createVideoSizeSelection({ ...preset, scale: 3.9 }); assert.deepEqual([limited.scale, limited.width, limited.height], [1, 1344, 768]);
}

/**
 * 对真实模板的每个任务克隆后写入，避免测试彼此污染默认参数。
 * 图生视频与参考视频共用尺寸适配，两类节点都必须受保护。
 * 遍历合法表单区间和全部滑条倍率，覆盖预设案例之外的舍入边界。
 * 对齐断言通过除法验证模型约束，不依赖产品的 clamp 实现。
 * 提交后的数值必须等于选择器返回值，不能在隐藏环节再次改尺寸。
 * 无 GPU 执行，因此结论只涉及参数和工作流结构，不涉及画面效果。
 * 最后核对旧草稿和不传设置的模板分支，防止只保护新 UI 路径。
 */
function checkSubmission(api, file) {
  const template = load(path.resolve(__dirname, "../apps/next/src/data/comfy/videoWorkflower/minnimax", file));
  // 模板中的节点 ID 可能调整，定位按官方 class_type，不硬编码 105:104。
  // 同一测试分别读取首尾帧和参考视频，不能只用一个手写假节点。
  // 找不到目标节点时立即失败，避免遍历空集合得出“全部通过”。
  // 使用深克隆保证文件加载缓存内的默认模板永远不受当前用例写入影响。
  // 测试保留模型、帧和采样链，后面的整图断言检查这些部分未被改动。
  // 不调用完整图构建器，避免其他模型清单依赖影响尺寸约束的结论。
  const id = Object.keys(template).find((key) => /^MiniMaxH3(ImageToVideo|ReferenceToVideo)$/.test(template[key].class_type)); assert.ok(id);
  const prompt = structuredClone(template);
  // 高宽互补可同时触及最小、最大与中间的奇偶 latent 边长。
  // 本循环不提交网络请求，只运行正式的参数适配和节点写入。
  // 每个 scale 单独从原始草稿计算，模拟用户任意拖动倍率滑条。
  // 同步检查两边，避免只修宽度却遗漏高度或竖屏场景。
  // 模板里的帧连接和模型名不应因遍历尺寸而被修改。
  // 原模板用于最后的深比较，既检测漏写也检测误写其他参数。
  // 64 至 1500 共 1437 个原始边长，不只抽查已经对齐的 32 倍数。
  // 每个边长覆盖十个倍率，每个模板因此检查 14370 组尺寸。
  // 两个真实模板合计 28740 组，不将每条内部 assert 重复算作案例。
  // 回调只触发同步纯函数，循环顺序不会模拟或依赖网络返回。
  // 范围内含 400、所有 32 像素中点及上限尾部区间。
  // 直接检查模 32，等价于要求 latent 空间边长是偶数。
  // 像素上界断言与对齐断言分开，避免越界的 1504 被误认为合格。
  // 像素下界也独立检查，不能因为零可被 32 整除而放行零尺寸。
  // 提交读 width/height，不应再应用 settings.scale。
  // 所以小倍率测试也能发现把同一个缩放计算两次的回归。
  for (let side = 64; side <= 1500; side++) for (let tenth = 1; tenth <= 10; tenth++) {
    const settings = api.createVideoSizeSelection({ ...custom(side, tenth / 10), customHeight: 1564 - side }); api.applyVideoResolution(prompt, settings);
    for (const key of ["width", "height"]) { assert.equal(settings[key] % 32, 0); assert(settings[key] >= 64 && settings[key] <= 1472); assert.equal(prompt[id].inputs[key], settings[key]); }
  }
  // 旧版本草稿可能存着 400，不能依赖新 UI 已自动对齐的假设。
  // 直接写最终 width/height，证明提交层本身也存在约束。
  // 无尺寸设置时同样处理模板；其他节点应与原始模板完全相同。
  // 保留 400 基准的首尾帧素材并不会在这里改写图片文件本身。
  // 参考图的像素调整属于 ComfyUI 官方节点，另一个处理边界。
  // 第一次使用显式旧草稿，第二次完全省略尺寸参数。
  // 两条路径最终应给出同样的 416，不允许未打开控件时留在 400。
  // 第二次先把两条边都写回 400，防止上一步结果使默认路径恒真。
  // expected 只修改模板宽高，任何额外节点或参数变化都会深比较失败。
  // 不把异常拦截当成默认路径成功；默认路径必须真实返回并写入。
  // 连线中的文件名和模型名也参与比较，但测试不读取这些实际文件。
  api.applyVideoResolution(prompt, { ...custom(400), width: 400, height: 400 }); assert.equal(prompt[id].inputs.width, 416);
  prompt[id].inputs.width = 400; prompt[id].inputs.height = 400; api.applyVideoResolution(prompt); assert.equal(prompt[id].inputs.height, 416);
  const expected = structuredClone(template); expected[id].inputs.width = 416; expected[id].inputs.height = 416; assert.deepEqual(prompt, expected);
  // 非整数、非有限值和超出历史范围的最终参数必须报错。
  // 每次检查失败后的整个图，确认部分写入不会留下半合法任务。
  // 错误 key 使用视频尺寸专用词条，不应误报帧率或生成步数错误。
  // 分别覆盖宽高，避免校验代码仅检查第一个值。
  // 类型层不允许这些数据，但运行时仍要防御损坏草稿或旧调用者。
  // 400.5 检查整数契约，而不是仅比较数值范围。
  // 1501 刚刚越过历史上限，必须拒绝，不能与旧 1500 混为一类。
  // 0 验证最小值拒绝，NaN 与 Infinity 验证非有限值拒绝。
  // 每次在合法图上制造一个坏字段，避免另一个坏字段掩盖漏检。
  // 失败后仍保留 expected，表明错误路径没有先写宽后在高度处抛错。
  // 这些都是参数断言，不会上传真实图像或消耗模型计算资源。
  for (const key of ["width", "height"]) for (const invalid of [NaN, Infinity, 400.5, 0, 1501]) {
    assert.throws(() => api.applyVideoResolution(prompt, { ...custom(400), width: 400, height: 400, [key]: invalid }), /invalidResolution/); assert.deepEqual(prompt, expected);
  }
}

// 图片尺寸单独执行真实算法，确保视频修复没有把图片的 400 改为 416。
// 缺失 H3 节点且未传尺寸时保留空图，用于兼容 Wan 等其他工作流。
// 显式传尺寸但找不到目标节点时应报错，不能静默丢弃用户设置。
// 缺节点的负向对照也传入合法尺寸，以免错误仅由坏尺寸触发而漏检定位。
// 成功摘要只在所有正向、负向和兼容断言均通过后打印。
// 测试不创建临时文件或模型，收尾无需删除目录或停止用户进程。
// 任何模块加载或断言异常均以退出码 1 返回，CI 可直接消费。
try {
  const api = load(path.resolve(__dirname, "../apps/next/src/utils/comfy/video-resolution.ts")); checkSelection(api);
  for (const file of ["minimax h3 图生视频-首尾帧.json", "minimax h3 参考视频.json"]) checkSubmission(api, file);
  const image = load(path.resolve(__dirname, "../apps/next/src/utils/imageSize.ts")); assert.equal(image.createSizeSelection(custom(400)).width, 400);
  // 同时验证图片放大与视频保持上限，失败不能被后面的旧用例通过掩盖。
  // 运行生产纯函数，UI 双击、取消与焦点另外需要浏览器交互验证。
  // 这里不创建新进程，避免尺寸专项与现有批量参数回归使用不同环境。
  checkImageScale(image, api);
  // 单独打印本次倍率用例的结论，避免旧的 H3 摘要掩盖新增覆盖范围。
  // 该行只会在实际断言通过后执行，不把调用函数本身当成通过证据。
  // 界面测试仍独立报告，这条结果不声称浏览器交互或真实模型生成成功。
  console.log("PASS: image scaling above 1x, one decimal, integer aligned pixels, original-size restoration and unchanged video limit");
  // 图片不沿用 H3 的最大值，4096×2160 必须完整保留。
  // 两条边都检查，避免只放开横图宽度而高度仍受旧限制。
  // 对照视频测试仍检查 1472 上限，两者共用 UI 不代表共用约束。
  const largeImage = image.createSizeSelection({ ...custom(4096), customHeight: 2160 }); assert.deepEqual([largeImage.width, largeImage.height], [4096, 2160]);
  // 缩放仍从原始尺寸计算，不能先截到旧 1500 再缩小。
  // 0.5 倍结果也是独立数值期望，不从生产返回值反推正确答案。
  // 保持自定义原始边长，切回 1 倍应恢复完整大图尺寸。
  const scaledImage = image.createSizeSelection({ ...largeImage, scale: 0.5 }); assert.deepEqual([scaledImage.width, scaledImage.height], [2048, 1080]);
  // 旧上限本身不是 8 的倍数，放开后应按普通图片步进得到 1504。
  // 400 必须仍是 400，不能错误套用 H3 的 416。
  // 不合法数值继续回落，不能把“无上限”解释为允许 NaN 或负数。
  assert.equal(image.clampImageSide(1500), 1504); assert.equal(image.clampImageSide(400), 400); assert.equal(image.clampImageSide(-1), 8);
  // 远高于常见 4K 的尺寸也不能被另一个隐藏的 UI 上限截断。
  // 这里只检查参数，不分配对应大小的画布或 GPU 内存。
  // 因此通过不代表任意设备都能实际生成如此大的图片。
  assert.equal(image.clampImageSide(1048576), 1048576); assert.equal(image.clampImageSide(Infinity), 8); assert.equal(image.clampImageSide(NaN), 8);
  const other = {}; api.applyVideoResolution(other); assert.deepEqual(other, {}); assert.throws(() => api.applyVideoResolution(other, api.createVideoSizeSelection(custom(400))), /missingNode/);
  console.log("PASS: H3 alignment, scaling, both real templates, legacy/default submission, invalid inputs and image compatibility (28740 size/scale cases)");
} catch (error) { console.error(error); process.exitCode = 1; }
