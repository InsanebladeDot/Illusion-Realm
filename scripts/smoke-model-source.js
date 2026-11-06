/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * model-download-network：复用下载专用会话和网络传输约束。
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * model-download.handlers：下载相关 IPC 与下载管理器在同一业务域维护。
 * civitai.handlers：Civitai 密钥相关 IPC 与密钥实现放在同一业务域。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * model-download-network：下载连接策略属于主进程，页面不自行读取 Cookie 或认证头。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * model-download.handlers：队列动作仍由主进程执行，preload 只负责参数和结果桥接。
 * civitai.handlers：输入校验和状态摘要仍由主进程封装，页面不直接访问凭据文件。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 * window-chrome：标题栏参数仍由主进程传入，渲染层不直接调用 Electron。
 * model-download-network：网络层与文件落盘层分开，便于识别重定向错误和本地写入错误。
 * user-data：读文档时的路径解析继续委托统一根目录，不能改成模块旁的文件。
 */
/** 模型来源回归：真实 UI + 原生下载 IPC，纯色预览和内存模型文件验证封面选择与 JSON 落盘。 */
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { createHash } = require("node:crypto");
const { app, BrowserWindow, protocol, nativeImage } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const { getDownloadSession } = require("../apps/electron/src/main/modules/models/downloads/model-download-network");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-source-")), modelsRoot = path.join(directory, "models");
// 两个来源调用同一组行为回归，避免对同样的文字控件各写一套宽松断言。
// 生产组件不导入测试助手，只有浏览器剪贴板边界在测试期间被替换。
// helper 不启动新窗口，仍遵守一次只运行一个 Electron 冒烟的约束。
const { verifyTriggerCopies, verifyDescriptionReader } = require("./lib/model-detail-readers-smoke");
// 左右面板共用同一组真实 CSS 动画回归，不按本地与在线另写定时等待。
// CDP 只覆盖本脚本窗口的动效偏好，结束后会释放，不影响用户桌面应用。
// 两端尺寸和中间帧分别断言，避免仅有最终宽度就声称动画已通过。
const { verifyModelLibraryMotion } = require("./lib/model-library-motion-smoke");
const smoke = createSmokeHarness({ name: "model-source", timeoutMs: 90000 });
const document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { paths: { searchPath: modelsRoot }, theme: "light", locale: "zh-CN" } });
const bytes = Buffer.alloc(65536, 42), hash = createHash("sha256").update(bytes).digest("hex");
const cover = color => nativeImage.createFromBitmap(Buffer.from(color), { width: 1, height: 1 }).toPNG();
const blue = cover([200, 100, 42, 255]), red = cover([42, 100, 200, 255]);
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], imageRequests = [], catalogRequests = [];
// 匹配只允许读取来源 JSON，任何隐式“补全资料”请求都记录为回归。
// 该计数不拦截原下载校验，下载权重按 SHA256 校验属于已有业务。
// 匹配标记与真正下载因此可以在同一次页面冒烟中独立核验。
let matchRecoveryCalls = 0;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(directory, "secrets");
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: document, filePath: "", isNew: false });
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/modules/models/downloads/model-download.handlers").registerModelDownloadHandlers();
require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers();
// 只在测试进程替换会触发模型哈希的补全通道，产品通道保持原实现。
// 一旦页面错误地调用它，先记次数再明确失败，不能悄悄完成一个假的补全。
// 原始只读元数据 IPC 未被替换，来源大小、真实路径与版本校验仍执行。
// 正常下载使用下载通道，不经过这里，不会让回归误伤已有下载测试。
registerHandle(C.MODELS_RECOVER_METADATA, () => { matchRecoveryCalls++; throw new Error("Matching must not recover model metadata"); });
require("../apps/electron/src/main/modules/civitai/civitai.handlers").registerCivitaiHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => directory);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, filePath) => fs.existsSync(filePath) ? "data:image/png;base64," + fs.readFileSync(filePath).toString("base64") : null);
const file = id => ({ id: id + 1000, name: `fixture-${id}.safetensors`, sizeKB: bytes.length / 1024, primary: true, hashes: { SHA256: hash }, metadata: { format: "SafeTensor" }, downloadUrl: `https://civitai.red/api/download/models/${id}?type=Model&token=fixture-secret` });
const model = { id: 1, name: "Source fixture", type: "LORA", description: "<p>Model introduction</p>", creator: { username: "Fixture author" }, modelVersions: [101, 102].map(id => ({ id, name: `v${id}`, baseModel: "SDXL", description: `<p>Version ${id}</p>` + (id === 101 ? "<p>Long model instructions, full text remains readable.</p>".repeat(30) : ""), trainedWords: ["fixture style,fixture word,,\nsecond group,third phrase,,"], files: [file(id)], images: [1, 2].map(index => ({ type: "image", nsfwLevel: 1, url: `https://image.civitai.com/preview-${index}.png` })) })) };
// 列表 API 的系列位于模型级 baseModels，版本级 baseModel 不能替代它。
// 固定六系列同时用于侧栏 SDXL 选项与前三项加 +3 的独立期望。
// 模拟响应应遵守真实生产解析契约，不能为测试要求改产品去猜缺失字段。
async function api(request) {
  if (request.url.includes("/api/v1/models")) catalogRequests.push(new URL(request.url));
  if (request.url.includes("/api/v1/models")) return new Response(JSON.stringify({ items: [{ ...model, baseModels: ["SDXL", "Anima", "Krea 2", "ZImageTurbo", "Flux.1 D", "Pony"], modelVersions: [...model.modelVersions, ...["Anima", "Krea 2", "ZImageTurbo", "Flux.1 D", "Pony"].map((baseModel, index) => ({ ...model.modelVersions[0], id: 200 + index, baseModel, files: [file(200 + index)] }))] }], metadata: {} }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  return new Response(request.url.includes("preview-2") ? red : blue, { headers: { "Content-Type": "image/png" } });
}
async function network(request) {
  if (request.url.includes("preview-")) { imageRequests.push(request.url); return new Response(request.url.includes("preview-2") ? red : blue, { headers: { "Content-Type": "image/png" } }); }
  return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) } });
}
// 轮询条件若自身执行异常，带回确切表达式，区分页面失败与测试定位错误。
// Electron 原始异常会省略页面侧具体语句，仅靠最后一条通过结果无法定位。
// 仍由主测试 catch 统一失败退出，不把异常转成 false 后等到超时。
async function wait(expression) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await run(`Boolean(${expression})`).catch(error => { throw new Error(`Wait expression failed: ${expression}: ${error.message}`); })) return; await delay(50); }
  console.error(await run("JSON.stringify({url:location.href,text:document.body.innerText.slice(-1500)})"));
  throw new Error("Model source condition timeout: " + expression);
}
// 选择器缺失时带出目标，避免 Electron 只报告没有上下文的 executeJavaScript 错误。
// 选择器常含双引号，错误文字也必须按 JS 字符串编码，否则测试自身先出现语法错误。
// 这只保护测试脚本求值，不会改变生产页面对分类或搜索的处理。
// 空选择器仍然报错，不能用可选链吞掉失效定位再伪报通过。
// 捕获时保留目标定位，明确是哪个按钮失效，不增加盲目重试。
// 失败仍进入原 harness 收尾，错误文字只使用测试固定目标，不含用户数据。
// 点击后的短暂调度机会沿用原 delay，真正加载仍由对应 wait 条件判断。
async function click(selector) { await run(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error(${JSON.stringify("Missing smoke target: " + selector)});element.click()})()`).catch(error => { throw new Error(`Click failed: ${selector}: ${error.message}`); }); await delay(50); }
async function waitCompleted(fileName) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const task = (await run("window.electronAPI.listModelDownloads()")).data.find(task => task.fileName === fileName);
    if (task?.status === "completed") return task;
    if (task?.status === "failed") throw new Error("Fixture download failed: " + task.error);
    await delay(50);
  }
  throw new Error("Download did not complete");
}
async function configure() { await click("[data-civitai-download]"); await wait("document.querySelector('[data-model-download-start]')?.disabled===false"); }
/**
 * 使用真实临时模型与来源 JSON 检查在线卡片标记，不直接给 React 塞匹配布尔值。
 * 每个场景重新进入页面，让 AppShell 按已有路径扫描发现实际文件。
 * 远端仍由固定 API 夹具提供，测试不把模型名或图片变化交给公网决定。
 * 等待本地只读元数据完成再核对缺标记，避免请求没回来时“没有”被误判为通过。
 * 有标记时也要核对证据类型，不能拿严格同名通过代替 SHA256 回退通过。
 * 旧的宽松文件名匹配会让第一条错误显示标记，形成直接的反证样本。
 * 旧的仅哈希规则会让第二条没有标记，两种错误都有独立样本捕获。
 * 所有页面都在同一个离屏窗口中，不切换用户桌面或读取真实模型配置。
 * 图片是测试协议返回的像素图，匹配证据来自本地磁盘而非封面相似度。
 */
async function assertLocalMatch(win, expected) {
  await win.loadURL("app://app/tools/models/civitai");
  await wait("document.querySelector('[data-civitai-card]')&&document.querySelector('[data-civitai-catalog]')?.dataset.civitaiLocalScanned==='true'&&document.querySelector('[data-civitai-catalog]')?.dataset.civitaiLocalState==='ready'");
  // 给扫描完成一个明确条件：本地文件已进入真实模型清单，而不是只等远端卡片。
  // scanned 标记来自 settings.lastScannedAt，与本地索引在同一次更新中写入。
  // 不通过“没有扫描中文字”猜完成，页面可能根本没有显示那段文字。
  // 命中条件用 DOM 的实际证据属性，不借用被测 matcher 的返回值当期望。
  // 文字翻译也由 CivitaiCard 选择，标记仍由原共享卡片角标插槽显示。
  // 两种证据各有独立的 title，避免用户把同名误解成重新校验了文件内容。
  // 空期望必须等元数据读取完成，不能因为 loading 初始隐藏而提前通过。
  await wait(expected ? `document.querySelector('[data-civitai-local-match]')?.dataset.civitaiLocalMatch===${JSON.stringify(expected)}` : "!document.querySelector('[data-civitai-local-match]')");
  smoke.check(`local match evidence is ${expected || 'absent'}`, await run(`(document.querySelector('[data-civitai-local-match]')?.dataset.civitaiLocalMatch||null)===${JSON.stringify(expected)}`));
}
/**
 * 名称与哈希使用配对样本：文件名相同但目录不符、严格全名、仅前缀相近、改名后哈希一致。
 * 目录标题直接取 Source fixture，不能靠别名 model.name 或去标点后的近似标题。
 * 只有版本文件名前缀完全相同才接受，fixture-101-extra 不能当成 fixture-101。
 * 同名正向没有 JSON，证明用户确认的低成本名称路径确实可独立工作。
 * 哈希正向的目录与文件均改名，不能让名称路径掩盖摘要回退未接通。
 * 哈希负向把 64 位摘要改成另一完整值，格式合法也不能随便认作同一文件。
 * JSON 存在却没有摘要的负向样本，防止把 ready 状态当作身份匹配。
 * 每条结束删除自己新建的精确文件，下一条不能借用前一条的成功证据。
 * 只删除显式创建的权重占位文本和 sidecar，空目录可以保留到测试结束。
 * 配置根由 mkdtemp 新建，实际用户模型目录、密钥和来源不被读取或修改。
 * 主进程来源仍通过生产读取链，坏路径或格式不能被夹具替身悄悄接受。
 * 返回页面不会自动补 JSON；补全通道计数必须始终保持零。
 * 大写摘要正向同时检查十六进制表示归一化，不能要求本地 JSON 必须小写保存。
 * 缺 JSON 与有 JSON 但空摘要分开验证，两者经过不同的来源读取状态。
 * 三个负向样本复用相同远端响应，失败不能归因于网站临时换了文件信息。
 * 文件名近似样本仍保持目录标题正确，确保测试确实能单独约束完整主干。
 * 错误目录样本仍保持文件名正确，确保两个名称条件不能被“任一个相同”替代。
 * 临时占位权重没有承诺能用于生成，此回归只覆盖扫描、来源读取和卡片判断。
 */
async function verifyLocalMatches(win) {
  const cases = [["Different model", "fixture-101", undefined, null], [model.name, "fixture-101", undefined, "name"], [model.name, "fixture-101-extra", undefined, null], ["Renamed", "renamed", hash.toUpperCase(), "sha256"], ["Renamed", "renamed", "f".repeat(64), null], ["Renamed", "renamed", "", null]];
  for (const [title, stem, sha256, expected] of cases) {
    // 每条只创建一个权重，使 AppShell 扫描完成后有确定的一条本地结果。
    // 文件字节故意不是实际下载模型，匹配应信任已有 JSON 而不重新计算它。
    // 若擅自重算，改名哈希正向会失败，补全通道计数也会暴露不必要请求。
    const filePath = path.join(modelsRoot, "loras", "SDXL", "match-fixtures", title, `${stem}.safetensors`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "local match fixture");
    if (sha256 !== undefined) fs.writeFileSync(filePath + ".civitai.json", JSON.stringify({ version: 1, sha256 }));
    // try/finally 将夹具所有权限定在这一条用例，即使断言失败也不留下成功证据。
    // unlink 只处理已知单文件，不使用计算出来的路径执行递归删除。
    // 真实页面依然拥有自己的播放器、预览与选中生命周期，测试不清空其 DOM。
    try { await assertLocalMatch(win, expected); }
    finally { fs.unlinkSync(filePath); if (sha256 !== undefined) fs.unlinkSync(filePath + ".civitai.json"); }
  }
  // 补全次数必须为零，不能只看最后卡片标签正确就忽略对大型模型的暗中读取。
  // 这里不禁止下载器的完整性校验，后续原有模型来源测试仍继续真实下载。
  // 这条断言覆盖整个六次页面进入，而非仅在一次成功请求前取计数。
  smoke.check("catalog matching never invokes SHA256 recovery", matchRecoveryCalls === 0);
}
// 在线与本地引用同一个外壳，在线测试仍经过生产请求适配器和浏览器 fetch。
// 只有远端 HTTPS 响应被夹具替换，筛选参数通过请求 URL 独立检查。
// 初次无选中时关闭资料也必须释放列宽，不能靠选择模型后才能点 X。
// 关闭状态跨搜索保持，点击真实模型才恢复详情与既有下载入口。
// 样式检查针对共享控件与 Card，不复制另一份测试页面来证明所谓一致。
// 主题切换通过 nativeTheme，不能用 CSS 滤镜给截图染色。
// 固定响应夹具提供真实页面使用的 Civitai 模型形状，不依赖公网模型变化。
// 首次在未选卡片时关闭空详情，用同一窗口测量列宽是否归还。
// 三个直接子节点和真实搜索框证明线上入口确实使用共同宿主与控件。
// 旧筛选入口应不存在，侧栏四种官方类别负责改写请求条件。
// Checkpoint 点击后读取实际 fetch URL，不以 React 内部 state 代替网络契约。
// 再选 Anima 验证类别与系列是并存条件，而不是后者覆盖前者。
// 输入通过 DOM input 事件更新受控草稿，再调用原生表单提交。
// wait 前留出 effect 调度机会；ready 仍需等页面回到非忙碌状态。
// 关闭详情后搜索不应该自动展开右栏，避免用户失去释放的空间。
// 最后把固定数据切回可显示的 LoRA/SDXL 组合以便保存有效截图。
// 逐次等待模型出现，避免上次请求状态的 aria-busy 提前满足条件。
async function verifyUnifiedLibrary(win) {
  const before = await run("document.querySelector('[data-civitai-catalog]').getBoundingClientRect().width");
  smoke.check("online uses shared three panels, search and sidebar categories", await run("document.querySelector('[data-model-library-workspace]')?.children.length===3&&!!document.querySelector('[data-model-library-search] [data-civitai-query]')&&document.querySelectorAll('[data-civitai-type]').length===4&&!document.querySelector('[data-civitai-filter]')"));
  // 公共回归先验证分类收起与恢复，再关闭当前空详情并测量中心扩展。
  // 截图读取当前生产页面，分别保留左栏收起与右栏关闭后的实际布局。
  // 初始 before 仍供既有独立宽度断言使用，避免只相信 helper 自己的期望。
  // helper 返回时左栏已恢复，后续类型、系列筛选仍通过原始侧栏完成。
  // 网络请求计数仍由原 catalogRequests 记录，不会因为收起而重建查询。
  await verifyModelLibraryMotion(win, { run, click, wait, check: (label, ok) => smoke.check(label, ok), capture: async name => { fs.writeFileSync(path.join(directory, `online-${name}.png`), (await win.webContents.capturePage()).toPNG()); } });
  smoke.check("online empty details close reclaims column width", await run(`!document.querySelector('[data-model-library-details]')&&document.querySelector('[data-civitai-catalog]').getBoundingClientRect().width>${before}+250`));
  await click('[data-civitai-type="Checkpoint"]');
  await wait("document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  smoke.check("sidebar type reaches original request contract", catalogRequests.at(-1).searchParams.get("types") === "Checkpoint");
  await click('[data-civitai-base="Anima"]');
  await wait("document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  smoke.check("sidebar base intersects selected type", catalogRequests.at(-1).searchParams.get("baseModels") === "Anima" && catalogRequests.at(-1).searchParams.get("types") === "Checkpoint");
  await run("(()=>{const el=document.querySelector('[data-civitai-query]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Source fixture');el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await run("document.querySelector('[data-civitai-query]').form.requestSubmit()");
  // 先等主进程观察到真实浏览器 fetch，再读请求参数，避免与 React 提交 effect 竞速。
  // ready 可能仍是上一次请求的状态，单看 aria-busy=false 不能证明新 query 已发出。
  await delay(100);
  await wait("document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  smoke.check("shared search submits draft with sidebar filters", catalogRequests.at(-1).searchParams.get("query") === "Source fixture" && catalogRequests.at(-1).searchParams.get("baseModels") === "Anima");
  smoke.check("search preserves closed details until card click", await run("!document.querySelector('[data-model-library-details]')"));
  // 固定夹具只含一份 SDXL LoRA，截图前把条件切回与夹具一致的类别。
  // 上面的请求参数断言仍独立覆盖 Checkpoint 与 Anima 交集，不据模拟结果假称真实命中。
  await click('[data-civitai-type="LORA"]');
  await wait("document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'&&document.querySelector('[data-civitai-card]')");
  await click('[data-civitai-base="SDXL"]');
  await wait("document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'&&document.querySelector('[data-civitai-card]')");
  fs.writeFileSync(path.join(directory, "model-library-online-closed.png"), (await win.webContents.capturePage()).toPNG());
  await verifyOnlineCard(win);
}
// 选中在线卡片应恢复右侧真实下载面板，但卡片点击本身不启动下载。
// overlay 文本检查卡片信息叠层，detail 按钮检查原业务入口仍在。
// 六系列夹具证明前三项缩写和 +N 规则来自准确长度差值。
// title 保留完整列表；nowrap 检查单行布局，不以视觉截图代替内容断言。
async function verifyOnlineCard(win) {
  // 从封面进入，而非直接点击文字按钮，才能发现旧版错误打开大图的分支。
  // 前一组已关闭右栏，因此这里必须由真实封面点击重新创建详情。
  // 图片读取由 HTTPS 夹具提供，不依赖外站可用性或真实账号。
  await click('[data-model-library-grid] button[class*=cardImagePreview]');
  await wait("document.querySelector('[data-civitai-details]')");
  // 右栏出现与无大图浮层必须同时成立，不能只看到旧资料就报告通过。
  // 网格中不应再保留画廊触发器，避免别的卡片仍走旧的预览入口。
  // 这里只检查卡片，详情图继续使用同一个 data-image-preview-trigger。
  smoke.check("online cover opens details without an image preview", await run("!document.querySelector('[data-image-preview-overlay]')&&!document.querySelector('[data-model-library-grid] [data-image-preview-trigger]')"));
  smoke.check("online card restores shared detail column and download action", await run("!!document.querySelector('[data-model-library-details] [data-civitai-download]')&&document.querySelector('[data-civitai-card] h3')?.textContent==='Source fixture'"));
  // 标题位于详情按钮内，不能再查一个嵌套的同名按钮作为测试目标。
  // 网格必须是白字纵向资料层，能捕捉 CSS module 裸类名失效的问题。
  // 长名称保持单行，统计依旧是独立横排，不以截图存在代替实际布局断言。
  smoke.check("online grid title uses the scoped vertical overlay", await run("(()=>{const title=document.querySelector('[data-civitai-card] h3'),box=title.parentElement;return getComputedStyle(box).flexDirection==='column'&&getComputedStyle(box).color==='rgb(255, 255, 255)'&&getComputedStyle(title).whiteSpace==='nowrap'})()"));
  await delay(250);
  fs.writeFileSync(path.join(directory, "model-library-online-light.png"), (await win.webContents.capturePage()).toPNG());
  // 六个不同系列必须得到前三个缩写与 +3，完整名称仍保留 title。
  // nowrap 和单个行框同时检查，避免只加省略却仍被父布局拆成多行。
  smoke.check("base badge keeps three abbreviations plus exact remaining count on one line", await run("(()=>{const el=document.querySelector('[data-civitai-bases]');return el.textContent==='LORASDX ANI KRE+3'&&el.title.includes('ZImageTurbo')&&getComputedStyle(el).whiteSpace==='nowrap'&&el.querySelector('span:nth-child(2)').getClientRects().length===1})()"));
  // 远端长说明与单数组逗号词组覆盖线上适配器，不能只测本地 sidecar。
  // 先测默认裁切与复制，再截图展开后的真实右栏，后续下载仍使用同一版本。
  // 复制失败测试会恢复 navigator，不影响后续详情与导出行为。
  // 在线 fixture 中 v101 为长说明，v102 仍保留短说明供版本切换回归。
  // 只有 v101 拼接额外段落，不改变版本 ID、文件摘要或下载目标。
  // 来源 JSON 的预期用固定句子构造，确保所有段落真实保存而非被 UI 裁切。
  // 触发词数组仍以原始形式保存，展示标签不是下载元数据的新来源。
  // 网格和列表稍后都会重新点击封面，当前展开状态不能改变点击目标。
  // helper 的 check 委托现有 harness，失败不会因为后面的下载成功被覆盖。
  const readers = { run, click, wait, check: (label, ok) => smoke.check(label, ok) };
  await verifyTriggerCopies(readers, ["fixture style", "fixture word", "second group", "third phrase"]);
  // 一个数组项内的真实换行构成两组，每组仍含两颗逗号标签。
  // 不根据屏幕上的折行数猜组数，这份固定期望与浏览器宽度无关。
  // 行内长短语必须保持完整，不把含空格的两个单词当作两颗标签。
  // 两组各有底板，后面的复制全部断言仍保持扁平逗号格式。
  // 原始换行继续保存在下载 JSON 中，展示分组不能写坏来源资料。
  // count 检查行数而非标签数，四颗标签不能错误地画成四组。
  smoke.check("online real newline preserves two independent tag groups", await run("document.querySelectorAll('[data-model-trigger-group]').length===2&&[...document.querySelectorAll('[data-model-trigger-group]')].every(el=>el.querySelectorAll('[data-copy-trigger-word]').length===2)"));
  await verifyDescriptionReader(readers);
  // 离屏窗口的截图等待一次合成刷新，DOM 尺寸就绪不代表旧绘制瓦片已经替换。
  // 等待不用于判定功能成功，滚动和截断断言已在 helper 中独立完成。
  // 这张图保留真实右栏与固定下载底部，能人工核对长文没有遮住操作。
  await delay(200);
  fs.writeFileSync(path.join(directory, "online-description-expanded.png"), (await win.webContents.capturePage()).toPNG());
  await verifyOnlineSection(win);
  // 列表密度使用相同 Card，也必须先关闭右栏再验证封面能重新打开它。
  // 不修改 React 内部状态，通过真实工具栏切换才能覆盖实际列表调用方。
  // 当前语言固定为中文夹具，按钮标签与生产 i18n 输出保持一致。
  await click('[aria-label="列表视图"]'); await click('[data-model-details-close]');
  // 第二个真实调用方也必须采用相同的 100px 方图，不能只修本地列表。
  // 资料来源是本脚本的模拟网站响应，没有注入仅供列表显示的假模型。
  // 检查网格资料实际隐藏，避免作者统计与两行核心信息同时铺满一行。
  // 名称仍是在线模型名，不能把未下载的模型伪装成本地已有的文件名。
  // 此处只要求属性包含网站类型，版本大小的语义仍由模拟响应提供。
  // 两个按钮共用选择回调，稍后的点击回归会确认列表没有错误唤醒大图。
  // 测量针对图像按钮边界，不依赖远端图片的固有长宽或完成加载时机。
  // 网格内容使用 display:none，不能单凭 opacity 为零让辅助技术读到重复资料。
  // 右栏已关闭，截图能检查紧凑列表在中心扩张后的样子。
  // 截图是人工检查依据，尺寸和内容断言独立执行，不以存在 PNG 作为通过。
  // 等待一次合成提交只用于截图，不能改变前面实际布局的判断。
  // 本组不开始下载，因此不用拥有公网凭据也能检查第二调用方。
  // 真实网络站点的字段是否完整不属于此模拟回归，最终交付中应明确区分。
  // 后续切回网格并执行原下载流程，以发现共享卡片修改造成的选择状态回归。
  smoke.check("online list uses shared compact thumbnail and core attributes", await run("(()=>{const root=document.querySelector('[data-model-library-card]'),image=root.querySelector('button[class*=cardImagePreview]').getBoundingClientRect(),summary=root.querySelector('[data-model-list-summary]');return image.width===100&&image.height===100&&summary.querySelector('small').textContent.includes('SDXL · LORA ·')&&getComputedStyle(root.querySelector('[class*=cardGridContent]')).display==='none'})()"));
  await delay(350);
  fs.writeFileSync(path.join(directory, "model-library-online-list.png"), (await win.webContents.capturePage()).toPNG());
  // 同一封面定位适用于两种密度，测试不另造一个仅验证布局的静态页面。
  // 右栏恢复前不运行任何下载动作，点击图片本身不能开始安装模型。
  // 若仍误开大图，下方资料等待或浮层断言至少有一项失败。
  await click('[data-model-library-grid] button[class*=cardImagePreview]');
  await wait("document.querySelector('[data-civitai-details]')");
  // 列表的结果必须仍是选中模型的资料，预览层只由后续详情图用例开启。
  // 切回网格后继续原有版本选图与来源下载回归，确认选择状态没有丢失。
  // 该检查只验证 UI，真实外站响应和权限不属于模拟数据冒烟的覆盖范围。
  smoke.check("online list cover opens details without an image preview", await run("!document.querySelector('[data-image-preview-overlay]')&&!!document.querySelector('[data-civitai-details]')"));
  await click('[aria-label="网格视图"]');
}
// 第二个调用方也必须实际引用共同折叠区，不能只有本地页支持收起。
// 收起远端类型区不应清除已提交的类型、系列和名称，也不应再次请求远端。
// 保存请求数是反证：如果折叠误触搜索，屏幕看似正常但这个计数会变化。
// 深色由真实外观入口切换，截图保留同一个已选模型和下载详情。
// 在线分类使用公共折叠区，收起不应提交一次新的远端模型查询。
// 先记录 fetch 次数，防止按钮无意触发筛选同时看起来成功收起。
// 已选 SDXL 和当前详情仍存在，说明视觉分组与模型业务选择彼此独立。
// 深色主题从现有外观入口切换，再保存同一张在线详情布局截图。
// 主题恢复通过相同设置入口完成，不污染后续下载来源回归状态。
async function verifyOnlineSection(win) {
  const requests = catalogRequests.length, section = '[data-model-library-section="civitai-type"]';
  await click(section + ' h2 button');
  await wait(`document.querySelector('${section} [data-collapsible-panel]').getBoundingClientRect().height===0`);
  smoke.check("online shared category folds without another search or lost filter", catalogRequests.length === requests && await run(`document.querySelector('${section} [inert]')&&document.querySelector('[data-civitai-base=SDXL]').getAttribute('aria-pressed')==='true'&&!!document.querySelector('[data-civitai-details]')`));
  await click(section + ' h2 button');
  await click('[data-theme-trigger]');
  await click('[data-theme-option=dark]');
  // 主题过渡标记在根节点 class 上，不是同名 data 属性。
  // 深色应用后外观面板仍保留，必须明确关闭，不能把下次点击误当成展开。
  // 用真实触发器清理浮层，不在测试中删除 DOM 或伪造关闭状态。
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme:dark)').matches&&!document.documentElement.classList.contains('theme-ripple')");
  await click('[data-theme-trigger]');
  fs.writeFileSync(path.join(directory, "model-library-online-dark.png"), (await win.webContents.capturePage()).toPNG());
  await click('[data-theme-trigger]');
  await click('[data-theme-option=light]');
  // 浅色也要等波纹结束，并关闭仍在的面板，后续下载按钮才是真实可达的目标。
  // 两个主题信号分别核对页面决议与系统媒体查询，不靠给截图加滤镜验收。
  // 本脚本已替换用户文档写入，主题变化不写进用户真实配置文件。
  await wait("document.documentElement.dataset.theme==='light'&&!matchMedia('(prefers-color-scheme:dark)').matches&&!document.documentElement.classList.contains('theme-ripple')");
  await click('[data-theme-trigger]');
}
async function verifyUi(win) {
  await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelector('[data-civitai-card]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await verifyUnifiedLibrary(win);
  await click("[data-civitai-card]"); await click("[data-civitai-preview-next]");
  smoke.check("manual next selects the second preview", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  // 在线详情的大图仍由原按钮手动切换，放大操作交给创建页共享预览层。
  // 当前索引受详情控制，打开预览应延续第二张而不是重置成第一张。
  await click("[data-civitai-preview] [data-image-preview-trigger]");
  await wait("document.querySelector('[data-image-preview-overlay] img')?.src.includes('preview-2')");
  smoke.check("Civitai detail opens the shared preview at its selected image", await run("document.querySelector('[data-image-preview-overlay] img')?.src.includes('preview-2')"));
  await click('[data-image-preview-overlay] > button');
  await wait("!document.querySelector('[data-image-preview-overlay]')");
  await delay(5500);
  smoke.check("preview does not advance automatically", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  await configure();
  smoke.check("download form uses current preview rather than first image", await run("document.querySelector('[data-model-download-form] img').src.includes('preview-2')"));
  await click("[data-model-download-form] button");
  smoke.check("returning to details preserves the chosen preview", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-2')"));
  await configure();
  await run(`(()=>{const input=document.querySelector('[data-model-download-form] input[type=file]'),transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob('${red.toString("base64")}'),c=>c.charCodeAt(0))],'custom.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait("document.querySelector('[data-model-download-form] img')?.src.startsWith('data:image/png')");
  smoke.check("custom cover still overrides the selected preview", true);
  await run("[...document.querySelectorAll('[data-model-download-form] button')].find(button=>button.textContent.includes('使用当前预览图')).click()");
  smoke.check("resetting custom cover returns to the selected preview", await run("document.querySelector('[data-model-download-form] img').src.includes('preview-2')"));
  await click("[data-model-download-start]");
  const task = await waitCompleted("fixture-101.safetensors"), metadataPath = task.filePath + ".civitai.json";
  smoke.check("model and per-file JSON are both committed", fs.readFileSync(task.filePath).equals(bytes) && fs.existsSync(metadataPath));
  const data = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  smoke.check("source JSON contains versioned model, page, creator and trigger words", data.version === 1 && data.modelId === 1 && data.modelName === model.name && data.source === "Civitai" && data.sourceTitle === model.name && data.sourceUrl === "https://civitai.red" && data.modelPageUrl === "https://civitai.red/models/1?modelVersionId=101" && data.creator === "Fixture author" && data.trainedWords.join(",") === model.modelVersions[0].trainedWords.join(","));
  smoke.check("source JSON keeps plain descriptions and public download options without credentials", data.description === "Model introduction" && data.versionDescription === "Version 101\n" + Array(30).fill("Long model instructions, full text remains readable.").join("\n") && data.versionId === 101 && data.versionName === "v101" && data.downloadUrl === "https://civitai.red/api/download/models/101?type=Model" && !JSON.stringify(data).includes("fixture-secret"));
  smoke.check("chosen preview is actually downloaded and saved as logo", imageRequests.at(-1).includes("preview-2") && fs.readFileSync(path.join(task.folderPath, "logo.png")).equals(red));
  smoke.check("no metadata temporary files remain", !fs.readdirSync(task.folderPath).some(name => name.endsWith(".part")));
  const dismissed = await run(`window.electronAPI.removeModelDownload(${JSON.stringify(task.id)})`);
  smoke.check("dismissing completed download preserves model, cover and source JSON", dismissed.success && fs.existsSync(task.filePath) && fs.existsSync(metadataPath) && fs.existsSync(path.join(task.folderPath, "logo.png")));
  await click("[data-civitai-version-bar] button");
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('v102')).click()"); await delay(80);
  smoke.check("version change resets preview to that version's first image", await run("document.querySelector('[data-civitai-preview] img').src.includes('preview-1')"));
  await configure(); await click("[data-model-download-start]");
  const second = await waitCompleted("fixture-102.safetensors");
  smoke.check("second version keeps its own JSON without overwriting the first", JSON.parse(fs.readFileSync(second.filePath + ".civitai.json", "utf8")).versionId === 102 && fs.readFileSync(metadataPath, "utf8") === JSON.stringify(data, null, 2) + "\n");
  smoke.check("later version uses its chosen cover even when the model already has a logo", fs.readFileSync(path.join(task.folderPath, "logo.png")).equals(blue));
  await verifyNative(task.folderPath);
  const moved = await run(`window.electronAPI.moveModelCategory(${JSON.stringify({ folderPath: task.folderPath, targetRootPath: path.join(modelsRoot, "loras"), category: "Moved" })})`);
  smoke.check("moving a category carries all version sidecars and the cover", moved.success && ["fixture-101.safetensors.civitai.json", "fixture-102.safetensors.civitai.json", "legacy.safetensors.civitai.json", "logo.png"].every(name => fs.existsSync(path.join(moved.data, name))));
  smoke.check("no React render or hydration errors", errors.length === 0);
}
async function verifyNative(folder) {
  const request = { modelType: "LORA", baseModel: "SDXL", modelName: model.name, fileName: "legacy.safetensors", downloadUrl: "https://civitai.red/api/download/models/103", category: "Uncategorized", sha256: hash, previewUrl: "" };
  const result = await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`);
  smoke.check("legacy callers without source snapshot remain accepted", result.success);
  const task = await waitCompleted(request.fileName);
  smoke.check("legacy downloads also get minimal source JSON and keep existing cover", JSON.parse(fs.readFileSync(task.filePath + ".civitai.json", "utf8")).versionId === 103 && fs.readFileSync(path.join(folder, "logo.png")).equals(blue));
  for (const source of [{ ...model.modelVersions[0], modelId: 1 }, { modelId: 1, versionId: 999, versionName: "v1", creator: "", description: "", versionDescription: "", trainedWords: [] }]) {
    const invalid = await run(`window.electronAPI.startModelDownload(${JSON.stringify({ ...request, source })})`);
    smoke.check("native IPC rejects malformed or mismatched source snapshots", !invalid.success && invalid.code === "INVALID_ARGUMENT");
  }
  const blockedPath = path.join(folder, "blocked.safetensors.civitai.json"); fs.writeFileSync(blockedPath, "existing source");
  const blocked = await run(`window.electronAPI.startModelDownload(${JSON.stringify({ ...request, fileName: "blocked.safetensors" })})`);
  await wait(`document.querySelector('[data-civitai-details]')`);
  let failed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const task = (await run("window.electronAPI.listModelDownloads()")).data.find(task => task.id === blocked.data.id);
    if (task.status === "failed") { failed = true; break; }
    await delay(50);
  }
  smoke.check("sidecar conflict fails visibly, preserves existing JSON and does not commit the model", failed && fs.readFileSync(blockedPath, "utf8") === "existing source" && !fs.existsSync(path.join(folder, "blocked.safetensors")));
  await run(`window.electronAPI.removeModelDownload(${JSON.stringify(blocked.data.id)})`);
  smoke.check("removing failed task preserves metadata owned by another download", fs.readFileSync(blockedPath, "utf8") === "existing source");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app }); protocol.handle("https", api);
  const downloadSession = getDownloadSession(); downloadSession.protocol.handle("https", network);
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 1500, height: 950, show: false, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.on("console-message", event => { if (event.level === "error" && /React|render|hydration|Minified/i.test(event.message)) errors.push(event.message); });
  try { await verifyLocalMatches(win); await verifyUi(win); } finally { occlusion.dispose(); downloadSession.protocol.unhandle("https"); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
