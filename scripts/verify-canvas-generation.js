// 纯算法反证：像素、模板参考链和图片编号直接执行生产TS，不运行GPU或外部服务。
// 与Electron窗口用例分开，本脚本不能证明系统选择框、真实模型兼容或鼠标手感。
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const nextRequire = createRequire(path.resolve("apps/next/package.json"));
const ts = nextRequire("typescript"), cache = new Map();

// 只替换语言状态读取；图构建、模板JSON和坐标解析都加载实际文件。
// 缓存以绝对路径登记，两个相对导入不会各自创建一份模板状态。
// TypeScript转译仅擦除类型，严格检查由仓库typecheck另行执行。
// 纯逻辑回归直接加载产品 TypeScript，不保存一份永远不变的算法副本。
// transpileModule 仅擦掉类型并转换模块语法，不能替代严格类型检查。
// 测试使用与 next 包相同的 TypeScript 版本，避免根目录没有直接依赖时解析失败。
// 绝对路径作为缓存键，同一个模板通过两个相对地址导入也只保留一份模块结果。
// 先登记 exports 再执行源码，保持正常 CommonJS 循环引用的基本行为。
// JSON 直接读取产品模板，因此更新编辑流时断言使用的默认值会同步变化。
// 没有编译 JSX 组件，本脚本的范围是尺寸、引用与工作流数据。
// 新的函数若依赖浏览器 DOM，应移到 Electron 验证而不是在这里造一个宽松假 DOM。
// new Function 只执行仓库本地受版本控制源码，不执行网络返回脚本。
// 解析器不接受外部用户指定文件路径，脚本入口中的模块路径均为固定常量。
// 缓存对象保存本次 Node 进程的结果，测试结束后不会写到应用用户数据。
// 同一个测试改变返回 prompt 时必须由产品深克隆，不能靠重新加载模板掩盖污染。
// 转译失败会直接抛异常，命令退出非零，不打印最终通过标记。
// 动态 require 的错误不能静默回落为 undefined，否则可能跳过真实依赖校验。
// 语言状态是唯一替换点，错误文本返回 key 以避免初始化 React 与用户设置。
// 数据构建器仍读取生产 SAMPLERS 和 SCHEDULERS，所以枚举校验没有被 stub 掉。
// 原模板文件名为中文也通过标准 fs 路径读取，不另存一份英文替代模板。
// 本回归没有启动 Electron，不能凭它宣称 localfile 协议或 IPC 已通过。
// 严格检查和 UI 冒烟属于另外两条证据，交付必须分别记录。
// 源码缓存是验证便利，不是建议产品把所有模型图片无限缓存。
function load(file) {
  if (cache.has(file)) return cache.get(file);
  if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
  const result = {}; cache.set(file, result);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("exports", "require", source)(result, name => resolve(file, name));
  return result;
}
// 解析别名遵守当前渲染与 shared 路径，不能把历史 types 兼容误判成缺失文件。
// 先尝试 next/src，再尝试 shared/src，与项目真实兼容关系相同。
// 相对导入以当前文件目录为基准，不假设所有文件都放在脚本目录。
// 普通 npm 依赖交给 nextRequire，因此构建器实际使用原公共包。
// 候选顺序支持 ts、json、原文件和 index.ts，没有猜测不存在的 tsx 组件。
// 每个候选都检查 isFile，存在目录不能被当作可读取源代码。
// 找不到目标立即失败，不能返回空对象让测试跳过模块功能。
// 只有 i18n 被固定成 key 返回；模型枚举、默认模板和像素工具都是真实源码。
// 如果未来被测函数引入新环境依赖，解析失败是在提示测试前提需要重新判断。
// 不应为让脚本通过而把该依赖对应的产品逻辑改成常量。
// 路径解析不会读取用户 home、模型目录或外部资料包。
// 根路径由运行工作区确定，所以命令文档要求从仓库根运行。
// 脚本没有访问应用 globals store，实例隔离另由正式页面验证。
// 对象缓存只供读入源码，不保存断言结果，第二次调用仍执行真正函数。
// 错误文本中包含的是固定源码依赖名，不会泄露真实用户媒体路径。
// 这类加载工具只服务验证，不被打入 Next 静态导出或 Electron 主进程。
function resolve(file, name) {
  if (name === "@/i18n") return { t: key => key };
  if (!name.startsWith(".") && !name.startsWith("@/")) return createRequire(file)(name);
  const bases = name.startsWith("@/") ? [path.resolve("apps/next/src", name.slice(2)), path.resolve("packages/shared/src", name.slice(2))] : [path.resolve(path.dirname(file), name)];
  const target = bases.flatMap(base => [base + ".ts", base + ".json", base, path.join(base, "index.ts")]).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!target) throw Error("Fixture cannot resolve " + name);
  return load(target);
}
// 这些模块边界恰好对应三项本轮能力：输出规格、参考编号和实际编辑图。
// output 是生产尺寸模块，不是测试计算器。
// references 是生产候选表适配器，读取来源 ID 与媒体类型。
// tokens 是原共享媒体协议，新 picture 别名要与旧三类引用共存。
// images 是原图片服务规范化器，提交使用 Picture 而编辑仍保留 @ 写法。
// edit 是原编辑构建器，既要验证新尺寸，也要保留旧 MP 分支。
// 各模块共享真实依赖缓存，但测试样本对象逐次构造，不复用被修改的返回图。
// 断言只引用公开函数返回，不访问内部临时变量来制造通过条件。
// 模块输入是纯数据，因此可以在不启动应用窗口时快速检查反证。
// 这条快路径用于定位参数错误，不能据它跳过最终 Electron UI 回归。
// 如果函数以后增加跨进程调用，这份纯测试应重新划定边界而不是 stub 掉整段业务。
// 语言 stub 只使异常文案可预测，不影响是否应该抛错的条件。
// 实际双语键一致性由项目语言命令检查，不在这里重复维护词条名单。
// checked 初始化为零，仅当一组断言执行到对应位置才增加。
// 有多条 assert 的一组按实际条数增加，不能按调用函数数声称覆盖条数。
// 这组样本不会修改服务配置、输出目录或 API 凭据。
// 纯格式样本不应登记入用户生成统计，测试进程不会发送任何真实生成通知。
// 格式支持与真实图片导入能力分开，C:/two.png 只是协议样例并非导入证据。
// 相对模块别名兼容是项目已有机制，本轮没有批量替换历史 import。
// 工具加载成功只是前置条件，后面的行为断言才决定功能是否符合约定。
// 脚本末尾的成功标记与 Electron 总结分别归档，避免不同证据合成一个模糊通过数。
// 被测默认模板在构建时有类型检查，运行测试的转译本身不代替这个检查。
const output = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-output-size.ts"));
const references = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-reference-media.ts"));
const tokens = load(path.resolve("apps/next/src/utils/prompt-media-references.ts"));
const images = load(path.resolve("apps/next/src/utils/image-prompt-references.ts"));
const edit = load(path.resolve("apps/next/src/utils/comfy/anima-edit-workflow.ts"));
const { SCHEDULERS } = load(path.resolve("apps/next/src/data/createForm.ts"));
let checked = 0;

// 四种比例的正反长边都验证；切比例不把2048误作像素总量或倍率。
// 精确像素写回原size附表，复制后的修改不得原地改变已有模板项。
// 没有配置的旧工程仍可显示默认1K，不强行填满所有模板默认数据。
// 第一组先用四个正常比例建立 golden，避免一个永远拒绝输入的实现假通过。
// 正方形预期两边相等，是长边算法最简单的基准。
// 十六比九预期短边五百七十六，能发现把 K 误解成总像素的实现。
// 九比十六交换长短边，能发现仅支持横图的计算。
// 四比三预期七百六十八，覆盖不是九比十六家族的另一个比例。
// 每个比例跑两个档位，不能只验证默认一千档后推测两千档正确。
// 预期使用明确数字，不调用另一个生产尺寸函数算预期。
// 若预期也调用被测函数，就无法发现双方一起算错的同源错误。
// 测试比较宽高对象整体，不能只看长边正确而忽略短边。
// 补丁样本同时带一个 SDXL 反向词，验证更新 Anima 不清空另一个模板。
// 一千五百三十六乘八百六十四是自定义合法画框，不能被预设重写回一千档。
// canvasOutputDimensions 读取应用后的补丁，证明显示端能消费真实持久化字段。
// 原 data 的附表仍只包含 SDXL，是不可变性反证。
// 如果 canvasSizePatch 原地改了输入，第二条 deepEqual 会失败。
// 第三条确认 SDXL 的 keep 值还在，避免只检查“对象没被改”但新补丁漏了其他模板。
// 这组没有调用服务，不把合法尺寸解释成真实模型已经成功运行。
// 像素单位是整数，断言不接受含 px 的字符串。
// 尺寸解析保持原 scale 契约，显式写一倍可避免二次放大。
// 这组只验证当前约定四种紧凑比例，不声称所有导入历史比例都经过实机截图。
// 输入 size 字段来自真实模块类型对应的轻量对象，不依赖 UI 内部 state。
// 计数 checked 在断言完成之后增加，失败不能先把计数凑满。
// 循环断言一旦抛错会终止 Node 命令，最终 OK 不会出现在失败输出后面。
// 这组与 Electron 的保存读回互补：前者查纯对象，后者查真正用户文档。
// 它不验证字体、hover 或焦点，不能用对象正确代替视觉验收。
function dimensions() {
  for (const [ratio, expected] of [["1/1", [1024, 1024]], ["16/9", [1024, 576]], ["9/16", [576, 1024]], ["4/3", [1024, 768]]]) {
    for (const side of [1024, 2048]) {
      assert.deepEqual(output.canvasPresetDimensions(ratio, side), { width: expected[0] * side / 1024, height: expected[1] * side / 1024 }); checked++;
    }
  }
  const data = { kind: "image", ratio: "16/9", workflow: "anima", imageParameters: { sdxl: { negative: "keep" } } };
  const patch = output.canvasSizePatch(data, 1536, 864);
  assert.deepEqual(output.canvasOutputDimensions({ ...data, ...patch }), { width: 1536, height: 864 });
  assert.deepEqual(data.imageParameters, { sdxl: { negative: "keep" } });
  assert.equal(patch.imageParameters.sdxl.negative, "keep"); checked += 3;
}

