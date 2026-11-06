/**
 * 本地来源 JSON 的真实 IPC 与 UI 回归：版本隔离、异常文件、LoRA 普通/高级提示词追加及去重。
 * 本轮增加批量入口、页面卸载、停止后续项、仅重试未完成项及 logo 完成基准。
 * 脚本必须使用刚构建的静态导出，harness 在每条检查前核对源码指纹。
 * 主进程哈希、来源保存、图片解码和 preload 通道都使用真实产品实现。
 * Civitai 响应由本地夹具提供，不能据此宣称网站当前账号权限一定可用。
 * 三张批量卡片展开为四个版本，是独立于 UI 实际行数的固定期望值。
 * 缺失版本没有 JSON 时先运行只读检查，后续补全不能破坏这项初始前提。
 * 无 logo 的文字资料可能已经落盘，测试必须同时核实状态、统计与真实文件。
 * 停止与重新请求是两个阶段，不将运行中的文件强制标成尚未执行。
 * 结果在本地页卸载后仍保留，由 store 负责，不靠截图中暂存的 DOM。
 * 重试保持完整的原批次分母，不用本次发出的请求数替换原版本总数。
 * 成功项的查询计数保持不变，防止“重试未完成”实际上重新读取所有模型。
 * 宽窄截图只用于检查布局，不将模拟图片内容当成实际 Civitai 预览成果。
 * 新增 batch 分类改变排序，因此原 LoRA 组按明确 style 分类进入。
 * 所有测试模型位于脚本创建的临时目录，不扫描用户 F 盘模型目录。
 * 失败时由 harness 非零退出并保留夹具，避免错误输出后返回成功。
 */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