// 旧MP链必须保留；确切画框只在显式outputSize时启用，不能改变旧创建页行为。
// 非八倍数、非有限值和控制图混用必须拒绝，而非在生成时静默忽略尺寸。
// VAEEncode消费的正是新缩放节点，不只在prompt里增加一颗无连接的假参数节点。
// 先构建旧设置且不传 outputSize，验证原编辑页面的 MP 链没有被本轮默认替换。
// 如果只测新尺寸入口，可能漏掉修改构建器后把所有旧编辑任务拉伸成方图。
// 新的显式尺寸样本固定二千零四十八乘一千一百五十二，测试 exact inputs。
// 输入节点必须仍引用 edit-source，而不是一个没有内容的空 latent。
// upscale_method 保持原参考缩放使用的 lanczos，不能只增加两个无效字段。
// crop 必须 disabled，这里表达精确目标画框而非默认中心裁剪。
// 检查 edit-encode 的 pixels 连到 edit-scale，能发现增加了孤立缩放节点的假接通。
// 后续采样消费参考 latent，单独修改 EmptyLatentImage 宽高不能通过这个断言。
// 旧 MP 与新确切尺寸在同一构建器分支，测试不能通过选择另一份临时模板规避。
// 非法列表包含零、负数、非八倍数、NaN 与 Infinity。
// 零验证最小单元，负八验证不能只用取模判合法。
// 九验证步进，有限性边界则由 NaN 与 Infinity 覆盖。
// 每个反例只改 width，height 保持一千零二十四，便于定位真正失败原因。
// 如果把两边都设错，只能证明至少一个错误被拒绝，无法判断是哪条约束。
// assert.throws 要求构建入口真实抛错，不把 undefined 结果当作已阻止上传。
// controlMode 与 outputSize 混用是另一条业务边界，不属于普通数值非法。
// 控制图已有源几何规则，测试应防止画布功能无意改变蒙版对齐。
// 设置来自 ANIMA_EDIT_DEFAULTS，包含真实编辑 LoRA、步数和默认采样枚举。
// instruction 只提供非空英文测试词，不代表实际提示词质量回归。
// imageName 只是构建期合法服务文件名，脚本不宣称已经完成上传。
// 此处没有调用 resolveAnimaEditModels，真实服务列表匹配由编辑集成另测。
// 所有图由 buildAnimaEditPrompt 新建，原模板对象不能被一个样本永久污染。
// 对新图 inputs 整体比较可以抓到字段拼写、错误节点连接和额外遗留参数。
// 旧默认对象使用展开不修改原常量，其他脚本运行不受本次测试数据影响。
// 禁止为了失败用例通过而缩小输出或更换断言预期。
// 本组只证明图结构，ComfyUI 自定义节点是否兼容仍需真实推理验证。
function workflow() {
  const settings = { ...edit.ANIMA_EDIT_DEFAULTS, instruction: "Edit a real image" };
  const old = edit.buildAnimaEditPrompt(settings, "input.png");
  assert.equal(old["edit-scale"].class_type, "ImageScaleToTotalPixels");
  const current = edit.buildAnimaEditPrompt({ ...settings, outputSize: { width: 2048, height: 1152 } }, "input.png");
  assert.deepEqual(current["edit-scale"].inputs, { image: ["edit-source", 0], upscale_method: "lanczos", width: 2048, height: 1152, crop: "disabled" });
  assert.deepEqual(current["edit-encode"].inputs.pixels, ["edit-scale", 0]); checked += 3;
  for (const width of [0, -8, 1.5, NaN, Infinity]) {
    assert.throws(() => edit.buildAnimaEditPrompt({ ...settings, outputSize: { width, height: 1024 } }, "input.png")); checked++;
  }
  checkEditOutput(settings, 8, "edit-scale");
  // 新菜单全部使用真实构建入口，不能只让下拉框增加三个好看的名称。
  // 对每项同时检查合法参数接纳与采样节点原值，覆盖校验和请求图两个边界。
  // 这里不维护第二份图结构，采样节点从返回的真实 prompt 中按类型寻找。
  // 名称顺序的独立预期由 Electron UI 断言负责，避免两层互相复制常量自证。
  // 若菜单允许 beta 而编辑入口拒绝它，本循环会直接异常退出。
  // 若构建器接纳后偷偷改成 simple，scheduler 比较会失败。
  // 九个样本逐次新建图，防止模板被前一轮修改后污染下一轮。
  // 这不模拟扩散采样算法，只验证我们传给 ComfyUI 的参数没有被篡改。
  // 真正服务的版本和节点插件兼容仍列为未验证，不以构建成功替代推理。
  for (const item of SCHEDULERS) {
    const graph = edit.buildAnimaEditPrompt({ ...settings, scheduler: item.value }, "input.png");
    assert.equal(Object.values(graph).find(node => node.class_type === "KSampler").inputs.scheduler, item.value); checked++;
  }
}

// ID排序故意与输入数组相反，同时包含空上游，编号不能因媒体未就绪而偷偷前移。
// picture是新增别名；旧image/video/audio的编号、查找和转换继续保持原协议。
// 来源数组故意先放 i10 后放 i2，用数字排序的明确反例检测是否误按连接先后。
// i10 没有图片媒体，仍必须占据第二号。
// i2 有真实形状的路径引用，但纯测试不会打开它，因此不声称该文件存在。
// 手动输入作为第三号，用于确认连线总是在手动导入之前。
// 第一条比较 ID 顺位，第二条比较文本 token，不能只验证其中一个表面。
// 空来源 src 应保持空串，不得复制邻居图片假装已经就绪。
// findPromptReferenceMedia 把 picture1 解析回 i2，证明新别名进入原公共查找器。
// 规范化同时输入 picture1 与旧 image3，验证两种写法可以共存于一段正文。
// 预期分别变成 Picture 一与 Picture 三，不能全部错误指向第一张图。
// available 第二项为 false，缺号返回具体 missing=2，而不是泛化成任意失败。
// 这样 UI 才能告诉用户缺哪张参考图，避免反复重试模型。
// 旧 image、video、audio 三种类型分别验证 token 和查找。
// 新增别名不能把所有类别都强制写成 picture。
// 每种旧类型编号都用一，能发现查找器没有按 kind 分组造成同编号串资源。
// 测试不伪造菜单装饰 span，DOM 焦点和补全交给真正组件的 Electron 用例。
// 返回 ID 比只看显示名称更可靠，同名图片不应该被错认成同一来源。
// 纯测试里路径不传给上传服务，用户数据不会因此新增受管图片。
// 已完成引用的提取、空格别名与光标查询还有原共享引用脚本独立覆盖。
// 这里重点覆盖画布 picture 扩展，不把原协议验证全部复制到一份新测试。
// 如果 i10 被 filter 掉，第三号会前移成第二号，号码断言能够抓住此类错误。
// 如果排序用普通字典序，i10 将回到第一号，ID 与 token 两组均会失败。
// 如果 imported 排在前面，第一号不再是 i2，查找和顺序断言同样失败。
// 如果空地址被填成假图，空 src 断言失败而不是把它算作已生成素材。
// 这些反例来自独立数据排列，不是直接重述某一行实现的返回常量。
// 模块加载的 i18n stub 不改变资源类型或正则，语言替换不会决定测试是否通过。
// 最后总计只用于汇报已执行断言，不作为产品完成比例。
// 没有真实视频生成或服务上传，报告不能把引用归一成功写成视频任务已经接通。
function media() {
  const sources = [{ id: "i10", data: { kind: "image", title: "ten" } }, { id: "i2", data: { kind: "image", title: "two", media: { path: "C:/two.png", kind: "image", name: "角色.正面.png", size: 1 } } }];
  const items = references.canvasReferenceMedia(sources, [{ name: "manual", path: "C:/manual.png" }]);
  assert.deepEqual(items.map(item => item.id), ["i10", "i2", "imported-0"]);
  assert.deepEqual(items.map(tokens.mediaReferenceToken), ["@picture1", "@picture2", "@picture3"]);
  // 真实资产名包含内部点，显示主体只去最后后缀，旧工作title不能覆盖它。
  // 这份媒体夹具补齐合法name与size，不让不符合生产合同的半个对象决定显示回落。
  // 空上游仍使用工作标题，尚未生成文件时不能捏造一个文件前缀。
  // 手动导入同样显示主体，不应只有连线图片启用新标签。
  // 编号断言继续独立存在，显示名变化不能牺牲原Picture协议的稳定性。
  // displayName与name分别服务已插入标签和搜索列表，两者都应来自同一实际名字。
  // 原i2的工作title是two，与文件主体刻意不同，能发现错误读取title的实现。
  assert.equal(items[1].displayName, "角色.正面");
  assert.equal(items[0].displayName, "ten");
  assert.equal(items[2].displayName, "manual"); checked += 3;
  assert.equal(items[0].src, "");
  assert.equal(tokens.findPromptReferenceMedia("@picture1", items).id, "i10");
  assert.equal(images.normalizeImageReferences("@picture1 move @image3", [true, false, true]).text, "<Picture 1> move <Picture 3>");
  assert.equal(images.normalizeImageReferences("@picture2", [true, false, true]).missing, 2); checked += 6;
  for (const kind of ["image", "video", "audio"]) {
    assert.equal(tokens.mediaReferenceToken({ kind, number: 1 }), `@${kind}1`);
    assert.equal(tokens.findPromptReferenceMedia(`@${kind}1`, [{ kind, number: 1, id: kind }]).id, kind); checked += 2;
  }
}
// 改名像修改档案总索引，同源输出、手动输入和历史底稿都要一起重定向。
// 本组只调用生产纯函数，不对Electron返回值造一个看似成功的文件操作。
// 文件是否真的存在由后续Electron专项验证，这里专门穷举会话内可恢复的引用。
// state保留一份JSON指纹，处理后必须字节相等，证明没有原地修改旧历史。
// present、past、future、drag和clipboard各放一份同源引用，漏任何一类都会失败。
// clipboard的接口不要求完整工程，因此被测函数不能靠name等不相关字段才能工作。
// 相同basename放到其他目录，是完整路径匹配的负向对照，不能一起被改名。
// 手动输入包含两张不同图片，只允许命中的第一张更新，另一张必须保留。
// 新主体含点，标题应保留Renamed.Image而不是截断到Renamed。
// 新文件名包含后缀，media.name应保留它，标题则省略后缀，两个字段用途不同。
// 每份文档的节点顺序和边不变，这个服务不能顺手重排连线或改变Picture顺位。
// 新的state是另一对象，React需要通过引用变化收到刷新，不能偷偷改旧对象后返回它。
// 无关节点应仍是原对象，避免每次文件改名都让全画布重新挂载解码媒体。
// 图中同源不同节点允许共享地址，更新必须以路径为单位而不是只修改一个节点id。
// 原路径中的私人目录不会进入错误或展示文案，这些字符串仅是隔离纯数据夹具。
// 遍历文档集合属于测试枚举，生产函数仍负责真正创建每份新快照。
// 预期直接写出合同目标路径，不从产品返回节点再推导应有结果。
// 更名不是磁盘撤销，本组不要求history把新地址恢复成旧地址。
// 真正撤销的坐标和其他字段保存在原快照，重定向只应改变资产名称和地址。
// 这里不清空future，用户重做删除或复制仍应使用有效的新文件地址。
// 复制底稿在工程外，单靠当前节点保存正确不能证明下次粘贴不会丢图。
// drag为空时保持null；本例故意让它非空，覆盖取消手势使用的备用索引。
// 函数不访问window，Node可以直接运行；若以后误引浏览器状态，这条回归会失败。
// 类型严格性由仓库typecheck另外检查，动态载入不会代替编译器的字段约束。
// 输出字段必须使用服务的真实结果，不把旧name只换一部分而保留过期扩展。
// 输入size保留，变更文件名不能声称媒体字节数也发生改变。
// 同一文档有两张同名图片仍不能按title匹配，否则无关节点的对照会暴露。
// 下面的for循环逐个验证所有文档，不是只看最后一次迭代的返回值。
// 本组没有吞掉assert异常，任何索引遗漏都会使命令以非零退出。
// 通过这些断言仍不能宣称断电原子性或跨工程文件监听已经接入。
// 模块不读取或写入实际用户文档，避免纯契约检查需要开启桌面窗口。
// 数据对象的大小刻意很小，只验证算法合同，不把运行耗时当大工程性能报告。
// JSON比较覆盖输入结构，独立身份比较覆盖无关节点引用，两者发现的问题不同。
// 当前与历史之间可能共享节点，fixture克隆使测试不能靠意外共同修改来通过。
// 真实同源图片数量不受本组的两个节点限制，生产逻辑按每份节点数组全部检查。
// 保留历史消息与粘贴计数属于state外壳职责，本测试只断言本次涉及的资产字段。
// checked随实际执行的三项索引断言累加，五份文档共十五项，不预填一个假通过总数。
// modifiedAt不参与节点身份判定，不能因文件时间变化重新生成id或重排媒体。
function renameIndexes() {
  const rename = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-media-rename.ts"));
  const node = { id: "a", data: { kind: "image", title: "旧标题", media: { kind: "image", path: "C:/canvas/a.png", name: "a.png", size: 7 }, inputImages: [{ kind: "image", path: "C:/canvas/a.png", name: "a.png", size: 7 }] } };
  const document = { nodes: [node, { ...node, id: "b", data: { ...node.data, media: { ...node.data.media, path: "C:/other/a.png" }, inputImages: [] } }], edges: [], name: "test" };
  const state = { ...document, past: [structuredClone(document)], future: [structuredClone(document)], drag: structuredClone(document), clipboard: structuredClone(document) };
  const before = JSON.stringify(state);
  const result = rename.relinkCanvasMedia(state, { oldPath: "C:/canvas/a.png", filePath: "C:/canvas/Renamed.Image.png", fileName: "Renamed.Image.png", modifiedAt: 0 });
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.nodes[1], state.nodes[1]); checked += 2;
  for (const value of [result, ...result.past, ...result.future, result.drag, result.clipboard]) {
    assert.equal(value.nodes[0].data.media.path, "C:/canvas/Renamed.Image.png");
    assert.equal(value.nodes[0].data.inputImages[0].path, "C:/canvas/Renamed.Image.png");
    assert.equal(value.nodes[0].data.title, "Renamed.Image"); checked += 3;
  }
}
// 执行顺序先固定尺寸合同，再固定工作流连接，最后固定引用协议。
// 尺寸失败时不继续用错误像素测试后续服务图，便于从第一处异常定位。
// 工作流检查没有绕过原 validateAnimaEdit，合法 golden 与非法样本共用入口。
// 引用检查也调用原函数，没有在断言里重写正则。
// 每一个 expected 对象由明确合同数字组成，不从刚返回的值再加工得出。
// 测试没有保存 golden 截图作为逻辑预期，视觉正确性另由真实页面图确认。
// Node 退出码来自断言异常，不能只打印发现问题然后返回零。
// 最后输出 pure-source/no-inference，避免后续脚本整理把它归成模型运行证据。
// 该脚本不引用 ComfyUI 地址，网络被断开时仍应给出相同纯逻辑结论。
// 它不消耗用户 API 配额，也不需要本地 GPU 驱动。
// 不能据此评价真实服务器吞吐、解码耗时或六张大图内存占用。
// 测试使用真实模板数据，对文件内容漂移敏感，模板升级应重新核对预期。
// 如果未来尺寸契约改变，需要先更新明确需求，再改 golden，不能为迁就失败随意换数字。
// 旧格式兼容没有通过省略校验实现，而是缺省字段进入旧执行分支。
// 输入别名兼容也没有删除旧类型，image、video、audio 的原查找结果都有断言。
// 纯函数的不可变检查可发现多实例串值，实际 UI 的 store 隔离仍须独立回归。
// 参数对象不包含用户文件内容，脚本结果日志适合归档审查。
// 测试路径字符串只是协议样本，不应该被当作待清理的真实磁盘路径。
// 没有给产品函数添加测试专用 export，防止为验证破坏模块业务边界。
// 转译模块只存在当前进程，发布构建不会包含测试解析器。
// 用户工作区已有修改不作为本轮全部成果，注释与改动统计使用任务开始前快照。
// 本脚本新增全文属于本轮测试范围，不能借其他脚本高注释率抵扣遗漏。
// 报告里应区分此处三十二条纯断言与 Electron 的完整 UI 断言。
// 若 UI 后续失败，这个纯脚本仍可通过，不能因此把 UI 失败忽略。
// 若服务生成失败，这个纯脚本只能排除部分参数构建问题，不能证明服务可用。
// 若系统选择框无法实测，这个脚本没有任何替代人工操作的效力。
// 对于无法实际验证的模型质量和收费行为，需要保持未验证清单。
// 新输出尺寸按项目八像素合同，不能从图像编码器支持任意整数推断模型也支持。
// 不同约束来自不同层：编码可行、数据合法与模型可执行不是同一结论。
// 这三个区别在纯回归、HTTP夹具与真实推理证据中分别报告。
// 未来导出如消费同一尺寸函数，可复用合同，但本轮没有提前实现导出框架。
// 当前没有保存回放的假模型答案，生成样图由明确 fixture 提供。
// 最终通过日志只在所有三组完成后产生，中途失败不附一条误导性的 OK。
// 同一生产尺寸入口区分图片长边与视频短边，1080p不能被图片八像素规则改成1088。
// 横屏、竖屏、方形和四比三都给出独立数值预期，不使用被测函数计算期望。
// 旧视频没有输出配置时只读默认720p；读取不能偷偷补写新字段。
// 输出补丁返回独立对象，随后修改不能污染另一个节点的确认配置。
// 画质不会改media或card，纯参数不等同于重编码源文件。
// 本组没有启动解码或生成服务，性能、模型支持和实际视频质量不在证据范围。
// 图片原有尺寸矩阵继续执行，复用不能破坏先前1K/2K规则。
// 计数只包含本次明确成功的断言，不把历史测试数量累加为新覆盖率。
// 16/9的480p取854×480，覆盖理想853.333宽度需要偶数取整的场景。
// 720p的1280×720无取整误差，用作换算公式的精确正向基准。
// 1080p的1920×1080验证用户定义的1K，不允许返回1920×1088。
// 9/16的1080×1920证明同一档位能正确交换长短边。
// 方形720×720证明没有把视频固定成横屏16/9。
// 四比三1440×1080证明比例来自节点，而非根据“视频”类型硬编码宽度。
// 默认读取后检查原对象仍不带videoOutput，发现读取时偷偷补表的副作用。
// canvasSizePatch期望只包含videoOutput，不允许顺手改ratio、media或imageParameters。
// expected数组是独立写明的数学结果，没有调用另一个同源公式来产生预期。
// 参数模块的依赖仍由现有生产源码loader解析，不用测试替身替换尺寸工具。
// 图片旧矩阵在下一行接着执行，视频新增通过并不能掩盖图片档位回归。
// 整个函数没有异步等待或页面计时，不把算法耗时当成播放性能测量。
function videoDimensions() {
  for (const [ratio, side, expected] of [['16/9',480,[854,480]],['16/9',720,[1280,720]],['16/9',1080,[1920,1080]],['9/16',1080,[1080,1920]],['1/1',720,[720,720]],['4/3',1080,[1440,1080]]]) {
    assert.deepEqual(output.canvasPresetDimensions(ratio,side,true),{width:expected[0],height:expected[1]});checked++;
  }
  // 默认视频样本故意不带workflow和videoOutput，覆盖最早版本空视频节点的恢复边界。
  // 不带workflow时显示720p并不意味着选择了某个已安装MiniMax权重。
  // 函数返回默认像素后源对象必须仍原样，读取行为不能被当成一次工程编辑。
  // 断言videoOutput缺省能发现函数直接给data赋值的副作用。
  // 后续patch采用1440×1080，与默认1280×720不同，空补丁实现无法误通过。
  // 新补丁只含一个videoOutput对象，图片参数和媒体不能夹带进入输出。
  // 这里没有调用JSON清洗样本，undefined与省略的内存边界仍可独立观察。
  // 比例仍来自节点data，输出函数不向sample添加另一个默认ratio。
  // 即便未来source媒体不存在，纯参数计算也应可在离线工程中使用。
  // 这些检查的成功只能证明算法和不可变边界，不证明UI焦点或真实服务可用。
  const data={kind:'video',ratio:'16/9'};
  assert.deepEqual(output.canvasOutputDimensions(data),{width:1376,height:768});checked++;
  assert.equal(data.videoOutput,undefined);checked++;
  assert.deepEqual(output.canvasSizePatch(data,1440,1080),{videoOutput:{width:1440,height:1080}});checked++;
}
// 从图片创建两类目标都进入同一生产reducer，而不是单独测一个测试连接器。
// 源没有媒体也可先连配置，文件就绪与生成按钮的输入校验是下一层职责。
// 新图片必须采用编辑流；否则文生图零输入规则应当拒绝这条边。
// 每类创建都从同一干净初态出发，不能依赖前一例留下的选中和历史。
// 用序列化作品比较撤销结果，能发现只撤销了边却留下新卡的半事务。
// 选择、测量和dragging是原历史明确不恢复的界面态，不把它们错当作品字段。
// 重做则核对原ID，不能通过重新创建另一张同类卡来蒙混过关。
// 丢失源测试沿用同样动作，菜单打开后源被删属于真实可发生的竞态。
// 普通添加不带sourceId，仍应创建独立卡，不自动引用当前高亮图片。
// 独立初态使用生产INITIAL对象，其空历史、空剪贴板遵循真实会话约定。
// 源先经普通add建立，使测试不手工拼一个缺少必要字段的CanvasState。
// 源的创建本身已有一笔历史，目标创建应只在这个基线上增加一笔。
// source的prompt为空不会阻止搭图，因为生成任务校验发生在执行入口。
// 目标kind分别为image和video，两者必须使用同一个add动作协议。
// 目标坐标400,100只是确定性样本，测试不把它作为布局固定规范。
// 目标title与kind相同方便诊断，但连接判定只能使用稳定ID。
// createdAt固定为二用于纯reducer确定性，产品不应从该值推导连接身份。
// sourceId使用真实存在的source，正向基准不能全部被拒绝。
// 节点数量严格为二，发现重复生成或误复用原源节点。
// 边数量严格为一，发现临时连接与正式连接重复保存。
// 边source严格检查source，不允许连接方向被颠倒。
// 边target严格检查target，不允许连接到最近选中对象。
// image的workflow必须是anima-edit，这是接受一张上游图片的既有模板。
// video的workflow省略仍合法，表示沿用已有MiniMax默认而不是新造模板。
// 未设置视频模型权重不影响纯图结构校验，也不代表真实权重已可用。
// 撤销命令redo=false直接进入生产history分支，不调用测试自己的撤销器。
// 对比序列化结果排除原设计不恢复的临时selection、measured与dragging。
// 节点作品字段仍全量比较，不因为排除界面态而漏掉提示词或位置。
// 旧边数组同样比较，发现撤销目标时误删了其他边。
// 重做使用redo=true，必须恢复同一个目标身份与输入边。
// 重做比较整份序列化图，不只比较类型数量，防止用重建代替恢复。
// 丢失源反例只修改sourceId，其他字段与合法样本相同。
// 这样失败可归因于源身份，而不是不合法目标kind或坐标。
// 拒绝后节点数组引用保持原样，证明没有偷偷增加孤立空卡。
// 拒绝后边数组引用保持原样，证明没有留下悬空边。
// 拒绝后past引用保持原样，错误连接不能挤占用户的撤销历史。
// message允许变化，它是原业务错误提示，不属于可保存作品。
// 最后普通add不带sourceId，即使源图片选中也不能隐式自动连接。
// 普通add仍应增加一张卡，因此不能靠拒绝所有新增来通过空边断言。
// 其边数保持零，说明新能力没有劫持底栏独立创建语义。
// checked增加的是明确断言次数，不把同一个比较的多个字段重复当多项。
// 所有断言直接抛错返回非零，脚本不在catch中改成成功。
// 没有启动Electron，因此这里不证明菜单焦点、图标或客户区坐标。
// 也没有mock图算法，@xyflow/react仍由next包实际依赖解析。
// 仅语言读取按既有loader替换，错误文案key不会改变连接结论。
// 这组数据无文件路径，没有写盘或读取任何用户资产。
// 同源实例是否生成真实图片属于别的执行层，不从图边存在推断。
// 算法回归和正式自动鼠标回归互补，不能将两者都描述为人工操作。
function connectedCreation() {
  const {canvasReducer:reduce,INITIAL_CANVAS_STATE:initial}=load(path.resolve('apps/next/src/view/infinite-canvas/canvas-reducer.ts'));
  const {serializeCanvas}=load(path.resolve('apps/next/src/view/infinite-canvas/canvas-model.ts'));
  const source=reduce(initial,{type:'add',kind:'image',position:{x:0,y:0},title:'source',id:'source',createdAt:1});
  for (const kind of ['image','video']) {
    const action={type:'add',kind,position:{x:400,y:100},title:kind,id:'target',createdAt:2,sourceId:'source'};
    const result=reduce(source,action);
    assert.equal(result.nodes.length,2);
    assert.equal(result.edges.length,1);
    assert.equal(result.edges[0].source,'source');
    assert.equal(result.edges[0].target,'target');
    assert.equal(result.nodes[1].data.workflow,kind==='image'?'minimax-image-edit':undefined);
    const undone=reduce(result,{type:'history',redo:false});
    assert.deepEqual(serializeCanvas(undone),serializeCanvas(source));
    assert.deepEqual(undone.edges,source.edges);
    assert.deepEqual(serializeCanvas(reduce(undone,{type:'history',redo:true})),serializeCanvas(result));
    const rejected=reduce(source,{...action,sourceId:'deleted'});
    assert.equal(rejected.nodes,source.nodes);
    assert.equal(rejected.edges,source.edges);
    assert.equal(rejected.past,source.past);
    checked+=11;
  }
  const plain=reduce(source,{type:'add',kind:'image',position:{x:0,y:300},title:'plain',id:'plain',createdAt:3});
  assert.equal(plain.nodes.length,2);
    assert.equal(plain.edges.length,0);
  checked+=2;
}
function minimaxImageEdit() {
  const h3=load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const before=JSON.stringify(h3.getMinimaxImageEditTemplate());
  const value={...h3.MINIMAX_IMAGE_EDIT_DEFAULTS,instruction:'Only apply the user instruction',seed:'42'};
  // 第一张决定输出画幅；八张各有独立上传槽和缩放链，不能复制第一张冒充多图。
  for (const count of [1,2,8]) {
    const names=Array.from({length:count},(_,i)=>`uploaded/${i}.png`);
    const prompt=edit.buildAnimaEditPrompt(value,names[0],names.slice(1));
    assert.equal(prompt['9'].inputs.prompt,value.instruction);
    assert.equal(prompt['12'].inputs.noise_seed,42);
    assert.equal(prompt['20'],undefined);
    assert.equal(prompt['16'].class_type,'SaveImage');
    assert.deepEqual(prompt['27'].inputs.image,['6',0]);
    names.forEach((name,index)=>{
      const source=index?`h3-source-${index}`:'26',scale=index?`h3-scale-${index}`:'6';
      assert.equal(prompt[source].inputs.image,name);
      assert.deepEqual(prompt[scale].inputs.image,[source,0]);
      assert.deepEqual(prompt['9'].inputs[`images.image_${index+1}`],[scale,0]);
      checked+=3;
    });
    checked+=5;
  }
  checkEditOutput(value, 32, '6', ['two.png']);
  // 构图边界使用同一转换器：多图按上传次序映射，缺失引用不能进入正式请求。
  const referenced = { ...value, instruction: 'Combine @picture1 and @image2' };
  assert.equal(edit.buildAnimaEditPrompt(referenced, 'one.png', ['two.png'])['9'].inputs.prompt, 'Combine <Picture 1> and <Picture 2>');
  assert.throws(() => edit.buildAnimaEditPrompt(referenced, 'one.png'), /missing/);
  checked += 2;
  // 原模板和后续任务不受前一次输出修改影响；拒绝超额、坏种子和错位尺寸。
  assert.equal(JSON.stringify(h3.getMinimaxImageEditTemplate()),before);checked++;
  checkH3Invalid(value);
}