// 两个来源调用同一组行为回归，避免对同样的文字控件各写一套宽松断言。
// 生产组件不导入测试助手，只有浏览器剪贴板边界在测试期间被替换。
// helper 不启动新窗口，仍遵守一次只运行一个 Electron 冒烟的约束。
const { verifyTriggerCopies, verifyDescriptionReader } = require("./lib/model-detail-readers-smoke");
// 左右面板共用同一组真实 CSS 动画回归，不按本地与在线另写定时等待。
// CDP 只覆盖本脚本窗口的动效偏好，结束后会释放，不影响用户桌面应用。
// 两端尺寸和中间帧分别断言，避免仅有最终宽度就声称动画已通过。
const { verifyModelLibraryMotion } = require("./lib/model-library-motion-smoke");
const smoke = createSmokeHarness({ name: "local-model-metadata", timeoutMs: 100000 });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-metadata-"));
const root = path.join(directory, "models"), run = smoke.createRun();
const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
const document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { theme: "light", locale: "zh-CN", paths: { searchPath: root } } });
const waitTime = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(relative, data) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.alloc(32));
  if (data !== undefined) fs.writeFileSync(file + ".civitai.json", typeof data === "string" ? data : JSON.stringify(data));
  return file;
}
const metadata = { version: 1, source: "Civitai", sourceTitle: "Source A", creator: "Author A", modelPageUrl: "https://civitai.red/models/1?modelVersionId=101&token=secret-fixture", trainedWords: ["fixture style, shared word,,"], description: "<p>Model description</p><script>window.BAD_METADATA=true</script>" + "<p>Long model instructions, full text remains readable.</p>".repeat(30), versionName: "Version A", sha256: "a".repeat(64) };
const a = fixture("loras/Anima/style/Alpha/a.safetensors", metadata);
const b = fixture("loras/Anima/style/Beta/b.safetensors", { ...metadata, trainedWords: ["shared word", "second word"], sourceTitle: "Source B", description: "Short description" });
const missing = fixture("loras/Anima/style/Alpha/z-missing.safetensors");
// 父目录含一份模型、子目录也含一份，整目录操作仍会移动两份权重。
// 这个反例防止安全判断只统计当前分组的 versions.length。
// Parent 不匹配 Batch-，不会改变原有补全队列的四项基准。
// VAE 是另一种官方分类，证明导航没有只收录 Checkpoint 和 LoRA。
const parentFile = fixture("loras/Anima/style/Parent/main.safetensors");
fixture("loras/Anima/style/Parent/child/nested.safetensors");
fixture("vae/Audio/audio.safetensors");
// 批量夹具三个模型四个版本，名称可通过现有搜索栏单独筛选。
// 每类响应使用不同内容摘要，区分不存在与没有预览而非按名称伪造状态。
// 两个成功版本共用目录，覆盖第一个保存 logo 后第二个复用封面的行为。
// 初次扫描就包含它们，测试中不修改 renderer store 来添加模型。
// 主进程文件全在本轮临时根，不接触用户模型库。
// 批量未启动前这些文件没有来源 JSON，真实识别仍需逐个读取。
const batchGood = fixture("loras/Anima/batch/Batch-0 Good/one.safetensors"), batchSecond = fixture("loras/Anima/batch/Batch-0 Good/two.safetensors");
const batchMissing = fixture("loras/Anima/batch/Batch-1 Missing/one.safetensors"), batchNoLogo = fixture("loras/Anima/batch/Batch-2 NoLogo/one.safetensors");
fs.writeFileSync(batchGood, "batch good"); fs.writeFileSync(batchSecond, "batch second"); fs.writeFileSync(batchMissing, "batch missing"); fs.writeFileSync(batchNoLogo, "batch no logo");
// 统计摘要请求次数，证明重试未完成项不会重新哈希已完成版本。
// hold 只控制一次外部模拟请求，不给产品代码增加测试模式。
// 未找到与无预览开关在重试前切换，用于验证同一个队列可恢复。
// release 函数在主测试进程调用，不通过页面 JS 暴露任何文件能力。
// fixtureHash 来自真实文件字节，不以文件名作为远程匹配条件。
// 模型文本不包含密钥或用户路径，页面结果仅使用夹具显示名。
const fixtureHash = file => require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
// 此处读取的只是几十字节测试文本，不把小文件夹具读法用在产品权重哈希。
// 产品流式读取已由 verify-local-model-recovery 断言每块最多 1 MiB。
// fixtureHash 仅用于选择模拟服务分支及统计，不替代主进程真正算出的摘要。
const batchMissingHash = fixtureHash(batchMissing), batchNoLogoHash = fixtureHash(batchNoLogo), hashCalls = new Map();
let holdBatch = false, releaseBatch, allowMissing = false, allowPreview = false;
fixture("diffusion_models/Anima/base.safetensors");
// 视觉夹具单独放在 Checkpoints 的 Anima SDXL 目录，不参与 Batch- 补全范围。
// 十二份小权重只用于浏览，绝不提交给 ComfyUI 推理。
// 封面复制仓库已有样例图，截图来自真实扫描、图片读取和应用页面。
// 不把这些演示文件写入正式模型库，也不把预览图宣称为新生成成果。
// 目录各自只有一个权重，原资料读取不需要借用同目录其他版本。
// 批量 Good/Missing/NoLogo 均不复制封面，保留缺图补全的原测试前提。
// 来源和说明是明确的测试资料，不依赖 Civitai 在线状态或账号。
// 每次脚本运行使用全新 Temp 根，之前留下的 logo 不会污染本次完成统计。
// 十二卡片数量是固定独立期望，不能从生产索引反算以掩盖漏模型。
// 相同视觉图可以复用为不同夹具封面，但模型身份仍为各自完整文件路径。
// files 的字节内容很小，页面不能因此假设它是可用于推理的合法 safetensors。
// 此处只验证扩展名识别和目录层级；读取张量内容属于另一个业务边界。
// 图片是目录封面，扫描器不会把它的 .webp 当成新的模型版本。
// sidecar 也不会出现在模型卡片列表，因此固定十二份期望不受资料文件数量影响。
// 不向产品添加演示数据开关，生产环境没有这些测试路径或自动生成权重行为。
// 名称中带空格可以覆盖卡片截断和目录分段，不使用手工 URL 编码后的假文件名。
// 每个来源 sourceTitle 有自己的名称，选择其他卡片时不能沿用第一次的标题。
// baseModel 固定 SDXL 只是来源字段，不授权这些占位文件作为 SDXL 主模型使用。
// 部分展示名称带 VAE 只是 UI 测试文本，官方类型仍以 checkpoints 真实目录为准。
// 这样也能反证前端没有仅凭名称中的 VAE 字符隐藏或重新分类当前文件。
// 同一测试根还包含真的 vae 官方目录，两个概念在导航中不能混为一谈。
// 视觉模型与 Batch 资料采用不同目录，批量查询关键字不会意外匹配这些样本。
// 任何准备失败在 Electron 窗口启动前抛出，不会保存一张只有一半夹具的验收图。
// 不用网络下载封面意味着离线时也能复现几何，不把外网延迟混进布局失败。
function prepareVisualFixtures() {
  const names = ["Anima Base", "Anime Style Light", "Character Detail Very Long Folder Name", "Anima Office", "VAE Anime", "Style Illust", "Anima Landscape", "Cute Face", "Outdoor Scene", "Anime Animal", "Anima Fantasy", "VAE Detail"];
  const assets = ["anima-official-base", "anima-preview2", "hyphoria", "hassaku-xl", "dreambox", "anima-preview3"];
  for (const [index, name] of names.entries()) {
    // 十二份文件以递增字节数、递减修改日期和递减标记构成独立排序期望。
    // 不能使用按名称生成的相同大小数据，否则错误名称排序也可能通过。
    // 修改时间使用固定 UTC 日期，跨时区显示不影响实际时间戳比较。
    // 触发词来自真实本地 sidecar，测试不往 renderer 注入标签缓存。
    // 标记序号与名称顺序不同，能发现忽略触发词而继续按文件名排序的错误。
    // 这些小文件仍只是测试夹具，不向 ComfyUI 提交有效权重推理。
    const file = fixture(`checkpoints/Anima SDXL/${name}/${name}.safetensors`, {...metadata, baseModel: "SDXL", sourceTitle: name, trainedWords: index === 4 ? [] : [String.fromCharCode(90-index)]});
    fs.writeFileSync(file, Buffer.alloc(100 + index));
    fs.utimesSync(file, new Date(Date.UTC(2026, 0, 12-index)), new Date(Date.UTC(2026, 0, 12-index)));
    fs.copyFileSync(path.join(__dirname, "../apps/next/src/assets/icon/create/models", assets[index % assets.length] + ".webp"), path.join(path.dirname(file), "logo.webp"));
  }
}
prepareVisualFixtures();
// 原生图片 handler 只读取本脚本根内的 WebP 与补全 PNG，不获得任意文件读取能力。
// 真实产品依旧使用生产图片通道；此处替身仅隔离测试权限与外部文件。
// 标题栏能力参数来自生产窗口配置，不能手工往 DOM 塞一个假的 header。
// 系统按钮 handler 同样沿用生产注册，门牌回归覆盖实际 AppShell 调用方。
// 首帧主题设为 light，后续 dark 通过原 nativeTheme 链路切换。
// 测试中不会为截图添加 .dark 类或把 JSX 复制成另一张静态网页。
// 侧栏和窗口控件均保留，截图不会裁掉不符合参考的外壳部分。
// 所有图片读取和渲染完成后才保存，不能拿缺图闪动帧冒充最终布局。
nativeTheme.themeSource = "light";
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: document, filePath: "", isNew: false });
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
// SHA-256 补全使用真实主进程链路，只有外部服务响应被固定夹具替换。
// 当前模型夹具内容是 32 字节零值，远程 files 返回其真实摘要。
// 文件名故意不同，避免只检查名称也能错误通过冒烟。
// 父模型使用独立响应，确保版本 ID 与作者说明的关联路径也被执行。
// 预览返回真实本地 PNG 字节，不依赖外部图片下载或网站可用性。
// 注入发生在 handler 模块加载前；生产版本没有测试环境开关。
// 这项回归只证明 UI/IPC 与本地持久化，不宣称模拟服务等同真实 Civitai。
// 实际网络可用性单独使用用户给出的摘要进行只读核实。
// 测试仍经过生产网络适配、无覆盖 JSON writer 和 PNG 保存器。
// 无 logo 时只有 JSON 不得成功，带 logo 的响应才符合新的完成标准。
// 404 在两个固定来源均出现，确保会返回 notFound 而非网络失败。
// 预览 URL 采用生产允许的主机，但字节由此夹具直接提供。
// hold 等待点用于精确操作切页和停止，不依赖猜测磁盘读取耗时。
// Response 的 files[].hashes 回显实际读取摘要，校验机制本身没有替换。
require("../apps/electron/src/main/modules/models/downloads/model-download-network").downloadFetch = async url => {
  // PNG 字节由 nativeImage 实际编码，下载保存后还需经过生产解码检查。
  // 这里不创建假的 logo 文件来绕过完成标准，文件由 saveLogo 真实提交。
  // 所有地址虽采用允许的主机名，模型识别请求仍在本地 mock 中返回。
  if (url.includes("preview.png")) return new Response(require("electron").nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG());
  if (!url.includes("by-hash")) return Response.json({ id: 42, name: "Recovered source", type: "LORA", creator: { username: "Recovered author" }, description: "Recovered description" });
  // hashCalls 只统计模型身份查询，不把预览和父模型请求误算为重复哈希。
  // 第一项首次成功后计数不应再增加，覆盖“重试全部”而非“重试未完成”的错误。
  // 404 两来源请求可以增加两次，这是回退行为，不能据此误判重复任务。
  const hash = url.split("/").pop(); hashCalls.set(hash, (hashCalls.get(hash) || 0) + 1);
  if (holdBatch) { holdBatch = false; await new Promise(resolve => { releaseBatch = resolve; }); }
  // hold 在当前一次请求进入时立即清零，后续父模型和其他版本不会再等待。
  // 停止检查因此能明确指定运行中的一项，避免时间差导致第一项已经完成。
  // 放行由主测试函数完成，网页不能通过这条 mock 控制主进程文件读写。
  if (hash === batchMissingHash && !allowMissing) return new Response("", { status: 404 });
  // noPreview 的 API 响应仍然合法，files 哈希、版本和父模型都准确匹配。
  // 唯一差别是图片数组为空，迫使测试通过 logo 标准发现它未完成。
  // 再次允许图片后，相同文件应补图而非被已有 JSON 提前跳过。
  return Response.json({ id: 43, modelId: 42, name: "Recovered version", baseModel: "Anima", trainedWords: ["recovered trigger"], files: [{ name: "different-name.safetensors", hashes: { SHA256: hash } }], images: hash === batchNoLogoHash && !allowPreview ? [] : [{ type: "image", nsfwLevel: 1, url: "https://image.civitai.com/preview.png" }] });
};
require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
for (const [channel, handler] of [
  [C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false })], [C.USER_DATA_WRITE, () => undefined],
  [C.USER_DATA_GET_DEFAULT_PATH, () => ""], [C.PATHS_GET_DEFAULT_OUTPUT, () => directory], [C.CHANGELOG_READ, () => ""],
  [C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } })],
  [C.MODELS_DOWNLOAD_LIST, () => []], [C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: [], diffusionModels: [], clips: [], vaes: [] })],
  // registerHandle 的业务回调第一参是 IPC event，文件路径位于第二参。
  // 若把第一参误认成路径，所有图片都回落占位；这正是一次夹具失败的已修正前提。
  // 校验根目录边界带路径分隔符，models-old 不能仅因共同前缀就被允许读取。
  // 后缀限制只接受本组封面类型，不给截图脚本引入任意文本或密钥读取能力。
  // 原生 Buffer 到 base64 的转换保留真实图片字节，没有用一张 CSS 渐变冒充资源。
  // 读取失败由 registerHandle 转成 IpcResult，页面已有图片 hook 会显示缺图回退。
  // empty 图片列表和本地封面读取是两种请求，不能让生成结果夹具混进模型封面。
  // 生成历史返回空数组是为了隔离全局外壳初始化，不表示本地模型扫描没有文件。
  // 这个 handler 不计算模型哈希，哈希仍由前面注册的生产恢复通道处理。
  // 图片副本全部位于本轮 Temp 子树，脚本不会尝试读取用户下载目录的封面。
  // 返回 data URL 符合原 readLocalImage 契约，不能再次包装一层自定义 result 对象。
  // 成功包装由 registerHandle 统一完成，避免 renderer 解包时把图片误当错误。
  // 此替身只存在当前 Electron 测试进程，不改变项目主进程模块的正式 handler。
  // 图片可解码条件在 wait 中检查，文件存在并不等同于封面在浏览器中显示成功。
  // PNG 是生产补全器真正落盘的格式，原先只放行 WebP 会漏测补图后的展示。
  // 类型从已允许的后缀推导，不能把 PNG 字节标成 WebP 来依赖浏览器容错。
  // 根目录授权保持不变，不为支持第二种图片而扩大文件读取范围。
  // Base64 只负责测试通道传输，封面本身仍由真实保存器写出。
  [C.FILES_LIST_GENERATED_IMAGES, () => []], [C.FILES_LIST_OUTPUT_FOLDERS, () => []], [C.FILES_READ_IMAGE_DATA_URL, (_event, file) => typeof file === "string" && file.startsWith(root + path.sep) && /\.(webp|png)$/i.test(file) ? `data:image/${path.extname(file).slice(1).toLowerCase()};base64,${fs.readFileSync(file).toString("base64")}` : null],
]) registerHandle(channel, handler);
async function wait(expression) {
  for (let i = 0; i < 180; i++) { if (await run(`Boolean(${expression})`)) return; await waitTime(50); }
  throw new Error("Condition timeout: " + expression + " · " + await run("document.body.innerText.slice(-1800)"));
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await waitTime(80); }
async function nativeRead(paths) { return run(`window.electronAPI.readLocalModelMetadata(${JSON.stringify(paths)})`); }
async function verifyNative() {
  const malformed = fixture("tests/bad.safetensors", "{bad");
  const future = fixture("tests/future.safetensors", { version: 999 });
  const huge = fixture("tests/huge.safetensors", " ".repeat(2 * 1024 * 1024 + 1));
  const result = await nativeRead([a, missing, malformed, future, huge, path.join(directory, "outside.safetensors")]);
  smoke.check("real IPC distinguishes ready, missing, invalid, unsupported, oversized and outside paths", result.success && result.data.map(item => item.status).join(",") === "ready,missing,invalid,unsupported,invalid,unavailable");
  smoke.check("source URLs strip credentials before crossing IPC", result.data[0].metadata.modelPageUrl === "https://civitai.red/models/1?modelVersionId=101");
  for (const input of [[], [1], Array(201).fill(a)]) {
    const bad = await nativeRead(input); smoke.check("IPC rejects invalid batch arguments", !bad.success && bad.code === "INVALID_ARGUMENT");
  }
  const absent = (await nativeRead([missing])).data[0];
  smoke.check("missing version never borrows sibling JSON", absent.status === "missing" && absent.metadata === null);
  const linked = fixture("tests/link.safetensors");
  try {
    fs.symlinkSync(a + ".civitai.json", linked + ".civitai.json");
    smoke.check("linked sidecars cannot read another model's JSON", (await nativeRead([linked])).data[0].status === "invalid");
  } catch (error) { if (error.code === "EPERM") console.log("SKIP symlink fixture: OS requires symlink privilege"); else throw error; }
}
async function verifyDetails(win) {
  await win.loadURL("app://app/tools/models/civitai");
  await wait("document.querySelector('[data-model-library=local]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-model-library=local]");
  await verifyFolderNavigation(win);
  await openFile(a);
  await wait("document.querySelector('[data-local-model-metadata]')?.dataset.status==='ready'");
  smoke.check("local details show source, triggers and safe plain descriptions", await run("(()=>{const el=document.querySelector('[data-local-model-metadata]');return ['Civitai','Source A','Author A','fixture style','Model description'].every(text=>el.textContent.includes(text))&&!el.querySelector('script')&&!window.BAD_METADATA})()"));
  // 本地与线上注入同样的行为回归，原始 JSON 中一个数组项含两个逗号词。
  // 长说明来自真正落盘的 sidecar，不能往 DOM 临时塞文字制造溢出。
  // 测试读取实际按钮的复制内容，不修改用户系统剪贴板。
  // Alpha 原始触发词带尾逗号，创建页后续仍需得到与旧版相同的独立短语。
  // Beta 保留两项数组格式，验证共享组件同时接受已拆分和未拆分的资料。
  // 两个模型都有自己的 sidecar，不能让详情借用同目录的另一份元数据。
  // 本段不会点击补全按钮，网络请求计数不能因为浏览说明而增长。
  // Alpha 的恶意 script 仍由原有净化断言检查，折叠不能绕过安全显示规则。
  // 短说明切换后等待 Source B，排除旧 Alpha DOM 尚未卸载的竞态。
  // 回到 Alpha 目录后 missing 版本仍应无资料，不能因共享阅读器保留旧内容。
  const readers = { run, click, wait, check: (label, ok) => smoke.check(label, ok) };
  await verifyTriggerCopies(readers, ["fixture style", "shared word"]);
  await verifyDescriptionReader(readers);
  // 只给截图的离屏合成留时间，不以延时替代真实溢出与滚动断言。
  // 画面仍包含来源、触发词和说明，不能只截一块脱离应用的自制样例。
  // 当前夹具没有 logo，缺图状态应保留为真实占位，而不是补上伪造封面。
  await waitTime(200);
  fs.writeFileSync(path.join(directory, "local-description-expanded.png"), (await win.webContents.capturePage()).toPNG());
  // 从展开的长说明切到短说明，不能保留上一模型的展开按钮和滚动状态。
  // 两模型位于不同目录，切换真实侧栏后打开模型，不绕过当前目录筛选。
  // 回到 Alpha 后继续原有缺失资料回归，避免改变后续测试的目录前提。
  await click('[data-model-tree-folder="Anima/style"]');
  await openFile(b);
  await wait("document.querySelector('[data-local-metadata-content]')?.textContent.includes('Source B')");
  smoke.check("short description resets the previous expanded state", await run("!document.querySelector('[data-model-description-toggle]')&&document.querySelector('[data-model-description]')?.dataset.expanded==='false'"));
  // Beta 的两个原始数组项也应保留两组，不以每组只有一词就偷偷合并。
  // 这是与在线换行不同的数据来源，验证同一组件同时处理两种分组形式。
  // 页面当前确已读到 Source B，上一个模型的旧 DOM 不会满足这条期望。
  // 每组独立按钮继续使用真实原词，不用序号或虚构标题替代触发词。
  // 未改变生成用的拆分器，后续普通和高级 LoRA 追加仍需通过旧回归。
  // 行数与内容一起检查，避免仅增加一个空包装盒就伪装成两组。
  smoke.check("local source array entries preserve separate trigger groups", await run("JSON.stringify([...document.querySelectorAll('[data-model-trigger-group]')].map(el=>el.textContent))==='[\"shared word\",\"second word\"]'"));
  await click('[data-model-tree-folder="Anima/style/Alpha"]');
  await openFile(missing);
  await wait("document.querySelector('[data-local-model-metadata]')?.dataset.status==='missing'");
  smoke.check("switching to version without JSON clears old source details", await run("!document.querySelector('[data-local-metadata-content]')&&!document.querySelector('[data-local-trigger-words]')"));
}
// 文件身份取完整路径，两个目录同名文件不能误打开另一份来源。
// 不直接写 React store，实际点击单模型卡片验证浏览层与详情接线。
// JSON 字符串只嵌入页面表达式，不传给 shell 解释。
// 等待卡片先挂载，目录导航失败时不会把 undefined.click 当成产品错误。
async function openFile(file) {
  const selector = `[data-local-model-file=${JSON.stringify(file)}]`;
  await wait(`document.querySelector(${JSON.stringify(selector)})`);
  await click(selector);
}
// 目录树是唯一文件夹入口，中间始终只显示真实模型卡片。
// 第一层全部应展示二十三个文件：原功能夹具十一份加视觉夹具十二份。
// LoRA 中有九个文件，进入 Anima 仍有九份，进入 style 后有五份。
// 这些固定数由临时文件设计得到，不从组件过滤器复制计算。
// Alpha 的两份权重是两张独立卡片，文件后缀和完整身份都必须保留。
// 查询目录只改变展示范围，不移动或删除临时磁盘文件。
// 同目录单文件卡片不能误调用整目录移动，禁用保护沿原契约检查。
// 多选后仍能清除或退出，安全保护不能把用户锁在无法恢复的 UI 中。
// 切换目录不得触发磁盘再次扫描，也不重启已有的资料补全任务。
// 分支箭头只控制开合，折叠树不能暗中改变中心范围。
// 该测试使用临时根，没有接触用户的真实模型、目录或账号。
// 所有点击走原生按钮事件，不直接修改 React 状态以制造正确画面。
async function verifyFolderNavigation(win) {
  // 分类必须由真实扫描索引产生，若 store 还没水合则等待，不抢先点一个不存在的入口。
  // 这里等待的是稳定 data 标记，不依赖默认语言翻译或第几个按钮。
  // 全库二十三卡片的断言不使用页面计数文本，避免数量文本和列表一起算错仍通过。
  // 没有文件夹网格的条件是独立反证，三列 CSS 正确但仍插入文件夹也应失败。
  await wait("document.querySelector('[data-local-model-root=loras]')");
  smoke.check("center starts with models only and no folder cards", await run("document.querySelectorAll('[data-local-model-card]').length===23&&!document.querySelector('[data-local-folder-grid]')"));
  // 官方分类从全部切换到 loras，另一个 checkpoints 中也有 Anima 名称但不能带入。
  // 先选择 Anima 父目录，那里没有直属权重，仍应该显示全部后代九份。
  // 因而旧版“只显示直属文件”的实现一定不能通过这个固定断言。
  // 接下来再进入 style，排除同为 Anima 后代的 batch 四份，形成范围交集的验证。
  await click("[data-local-model-root=loras]");
  await click("[data-model-tree-folder=Anima]");
  smoke.check("parent folder recursively includes every descendant model", await run("document.querySelectorAll('[data-local-model-card]').length===9"));
  await click('[data-model-tree-folder="Anima/style"]');
  smoke.check("deeper scope excludes sibling folders", await run("document.querySelectorAll('[data-local-model-card]').length===5"));
  await click('[data-model-tree-folder="Anima/style/Alpha"]');
  smoke.check("leaf folder keeps each model file and extension", await run("document.querySelectorAll('[data-local-model-card]').length===2&&document.querySelector('[data-local-model-grid]').textContent.includes('z-missing.safetensors')"));
  await openFile(a);
  smoke.check("atomic file cannot invoke directory-wide move on siblings", await run("document.querySelector('[data-local-change-category]').disabled"));
  // 第一击只进入明确的删除多选模式，此时磁盘上没有任何删除动作。
  // 第二击 a.safetensors 是选择具体文件，不应该变成立即打开确认或执行删除。
  // Alpha 的两个权重共目录，旧目录管理不能只删掉其中之一，因此继续按钮要禁用。
  // 同时核对清空按钮可用，避免安全限制正确但用户无法解除已选目标。
  // 退出后恢复浏览，后续来源测试才能用同一张卡打开真实详情。
  // 该目录首个缺图卡片也必须沿用多选动作，不能依赖预览图片是否读到。
  // 这里只进入删除选择模式，不确认删除，临时权重应继续留在磁盘。
  // 封面点击和下方清空可用性一起证明选中进入了真实批量状态。
  await click("[data-local-batch-delete]"); await click('[data-local-model-grid] button[class*=cardImagePreview]');
  smoke.check("unsafe delete stays disabled while selection can be cleared", await run("document.querySelector('[data-local-batch-delete]').disabled&&!document.querySelector('[data-local-select-clear]').disabled"));
  await click("[data-local-select-exit]");
  // previousElementSibling 是该目录的展开箭头，主目录按钮另有 data 标记。
  // 不靠整个 li 的冒泡事件展开，才能把“开合”与“进入目录”明确分开。
  // 折叠后后代节点应卸载，但中心两张 Alpha 文件不能跟着隐藏或回到全库。
  // 重新展开后检查 aria-current，以完整相对路径判定选中，不只比较 Alpha 显示名。
  // 同名叶目录可以存在于不同根中，这里不能把纯名称当作唯一测试身份。
  await run("document.querySelector('[data-model-tree-folder=Anima]').previousElementSibling.click()");
  smoke.check("collapsing tree leaves recursive model scope unchanged", await run("!document.querySelector('[data-model-tree-folder=\"Anima/style\"]')&&document.querySelectorAll('[data-local-model-card]').length===2"));
  await run("document.querySelector('[data-model-tree-folder=Anima]').previousElementSibling.click()");
  smoke.check("reopening tree preserves full current directory", await run("document.querySelector('[data-model-tree-folder=\"Anima/style/Alpha\"]').getAttribute('aria-current')==='page'"));
  await verifyParentFolder();
  await verifyLibraryVisuals(win);
}
// 父目录有一份直属模型和一份子目录模型，必须递归显示两份。
// 这个样本能发现只数 versions 长度便允许整目录操作的错误保护。
// 嵌套目录由左侧树继续进入，中心不会出现文件夹卡片冒充模型。
// 检查后回到 Alpha，后续缺失 sidecar 和单文件补全的原前提保持不变。
// 当前分组只有一版本仍不能据此判定目录安全，因为操作会带走后代。
// 不执行实际移动或删除，业务写入契约由原主进程独立回归覆盖。
// 路径边界不是简单 contains，style 与 style-old 等相似目录不能混入。
// 文件卡片身份必须为完整权重路径，同名 nested 也不能覆盖 main。
async function verifyParentFolder() {
  await click('[data-model-tree-folder="Anima/style/Parent"]');
  await openFile(parentFile);
  smoke.check("parent includes nested model and blocks directory-wide actions", await run("document.querySelectorAll('[data-local-model-card]').length===2&&document.querySelector('[data-local-change-category]').disabled"));
  await click('[data-model-tree-folder="Anima/style/Alpha"]');
}
// 实际运行图同时覆盖三面板几何、目录门牌、详情底部四个按钮和主题切换。
// 选择视觉夹具目录后必须有十二个模型，不是渲染十二张手写的演示卡片。
// 各个封面由原 ResourceCoverImage 经现有本地图片缓存加载。
// 等待 complete 和 naturalWidth，防止截图保存图片尚未就绪的中间帧。
// 空间计算读取真实 DOM，能发现面板嵌套在中心而不是并列的大卡片。
// 左右两栏底边须接近一致，说明管理区没有把模型区撑出整个展示范围。
// 管理按钮位于右侧详情面板内，不能继续作为中心顶部横条显示。
// 两行工具栏必须位于中心头部，按钮存在并不能证明区域位置正确。
// 标题栏不得保留宣传语，目录门牌来自实际选中的 Anima SDXL 路径。
// 深色通过 nativeTheme 与用户文档设置链路切换，不对截图后期染色。
// 恢复 light 后继续原业务用例，主题变化不能重置已选目录。
// 关闭公告使用它的真实按钮，不删除 DOM 或遮盖截图中不想看见的部分。
// 不对截图做裁切，保留完整 AppShell 以便人工核对高度与全局导航。
// 检查密度切换前后卡片数不变，可以发现错误地为每种视图维护第二套结果。
// 列表切换只改变布局，不能导致当前详情重新选中另一份同名模型。
// 全部测试结束后继续按原逻辑进入 LoRA，视觉样本不会参与补全队列。
// 排序测试始终通过页面上的菜单按钮，不直接调用比较函数取得自洽结果。
// 大小以真实写入的 100–111 字节为基准，日期和标记与该顺序相反。
// 各次选择后保持十二份文件，并保留当前详情，排序不能改变文件身份。
// 完成后恢复名称递增，后续深浅主题图和原批量范围不受此测试干扰。
// 查询请求数来自主进程模拟网络边界，不依赖 UI 声称自己没有匹配。
// 菜单键盘用实际焦点发送事件，避免只检查 aria 属性而没接通交互。
// 每次先打开，再选明确的字段或方向，测试和用户经过同一回调。
// 等待 header 的读取状态结束，防止在标记异步加载前误测名称回退结果。
// 其他三个字段没有额外 I/O，所以该等待应立即结束而不是固定延迟。
// 菜单选项的 data 标记来自真实参数，不依赖可能改变的中文文字定位。
// 本函数不创建文件或修改 mtime，夹具属性在窗口打开前已经冻结。
// 缺少菜单按钮时 click 会抛错，不能默默跳过某个未实现的排序项目。
async function chooseModelSort(attribute, value) {
  await click("[data-local-sort-trigger]");
  await click(`[data-local-sort-${attribute}=${value}]`);
  await wait("document.querySelector('[data-local-sort-status]')?.dataset.localSortStatus==='ready'");
}
// 初始选择的 Anima Base 有真实 sidecar，却不应因打开详情而启动哈希。
// 比对首尾文件全名，避免仅检查数组非空就误报排序已经生效。
// 目录名称与文件名都来自夹具，不能从生产比较器反推期望顺序。
// 外部点击使用 pointerdown，与公共菜单实际监听的事件保持一致。
// Escape 和上下键在 Portal 内响应，说明菜单没被搜索盒的 overflow 裁掉。
// 真实截图包含完整应用外壳和菜单，不用另画一张 HTML 排序示例。
async function verifySorting(win) {
  // 计数快照在选择任何排序前取值，后续比较可捕获排序错误触发的网络调用。
  // 本地 JSON IPC 不计入此计数，允许真正需要的标记读取按预期发生。
  // 点击已存在资料的详情也纳入这段观察，排除挂载自动匹配的回归。
  // 当前有十二份小模型，所有字段都完整，因此首尾预期不依赖缺失回退。
  const before = [...hashCalls.values()].reduce((sum, count) => sum + count, 0);
  // 之前只是访问目录和详情，理应完全没有摘要查询，不能仅比较本函数增量。
  // 若挂载时自动匹配已经结束，只有这个零基准才能发现提前发出的请求。
  // 观察站点查询数不限制正常封面加载或现有本地来源读取。
  smoke.check("browsing and selecting never auto-match models", before === 0);
  const first = "document.querySelector('[data-local-model-card]').dataset.localModelFile";
  await chooseModelSort("field", "size");
  // Anima Base 写入最小的 100 字节；名称相近不能作为通过的唯一依据。
  // 下一条方向反转检查与此配对，防止实现只对默认名称排序碰巧正确。
  // 用真实文件路径后缀确认身份，图片或目录标题不能替代模型文件。
  // 此处只检查 UI 排序，不将小文件当成可加载的 safetensors 证明。
  smoke.check("size ascending uses actual file bytes", await run(`${first}.endsWith('Anima Base.safetensors')`));
  await chooseModelSort("direction", "desc");
  // 最大文件固定为 VAE Detail 的 111 字节，名称不是按测试现算出来。
  // 上下两个方向都通过，才能说明方向组确实与字段组接通。
  // 若只切换按钮上的勾号而不改变列表，这条检查会直接失败。
  // stat 来自正式扫描器，不在页面 store 填入模拟大小以绕过 IPC。
  smoke.check("size descending reverses numeric order", await run(`${first}.endsWith('VAE Detail.safetensors')`));
  await chooseModelSort("field", "date");
  // 日期序列与体积序列反向，因此改字段但保留递减应回到 Anima Base。
  // 这同时反证新字段选择没有偷偷把方向重置成递增。
  // 字符串格式化日期也可能在某些语言下排序错误，所以夹具使用固定时间戳。
  // 该检查不依赖系统本地时区显示，因为比较对象是扫描返回的毫秒。
  smoke.check("field selection preserves descending direction and uses file dates", await run(`${first}.endsWith('Anima Base.safetensors')`));
  await chooseModelSort("direction", "asc");
  // 最早修改文件固定为 VAE Detail，日期由测试实际写进文件系统。
  // 若实现误读目录日期，各文件夹创建时间几乎相同，无法满足此预期。
  // 网页元数据没有提供这里的日期，因此不能从来源发布时间凑出结果。
  // 文件排序应只重排卡片，点击的详情仍保留到后面的独立断言。
  smoke.check("date ascending uses modification timestamps", await run(`${first}.endsWith('VAE Detail.safetensors')`));
  await chooseModelSort("field", "mark");
  // 标签 O 到 Z 是旁车真实触发词，升序第一项应与文件大小升序相反。
  // 顺序和外部请求计数同时满足，才能说明既读对标记又没有启动自动补全。
  // 缺图加载不会发 by-hash 请求，所以封面异步解码不影响这个计数。
  // 本轮未测试线上标签 API，不能将此项通过称为 Civitai 实时标签检索成功。
  smoke.check("tags sort reads local trigger words without matching", await run(`${first}.endsWith('VAE Detail.safetensors')`) && [...hashCalls.values()].reduce((sum, count) => sum + count, 0) === before);
  // VAE Anime 的词条故意为空，两个方向都必须放末尾，不能伪装成空字符串最小。
  // 缺标记与缺文件不同，卡片数量仍应十二，模型不能被排序过滤掉。
  // 检查最后一份完整路径，而非只确认前面某一项碰巧符合期望。
  // 递减下仍置后能发现比较器把“未知最大值”整体反转的常见错误。
  // 恢复递增后再恢复名称，确保后续截图仍是原定的名称顺序。
  // 这些检查只读旁车，原始无标记 JSON 必须继续保持空词条。
  await chooseModelSort("direction", "desc");
  smoke.check("untagged model stays last in descending order", await run("[...document.querySelectorAll('[data-local-model-card]')].at(-1).dataset.localModelFile.endsWith('VAE Anime.safetensors')&&document.querySelectorAll('[data-local-model-card]').length===12"));
  await chooseModelSort("direction", "asc");
  smoke.check("untagged model stays last in ascending order", await run("[...document.querySelectorAll('[data-local-model-card]')].at(-1).dataset.localModelFile.endsWith('VAE Anime.safetensors')"));
  await chooseModelSort("field", "name");
  await verifySortMenu(win);
}
// 菜单交互与字段数据检查分开，失败信息能够区分属性来源和焦点管理。
// 此时已恢复名称递增，菜单的第一字段被选中，循环起点是确定的。
// 打开菜单只读受控值，不能新增后台任务或改变当前模型详情。
// 六个选项都来自生产 JSX，不用脚本临时插入按钮来演示预期布局。
// 图像夹具均已在前面的自然宽度等待中解码，本函数不控制图片缓存。
// 捕获菜单时背景仍是同一个真实列表，不使用额外静态网页替代。
// 这里不采用窗口截图裁切，保留全局导航和右侧详情用于核对相对位置。
// 排序按钮从搜索右端弹出，菜单坐标由共享外壳的视口避让结果决定。
// 真实鼠标外点与键盘关闭都应移除菜单，各自不能依赖对方先运行。
// 外部点击监听仅在浮层打开时存在，关闭后不应该继续干扰搜索输入。
// 先 Escape 再重开可覆盖监听重新安装，避免首次可用但第二次无响应。
// ArrowUp 的循环跨越字段和方向分组，分隔符不能成为不可退出的停靠点。
// 原生 Enter 和 Space 激活不在这里额外模拟，实际回调已由选择测试覆盖。
// 菜单里两组 aria-checked 不应被方向键改变，焦点浏览与选择是两件事。
// 最后的外点断言保留详情身份，证明重排不会把模型选择按数组索引重映射。
// 当前选中的模型即使从第一张移动到后面，也仍应拥有同一份版本资料。
// 本轮没有触发模型加载、保存或移动，临时文件在此测试中始终保持原位。
// 截图动画等待有明确上限，不将无限 rAF 作为后台窗口的完成条件。
// BrowserWindow 已禁用后台节流，主进程计时器驱动等待，不依赖窗口可见性。
// 真正窗口遮挡与系统缩放不在本轮菜单测试范围内，不把离屏窗口称为遮挡验证。
// 异常由上层 main 的 finally 销毁窗口，避免失败留下占用单实例的测试进程。
// 所有结果仍进入同一个 harness，后续来源测试成功不能覆盖这里的断言失败。
async function verifySortMenu(win) {
  await click("[data-local-sort-trigger]");
  // 六项来自四个字段和两个方向，不能把递减重复拼进每个字段制造八项。
  // 分隔线必须真实存在，菜单分组不能只依赖几个像素的空白。
  // menuitemradio 让选中语义可以被辅助阅读工具识别，而非纯装饰勾号。
  // 本检查只针对本轮排序浮层，不统计应用其他菜单的 option。
  smoke.check("sort menu contains four fields and two directions", await run("document.querySelectorAll('[role=menuitemradio]').length===6&&document.querySelector('[role=separator]')!==null"));
  await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))");
  // 外壳默认聚焦第一字段，向上应环绕到最后方向，而不是滚动整页。
  // 焦点与排序值分开，按方向键不能立即改变模型顺序或读取更多资料。
  // 事件由当前实际焦点发出，通过 Portal 的 React 路径触达本模块。
  // 如果只是给触发器写了键盘说明却没有接事件，这条会发现失败。
  smoke.check("menu ArrowUp wraps to last direction", await run("document.activeElement.dataset.localSortDirection==='desc'"));
  // 菜单入场动画结束后截图，否则半透明过渡帧会误判背景不实。
  // 排序行为已由上方断言验证，此处等待只用于稳定视觉帧。
  // 不暂停产品动画或覆盖主题变量来人为改善截图。
  // 真正边界检查仍读取 DOM 实测，不依赖这段固定延迟判断业务成功。
  await waitTime(250);
  fs.writeFileSync(path.join(directory, "model-sort-light.png"), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  // Escape 之后不能残留六项按钮，否则隐藏菜单仍可能抢键盘焦点。
  // 同时验证焦点回到触发器，避免关闭 Portal 后焦点丢到页面 body。
  // 菜单关闭不会清除已选字段和方向，后续普通浏览仍应保持名称递增。
  // 这条不模拟整个窗口的 Escape 行为，只检查局部菜单拥有的关闭边界。
  smoke.check("Escape closes menu and returns focus", await run("!document.querySelector('[role=menuitemradio]')&&document.activeElement.hasAttribute('data-local-sort-trigger')"));
  await click("[data-local-sort-trigger]");
  await run("document.querySelector('[data-local-model-catalog] input').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  // pointerdown 来自菜单外的真实搜索输入框，必须触发共享外部关闭监听。
  // 没有把 Portal DOM 直接删除，关闭经过组件正常状态与监听释放流程。
  // 详情标题仍属于原来选中的 Anima Base，排序不能按卡片序号换详情。
  // 此处的网络计数测试先前已经完成，不把外部点击当成新的匹配入口。
  smoke.check("outside click closes menu without changing model", await run("!document.querySelector('[role=menuitemradio]')&&document.querySelector('[data-local-model-details]').textContent.includes('Anima Base')"));
}
// 详情的空态和有模型态都能关闭，不能以“没有选中”为由禁用 X。
// 关闭必须真的取消第三列分配，不是把文字隐藏但保留相同网格宽度。
// 再点同一张真实卡片恢复资料，模型浏览无需寻找额外的恢复按钮。
// 长目录通过真实扫描进入树，不能只给测试 DOM 强行设置一个长字符串。
// 图标和计数都应保留，省略只作用于文本的可用宽度。
// 此处不发起补全或文件操作，模型都来自一次已有扫描快照。
// 本函数在真实工作区选定 Checkpoint/Anima SDXL 后执行。
// before 来自当前三栏实际宽度，不依赖某张设计图的固定像素。
// 空详情检查首次进入场景，关闭按钮不应等待先点选模型。
// disabled 属性缺失才表示可操作，单看颜色无法证明真实可点击。
// 关闭后节点卸载并且中心区变宽，排除只隐藏内容留下空列。
// 截图记录详情关闭态，便于人眼确认卡片扩展后的真实布局。
// 重新打开使用扫描器创建的模型路径，不在 DOM 中注入假详情。
// 本地卡片没有辅助小字行，路径不会因为共享结构又回到卡片中。
// 整卡就是详情入口，已删除单独动作按钮后仍能访问文件资料。
// 长目录名称来自真实夹具目录，包含扫描索引到递归树的完整数据流。
// whiteSpace 与 textOverflow 必须同时成立，前者不换行，后者负责省略。
// scrollWidth 大于 clientWidth 证明测试到真正发生溢出的长文本。
// 行高以 32px 为目标，浮动容差允许系统字体的像素取整。
// title 保留完整目录名，省略外观不应该丢掉核对信息。
async function verifyLocalDetailsClosing(win) {
  const before = await run("document.querySelector('[data-local-model-catalog]').getBoundingClientRect().width");
  smoke.check("empty details can be closed", await run("!document.querySelector('[data-model-details-close]').disabled&&!document.querySelector('[data-local-model-details]')"));
  // 本地调用与在线同一个动画 helper，真实目录、搜索与当前卡片不复制。
  // 初始模型区宽度继续作为独立反证，不能由 helper 的成功标签替代旧断言。
  // 新截图覆盖收起按钮仍可见，和 X 关闭后中心占满右侧空间两种状态。
  // helper 结束会恢复左栏和系统动效偏好，再继续封面点击与目录回归。
  // 当前仍是空详情，不能借一个已选模型掩盖“未选也应该能关闭”的要求。
  await verifyModelLibraryMotion(win, { run, click, wait, check: (label, ok) => smoke.check(label, ok), capture: async name => { fs.writeFileSync(path.join(directory, `local-${name}.png`), (await win.webContents.capturePage()).toPNG()); } });
  smoke.check("closing details releases its column to models", await run(`!document.querySelector('[data-model-library-details]')&&document.querySelector('[data-local-model-catalog]').getBoundingClientRect().width>${before}+250`));
  fs.writeFileSync(path.join(directory, "model-library-local-closed.png"), (await win.webContents.capturePage()).toPNG());
  // 在右栏已关闭的网格里直接点封面，验证这次修复的实际入口。
  // 夹具名按默认排序位于第一张，仍由下方文件名断言核对实际打开对象。
  // 不直接调用详情文字按钮，否则旧版错误的封面分支也可能通过。
  await click('[data-local-model-grid] button[class*=cardImagePreview]');
  // 若封面误开预览，即使右栏有旧内容也不能判定本次点击正确。
  // 与模型详情对象断言分开，失败时可区分选错文件和打开了错误浮层。
  // 当前是宽屏真实三栏，不把窄屏详情对话框误认作大图层。
  smoke.check("grid cover opens details without an image overlay", await run("!!document.querySelector('[data-local-model-details]')&&!document.querySelector('[data-image-preview-overlay]')"));
  // 共享卡片保留另一种密度的排版节点，网格只要求它不显示，而不是 DOM 中绝无 small。
  // 使用真实 computed style 检查可见性，能区分复用的隐藏摘要与实际多出来的资料行。
  // 详情已经打开且没有重复动作入口，避免隐藏检查掩盖浏览行为被改坏。
  // 列表稍后独立检查摘要真实可见及上下两行位置，两个分支互为反证。
  smoke.check("card reopens details with filename only and no extra action", await run("document.querySelector('[data-local-model-details]')?.textContent.includes('Anima Base')&&!document.querySelector('[data-local-model-details-open]')&&[...document.querySelectorAll('[data-local-model-card]')].every(el=>[...el.querySelectorAll('small')].every(item=>item.getClientRects().length===0))"));
  smoke.check("long tree names truncate on one aligned line", await run("(()=>{const button=document.querySelector('[data-model-tree-folder=\"Anima SDXL/Character Detail Very Long Folder Name\"]');const text=button.querySelector('span'),css=getComputedStyle(text);return css.whiteSpace==='nowrap'&&css.textOverflow==='ellipsis'&&text.scrollWidth>text.clientWidth&&Math.abs(button.getBoundingClientRect().height-32)<3&&button.title.includes('Long Folder')})()"));
}
// 分组沿用创建页动画，检查实际高度、inert 和独立开合，不只核对箭头样子。
// 初始两个区都展开；收起官方区不该改变当前十二份模型或下方目录的位置选择。
// 用真实键盘重新展开，保证标题可被 Tab 聚焦后用 Enter 激活。
// 浏览位置是筛选条件，折叠只是视觉行为，所以恢复后仍选中 Anima SDXL。
// 淡色选框仍是一像素边界，禁止用内阴影再叠一层更粗的光圈。
// 当前测试基于十二张真实模型卡片，折叠导航不应触碰中心结果。
// selector 对应两个公共 section 实例的稳定身份，不依赖翻译出来的标题。
// 第一次只关闭官方分类，检查动画结束、内容 inert 和另一组仍展开。
// 分类条件和卡片数量共同证明折叠仅改变布局，没有清空真实筛选。
// 标题必须是可聚焦 button，为键盘用户保留明确入口。
// 隐藏窗口不可靠地派发系统按键，所以焦点语义和真实 click 分开验证。
// 第二次展开使用同一个按钮回调，动画需重新测量到真实内容高度。
// 然后只关闭目录组，反证两组没有共享一个 open 状态。
// 展开目录后卡片仍只有 1px border 且 box-shadow 为空，避免光圈变粗。
async function verifyLibrarySections(win) {
  const official = '[data-model-library-section="local-model-root"]', folders = '[data-model-library-section="local-folders"]';
  await click(official + ' h2 button');
  await wait(`document.querySelector('${official} [data-collapsible-panel]').getBoundingClientRect().height===0`);
  smoke.check("official category folds with animation while folders and results stay", await run(`document.querySelector('${official} [inert]')&&getComputedStyle(document.querySelector('${official} [data-collapsible-panel]')).transitionProperty.includes('height')&&document.querySelector('${folders} h2 button').getAttribute('aria-expanded')==='true'&&document.querySelectorAll('[data-local-model-card]').length===12`));
  smoke.check("section heading is a keyboard-focusable toggle", await run(`(()=>{const button=document.querySelector('${official} h2 button');button.focus();return button.tagName==='BUTTON'&&button.tabIndex===0&&document.activeElement===button})()`));
  await click(official + ' h2 button');
  await wait(`document.querySelector('${official} [data-collapsible-panel]').getBoundingClientRect().height>100`);
  await click(folders + ' h2 button');
  await wait(`document.querySelector('${folders} [data-collapsible-panel]').getBoundingClientRect().height===0`);
  smoke.check("folder section folds independently without clearing current root", await run(`document.querySelector('${official} h2 button').getAttribute('aria-expanded')==='true'&&document.querySelector('[data-local-model-root=checkpoints]').getAttribute('aria-pressed')==='true'&&document.querySelectorAll('[data-local-model-card]').length===12`));
  await click(folders + ' h2 button');
  await wait(`document.querySelector('${folders} [data-collapsible-panel]').getBoundingClientRect().height>100`);
  // Card 的可访问按钮位于封面叠层内，描边属于外层卡片，不是图片容器。
  smoke.check("selected card uses one thin border without an extra glow", await run("(()=>{const card=document.querySelector('[data-local-model-card]').parentElement.parentElement,css=getComputedStyle(card);return css.borderTopWidth==='1px'&&css.boxShadow==='none'})()"));
}
async function verifyLibraryVisuals(win) {
  await click('[data-local-model-root=checkpoints]');
  await click('[data-model-tree-folder="Anima SDXL"]');
  await verifyLocalDetailsClosing(win);
  await verifyLibrarySections(win);
  await openFile(path.join(root, "checkpoints/Anima SDXL/Anima Base/Anima Base.safetensors"));
  // 查询范围严格限定中心网格，右侧同封面的详情图不能算作第十三张卡片。
  // naturalWidth 大于零才能说明解码成功，complete 对失败图片也可能为 true。
  // logo.webp 经临时图片 IPC 返回真实字节，测试没有往 React 节点直接塞 src。
  // 这些夹具与主模型元数据一一对应，不从 C 站随机拉图导致截图不可复现。
  // 同一个缓存可被卡片与详情复用，图片数断言不等于底层读取请求数断言。
  await wait("[...document.querySelectorAll('[data-local-model-grid] img')].length===12&&[...document.querySelectorAll('[data-local-model-grid] img')].every(el=>el.complete&&el.naturalWidth>0)");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  // 用前三个真实宿主后代的矩形检查左到右顺序，不能把内层详情误当并列第三面板。
  // 比较左右底边能发现其中一列按内容增长而不是继承工作区高度的错误。
  // 管理入口若仍位于右侧详情底部，区域归属的独立条件会直接失败。
  // 搜索、排序、补全的 top 与管理行的 top 比较能区分上下两层。
  // 宽度不要求每个设备都与设计稿同一像素，而要求同一比例和真实容器分配关系。
  // 视口固定为参考图尺寸，人工比较不需要在两个不同大小窗口之间猜测比例。
  // 管理区应在中心头部，右侧详情内不能再出现同一套按钮。
  // 搜索、排序和批量补全必须同一行，不能只检查按钮是否存在。
  // 第二行管理与视图共用高度，视图要位于移动删除的右边。
  // 比较容器相对位置而非写死导航宽度，适应真实应用外壳的分配。
  smoke.check("three panels with search-sort-recovery above management and views", await run("(()=>{const host=document.querySelector('[data-local-model-library]');const [left,center,right]=[...host.children].slice(0,3).map(el=>el.getBoundingClientRect());const rect=s=>document.querySelector(s).getBoundingClientRect();const search=rect('[data-local-model-catalog] input'),sort=rect('[data-local-sort-trigger]'),batch=rect('[data-local-batch-recover]'),move=rect('[data-local-batch-move]'),view=rect('[data-local-model-catalog] button[aria-pressed=true]');return left.right<center.left&&center.right<right.left&&Math.abs(left.bottom-right.bottom)<2&&sort.left>search.left&&batch.left>sort.left&&Math.abs(batch.top-sort.top)<5&&move.top>batch.bottom&&view.left>move.right&&!document.querySelector('[data-local-details-panel] [data-local-batch-toolbar]')})()"));
  await verifySorting(win);
  // 排列菜单不是交付画面的主体，收起菜单后才拍实际卡片与详情。
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  // 门牌文字从页面真实目录发布，若标题栏硬编码 Anima 但回调未接通会在后续根切换暴露。
  // data-brand-tagline 缺失检查只针对 head 的旧节点，不误删全局底部状态条的既有文案。
  // 目录名称是测试创建的带空格文件夹，能发现错误分段或仅保留末级的展示问题。
  // 标题栏沿用生产 chrome capability；普通浏览器没有 head 时不应把此用例误报为通过。
  // 截图包含真实最小化、最大化与关闭按钮，但本脚本不会点击关闭当前测试窗口。
  smoke.check("head replaces slogan with current model directory", await run("!document.querySelector('[data-brand-tagline]')&&document.querySelector('[data-model-library-location]')?.textContent.includes('Anima SDXL')"));
  fs.writeFileSync(path.join(directory, "model-library-light.png"), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  // 深色切换不重新 loadURL，所以仍是同一份扫描索引和局部选中状态。
  // 明暗截图都必须包含十二卡和三面板，而不是另一个专用深色演示页面。
  // 背景取自 CSS 语义变量，截图不通过颜色滤镜把浅色渲染结果简单反相。
  // 窗口 controls 也随原主题链变色，本地库没有创建一套主题开关。
  // 主题面板关闭后才截图，避免浮层遮住详情而无法验收。
  await chooseTheme("dark");
  fs.writeFileSync(path.join(directory, "model-library-dark.png"), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  await chooseTheme("light");
  // 同一份十二文件扫描夹具切换为紧凑列表，不能因密度切换触发重扫或丢失模型。
  // 当前详情仍属于 Anima Base，卡片排布变化不应改变已选文件身份。
  // 只改变视图参数，不向模型服务提交新的查询，也不重新创建模型文件。
  // 本轮需求将旧版“与网格一样大”的图片改为 100px 方图，因此独立检查真实几何。
  // 截图前确认两个维度，防止只改了宽度却保留竖图高度的半修复。
  // 原封面占位来自真实临时文件，图片加载前后都应保持这组尺寸。
  // 列表摘要由 sidecar 与扫描结果联合提供，不在测试里注入列表专用字符串。
  // SDXL 来自夹具元数据，Checkpoint 来自实际分类，B 来自 stat 字节数格式化。
  // 触发词与介绍必须留在详情里，不能因为旧摘要仍在 DOM 中而误认为两行布局已完成。
  // 用两个文字框的实际上下位置检查顺序，不能仅以 DOM 包含两个文本就判定通过。
  // 同时确认名称没有扩展名，文件本身及其操作身份仍保留精确的后缀。
  // 第一张名称在排序回归中已经核对，不依靠模型数据在未来偶然出现相同关键字。
  // 选用短属性也让截图可读，长介绍夹具不应重新把这一行撑高。
  await click('[aria-label="列表视图"]');
  smoke.check("view switching reuses all twelve file cards", await run("document.querySelector('[data-local-model-grid]').dataset.view==='list'&&document.querySelectorAll('[data-local-model-card]').length===12"));
  smoke.check("list thumbnail is a compact 100px square", await run("(()=>{const r=document.querySelector('[data-local-model-grid] button[class*=cardImagePreview]').getBoundingClientRect();return Math.abs(r.width-100)<1&&Math.abs(r.height-100)<1})()"));
  // 首个文件由夹具固定为 100 字节、1 月 12 日修改；期望来自磁盘夹具而不是 UI 文本。
  // 时间字符串允许当前机器时区的时分变化，但月日必须与固定日期一致。
  // 大小与日期使用现有中文词条，不能只出现没有含义的裸时间。
  // 摘要仍在六十像素内，新增日期不得悄悄扩展为第三行。
  // 这同时保留原名称、分类、基础系列检查，不以日期出现替代其他属性验证。
  // 实际文件很小是为了快速回归，产品字节格式化仍复用同一 GB/MB 工具。
  smoke.check("list shows filename above actual base category size and modification date", await run("(()=>{const row=document.querySelector('[data-model-list-summary]'),name=row.querySelector('p'),summary=row.querySelector('small');return name.textContent&&!name.textContent.endsWith('.safetensors')&&/^SDXL · Checkpoint · 大小 100 B · 日期 1月12日 /.test(summary.textContent)&&name.getBoundingClientRect().bottom<=summary.getBoundingClientRect().top&&row.getBoundingClientRect().height<60})()"));
  fs.writeFileSync(path.join(directory, "model-library-list.png"), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  // 列表与网格的封面必须保持相同含义：先选模型并展示右侧资料。
  // 先关闭右栏，避免现存详情掩盖封面没有接通回调的错误。
  // 使用有封面的十二模型夹具，防止只修好了缺图时的普通按钮分支。
  // 卡片下标由已验证的当前排序决定，列表摘要断言已核对首项内容。
  // 点击使用真实 DOM 按钮，不从测试里调用 React 的状态更新器。
  // 卡片内不应再有大图触发器，防止文字和图片悄悄分成两种入口。
  // 详情恢复后，后面的同一按钮定位验证第三栏图片仍能打开原预览层。
  await click('[data-model-details-close]'); await click('[data-local-model-grid] button[class*=cardImagePreview]');
  // 两个条件同时成立才能通过，不能只因为右侧存在旧 DOM 就算成功。
  // 这里检查的浮层标记来自创建页共享组件，没有另做一个本地预览标记。
  // 对整个网格查触发器，能发现其他卡片仍残留上轮预览接线。
  smoke.check("list cover restores details and never opens image preview", await run("!!document.querySelector('[data-local-model-details]')&&!document.querySelector('[data-image-preview-overlay]')&&!document.querySelector('[data-local-model-grid] [data-image-preview-trigger]')"));
  // 只有第三栏里的图片负责放大，和用户先看资料再看原图的顺序一致。
  // 此处沿用共享预览的原始加载、缩放与关闭生命周期。
  // 自然宽度的等待验证真实封面读取，不仅断言一个空浮层挂载成功。
  await click('[data-local-model-details] [data-image-preview-trigger]');
  // 详情缩略图铺满自己的框，真正放大层仍保持完整原图，因此两种适配不能混用。
  // 读取最终计算样式能发现调用方残留 object-contain 覆盖默认填充的问题。
  // 不要求裁切后的缩略图改变原文件，也不会在此触发另一次封面写入。
  smoke.check("detail thumbnail fills its preview frame", await run("getComputedStyle(document.querySelector('[data-local-model-details] img')).objectFit==='cover'"));
  await wait("document.querySelector('[data-image-preview-overlay] img')?.naturalWidth>0");
  // 图像已经从临时目录加载，当前断言不依赖用户模型路径或外部网站。
  // 关闭之后还要等浮层移除，避免后续切换视图时误点到遮罩。
  // 不把原生下载、ComfyUI 推理或图片文件写入纳入这个 UI 点击用例。
  smoke.check("local detail image opens the shared image preview", await run("document.querySelector('[data-image-preview-overlay] img')?.naturalWidth>0"));
  await click('[data-image-preview-overlay] > button');
  await wait("!document.querySelector('[data-image-preview-overlay]')");
  await click('[aria-label="网格视图"]');
  await verifyLibraryNarrow(win);
  await click('[data-local-model-root=loras]');
  await click('[data-model-tree-folder=Anima]');
  await click('[data-model-tree-folder="Anima/style"]');
  await click('[data-model-tree-folder="Anima/style/Alpha"]');
}
// 窄窗先关闭模型选择，避免 resize 自动打开详情而挡住中心布局测量。
// 浏览器元素宽度直接与 viewport 比较，能发现长文件名撑出页面的问题。
// 小窗口管理动作保留在中间面板下方，不以隐藏全部操作换取“没有溢出”。
// 再点击同一个模型，详情应使用原资源弹窗，并对齐真实 main 左边缘。
// 这个断言能发现共享外壳历史导航宽度与当前 nav 宽度不一致的空槽。
// 浮层左边界用像素容差一，允许浏览器边框取整，不允许几十像素留白。
// 返回宽窗后不调用扫描，原十二份模型身份与排序仍应保持。
// 关闭按钮走 onOpenChange，不直接卸载节点，避免跳过真实清理生命周期。
// 窄屏截图使用完整客户端，目录区和应用 nav 可见，便于人工核对位置。
// 等实际宽度与媒体查询同时生效再拍图，不使用 resize 事件载荷当作读数。
// 本组不测试移动和删除事务，只确认这些入口在小窗口仍然可达。
// 所有按钮在只读夹具上检查，不向资源管理器或回收站发送命令。
async function verifyLibraryNarrow(win) {
  await click('[data-local-details-panel] > header button');
  win.setSize(880, 950);
  // setSize 请求可能先于 renderer 布局提交完成，先读取实际 innerWidth 再量边界。
  // desktop nav 在 880px 仍可用，因此左偏移应该来自当前展开 nav 的真实宽度。
  // 这里不修改用户的展开偏好，也不通过收起导航掩盖弹窗错误的留白。
  // 详情关闭后三面板宿主变成两列，管理入口仍在中心页头。
  // scrollWidth 条件允许一像素取整，不会放过整个卡片宽度的横向溢出。
  // 管理区 bottom 与 main bottom 比较，能发现按钮落在底部全局状态栏下面。
  // 布局检查使用边界而非截图像素颜色，深色主题不会改变这些期望。
  // 可访问按钮文字保持存在，不能以 display:none 隐藏按钮后伪造更小的 scrollWidth。
  await wait("innerWidth===880&&!matchMedia('(min-width:1280px)').matches");
  smoke.check("narrow library keeps model grid and management inside main", await run("document.querySelector('[data-local-model-library]').scrollWidth<=document.querySelector('[data-local-model-library]').clientWidth+1&&document.querySelector('[data-local-batch-toolbar]').getBoundingClientRect().bottom<=document.querySelector('[data-app-main]').getBoundingClientRect().bottom"));
  await openFile(path.join(root, "checkpoints/Anima SDXL/Anima Base/Anima Base.safetensors"));
  // 弹窗对应明确 titleId，不把仍存在的右侧详情面板当成已经打开的资源页。
  // 精确查询顶层 data-resource-dialog，测量的是浮层外边缘而非内部有 padding 的文本块。
  // 左边界必须等于 main 外框，即使 nav 的 CSS 宽度是带小数的 158.75px。
  // 宽度不再使用旧 220px 常量，因此可以直接发现之前右侧主区空出一条带的问题。
  // 外壳的 focus/escape 仍归公共 ResourceDialogShell，本组不重新实现键盘陷阱。
  // 关闭使用弹窗里的第一颗返回按钮，不误触右侧管理区的“删除模型”。
  // 主动等待卸载后才扩大窗口，避免窄屏弹窗还在退出时又截取宽屏布局。
  await wait("document.querySelector('[data-resource-dialog=local-model-details-title]')");
  smoke.check("narrow details align with actual app main edge", await run("Math.abs(document.querySelector('[data-resource-dialog=local-model-details-title]').getBoundingClientRect().left-document.querySelector('[data-app-main]').getBoundingClientRect().left)<1"));
  // 窗口改尺寸后布局断言可以同步通过，但离屏合成器的截图表面可能尚未完成替换。
  // 几何验证不依赖这段延时；这里只给截图留一次有界的合成提交机会。
  // 不捕获并吞掉 UnknownVizError，也不循环重试截图，真正失败仍由 harness 报错。
  // 350ms 超过本页正常 300ms 过渡，截图不会取到半开面板。
  // 等待在主进程计时，不依赖隐藏窗口可能停止的 requestAnimationFrame。
  await new Promise(resolve => setTimeout(resolve, 350));
  fs.writeFileSync(path.join(directory, "model-library-narrow.png"), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
  await click('[data-resource-dialog=local-model-details-title] button');
  await wait("!document.querySelector('[data-resource-dialog=local-model-details-title]')");
  win.setSize(1585, 992);
  await wait("innerWidth===1585&&matchMedia('(min-width:1280px)').matches");
}
// 应用会把 system 偏好重新写回 nativeTheme，直接改主进程值不能模拟用户切换。
// 因此通过现有外观面板选择明确的深/浅主题，覆盖与实际用户相同的路径。
// 两个信号同时确认：data-theme 说明决议，matchMedia 说明 CSS 实际采用的配色。
// 过渡动画结束后再截图，避免半深半浅的一帧被误当成最终主题。
// 外观面板通过自己的触发器关闭，不删除节点以掩盖布局。
// 等待由主进程有界轮询提供，隐藏窗口不需要持续 rAF 才能结束。
// close 后目录与当前模型保持不变，主题切换不能重新创建另一套本地库。
// 截图前确认弹层卸载，否则右上角浮层会遮住模型详情。
async function chooseTheme(value) {
  await click("[data-theme-trigger]");
  await wait(`document.querySelector('[data-theme-option=${value}]')`);
  await click(`[data-theme-option=${value}]`);
  // applyThemeSignals 会先写观察属性，再跨 IPC 应用 nativeTheme，二者不一定同一帧到达。
  // 只看到 data-theme 改为 dark 不能说明 CSS 的 prefers-color-scheme 已经变成 dark。
  // 等待同时包含 matchMedia 读值，用当前事实而不是某次媒体事件携带的旧值判断。
  // theme-ripple 是过渡生命周期标记，清除后截图才代表最终表面颜色。
  // 隐藏窗口也有主进程轮询上限，过渡失败会报告超时，不无限等待下一帧。
  // 选择明确 dark/light 不依赖测试电脑的系统主题，保证截图的主题前提可重现。
  // 此处不会向用户文档文件写主题，USER_DATA_WRITE 仍是本进程隔离替身。
  // 但页面真实 store 和主题通道正常执行，因此覆盖的是产品的切换路径。
  // 等待失败保留现场和非零退出码，不能因为已经保存浅色截图就报告整组通过。
  await wait(`document.documentElement.dataset.theme==='${value}'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches===${value === "dark"}`);
  await click("[data-theme-trigger]");
  await wait("!document.getElementById('appearance-popover')");
}
// 资料元数据依然逐版本读取，不能因为布局合成十二卡便复用另一个模型的说明。
// 管理按钮通过现有 selection 和 recovery store 驱动，视觉测试不跳过原行为回归。
// 窄屏真实详情在后续截图组中验证，不把此处宽屏通过理解为所有窗口已经通过。
// 同一窗口顺序检查深浅主题，不启动第二个 Electron 冒烟争抢资源。
// 本轮未验证真实 C 站账号授权、GB 级模型推理或用户盘符离线情况。
// 图片加载失败仍保留卡片身份，后续无封面批量夹具继续覆盖该情况。
// 主测试的 finally 负责销毁窗口，任何断言异常都由 harness 保留失败退出码。
// 数量与几何断言是运行时读取，不能由“源码写了三列”这种静态判断代替。

async function addLora(name) {
  // 批量结束后创建页会重新水合布局，等待实际扩展入口挂载再点击。
  // 使用组件已经提供的稳定选择器，避免仅凭整颗按钮文本匹配图标内容。
  // 没有按钮时 wait 会给出页面摘要，不能让 undefined.click 隐藏具体前提。
  await wait("document.querySelector('[data-extension-picker-trigger]')");
  await click("[data-extension-picker-trigger]");
  // 新增批量夹具后 batch 分类排在 style 之前，不能再把第一个分类当 style。
  // 根据已有 picker 可访问名称选择原触发词夹具分类，不改变产品排序。
  // 这项调整只修正测试前提，普通与高级提示词的断言期望保持不变。
  await wait("[...document.querySelectorAll('[data-lora-model-picker]')].some(el=>el.getAttribute('aria-label')?.includes('style'))");
  await run("[...document.querySelectorAll('[data-lora-model-picker]')].find(el=>el.getAttribute('aria-label')?.includes('style')).click()");
  await wait("document.querySelector('[data-lora-model-option]')");
  // 新增批量模型会扩大选择列表，先证明目标版本确实在当前候选中。
  // 找不到时输出候选文本作为测试诊断，避免失去上下文的 undefined.click。
  // 文本全是临时夹具名称，不包含用户真实模型或账户数据。
  const options = await run("[...document.querySelectorAll('[data-lora-model-option]')].map(el=>el.textContent)");
  if (!options.some(value => value.includes(name))) throw new Error("LoRA fixture not offered: " + name + " / " + JSON.stringify(options));
  await run(`[...document.querySelectorAll('[data-lora-model-option]')].find(el=>el.textContent.includes(${JSON.stringify(name)})).querySelector('[data-resource-model-select]').click()`);
  await wait("!document.querySelector('[aria-labelledby=model-version-dialog-title]')"); await click("[data-resource-confirm]");
  await wait("document.querySelector('[data-apply-lora-triggers]')");
}
/**
 * 前置：详情测试已经选中了没有 sidecar 的 z-missing 版本。
 * 必须先验证缺失文件的原生读取，再执行会创建 sidecar 的恢复操作。
 * 用户点击实际界面按钮，经 preload 和真实 IPC 进入流式哈希事务。
 * 等待 ready 而不使用固定 sleep，避免磁盘速度决定回归结果。
 * 精确检查恢复版本的触发词，不能只检查某个通用“成功”提示。
 * 读取落盘 JSON 的版本 ID，证明页面结果有持久化文件支撑。
 * 返回上一版本后，它原有的来源与触发词必须仍然保持。
 * 此处只检查固定模拟 API 的接入，不进行真正的模型推理。
 */
async function verifyRecovery() {
  // 当前选择由 verifyDetails 的真实版本下拉产生，不在这里直接设置 store。
  // verifyNative 不切换页面，所以此处仍然可以点击缺失版本的补全入口。
  // 按钮操作之后先等业务结果，再检查内容，避免 loading 瞬间误判。
  // 页面内部会重读 sidecar，本测试不直接把模拟对象注入 React。
  // 检查磁盘版本 ID 可以识别“请求成功但保存失败却显示成功”的回归。
  // 同目录 a 与 z-missing 共用封面但来源应独立，这是版本隔离的关键样本。
  // 这些夹具是临时占位模型，不验证 ComfyUI 推理或真实作者推荐权重。
  // 旧版详情与新补全入口共存，后续触发词测试继续沿用原有配置。
  await click("[data-recover-model-metadata]");
  await wait("document.querySelector('[data-model-recovery-status]')?.dataset.modelRecoveryStatus==='recovered'&&document.querySelector('[data-local-model-metadata]')?.dataset.status==='ready'");
  // 来源说明、作者和触发词都应来自本轮精确匹配的版本。
  // 旧版本来源不能通过缓存残留混进结果。
  // DOM 检查与磁盘检查配对，防止界面仅显示乐观成功。
  smoke.check("hash recovery refreshes selected version through real preload and IPC", await run("(()=>{const el=document.querySelector('[data-local-metadata-content]');return ['Recovered source','Recovered author','recovered trigger'].every(text=>el?.textContent.includes(text))})()"));
  smoke.check("recovered source persists next to the actual selected file", JSON.parse(fs.readFileSync(missing + ".civitai.json", "utf8")).versionId === 43);
  // 第一颗按钮仍是版本下拉，补全入口不能改变它的交互结构。
  // 切回 a.safetensors 时使用实际选项文本，而不是直接改 React 状态。
  // 原有来源 A 应重新显示，证明恢复未覆盖同目录其他版本。
  await openFile(a);
  await wait("document.querySelector('[data-local-metadata-content]')?.textContent.includes('Source A')");
  smoke.check("recovery preserves sibling version metadata", await run("document.querySelector('[data-local-trigger-words]')?.textContent.includes('fixture style')&&!document.querySelector('[data-local-trigger-words]')?.textContent.includes('recovered trigger')"));
}
/**
 * 使用页面真实搜索栏冻结三个模型四个版本的范围。
 * 通过原生 input setter 与 React input 事件操作，避免直接改 store 绕过 UI。
 * 同一个筛选框也用于切页后恢复展示范围，队列本身不能依赖筛选框存在。
 * 测试会检查卡片数，而不是假设筛选事件必然已被处理。
 * 名称前缀只匹配批量夹具，不包含原有 Alpha/Beta 触发词回归文件。
 */
async function filterBatch() {
  // UI 事件走和实际用户输入相同的 React 入口，不调用过滤器内部函数。
  // 三个卡片只是模型数，后面的四个队列项才是展开 versions 的真实文件数。
  // 独立断言卡片数可发现输入事件没有派发到 React 时的恒真范围测试。
  await run("(()=>{const input=document.querySelector('input[placeholder=\"搜索本地模型名称、分类或文件名\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Batch-');input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait("document.querySelectorAll('[data-local-model-card]').length===4");
}
/**
 * 前置：原有单文件恢复已通过，批量夹具均没有 sidecar。
 * 第一项查询被夹具精确暂停，便于验证切换在线页不会丢失队列。
 * 回到本地页后仍需显示运行中、按钮禁用、四个版本快照。
 * 停止仅影响尚未提交项，不能把正在执行的文件误标为取消。
 * 解除等待后当前文件真实保存 JSON 和 logo，其余三项明确标记停止。
 * 不使用窗口遮挡或页面 rAF 作为测试节拍，等待均由主进程有界轮询驱动。
 * 该组仅模拟网络延迟，文件读取与资源提交仍为真实实现。
 */
async function verifyBatchStop() {
  // holdBatch 在点击之前设置，确保真正发起的第一个 by-hash 请求会停住。
  // 等待 releaseBatch 表示哈希已完成并进入网络边界，不是假设 sleep 足够长。
  // 所有轮询次数均有上限，失败由冒烟 harness 非零退出并记录诊断。
  await click("[data-local-model-root=loras]");
  await filterBatch(); holdBatch = true;
  const requestsBefore = [...hashCalls.values()].reduce((sum, count) => sum + count, 0);
  await click("[data-local-batch-recover]");
  // 打开面板不能开始哈希，第一次也必须点击内部“开始”才执行。
  // 请求计数从外部模拟服务统计，不依赖产品组件报告的 busy 状态。
  // 没有行记录配对证明不只是网络尚未响应，而是还未创建批次。
  // 这里不使用全局已完成任务数，单项恢复的既有请求不会影响判断。
  // 固定等待只用于让可能的错误自动启动暴露，真正运行仍按 release 轮询。
  // 内外按钮用容器范围区分，不能误点背景按钮后声称已经确认执行。
  // 如果第一次入口仍偷偷调用 start，会同步建立条目，因此无需猜哈希完成时间。
  // 网络计数不变且没有任务行，两项配对避免仅用单一忙碌文案判断。
  // 用户未确认时不应该得到“未找到模型”或“完成”之类伪造结果。
  // 内部开始按钮仍可用，修复不能通过永久禁用整个批量能力实现。
  smoke.check("opening batch panel never starts matching", [...hashCalls.values()].reduce((sum, count) => sum + count, 0) === requestsBefore && await run("!document.querySelector('[data-recovery-batch-item]')"));
  await click("[data-local-model-recovery-batch] [data-local-batch-recover]");
  for (let i = 0; i < 180 && !releaseBatch; i++) await waitTime(20);
  if (!releaseBatch) throw new Error("batch did not reach held request");
  // 当前筛选包含两版本 Good、一版本 Missing、一版本 NoLogo，总数应为四。
  // 不使用 store 内部数组作为期望值，以免队列漏项时测试仍自洽通过。
  // DOM 行数来自用户真实看到的结果面板，能够覆盖组件与 store 的连接。
  smoke.check("batch snapshot includes all versions in the current filter", await run("document.querySelectorAll('[data-recovery-batch-item]').length===4"));
  // 批量结果现在属于独立资源弹窗，先正常关闭再访问背景的库切换入口。
  // 不能直接点击被弹窗挡住的背景按钮来模拟用户操作，那会绕过真正交互边界。
  // 关闭只移除结果 DOM，主进程当前事务继续等候之前设置的网络回执。
  // 再切在线确认本地库实际卸载，排除页面仅仅 CSS 隐藏却保留所有状态的假持久化。
  // 重新进入本地后点紧凑按钮只是查看 running 队列，不能开始另一个全库批次。
  // 内层开始按钮要 disabled，但外层查看结果按钮保持可用，这是两个不同动作。
  // 原快照仍是 Batch- 四份，当前全库筛选不会悄悄改写已经执行的任务数。
  // 此处的网络暂停只存在于测试 mock，产品页面没有测试专用暂停入口。
  await click('[aria-labelledby="model-batch-recovery-title"] button');
  await click("[data-model-library=online]"); await wait("!document.querySelector('[data-local-model-library]')");
  // 等待面板完全卸载再切回，避免只是 CSS 隐藏而没有真正覆盖生命周期。
  // 运行循环在 Zustand 模块中，应能跨过这次 React 子树销毁。
  // 检查按钮仍禁用，证明回到页面后不是一份新的空队列。
  await click("[data-model-library=local]");
  await click("[data-local-batch-recover]");
  await wait("document.querySelector('[data-local-model-recovery-batch]')?.dataset.running==='true'");
  smoke.check("batch survives page unmount and blocks duplicate submission", await run("document.querySelector('[data-local-model-recovery-batch] [data-local-batch-recover]').disabled&&document.querySelectorAll('[data-recovery-batch-item]').length===4"));
  // 批量锁应禁用单项入口，却不能显示该模型自己正在匹配。
  // 已运行的队列继续 hold，关闭只是暂时返回目录浏览，不会停止事务。
  // 选择原始 LoRA 资料版本，避免批量第一项自己的状态干扰判断。
  // 检查按钮文案与禁用同时满足，不能通过直接启用按钮修复文字。
  // 说明必须独立可见，用户能够理解为何还不能手动发起另一个请求。
  // 最后重新打开原队列继续停止回归，不创建第二批任务。
  await click('[aria-labelledby="model-batch-recovery-title"] button');
  await openFile(a);
  await wait("document.querySelector('[data-recover-model-metadata]')?.disabled");
  // 这个模型并非挂起的批量当前项，因此应明确描述占用而非自身读取进度。
  // disabled 必须已经成立，不能仅改成手动文案却允许第二个请求冲突。
  // 独立说明必须在面板内可读，不要求鼠标悬停才能知道按钮为何不可用。
  // 回到批量结果后停止逻辑继续运行，修复单项状态不能丢掉正在执行的任务。
  smoke.check("batch occupation is not single-model matching progress", await run("document.querySelector('[data-recover-model-metadata]').textContent.includes('补全')&&!document.querySelector('[data-recover-model-metadata]').textContent.includes('正在流式')&&document.querySelector('[data-local-model-metadata]').textContent.includes('批量补全正在执行')"));
  await click("[data-local-batch-recover]");
  await click("[data-recovery-batch-stop]"); releaseBatch();
  // 当前项有安全收尾机会，等待 running=false 还包含一次列表刷新。
  // 三个取消项必须没有发起后续事务，不能被记成未找到模型。
  // 一项 recovered 之外还核实真实 logo 路径，防止只改 UI 状态就算成功。
  await wait("document.querySelector('[data-local-model-recovery-batch]')?.dataset.running==='false'");
  smoke.check("stop finishes current file with logo and marks only unsubmitted versions stopped", await run("document.querySelectorAll('[data-recovery-batch-item][data-phase=cancelled]').length===3&&document.querySelectorAll('[data-recovery-batch-item][data-result=recovered]').length===1") && fs.existsSync(path.join(path.dirname(batchGood), "logo.png")));
}
/**
 * 重试上一组停止的三项：成功的第一项不能重新哈希。
 * 同目录第二版本可复用真实 logo，另两项分别得到 notFound 与 noPreview。
 * 页面显示完整原因，并以 2/4 完成为统计，不能把只有 JSON 的项算成功。
 * 检查文字 JSON 已保存但 logo 缺失，明确复现“文字不是补全基准”。
 * 逐项结果脱离当前筛选保留，便于用户看到原批次的失败项。
 * 截图覆盖宽/窄展示，窗口宽度变化不改变批量队列范围。
 * 夹具恢复远程模型与图片后再次重试，应只处理两个未完成项。
 * 同一原始 JSON 必须逐字保留，补封面不能覆盖用户原资料。
 */
async function verifyBatchRetry(win) {
  // 第一个成功文件的查询计数在所有重试前保存成独立期望值。
  // 不能只观察最后状态 recovered，因为重复哈希同样可能最终成功。
  // retry 接口由可见按钮触发，测试不直接手动构造剩余任务列表。
  const before = hashCalls.get(fixtureHash(batchGood));
  await click("[data-recovery-batch-retry]"); await wait("document.querySelector('[data-local-model-recovery-batch]')?.dataset.running==='false'");
  smoke.check("retry does not hash completed versions again", hashCalls.get(fixtureHash(batchGood)) === before);
  // 两类未完成原因必须同时存在，一条通用“失败”不能满足本组断言。
  // summary 中完成数明确为 2，JSON 已保存的 NoLogo 不允许抬高到 3。
  // 进度分母仍为原快照 4，不因只重试三项而错误缩减为 3。
  smoke.check("batch explains absent Civitai models and missing logo separately", await run("(()=>{const el=document.querySelector('[data-recovery-batch-results]');return !!el.querySelector('[data-result=notFound]')&&!!el.querySelector('[data-result=noPreview]')&&el.textContent.includes('Civitai 未找到此文件')&&el.textContent.includes('缺少 logo')&&el.querySelector('summary').textContent.includes('已完成 2')&&el.querySelector('summary').textContent.includes('未完成 2')})()"));
  const partial = fs.readFileSync(batchNoLogo + ".civitai.json", "utf8");
  // partial 是实际落盘的来源内容，保留供最后一次补图后逐字比对。
  // 此时 lack logo 与来源 JSON 存在形成配对，直接覆盖用户强调的基准。
  // 不以卡片占位图的存在代替真正的本地 logo.png 文件。
  smoke.check("metadata without a logo stays incomplete", !fs.existsSync(path.join(path.dirname(batchNoLogo), "logo.png")));
  // 更新公告可晚于页面首帧出现，截图前通过它自己的关闭按钮正常关闭。
  // 不删除 DOM 或修改产品 store，避免截图掩盖实际渲染状态。
  // 只操作本脚本临时会话，真实用户公告记录不会受影响。
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  // 宽屏结果图只截当前弹窗，背景列表不必再通过被遮挡的输入框改筛选。
  // 弹窗展示的是原四项快照，即使背景已回到全库，仍应完整解释原批次失败。
  // 这种隔离能发现把结果错误绑定 filtered、用户切目录就丢失未完成原因的回归。
  // NoLogo 的 JSON 已存在，但还没有可解码封面，这是必须重试而不是直接跳过的样本。
  // Missing 的 SHA-256 在所有模拟来源都返回 404，不能与网络临时失败混为同一原因。
  // 再次允许预览只改变外部模拟响应，真正 logo 仍由生产保存器验证并写盘。
  // 前一份成功任务的查询计数保存下来，后续重试不能再次给它增加哈希查询。
  // 原 sidecar 逐字保留检查可以发现“补封面”意外覆盖用户已有资料的错误。
  fs.writeFileSync(path.join(directory, "batch-wide.png"), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  win.setSize(880, 950); await waitTime(200);
  // 窄屏仅验证结果容器宽度及截图，不在这里测试媒体查询动画的中间帧。
  // 除固定等待外，几何断言来自当前 DOM 实测，能发现长原因文字撑宽面板。
  // 恢复宽窗口后继续操作同一批次，尺寸变化不能重置结果或触发重复执行。
  smoke.check("batch results fit a narrow main area", await run("document.querySelector('[data-local-model-recovery-batch]').scrollWidth<=document.querySelector('[data-local-model-recovery-batch]').clientWidth+1"));
  fs.writeFileSync(path.join(directory, "batch-narrow.png"), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  win.setSize(1500, 950); allowMissing = true; allowPreview = true;
  // 模拟站点后来收录缺失模型及补上预览，这是显式重试可恢复的实际前提。
  // 主进程不会凭新开关直接成功，仍需重读文件、匹配版本并保存可解码 PNG。
  // 最后四项完成且按钮禁用，证明已成功项目保留、仅未完成项目被重新提交。
  await click("[data-recovery-batch-retry]"); await wait("document.querySelector('[data-local-model-recovery-batch]')?.dataset.running==='false'");
  smoke.check("retry fills missing logos despite an existing JSON and completes all versions", await run("document.querySelector('[data-recovery-batch-results] summary').textContent.includes('已完成 4')&&document.querySelector('[data-recovery-batch-retry]').disabled") && fs.existsSync(path.join(path.dirname(batchNoLogo), "logo.png")) && fs.readFileSync(batchNoLogo + ".civitai.json", "utf8") === partial);
  await verifyRecoveredCover();
}
/**
 * 补图完成后检查列表与详情的实际解码状态，独立于队列统计和落盘检查。
 * 卡片文字与封面是兄弟按钮，图片必须从共同封面容器查找。
 * 不能把文字按钮中没有 img 误判为产品补全失败。
 * 测试路径均是本轮临时根中的模型，所选文件不会触及真实用户数据。
 */
async function verifyRecoveredCover() {
  // 收起结果窗口后检查真实卡片，结果行的成功提示不能证明封面已刷新。
  // 文件身份使用原模型完整路径，不依赖多个 one.safetensors 的同名显示文本。
  // 这里不主动扫描或重载页面，必须由原批量流程的完成回调刷新列表。
  // naturalWidth 大于零才说明浏览器真的解码了图片，而不只是生成 img 标签。
  // 限定 data:image/png 排除卡片原占位图或其他 WebP 样例意外满足断言。
  // 随后打开同一张卡片，检查第三栏与中间列表使用的是同一份补全结果。
  // 生产选择动作通过真实点击完成，不给详情组件手工注入封面 URL。
  // 此组网络仍是模拟响应，只能证明真实 IPC、磁盘和渲染之间的链路。
  // 结果弹窗关闭是正式交互，背景列表的筛选、选择和素材状态均由产品维护。
  // NoLogo 是先有来源再补图片的用例，能捕获只在首次创建 JSON 时刷新图标的问题。
  // 最终数据不得仅停留在队列 store，目录扫描必须提供新的 iconPath。
  // 测试不直接检查 store 私有字段，选择检查用户实际看到的两个图片位置。
  // 卡片与右栏使用各自图片 hook，分别验证可发现其中一个仍持有缺图缓存的情况。
  // 每条等待都通过现有有界轮询执行，隐藏窗口也不会无限等浏览器动画帧。
  // 外壳和窗口继续使用同一测试实例，不创建第二套模型列表来验证新图。
  // 如果扫描没有刷新，卡片没有 img，naturalWidth 的等待会明确超时失败。
  // 如果读取图片通道失败，img 可以存在但解码宽度为零，同样不能通过。
  // 如果详情复用了错误版本封面，PNG 格式和指定文件身份的配对会帮助定位。
  // 前面的 JSON 逐字比对仍保留，界面刷新不能以改写来源换取成功。
  // 这一组不验证从资源管理器拖入，也无需占用用户前台桌面或切换全屏程序。
  // 浅深主题与布局已由同脚本前面的回归执行，这里专门检查数据刷新。
  // 网络可达性另用生产下载传输核实，不能把此处本地 PNG 当公网下载证据。
  // 本次没有操纵用户真实模型、下载队列或已保存内容访问偏好。
  await click('[aria-labelledby="model-batch-recovery-title"] button');
  // 前面的占用测试选过 Alpha，目录会跟随所选文件展开，不假定仍停留 batch。
  // 只通过官方分类和搜索恢复可见范围，不手工更新索引或触发重新扫描。
  // 否则找不到卡片只是筛选前提错误，不能说明补图缓存存在回归。
  // 选择 loras 父分类后，Batch- 四个文件必须都能通过已有搜索展示。
  // 目录展开是纯 UI 行为，新增 PNG 是否进入索引仍取决于原完成回调。
  // 这相当于走回目标书架查看刚补好的书封面，不重新采购或补贴一次封面。
  // filterBatch 自己核对四张卡片，范围错误会在图片断言前单独报出。
  // 搜索不会调用哈希接口，已成功版本不会因验证图片再次执行补全。
  await click('[data-local-model-root=loras]');
  await filterBatch();
  const card = `[data-local-model-file=${JSON.stringify(batchNoLogo)}]`;
  const image = `document.querySelector(${JSON.stringify(card)})?.closest('[data-model-library-card]')?.querySelector('img')`;
  await wait(`${image}?.naturalWidth>0`);
  smoke.check("batch completion refreshes the decoded PNG on the model card", await run(`${image}?.src.startsWith('data:image/png')`));
  await openFile(batchNoLogo);
  await wait("document.querySelector('[data-local-model-details] img')?.naturalWidth>0");
  smoke.check("recovered cover also decodes in the selected model details", await run("document.querySelector('[data-local-model-details] img')?.src.startsWith('data:image/png')"));
}
async function setTab(text) {
  await run(`(()=>{const el=document.querySelector('[data-prompt-tab-input]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitTime(100);
}
async function verifyTriggers(win) {
  await win.loadURL("app://app/create"); await wait("document.querySelector('#prompt-editor')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await waitTime(500);
  smoke.check("no trigger button without a selected LoRA", await run("!document.querySelector('[data-apply-lora-triggers]')"));
  await addLora("Alpha"); await addLora("Beta");
  // 实际选择两份 LoRA 后再量标题栏，避免按钮隐藏时误判没有挤压。
  // 检查正文标题、高级组装与触发词的垂直中心，确认三者没有换到第二行。
  // 自动补全入口应被移除，不能只用透明度隐藏仍可被键盘激活的开关。
  // 右侧按钮的完整边界不得超过标题栏，禁止用裁切溢出冒充单行布局。
  // 后面的普通和高级写入检查继续验证按钮业务，几何通过不能替代真实应用触发词。
  // 截图保存真实创建页，不向组件注入仅供拍照的假标题或假按钮。
  // 等待元数据使触发词按钮出现，旁车读取速度不应影响几何测量。
  await wait("document.querySelector('[data-apply-lora-triggers]')");
  smoke.check("prompt header is one row with trigger action right and no autocomplete", await run("(()=>{const h=document.querySelector('[data-create-prompt-header]'),a=h.querySelector('[data-apply-lora-triggers]').getBoundingClientRect(),l=h.querySelector('label').getBoundingClientRect(),s=h.querySelector('[data-advanced-prompt-toggle]').getBoundingClientRect(),r=h.getBoundingClientRect();return !document.querySelector('#anima-autocomplete-toggle')&&Math.abs(a.y+a.height/2-l.y-l.height/2)<2&&Math.abs(a.y+a.height/2-s.y-s.height/2)<2&&a.right<=r.right&&a.left>s.right})()"));
  // 更新公告可能在首次关闭检查之后才异步出现，截图前需再次关闭实际可见公告。
  // 点击真实关闭入口，不用 CSS 隐藏遮罩，以免把正常焦点恢复问题掩盖掉。
  // 等到公告卸载后再截图，人工检查才能看见右侧触发词按钮。
  // 上面的几何断言不依赖截图，公告关闭不会把失败的布局检查变成成功。
  // 此处只清理测试窗口的公告，不修改用户应用的更新阅读记录。
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  // 公告 DOM 已卸载不代表离屏合成器已重绘，给截图一次有界提交机会。
  // 功能断言已经独立完成；主进程计时不会依赖隐藏页面的动画帧。
  await waitTime(350);
  fs.writeFileSync(path.join(directory, "prompt-header.png"), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('#prompt-editor').textContent='existing prompt, FIXTURE STYLE'");
  await click("[data-apply-lora-triggers]");
  const expected = "existing prompt, FIXTURE STYLE, shared word, second word";
  smoke.check("normal mode preserves existing text and deduplicates selected LoRA words", await run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(expected)}`));
  await click("[data-apply-lora-triggers]");
  smoke.check("repeat application is idempotent", await run(`document.querySelector('#prompt-editor').textContent===${JSON.stringify(expected)}`));
  await click("[data-advanced-prompt-toggle]"); await wait("document.querySelector('[data-prompt-tab-input]')");
  const tabs = await run("[...document.querySelectorAll('[data-prompt-tab]')].map(el=>el.dataset.promptTab)");
  await click(`[data-prompt-tab="${tabs[0]}"]`); await setTab("fixture style");
  await click(`[data-prompt-tab="${tabs[1]}"]`); await setTab("my character");
  await click("[data-apply-lora-triggers]");
  const advanced = "my character, shared word, second word";
  smoke.check("advanced mode appends into active category and deduplicates across categories", await run(`document.querySelector('[data-prompt-tab-input]').value===${JSON.stringify(advanced)}`));
  await click("[data-apply-lora-triggers]");
  smoke.check("advanced mode repeat is idempotent", await run(`document.querySelector('[data-prompt-tab-input]').value===${JSON.stringify(advanced)}`));
  await click(`[data-prompt-tab="${tabs[0]}"]`);
  smoke.check("other prompt category remains unchanged", await run("document.querySelector('[data-prompt-tab-input]').value==='fixture style'"));
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({ ...chrome.windowChromeOptions(), width: 1585, height: 992, show: false, webPreferences: { additionalArguments: chrome.windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents);
  chrome.registerWindowChrome(win);
  // 先检查原生 missing，再进行会创建 sidecar 的补全操作。
  // 最后继续验证创建页 LoRA 普通/高级触发词，覆盖格式复用的消费者。
  // 整个 Electron 冒烟只有这一个窗口序列，不并行启动其他冒烟进程。
  // 批量组在原始 missing/单项恢复之后执行，避免先创建 JSON 破坏旧用例前提。
  // 两个批量组共享一次暂停和重试过程，检查会话状态与真实 UI 结果。
  // 最后继续运行原有提示词消费回归，防止新判定影响已有 LoRA 资料读取。
  try { await verifyDetails(win); await verifyNative(); await verifyRecovery(); await verifyBatchStop(); await verifyBatchRetry(win); await verifyTriggers(win); }
  finally { win.destroy(); }
  // 布局断言失败会保留在同一 harness 里，后面的来源回归成功不能把它覆盖。
  // 正常退出前统一检查所有累计结果，测试报告不是只看最后一个截图是否写入成功。
  // 运行编号与临时目录会同步写入日志，后续人工查看图片时可追溯对应那次构建。
  // 窗口在上方 finally 已销毁，最终报告不再触发页面请求或新的图片解码。
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