// 奇数尺寸进入采样前按模型对齐，输出节点必须连回精确的首图尺寸。
function checkEditOutput(value, step, scaleNode, references = []) {
  const outputSize = { width: 1001, height: 721 };
  const prompt = edit.buildAnimaEditPrompt({ ...value, outputSize }, 'one.png', references);
  assert.equal(prompt[scaleNode].inputs.width, Math.ceil(outputSize.width / step) * step);
  const outputNode = Object.values(prompt).find(node => ['SaveImage', 'PreviewImage'].includes(node.class_type));
  assert.deepEqual(outputNode.inputs.images, ['edit-output-size', 0]);
  const { width, height } = prompt['edit-output-size'].inputs;
  assert.deepEqual({ width, height }, outputSize);
  if (references.length) {
    assert.deepEqual(prompt['9'].inputs.width, ['27', 0]);
    assert.deepEqual(prompt['27'].inputs.image, ['6', 0]);
    assert.equal(prompt['h3-source-1'].inputs.image, references[0]);
    checked += 3;
  }
  checked += 3;
}

// 执行真实构建器，核对扩展链和服务端名称解析；不加载权重或运行 GPU。
function checkH3Loras() {
  const { MINIMAX_IMAGE_EDIT_DEFAULTS } = load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const value = { ...MINIMAX_IMAGE_EDIT_DEFAULTS, instruction: 'Edit', seed: '42', loras: [{ name: 'mINImAX/image/one.safetensors', strength: 0 }, { name: 'Minimax/image/two.safetensors', strength: -0.5 }] };
  const graph = edit.buildAnimaEditPrompt(value, 'one.png');
  assert.deepEqual(graph.ir_video_lora_0.inputs, { model: ['1', 0], lora_name: value.loras[0].name, strength_model: 0 });
  assert.deepEqual(graph.ir_video_lora_1.inputs.model, ['ir_video_lora_0', 0]);
  assert.equal(graph.ir_video_lora_1.inputs.strength_model, -0.5);
  assert.deepEqual(graph['18'].inputs.model, ['ir_video_lora_1', 0]);
  const cleared = edit.buildAnimaEditPrompt({ ...value, loras: [] }, 'one.png');
  assert.deepEqual(cleared['18'].inputs.model, ['1', 0]);
  for (const patch of [{ name: 'Anima/wrong.safetensors', strength: 1 }, { name: '../escape', strength: 1 }, { name: 'Minimax/bad', strength: Infinity }]) assert.throws(() => edit.buildAnimaEditPrompt({ ...value, loras: [patch] }, 'one.png'));
  checked += 8;
}

// 两端都读同一份工程样本，验证保存不丢扩展，并拒绝混入视频和错误权重。
function checkH3LoraStorage() {
  const { InfiniteCanvasDocumentSchema } = load(path.resolve('packages/shared/src/schemas/infinite-canvas.schema.ts'));
  const native = require('../apps/electron/src/main/modules/canvas/project-validation');
  const lora = { id: '0', name: 'Minimax/image/edit.safetensors', strength: -0.5 };
  const data = { kind: 'image', title: 'Edit', content: '', prompt: 'Edit', ratio: '1/1', workflow: 'minimax-image-edit', workflowLoras: { 'minimax-image-edit': [lora] } };
  const doc = { version: 1, name: 'Test', nodes: [{ id: 'one', position: { x: 0, y: 0 }, data }], edges: [] };
  const roundTrip = JSON.parse(JSON.stringify(doc));
  const model = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-model.ts'));
  assert.deepEqual(model.serializeCanvas(model.restoreCanvas(doc)).nodes[0].data.workflowLoras, data.workflowLoras);
  assert.deepEqual(InfiniteCanvasDocumentSchema.parse(roundTrip).nodes[0].data.workflowLoras, data.workflowLoras);
  assert.equal(native.document(roundTrip), true);
  for (const items of [[], undefined]) {
    const sample = structuredClone(doc); sample.nodes[0].data.workflowLoras['minimax-image-edit'] = items;
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(sample).success, true); assert.equal(native.document(sample), true);
  }
  for (const patch of [{ kind: 'video', workflow: 'minimax' }, { workflowLoras: { 'minimax-image-edit': [{ ...lora, strength: 6 }] } }, { workflowLoras: { 'minimax-image-edit': [lora, lora] } }]) {
    const sample = structuredClone(doc); Object.assign(sample.nodes[0].data, patch);
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(sample).success, false); assert.equal(native.document(sample), false);
  }
  checked += 13;
}

// 旧节点即使留有 x6，编辑仍为一次；普通文生图的批次保持原值。
function checkEditBatch() {
  const { canvasImageBatchSize } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-input-rules.ts'));
  for (const workflow of ['minimax-image-edit', 'anima-edit']) assert.equal(canvasImageBatchSize({ kind: 'image', workflow, batchSize: 6 }), 1);
  for (const mode of ['image', 'reference']) assert.equal(canvasImageBatchSize({ kind: 'image', remoteImage: {}, mode, batchSize: 4 }), 1);
  assert.equal(canvasImageBatchSize({ kind: 'image', workflow: 'sdxl', batchSize: 6 }), 6);
  assert.equal(canvasImageBatchSize({ kind: 'image', remoteImage: {}, mode: 'text', batchSize: 4 }), 4);
  checked += 6;
}

// Anima 保持单图，H3 不接受九张；不能只靠界面隐藏加图按钮。
function checkH3Invalid(value) {
  for (const patch of [{seed:'-1'},{seed:'9007199254740992'},{instruction:''},{outputSize:{width:1024,height:0}}]) {
    assert.throws(()=>edit.buildAnimaEditPrompt({...value,...patch},'one.png'));checked++;
  }
  assert.throws(()=>edit.buildAnimaEditPrompt(value,'one.png',Array(8).fill('extra.png')));checked++;
  assert.throws(()=>edit.buildAnimaEditPrompt({...edit.ANIMA_EDIT_DEFAULTS,instruction:'legacy'},'one.png',['two.png']));checked++;
}
// 直接操作生产 Zustand 草稿，验证两条模板和控制工具没有暗中共用参数。
// 不创建 DOM、文件或网络任务；这只是内存隔离证据。
function editDraftIsolation() {
  const store=load(path.resolve('apps/next/src/stores/use-anima-edit-store.ts')).useAnimaEditStore;
  const drafts=load(path.resolve('apps/next/src/stores/use-anima-control-store.ts'));
  const original=store.getState();
  assert.equal(original.editWorkflow,'minimax-image-edit');checked++;
  drafts.editDraftSetter('text','settings')(value=>({...value,instruction:'H3 draft'}));
  drafts.patchAnimaEditDraft('text',{seedMode:'random'});
  store.getState().patch({editWorkflow:'anima-edit'});
  assert.equal(drafts.getAnimaEditDraft('text').settings.instruction,'');checked++;
  assert.equal(drafts.getAnimaEditDraft('text').seedMode,'custom');checked++;
  drafts.editDraftSetter('text','settings')(value=>({...value,instruction:'Anima draft'}));
  store.getState().patch({editWorkflow:'minimax-image-edit'});
  assert.equal(drafts.getAnimaEditDraft('text').settings.instruction,'H3 draft');checked++;
  assert.equal(drafts.getAnimaEditDraft('text').seedMode,'random');checked++;
  assert.equal(drafts.getAnimaEditDraft('edge').settings.editWorkflow,undefined);checked++;
  // 还原同一进程中的夹具状态，不让后续纯算法断言继承本用例的改动。
  store.setState(original,true);
}
// 超分模板克隆、倍数和视频封装直接核对生产构建器；不把图结构测试当GPU推理。
function seedvr2() {
  const { buildSeedvr2Prompt, DEFAULT_UPSCALE } = load(path.resolve("apps/next/src/utils/comfy/seedvr2-workflow.ts"));
  assert.equal(DEFAULT_UPSCALE.enabled, false); checked++;
  for (const scale of [2, 3, 4]) {
    const value = { ...DEFAULT_UPSCALE, enabled: true, scale };
    const image = buildSeedvr2Prompt("inputs/image.png", "image", value);
    assert.equal(image["1"].inputs.image, "inputs/image.png"); checked++;
    assert.equal(image["66:57"].inputs["resize_type.multiplier"], scale); checked++;
    assert.equal(image["76"].class_type, "SaveImage"); checked++;
    const video = buildSeedvr2Prompt("inputs/video.mp4", "video", value);
    assert.equal(video["73"].inputs.file, "inputs/video.mp4"); checked++;
    assert.equal(video["107"], undefined); checked++;
    assert.equal(video["109"], undefined); checked++;
    assert.deepEqual(video["66:75"].inputs.fps, ["66:74", 2]); checked++;
    assert.equal(video["66:52"].inputs.unet_name, "SeedVR2\\seedvr2_7b_int8_convrot.safetensors"); checked++;
    assert.equal(video["76"].class_type, "SaveVideo"); checked++;
    assert.equal(video["1"], undefined); checked++;
    image["66:57"].inputs["resize_type.multiplier"] = 100;
    assert.equal(buildSeedvr2Prompt("another.png", "image", value)["66:57"].inputs["resize_type.multiplier"], scale); checked++;
  }
  for (const value of [{ ...DEFAULT_UPSCALE }, { ...DEFAULT_UPSCALE, enabled: true, scale: 0 }, { ...DEFAULT_UPSCALE, enabled: true, model: "unknown" }]) {
    assert.throws(() => buildSeedvr2Prompt("input.png", "image", value)); checked++;
  }
}
seedvr2();
/** 全批共用完整源，开始秒数递增；尾批不改1秒截长，不污染原模板。 */
function seedvr2WorkflowBatches() {
  const { buildSeedvr2Prompt, seedvr2VideoBatch, DEFAULT_UPSCALE } = load(path.resolve("apps/next/src/utils/comfy/seedvr2-workflow.ts"));
  const graph = buildSeedvr2Prompt("full-source.mp4", "video", { ...DEFAULT_UPSCALE, enabled: true });
  const original = JSON.stringify(graph);
  for (const [index, frames] of [10, 10, 3].entries()) {
    const batch = seedvr2VideoBatch(graph, index, frames);
    assert.equal(batch["73"].inputs.file, "full-source.mp4");
    assert.equal(batch["113:112"].inputs.fps, 10);
    assert.equal(batch["113:115"].inputs.start_time, index);
    assert.equal(batch["113:115"].inputs.duration, 1);
    assert.equal(batch["66:81"].inputs.switch, false);
    assert.deepEqual(batch["66:81"].inputs.on_false, ["113:115", 0]);
    assert.deepEqual(batch["66:75"].inputs.fps, ["66:74", 2]);
    assert.equal(!!batch.ir_tail_video, frames < 10);
    assert.equal(JSON.stringify(graph), original);
    checked += 9;
  }
  for (const [start, frames] of [[-1, 10], [0.1, 10], [0, 0], [0, 11]]) {
    assert.throws(() => seedvr2VideoBatch(graph, start, frames)); checked++;
  }
}
seedvr2WorkflowBatches();
// 两端接受相同的可调批帧数；非法设置不能进入真实工作流。
function seedvr2RequestContract() {
  const { VideoUpscaleRequestSchema } = load(path.resolve("packages/shared/src/schemas/video-upscale.schema.ts"));
  const { validateUpscale } = require("../apps/electron/src/main/modules/ffmpeg/upscale-validation");
  for (const fps of [1, 10, 20, 120, 0, 121, 1.5, "10", undefined]) {
    const value = { action: "prepare", requestId: "contract", inputPath: "D:/fixture/source.mp4", fps };
    assert.equal(VideoUpscaleRequestSchema.safeParse(value).success, typeof fps === "number" && Number.isInteger(fps) && fps >= 1 && fps <= 120);
    assert.equal(validateUpscale([value]) === null, typeof fps === "number" && Number.isInteger(fps) && fps >= 1 && fps <= 120);
    checked += 2;
  }
}
seedvr2RequestContract();
// 真实构图、工程序列化和两端校验共用样本；不把按钮文字当成参数接通证据。
function seedvr2ConfigRoundtrip() {
  const { InfiniteCanvasDocumentSchema } = load(path.resolve("packages/shared/src/schemas/infinite-canvas.schema.ts"));
  const { document: validate } = require("../apps/electron/src/main/modules/canvas/project-validation");
  const { resolveUpscaleSettings, buildSeedvr2Prompt, seedvr2VideoBatch } = load(path.resolve("apps/next/src/utils/comfy/seedvr2-workflow.ts"));
  for (const model of ["seedvr2_3b", "seedvr2_7b"]) for (const scale of [2, 3, 4, 5, 6, 7, 8]) {
    const upscale = { enabled: true, model, scale, batchFrames: 20, seedMode: "fixed", seed: "9007199254740991" };
    const doc = { version: 1, name: "settings", nodes: [{ id: "u", position: { x: 0, y: 0 }, data: { kind: "video", title: "u", prompt: "", content: "", ratio: "16/9", mode: "upscale", upscale } }], edges: [] };
    assert.equal(validate(doc), true);
    assert.deepEqual(InfiniteCanvasDocumentSchema.parse(JSON.parse(JSON.stringify(doc))).nodes[0].data.upscale, upscale);
    const graph = buildSeedvr2Prompt("full.mp4", "video", upscale);
    assert(graph["66:52"].inputs.unet_name.includes(model === "seedvr2_3b" ? "3b_int8" : "7b_int8"));
    assert.equal(graph["66:57"].inputs["resize_type.multiplier"], scale);
    assert.equal(graph["66:54"].inputs.seed, Number(upscale.seed));
    assert.equal(graph["113:112"].inputs.fps, 20);
    assert.equal(seedvr2VideoBatch(graph, 1, 3)["113:115"].inputs.duration, 1);
    checked += 7;
  }
  assert.equal(resolveUpscaleSettings({ enabled: false, model: "seedvr2_7b", scale: 2 }).batchFrames, 10); checked++;
}
seedvr2ConfigRoundtrip();

// 用可预测的随机源验证抽取次数；固定和共用模式不能悄悄每批重抽。
function seedvr2Seeds() {
  const { upscaleSeed, DEFAULT_UPSCALE } = load(path.resolve("apps/next/src/utils/comfy/seedvr2-workflow.ts"));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  let draws = 0;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: words => { words[0] = 0; words[1] = ++draws; return words; } } });
  try {
    const random = { ...DEFAULT_UPSCALE, seedMode: "random" }, shared = { ...DEFAULT_UPSCALE, seedMode: "shared" };
    assert.deepEqual([upscaleSeed(random), upscaleSeed(random), upscaleSeed(random)], [1, 2, 3]);
    const first = upscaleSeed(shared);
    assert.deepEqual([upscaleSeed(shared, first), upscaleSeed(shared, first)], [4, 4]);
    assert.equal(upscaleSeed({ ...DEFAULT_UPSCALE, seedMode: "fixed", seed: "123" }), 123);
    assert.equal(draws, 4); checked += 4;
  } finally { Object.defineProperty(globalThis, "crypto", descriptor); }
}
seedvr2Seeds();

function seedvr2InvalidSettings() {
  const { UpscaleSettingsSchema } = load(path.resolve("packages/shared/src/schemas/upscale-settings.schema.ts"));
  const { upscaleSettings } = require("../apps/electron/src/main/modules/canvas/upscale-validation");
  const base = { enabled: true, model: "seedvr2_7b", scale: 2 };
  for (const patch of [{ scale: 1 }, { scale: 9 }, { scale: 2.5 }, { model: "unknown" }, { batchFrames: 0 }, { batchFrames: 121 }, { batchFrames: 10.5 }, { seedMode: "unknown" }, { seed: "-1" }, { seed: "9007199254740992" }, { seed: "" }, { other: true }]) {
    assert.equal(UpscaleSettingsSchema.safeParse({ ...base, ...patch }).success, false);
    assert.equal(upscaleSettings({ ...base, ...patch }), false); checked += 2;
  }
}
seedvr2InvalidSettings();

// 从两种媒体拉出超分节点都应一步撤销；第二条输入不能绕过单源限制。
function seedvr2Connections() {
  const { canvasReducer: reduce, INITIAL_CANVAS_STATE: initial } = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-reducer.ts"));
  const { serializeCanvas, connectionError } = load(path.resolve("apps/next/src/view/infinite-canvas/canvas-model.ts"));
  for (const kind of ["image", "video"]) {
    const source = reduce(initial, { type: "add", kind, position: { x: 0, y: 0 }, title: "source", id: "source", createdAt: 1 });
    const result = reduce(source, { type: "add", kind: "upscale", position: { x: 400, y: 0 }, title: "upscale", id: "target", createdAt: 2, sourceId: "source" });
    assert.equal(result.nodes[1].data.kind, kind); checked++;
    assert.equal(result.nodes[1].data.mode, "upscale"); checked++;
    assert.deepEqual(result.nodes[1].data.upscale, { enabled: false, model: "seedvr2_7b", scale: 2 }); checked++;
    assert.equal(result.edges.length, 1); checked++;
    assert.deepEqual(serializeCanvas(reduce(result, { type: "history", redo: false })), serializeCanvas(source)); checked++;
    const another = { ...source.nodes[0], id: "second" };
    assert.equal(connectionError({ source: "second", target: "target" }, { nodes: [...result.nodes, another], edges: result.edges }), "type"); checked++;
  }
}
seedvr2Connections();
// 默认链、缺文件原因、显式清空分别验证，不能用界面出现名称代替实际构图。
function checkWorkflowDefaults() {
  const workflow = load(path.resolve('apps/next/src/utils/comfy/videoWorkflow.ts'));
  const loras = load(path.resolve('apps/next/src/utils/comfy/video-workflow-loras.ts'));
  for (const [id, count] of [['minimax', 2], ['minimax-reference', 1]]) {
    assert.equal(loras.getVideoLoras(workflow.getVideoWorkflowTemplate(id, true)).length, count);
    assert.equal(loras.getVideoLoras(workflow.getVideoWorkflowTemplate(id)).length, 0);
    checked += 2;
  }
  const h3 = load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const graph = h3.buildMinimaxImageEditPrompt({ ...h3.MINIMAX_IMAGE_EDIT_DEFAULTS, instruction: 'Edit', seed: '42' }, ['one.png']);
  assert.equal(loras.getVideoLoras(graph).length, 1); checked++;
  const { defaultLoraIssues } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-lora-validation.ts'));
  assert.deepEqual(defaultLoraIssues(['MiniMax/a.safetensors'], ['minimax\\a.safetensors']), []);
  assert.deepEqual(defaultLoraIssues(['MiniMax/a.safetensors'], ['other/a.safetensors']), []);
  assert.deepEqual(defaultLoraIssues(['MiniMax/a.safetensors'], []), ['canvas.defaultLoraMissing']);
  assert.deepEqual(defaultLoraIssues(['MiniMax/a.safetensors'], ['one/a.safetensors', 'two/a.safetensors']), ['canvas.defaultLoraAmbiguous']);
  checked += 4;
}

// 开关是持久化参数；关闭后构图保留 @ 原稿，开启时缺引用仍须拒绝。
function checkPromptConversion() {
  const h3 = load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const value = { ...h3.MINIMAX_IMAGE_EDIT_DEFAULTS, instruction: 'Use @picture1', seed: '42' };
  assert.equal(h3.buildMinimaxImageEditPrompt(value, ['one.png'])['9'].inputs.prompt, 'Use <Picture 1>');
  assert.equal(h3.buildMinimaxImageEditPrompt({ ...value, promptConversion: false }, ['one.png'])['9'].inputs.prompt, value.instruction);
  const { InfiniteCanvasDocumentSchema } = load(path.resolve('packages/shared/src/schemas/infinite-canvas.schema.ts'));
  const validate = require('../apps/electron/src/main/modules/canvas/project-validation');
  const { serializeCanvas } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-model.ts'));
  for (const promptConversion of [undefined, true, false, null, 'false', 0]) {
    const document = { version: 1, name: 'Conversion', nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'image', title: '', prompt: '', content: '', ratio: '1/1', promptConversion } }], edges: [] };
    const valid = promptConversion === undefined || typeof promptConversion === 'boolean';
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(document).success, valid);
    assert.equal(validate.document(document), valid);
    if (valid) assert.equal(serializeCanvas(document).nodes[0].data.promptConversion, promptConversion);
    if (valid) checkConversionDatabase(document, promptConversion);
    checked += valid ? 3 : 2;
  }
  checked += 2;
}

// 用真实 SQLite 反读可抓到保存白名单漏项；不以序列化对象自证落盘成功。
function checkConversionDatabase(document, expected) {
  const db = require('../apps/electron/src/main/storage/sqlite/connection').openConnection(':memory:');
  try {
    require('../apps/electron/src/main/storage/sqlite/canvas-store').saveCanvas(db, document);
    const restored = require('../apps/electron/src/main/storage/sqlite/canvas-load').loadCanvas(db);
    assert.equal(restored.nodes[0].data.promptConversion, expected); checked++;
  } finally { db.close(); }
}

// 自定义只替换类型前缀，编号和工作流输入不变；助手二次处理也不能再换号。
function checkCustomReferenceLabels() {
  const { normalizeVideoReferences } = load(path.resolve('apps/next/src/utils/comfy/video-reference-media.ts'));
  const media = ['image', 'image', 'video', 'audio'].map((kind, index) => ({ id: String(index), kind, name: kind, number: kind === 'image' ? index + 1 : 1 }));
  const labels = { image: 'XXX', video: 'Film', audio: 'Voice' };
  const expected = '<XXX 2> <Film 1> <Voice 1>';
  assert.equal(normalizeVideoReferences('@image2 @video1 @audio1', media, labels), expected);
  assert.equal(normalizeVideoReferences(expected, media, labels), expected);
  assert.equal(normalizeVideoReferences('<Picture 1> <Slot 1>', media, labels), '<XXX 1> <Voice 1>');
  assert.throws(() => normalizeVideoReferences('<XXX 3>', media, labels));
  const h3 = load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const value = { ...h3.MINIMAX_IMAGE_EDIT_DEFAULTS, instruction: 'Use @picture2', seed: '42', promptReferenceLabels: labels };
  const graph = h3.buildMinimaxImageEditPrompt(value, ['first.png', 'second.png']);
  assert.equal(graph['9'].inputs.prompt, 'Use <XXX 2>');
  assert.equal(graph['h3-source-1'].inputs.image, 'second.png');
  assert.equal(h3.buildMinimaxImageEditPrompt({ ...value, promptConversion: false }, ['first.png', 'second.png'])['9'].inputs.prompt, value.instruction);
  checked += 7;
}

// 双端校验和真实 SQLite 反读：旧工程兼容，非法前缀不能靠导入绕过界面检查。
function checkReferenceLabelStorage() {
  const { InfiniteCanvasDocumentSchema } = load(path.resolve('packages/shared/src/schemas/infinite-canvas.schema.ts'));
  const validate = require('../apps/electron/src/main/modules/canvas/project-validation');
  const { serializeCanvas } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-model.ts'));
  const samples = [undefined, {}, { image: 'XXX', audio: 'Voice' }, { image: undefined }, null, [], { image: '' }, { image: 'X'.repeat(33) }, { image: 'two words' }, { image: 'XXX\n' }, { image: '1XXX' }, { image: '<XXX 1>' }, { image: 'Audio' }, { image: 'Slot' }, { image: 'Same', video: 'same' }, { extra: 'XXX' }];
  for (const [index, promptReferenceLabels] of samples.entries()) {
    const document = { version: 1, name: 'Labels', nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { kind: 'image', title: '', prompt: '', content: '', ratio: '1/1', promptReferenceLabels } }], edges: [] };
    const valid = index < 4;
    assert.equal(InfiniteCanvasDocumentSchema.safeParse(document).success, valid);
    assert.equal(validate.document(document), valid);
    if (valid) assert.deepEqual(serializeCanvas(document).nodes[0].data.promptReferenceLabels, promptReferenceLabels);
    if (valid) checkReferenceLabelDatabase(document, promptReferenceLabels);
    checked += valid ? 3 : 2;
  }
}

function checkReferenceLabelDatabase(document, expected) {
  const db = require('../apps/electron/src/main/storage/sqlite/connection').openConnection(':memory:');
  try {
    require('../apps/electron/src/main/storage/sqlite/canvas-store').saveCanvas(db, document);
    const restored = require('../apps/electron/src/main/storage/sqlite/canvas-load').loadCanvas(db);
    assert.deepEqual(restored.nodes[0].data.promptReferenceLabels, expected ? JSON.parse(JSON.stringify(expected)) : expected); checked++;
  } finally { db.close(); }
}

// 非 MiniMax 默认没有 @ 菜单；明确自定义后只改发送快照，不污染原稿或图片顺序。
function checkCustomWorkflowPrompt() {
  const { canvasPromptReferencesEnabled, canvasCustomPromptNode } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-prompt-conversion.ts'));
  const node = { id: 'a', data: { kind: 'image', workflow: 'anima-edit', prompt: 'Use @picture1', inputImages: [{ name: 'one.png', path: 'C:/one.png' }] } };
  assert.equal(canvasPromptReferencesEnabled(node.data), false);
  const custom = { ...node, data: { ...node.data, promptReferenceLabels: { image: 'Ref' } } };
  assert.equal(canvasPromptReferencesEnabled(custom.data), true);
  assert.equal(canvasCustomPromptNode(custom, { nodes: [], edges: [] }).data.prompt, 'Use <Ref 1>');
  assert.equal(custom.data.prompt, 'Use @picture1');
  assert.equal(canvasCustomPromptNode({ ...custom, data: { ...custom.data, promptConversion: false } }, { nodes: [], edges: [] }).data.prompt, 'Use @picture1');
  checked += 5;
}

// 展示引用覆盖附件、音频、合成和导演台；枚举不会给未知文件登记删除权限。
function checkResourceReferences() {
  const { canvasResourceReferences, canvasResourceKey } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-resource-references.ts'));
  const media = path => ({ kind: 'image', path, name: 'same.png', size: 1 });
  const data = { media: media('C:/project/picture/a.png'), inputImages: [media('C:\\PROJECT\\picture\\A.png'), media('C:/project/picture/b.png')],
    audioParameters: { reference: { ...media('C:/project/audio/a.wav'), kind: 'audio' } }, composition: { assets: [{ media: media('C:/project/picture/c.png') }] },
    scene: { previewPath: 'C:/project/picture/d.png', panoramaUrl: 'C:/project/picture/e.png', characters: [], props: [{ imageUrl: 'C:/project/picture/f.png' }] } };
  const before = JSON.stringify(data), references = canvasResourceReferences({ nodes: [{ data }] });
  assert.equal(references.length, 7);
  assert.equal(new Set(references.map(item => canvasResourceKey(item.path))).size, 7);
  assert.equal(JSON.stringify(data), before);
  assert.equal(canvasResourceKey('https://example.com/A.png'), 'https://example.com/A.png');
  checked += 4;
}
// 节点存放顺序与接线顺序刻意不同，预览编号和实际工作流端口仍须一致。
function checkReferenceInputOrder() {
  const { canvasImageInputs } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-input-rules.ts'));
  const h3 = load(path.resolve('apps/next/src/utils/comfy/minimax-image-edit-workflow.ts'));
  const nodes = ['first', 'second'].map(id => ({ id, data: { kind: 'image', title: id, media: { path: `C:/${id}.png`, name: `${id}.png`, kind: 'image', size: 1 } } }));
  const edges = ['second', 'first'].map(source => ({ source, target: 'target' }));
  const sources = canvasImageInputs('target', { nodes, edges });
  const items = references.canvasReferenceMedia(sources, [{ path: 'C:/manual.png', name: 'manual.png' }]);
  assert.deepEqual(items.map(item => item.name), ['second', 'first', 'manual']);
  const graph = h3.buildMinimaxImageEditPrompt({ ...h3.MINIMAX_IMAGE_EDIT_DEFAULTS, instruction: 'Use @picture2', seed: '1' }, items.map(item => item.name));
  assert.equal(graph['9'].inputs.prompt, 'Use <Picture 2>');
  assert.equal(graph['26'].inputs.image, 'second');
  assert.equal(graph['h3-source-1'].inputs.image, 'first');
  checked += 4;
}
// 带连线和附件切换文生图，旧输入保留但不参与引用；切回编辑再恢复使用。
function checkTextOnlyWorkflow() {
  const { canvasReducer, INITIAL_CANVAS_STATE } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-reducer.ts'));
  const { canvasIsTextToImage } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-input-rules.ts'));
  const { connectionError } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-model.ts'));
  const { canvasPromptReferencesEnabled, canvasCustomPromptNode } = load(path.resolve('apps/next/src/view/infinite-canvas/canvas-prompt-conversion.ts'));
  const target = { id: 'target', position: { x: 0, y: 0 }, data: { kind: 'image', workflow: 'minimax-image-edit', prompt: 'Use @picture1', inputImages: [{ kind: 'image', path: 'C:/one.png', name: 'one.png', size: 1 }], promptReferenceLabels: { image: 'Ref' } } };
  const initial = { ...INITIAL_CANVAS_STATE, nodes: [target], edges: [{ id: 'edge', source: 'source', target: 'target' }] };
  for (const patch of [{ workflow: 'anima' }, { workflow: 'sdxl' }, { remoteImage: { provider: 'euzhi' }, mode: 'text' }]) {
    const state = canvasReducer(initial, { type: 'updateData', id: 'target', patch });
    assert.equal(canvasIsTextToImage(state.nodes[0].data), true);
    assert.equal(canvasPromptReferencesEnabled(state.nodes[0].data), false);
    assert.equal(canvasCustomPromptNode(state.nodes[0], state).data.prompt, target.data.prompt);
    assert.deepEqual(state.nodes[0].data.inputImages, target.data.inputImages);
    assert.deepEqual(state.edges, initial.edges);
    const connection = { source: 'source', target: 'target' }, document = { nodes: [{ id: 'source', data: { kind: 'image' } }, state.nodes[0]], edges: [] };
    assert.equal(connectionError(connection, document), 'input');
    assert.equal(connectionError(connection, document, true), null);
    assert.equal(connectionError(connection, { ...document, edges: [{ source: 'target', target: 'source' }] }, true), 'cycle');
    const restored = canvasReducer(state, { type: 'history', redo: false });
    assert.equal(canvasIsTextToImage(restored.nodes[0].data), false);
    assert.equal(canvasPromptReferencesEnabled(restored.nodes[0].data), true);
    checked += 10;
  }
}
checkTextOnlyWorkflow();
checkWorkflowDefaults();
checkPromptConversion();
checkCustomReferenceLabels();
checkCustomWorkflowPrompt();
checkReferenceLabelStorage();
checkResourceReferences();
checkReferenceInputOrder();
editDraftIsolation();
minimaxImageEdit();
checkH3Loras();
checkH3LoraStorage();
checkEditBatch();
connectedCreation();
videoDimensions();
dimensions(); workflow(); media(); renameIndexes();
console.log("CANVAS_GENERATION_PURE_OK", { checked, evidence: "pure-source/no-inference" });
