/**
 * model-download-network：复用下载专用会话和网络传输约束。
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * model-download.handlers：下载相关 IPC 与下载管理器在同一业务域维护。
 * civitai.handlers：Civitai 密钥相关 IPC 与密钥实现放在同一业务域。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * model-download-network：下载连接策略属于主进程，页面不自行读取 Cookie 或认证头。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * model-download.handlers：队列动作仍由主进程执行，preload 只负责参数和结果桥接。
 * civitai.handlers：输入校验和状态摘要仍由主进程封装，页面不直接访问凭据文件。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * model-download-network：网络层与文件落盘层分开，便于识别重定向错误和本地写入错误。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 * window-chrome：标题栏参数仍由主进程传入，渲染层不直接调用 Electron。
 */
/** Production UI/native IPC smoke with isolated model folders, fixture API and the real preload. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { app, BrowserWindow, nativeImage, dialog, protocol } = require("electron");
const { createSmokeHarness } = require("./lib/smoke-harness");
const { getDownloadSession } = require("../apps/electron/src/main/modules/models/downloads/model-download-network");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, registerWindowChrome, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-model-download-ui-"));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, "secrets");
const modelsRoot = path.join(root, "models");
const settings = { paths: { searchPath: modelsRoot }, theme: "light", locale: "zh-CN" };
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: { settings }, filePath: "", isNew: false });
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 下载中心位于正式自定义顶栏，初始化时需要真实的窗口状态查询通道。
// 使用生产handler避免缺失通道被读取回落掩盖，不伪造最大化或全屏结果。
// 窗口只属于本专项隔离进程，不触碰用户已经打开的客户端。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers();
require("../apps/electron/src/main/modules/models/downloads/model-download.handlers").registerModelDownloadHandlers();
require("../apps/electron/src/main/modules/civitai/civitai.handlers").registerCivitaiHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession({ settings }), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => path.join(root, "output"));
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, file) => fs.existsSync(file) ? "data:image/png;base64," + fs.readFileSync(file).toString("base64") : null);
const openedModelPaths = [];
registerHandle(C.SHELL_OPEN_PATH, (_event, folder) => { openedModelPaths.push(folder); return folder; });
const smoke = createSmokeHarness({ name: "model-download-ui", timeoutMs: 120000 });
const errors = [];
const bytes = Buffer.alloc(512 * 1024, 42);
const hash = createHash("sha256").update(bytes).digest("hex");
const cover = nativeImage.createFromBitmap(Buffer.from([42, 100, 200, 255]), { width: 1, height: 1 }).toPNG();
const newCover = nativeImage.createFromBitmap(Buffer.from([200, 42, 100, 255]), { width: 1, height: 1 }).toPNG();
const replacement = path.join(root, "replacement.png"); fs.writeFileSync(replacement, newCover);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let win;
let paginationMode = false;
let failLastPage = true;
const pageRequests = [0, 0, 0, 0];
const run = (expression) => win.webContents.executeJavaScript(expression, true);
async function wait(expression) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await run(`Boolean(${expression})`)) return; await delay(100); }
  throw new Error("UI condition timeout: " + expression);
}
async function click(selector) { await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.click()})()`); await delay(100); }
async function input(selector, value) {
  await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(100);
}
async function screenshot(name) {
  await delay(250);
  fs.writeFileSync(path.join(root, name + ".png"), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
function fixtureModel(id, name, preview) {
  return { id, name, type: "LORA", baseModels: ["SDXL"], creator: { username: "Fixture" }, modelVersions: [{ id, name: "v1", baseModel: "SDXL", files: [{ id, name: `fixture-${id}.safetensors`, sizeKB: bytes.length / 1024, primary: true, hashes: { SHA256: hash }, downloadUrl: `https://civitai.red/api/download/models/${id}`, metadata: { format: "SafeTensor" } }], images: preview ? [{ type: "image", nsfwLevel: 1, url: "https://image.civitai.com/preview.png" }] : [] }] };
}
async function fixtureApiResponse(request) {
  if (!request.url.includes("/api/v1/models")) return new Response(cover, { headers: { "Content-Type": "image/png" } });
  let payload = { items: [fixtureModel(1, "With Preview", true), fixtureModel(2, "No Preview", false), fixtureModel(3, "Cancel", false)] };
  if (paginationMode) {
    const page = Number(new URL(request.url).searchParams.get("page") || 1);
    pageRequests[page]++;
    await delay(200);
    if (page === 3 && failLastPage) return new Response("Fixture failure", { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
    const ids = page === 1 ? Array.from({ length: 12 }, (_, index) => index + 1) : page === 2 ? Array.from({ length: 13 }, (_, index) => index + 12) : [25];
    payload = { items: ids.map((id) => fixtureModel(id, "Page model " + id, false)), metadata: page < 3 ? { nextPage: `https://civitai.red/api/v1/models?page=${page + 1}` } : {} };
  }
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function streamingResponse(request) {
  // Electron 会把 protocol handler 的 Promise 拒绝转换为 HTTP 错误响应。
  // 因此先返回合法响应头，再让流读取报错，才能真实覆盖 failed/network。
  // 故障发生在首个异步 pull，不能用 HTTP 500 冒充连接中断来通过分类断言。
  // 本机夹具不等待生产 90 秒超时，也不访问真实下载地址。
  // 延时保证 Response 已交回 Electron，流错误走传输边界而不是 handler 拒绝。
  // 本例尚未写入模型字节，专门覆盖无断点的失败任务依然能够点 X 删除。
  // 另一个原生回归使用真实分块 HTTP 中断，覆盖有断点文件的删除。
  // 流由请求者消费，测试不创建永久监听器或保留无法结束的网络连接。
  // 故障没有伪造 ModelDownloadTask，任务 error 仍由生产 manager 判定。
  if (request.url.endsWith("/408")) return Promise.resolve(new Response(new ReadableStream({
    async pull(controller) { await delay(20); controller.error(new Error("Fixture connection lost")); },
  }), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) } }));
  if (request.url.includes("preview")) return Promise.resolve(new Response(cover, { headers: { "Content-Type": "image/png" } }));
  if (request.url.endsWith("/401")) return Promise.resolve(new Response("", { status: 401 }));
  if (request.url.endsWith("/500")) return Promise.resolve(new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }));
  const offsetStart = Number(/^bytes=(\d+)-$/.exec(request.headers.get("Range") || "")?.[1] || 0);
  let offset = offsetStart;
  const stream = new ReadableStream({ async pull(controller) {
    await delay(request.url.endsWith("/3") ? 300 : 20);
    if (request.signal.aborted) { controller.error(new DOMException("Cancelled", "AbortError")); return; }
    controller.enqueue(bytes.subarray(offset, offset + 16384)); offset += 16384;
    if (offset === bytes.length) controller.close();
  } });
  return Promise.resolve(new Response(stream, { status: offsetStart ? 206 : 200, headers: { "Content-Type": "application/octet-stream", "Content-Length": bytes.length - offsetStart, ETag: '"fixture-model"', ...(offsetStart ? { "Content-Range": `bytes ${offsetStart}-${bytes.length - 1}/${bytes.length}` } : {}) } }));
}
async function configure(id) {
  await click(`[data-civitai-card="${id}"]`); await click("[data-civitai-download]");
  await wait("document.querySelector('[data-model-download-start]')?.disabled===false&&document.querySelector('[data-model-download-start]').getBoundingClientRect().width>0");
}
async function verifyCaptionEntry() {
  await wait("document.querySelector('[data-window-download]')");
  // head已按用户要求缩为44px，main外框直接接其下沿，不再保留旧的8px顶距。
  // 下载入口仍须避开右侧自定义窗口按钮，并保留no-drag命中语义。
  // 同时测入口和main坐标，不能把旧54/62px断言当成新布局回归。
  smoke.check("Caption entry fits the 44px custom head above main", await run("(()=>{const button=document.querySelector('[data-window-download]').getBoundingClientRect();return button.top===0&&button.height===44&&button.right<=innerWidth-130&&document.querySelector('#main-content').getBoundingClientRect().top===44&&getComputedStyle(document.querySelector('[data-window-download]')).getPropertyValue('-webkit-app-region')==='no-drag'})()"));
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Download icon opens an empty global center", await run("document.querySelector('[data-window-download-center]').textContent.includes('暂无下载任务')"));
  await screenshot("titlebar-empty-light");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Escape closes the center and restores focus to its trigger", await run("!document.querySelector('[data-window-download-center]')&&document.activeElement===document.querySelector('[data-window-download]')"));
}
async function verifyCaptionProgress() {
  await wait("document.querySelector('[data-window-download-count]')?.textContent==='1'");
  const point = await run("(()=>{const r=document.querySelector('[data-window-download]').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  await wait("document.querySelector('[data-window-download-center]')?.textContent.includes('fixture-3')");
  await wait("document.querySelector('[data-window-download-center] progress')?.value>0");
  smoke.check("Native caption mouse click opens live download progress", await run("document.querySelector('[data-window-download-center] progress')?.max===100"));
  await screenshot("titlebar-download-progress-dark");
  await click("a[href='/tools']"); await wait("location.pathname==='/tools'");
  await wait("!document.documentElement.classList.contains('page-transition')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Downloads remain accessible after leaving the model page", await run("document.querySelector('[data-window-download-center]').textContent.includes('fixture-3')"));
  await run("[...document.querySelectorAll('[data-window-download-center] [data-model-download-task]')].find(el=>el.textContent.includes('fixture-3')).querySelector('[data-download-cancel]').click()");
  await wait("document.querySelector('[data-window-download-center]').textContent.includes('已取消')");
  smoke.check("Global cancel clears the active badge", await run("!document.querySelector('[data-window-download-count]')"));
  await verifyRetryAndRemove();
  await run("document.querySelector('#main-content').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  smoke.check("Outside pointer closes the progress panel", await run("!document.querySelector('[data-window-download-center]')"));
  await click("[data-tool-category=models]"); await click("[data-tool-entry='/tools/models/civitai']");
  await wait("document.querySelectorAll('[data-civitai-card]').length===3");
}
async function verifyRetryAndRemove() {
  const before = (await run("window.electronAPI.listModelDownloads()")).data.find((task) => task.fileName === "fixture-3.safetensors");
  const selector = `[data-model-download-task="${before.id}"]`;
  smoke.check("Cancel preserves partial bytes and displays Retry with the rightmost delete icon", before.received > 0 && fs.existsSync(path.join(before.folderPath, `.download-${before.id}.part`)) && await run(`Boolean(document.querySelector('${selector} [data-download-retry]')&&document.querySelector('${selector} [data-download-remove]'))`));
  await screenshot("download-cancelled-retry");
  await click(selector + " [data-download-retry]");
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='downloading'`);
  smoke.check("Retry resumes the original task and exposes download speed/remaining text", await run(`document.querySelectorAll('${selector}').length===1&&document.querySelector('${selector}').textContent.includes('/s')`));
  await screenshot("download-retry-progress");
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='completed'`);
  smoke.check("Resumed UI download completes with exact model bytes", fs.readFileSync(before.filePath).equals(bytes));
  await click(selector + " [data-download-remove]");
  await wait(`!document.querySelector('${selector}')`);
  smoke.check("Rightmost X dismisses a completed task and preserves the model", fs.readFileSync(before.filePath).equals(bytes) && !(await run("window.electronAPI.listModelDownloads()")).data.some((task) => task.id === before.id));
  await verifyActiveRemoval();
}
async function verifyActiveRemoval() {
  const request = { modelType: "LORA", baseModel: "SDXL", modelName: "Remove active", fileName: "active.safetensors", downloadUrl: "https://civitai.red/api/download/models/3", category: "Uncategorized", sha256: hash, previewUrl: "" };
  const task = (await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`)).data;
  const selector = `[data-model-download-task="${task.id}"]`;
  await wait(`document.querySelector('${selector}')?.dataset.downloadStatus==='downloading'`);
  await delay(650); await click(selector + " [data-download-remove]");
  await wait(`!document.querySelector('${selector}')`);
  await delay(350);
  smoke.check("X on an active task removes partial files without recreating the row", !fs.existsSync(task.folderPath) && await run(`!document.querySelector('${selector}')`));
  await screenshot("download-list-compact-dark");
}
async function verifyDownloads() {
  await configure(1);
  smoke.check("Default category and configured destination shown", await run("document.querySelector('[data-model-download-form]').textContent.includes('Uncategorized')"));
  await screenshot("download-light");
  await click("[data-model-download-start]");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  await wait("document.querySelector('[data-window-download-center] [data-model-download-task]')?.textContent.includes('已完成')");
  smoke.check("Model page has only the titlebar download entry", await run("!document.querySelector('[data-model-downloads]')&&document.querySelectorAll('[data-model-download-list]').length===1"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Download reaches native destination and saves first preview as logo.png", fs.existsSync(path.join(modelsRoot, "loras", "Uncategorized", "With Preview", "fixture-1.safetensors")) && fs.existsSync(path.join(modelsRoot, "loras", "Uncategorized", "With Preview", "logo.png")));
  await configure(2);
  await click("[data-model-download-form] button[aria-label='分类']");
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('自定义分类')).click()");
  await input("#model-download-category", "Styles");
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='dark'");
  await delay(700); await screenshot("download-dark");
  await click("[data-model-download-start]");
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  await wait("[...document.querySelectorAll('[data-window-download-center] [data-model-download-task]')].filter(el=>el.textContent.includes('已完成')).length===2");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Custom category creates an independent folder and no-preview models have no logo", fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "fixture-2.safetensors")) && !fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "logo.png")));
  await configure(3); await click("[data-model-download-start]");
  await verifyCaptionProgress();
  smoke.check("Cancelled task can retry to completion and keeps its file after dismissal", fs.readFileSync(path.join(modelsRoot, "loras", "Uncategorized", "Cancel", "fixture-3.safetensors")).equals(bytes));
}
async function verifyLocalAndNarrow() {
  await click("[data-model-library=local]"); await wait("document.querySelectorAll('[data-local-model-card]').length===3");
  smoke.check("Local library auto-refreshes and shows custom categories", await run("document.querySelector('[data-local-model-library]').textContent.includes('Styles')"));
  await openLocalDetails("No Preview");
  smoke.check("Missing logo displays actual model filename", await run("document.querySelector('[data-local-model-details]').textContent.includes('fixture-2.safetensors')"));
  const originalDialog = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [replacement] });
  try { await click("[data-local-change-logo]"); await wait("document.querySelector('[data-local-model-details] img')?.src.startsWith('data:image/png')"); }
  finally { dialog.showOpenDialog = originalDialog; }
  smoke.check("Change-logo button writes logo.png and updates the cover", fs.existsSync(path.join(modelsRoot, "loras", "Styles", "No Preview", "logo.png")));
  await openLocalDetails("With Preview");
  await wait("document.querySelector('[data-local-model-details] img')?.src.startsWith('data:image/png')");
  const oldSrc = await run("document.querySelector('[data-local-model-details] img').src");
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [replacement] });
  try { await click("[data-local-change-logo]"); await wait(`document.querySelector('[data-local-model-details] img')?.src!==${JSON.stringify(oldSrc)}`); }
  finally { dialog.showOpenDialog = originalDialog; }
  smoke.check("Replacing the same logo path invalidates the image cache", true);
  await verifyLocalHierarchy();
  await verifyLocalCategoryMoves();
  await verifyBatchModels();
  await click("[data-model-library=online]"); await wait("document.querySelectorAll('[data-civitai-card]').length===3");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await configure(1);
  await screenshot("download-mobile");
  smoke.check("Mobile download configuration fits the viewport", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelectorAll('[data-model-download-form]').length===1&&document.querySelector('[data-model-download-start]').getBoundingClientRect().width>0&&document.querySelector('[data-model-download-start]').getBoundingClientRect().bottom<=innerHeight"));
  smoke.check("Real IPC rejects traversal", (await run("window.electronAPI.startModelDownload({modelType:'LORA',baseModel:'SDXL',modelName:'escape',fileName:'model.pt',downloadUrl:'https://civitai.red/api/download/models/1',category:'../escape',sha256:'',previewUrl:''})")).success === false);
  smoke.check("No React rendering or hydration errors", errors.length === 0);
  await verifyNarrowCenter();
}
/**
 * 下载完成后重新加载真实渲染进程，验证列表回填与通知的区别。
 * 前提为已有两条完成任务，另两条移除记录已通过原有流程清理。
 * 原生下载管理器仍是同一主进程，本例不冒充跨进程重启测试。
 * 四次实际Electron重启与Range/If-Range验证由独立持久化专项负责。
 * 本用例补充页面启动时只恢复历史，不重播完成通知的用户可见行为。
 * 首先从原生列表取得稳定ID，刷新后按相同ID检查全局下载中心。
 * 文件清单独立从临时userData读取，避免UI有记录但未落盘的假通过。
 * 清单必须带version=1，并保留相同数量的任务，不能只是保存一个空文件。
 * 隔离设置保持刷新前主题，避免破坏后续明暗切换用例的起始条件。
 * 设置属于测试夹具，不读写真实账户资料或系统外观偏好。
 * 完整loadURL重新建立页面模块，Zustand内存为空，能够实际触发初始列表回填。
 * 等待三张目录卡片说明页面和preload均已初始化，不只等待静态HTML。
 * 更新公告按原夹具关闭，避免模态层遮住下载入口造成假红。
 * 中心打开后等待两条任务，确保异步listModelDownloads已返回。
 * 行数与稳定ID一起检查，避免重复显示和误认刚开始的新下载。
 * 完成状态必须仍在，不能为了过滤旧通知而把完成历史一并删除。
 * 全局status区域不应包含已下载提示，它只属于本次运行新的完成事件。
 * 原来的任务完成用例仍检查真实写盘，因此本例不会用屏蔽全部事件来通过。
 * 检查后关闭中心，让本地模型后续流程继续从正常浏览状态进入。
 * 模型文件及封面不在刷新时删除，后续本地库断言继续读取相同字节。
 * 没有额外网络服务器或伪造任务列表，恢复仍走真实IPC和管理器。
 * 假模型内容由已有本地协议夹具提供，不访问外网或花费模型额度。
 * 本例与其余Electron专项串行执行，不争用单实例锁或用户窗口。
 * 临时JSON仅包含当前专项的模型路径，不把持久化内容打印到控制台。
 * 失败由原smoke护栏转为非零退出，不能靠app.quit掩盖。
 * 这些断言针对列表初始化；正常退出的文件句柄关闭由原生重启专项验证。
 * 读取清单发生在移除操作已完成之后，manager已等待对应的写入链。
 * 刷新不创建新的下载任务，因此历史编号及.part归属不会变化。
 * 测试结束由现有finally销毁本窗口，夹具目录保留便于复核。
 */
async function verifyRestoredHistory() {
  const previous = (await run("window.electronAPI.listModelDownloads()")).data;
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, "browser", "model-download-queue.json"), "utf8"));
  smoke.check("Completed UI tasks have a versioned durable queue snapshot", previous.length === 2 && snapshot.version === 1 && snapshot.jobs.length === 2);
  settings.theme = await run("document.documentElement.dataset.theme");
  await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelectorAll('[data-civitai-card]').length===3");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await click("[data-window-download]"); await wait("document.querySelectorAll('[data-model-download-task]').length===2");
  smoke.check("Renderer reload restores completed rows without replaying old success notifications", await run(`(()=>{const ids=${JSON.stringify(previous.map(task => task.id))};return [...document.querySelectorAll('[data-model-download-task]')].every(e=>ids.includes(e.dataset.modelDownloadTask)&&e.dataset.downloadStatus==='completed')&&![...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('已下载：'))})()`));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
}
async function chooseLocalCategory(name) {
  await click("[data-local-model-category] button");
  await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()===${JSON.stringify(name)}).click()`);
}
async function openLocalDetails(name) {
  await run(`[...document.querySelectorAll('[data-local-model-card]')].find(el=>el.textContent.includes(${JSON.stringify(name)})).parentElement.querySelector('[data-local-model-details-open]').click()`);
  await wait("document.querySelector('[data-local-model-details]')");
}
async function chooseMoveOption(selector, name) {
  await click(selector);
  await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()===${JSON.stringify(name)}).click()`);
}
async function verifyLocalCategoryMoves() {
  const source = path.join(modelsRoot, "loras", "Uncategorized", "With Preview");
  const conflict = path.join(modelsRoot, "loras", "Conflict", "With Preview");
  fs.mkdirSync(conflict, { recursive: true }); fs.writeFileSync(path.join(conflict, "keep.txt"), "existing");
  await openLocalDetails("With Preview");
  await click("[data-local-change-category]"); await wait("document.querySelector('[data-model-category-form]')");
  smoke.check("Change category starts at the actual major/category folder", await run("document.querySelector('[data-model-category-root]').textContent.includes('loras')&&document.querySelector('[data-model-category-form]').textContent.includes('Uncategorized')&&document.querySelector('[data-model-category-move]').disabled"));
  await chooseMoveOption("[data-model-category-root] button", "checkpoints");
  smoke.check("Cross-major selection shows an explanation and no automatic move action", await run("document.querySelector('[data-model-category-cross]').textContent.includes('不支持跨大分类')&&!document.querySelector('[data-model-category-move]')") && fs.existsSync(source));
  await click("[data-model-category-source]"); await click("[data-model-category-target]");
  smoke.check("Cross-major explorer buttons point to source and target folders", openedModelPaths.at(-2) === source && openedModelPaths.at(-1) === path.join(modelsRoot, "checkpoints"));
  await screenshot("local-model-category-cross-dark");
  smoke.check("IPC independently refuses cross-major moves", (await run(`window.electronAPI.moveModelCategory({folderPath:${JSON.stringify(source)},targetRootPath:${JSON.stringify(path.join(modelsRoot, "checkpoints"))},category:'Styles'})`)).error === "crossRoot");
  await chooseMoveOption("[data-model-category-root] button", "loras");
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "Conflict");
  smoke.check("Single move waits for explicit acknowledgement", await run("document.querySelector('[data-model-category-move]').disabled") && fs.existsSync(source));
  await click("[data-model-category-acknowledge]");
  await click("[data-model-category-move]"); await wait("document.querySelector('[data-model-category-form] [role=alert]')");
  smoke.check("UI reports a folder collision without replacing its contents", await run("document.querySelector('[data-model-category-form] [role=alert]').textContent.includes('同名模型文件夹')") && fs.readFileSync(path.join(conflict, "keep.txt"), "utf8") === "existing" && fs.existsSync(source));
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "自定义分类…");
  await input("[data-model-category-form] input[type=text], [data-model-category-form] input:not([type])", "../escape");
  smoke.check("Invalid custom categories cannot be submitted", await run("document.querySelector('[data-model-category-move]').disabled"));
  await input("[data-model-category-form] input[type=text], [data-model-category-form] input:not([type])", "New Style");
  smoke.check("Changing the destination resets move acknowledgement", await run("!document.querySelector('[data-model-category-acknowledge]').checked&&document.querySelector('[data-model-category-move]').disabled"));
  await click("[data-model-category-acknowledge]");
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='light'");
  await screenshot("local-model-category-light");
  await click("[data-model-category-move]");
  await wait("document.querySelector('[data-local-model-details]')?.textContent.includes('New Style')&&document.querySelector('[data-local-model-category] button')?.textContent.includes('New Style')");
  const moved = path.join(modelsRoot, "loras", "New Style", "With Preview");
  smoke.check("Move refreshes category filter, focused details and the cover", !fs.existsSync(source) && fs.existsSync(path.join(moved, "fixture-1.safetensors")) && fs.existsSync(path.join(moved, "logo.png")) && await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-details]').textContent.includes('With Preview')"));
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait("document.querySelector('[aria-labelledby=local-model-details-title]')");
  await click("[data-local-change-category]"); await wait("document.querySelector('[data-model-category-form]')");
  smoke.check("Category editor fits narrow model details", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-model-category-form]').getBoundingClientRect().right<=innerWidth"));
  await screenshot("local-model-category-mobile");
  await chooseMoveOption("[data-model-category-form] button[aria-label='分类']", "Uncategorized");
  await click("[data-model-category-acknowledge]");
  await click("[data-model-category-move]"); await wait("document.querySelector('[data-local-model-details]')?.textContent.includes('Uncategorized')&&!document.querySelector('[data-model-category-form]')");
  smoke.check("Narrow details move back to an existing category and retain the model", fs.existsSync(path.join(source, "fixture-1.safetensors")) && !fs.existsSync(moved));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
}
async function verifyLocalHierarchy() {
  for (const [type, category, name] of [["checkpoints", "Styles", "Checkpoint Style"], ["checkpoints", "Portrait", "Checkpoint Portrait"], ["embeddings", "Expressions", "Embedding Expression"]]) {
    const folder = path.join(modelsRoot, type, category, name); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, name + ".safetensors"), bytes);
  }
  await run("[...document.querySelectorAll('[data-local-model-library] button')].find(el=>el.textContent.includes('重新扫描')).click()");
  await wait("[...document.querySelectorAll('[data-local-model-library] button')].some(el=>el.textContent.includes('重新扫描')&&!el.disabled)");
  await wait("document.querySelectorAll('[data-local-model-card]').length===6");
  await click("[data-local-model-root=loras]");
  await chooseLocalCategory("Styles");
  smoke.check("Root tag filters its models before subcategories", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('No Preview')"));
  await click("[data-local-model-root=checkpoints]");
  smoke.check("Switching root tag resets subcategory and details", await run("document.querySelectorAll('[data-local-model-card]').length===2&&document.querySelector('[data-local-model-category] button').textContent.includes('全部')&&!document.querySelector('[data-local-model-details]')"));
  await click("[data-local-model-category] button");
  smoke.check("Subcategories belong only to the current model type", await run("[...document.querySelectorAll('[role=option]')].map(el=>el.textContent.trim()).sort().join('|')==='Portrait|Styles|全部'"));
  await run("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.trim()==='Portrait').click()");
  smoke.check("Checkpoint subcategory shows its own models", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('Checkpoint Portrait')"));
  await click("[data-local-model-root=embeddings]");
  smoke.check("Embedding root tag displays all its models by default", await run("document.querySelectorAll('[data-local-model-card]').length===1&&document.querySelector('[data-local-model-card]').textContent.includes('Embedding Expression')&&document.querySelector('[data-local-model-category] button').textContent.includes('全部')"));
  await click("[data-local-model-root=loras]");
  smoke.check("Returning to the LoRA root tag displays its models", await run("document.querySelectorAll('[data-local-model-card]').length===3"));
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  smoke.check("Hierarchical filters fit a narrow local library", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-local-model-category]').getBoundingClientRect().right<=innerWidth"));
  await screenshot("local-model-hierarchy-mobile");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await screenshot("local-model-hierarchy");
}
async function verifyBatchModels() {
  await chooseLocalCategory("全部");
  const sources = [path.join(modelsRoot, "loras", "Uncategorized", "With Preview"), path.join(modelsRoot, "loras", "Uncategorized", "Cancel"), path.join(modelsRoot, "loras", "Styles", "No Preview")];
  smoke.check("Default library browses models with no checkboxes or select-all action", await run("document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'&&!document.querySelector('[data-local-model-checkbox]')&&!document.querySelector('[data-local-select-all]')"));
  await click("[data-local-model-card]"); await wait("document.querySelector('[data-local-model-details]')");
  smoke.check("Default card click opens details without selecting or changing files", await run("!document.querySelector('[data-local-model-card][aria-pressed=true]')") && sources.every(fs.existsSync));
  await screenshot("local-model-default-browse");
  await click("[data-local-batch-move]");
  smoke.check("Move enters empty multiselection without opening confirmation", await run("document.querySelectorAll('[data-local-model-checkbox]').length===3&&!document.querySelector('[data-local-model-card][aria-pressed=true]')&&!document.querySelector('[data-local-model-details]')&&!document.querySelector('[data-local-batch-dialog]')&&document.querySelector('[data-local-batch-move]').disabled"));
  await click("[data-local-select-all]");
  smoke.check("Explicit select-all checks cards only after entering a batch action", await run("document.querySelectorAll('[data-local-model-card][aria-pressed=true]').length===3") && sources.every(fs.existsSync));
  await click("[data-local-model-card]");
  smoke.check("Clicking a card toggles only that selection", await run("document.querySelectorAll('[data-local-model-card][aria-pressed=true]').length===2"));
  await click("[data-local-select-all]"); await click("[data-local-batch-move]");
  await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Batch move confirmation lists every source and waits for acknowledgement", await run("document.querySelector('[data-local-batch-confirm]').disabled&&!document.querySelector('[data-local-batch-acknowledge]').checked&&document.querySelector('[data-local-batch-dialog]').textContent.includes('No Preview')") && sources.every(fs.existsSync));
  await chooseMoveOption("[data-local-batch-dialog] button[aria-label='模型大分类']", "checkpoints");
  smoke.check("Batch move refuses crossing major categories", await run("document.querySelector('[data-local-batch-confirm]').disabled&&document.querySelector('[data-local-batch-dialog]').textContent.includes('不支持跨大分类')") && sources.every(fs.existsSync));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Closing batch confirmation leaves all models unchanged", sources.every(fs.existsSync));
  await click("[data-local-batch-move]"); await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  await chooseMoveOption("[data-local-batch-dialog] button[aria-label='分类']", "自定义分类…");
  await input("[data-local-batch-dialog] input:not([type])", "Batch Style");
  await click("[data-local-batch-acknowledge]"); await screenshot("local-model-batch-move-light");
  await click("[data-local-batch-confirm]"); await wait("!document.querySelector('[data-local-batch-dialog]')");
  const destinations = sources.map((source) => path.join(modelsRoot, "loras", "Batch Style", path.basename(source)));
  smoke.check("Confirmed batch move preserves files and covers and returns to browsing", sources.every((source) => !fs.existsSync(source)) && destinations.every(fs.existsSync) && fs.existsSync(path.join(destinations[0], "logo.png")) && await run("document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'&&!document.querySelector('[data-local-model-checkbox]')"));
  await verifyBatchDelete(destinations);
}
async function verifyBatchDelete(destinations) {
  await click("[data-local-batch-delete]"); await click("[data-local-model-card]"); await click("[data-local-select-exit]");
  smoke.check("Exit selection clears checkboxes and returns cards to details behavior", await run("!document.querySelector('[data-local-model-checkbox]')&&!document.querySelector('[data-local-select-all]')&&document.querySelector('[data-local-batch-toolbar]').dataset.localSelectionMode==='browse'") && destinations.every(fs.existsSync));
  await click("[data-local-model-card]"); await wait("document.querySelector('[data-local-model-details]')");
  await click("[data-local-batch-delete]");
  smoke.check("Delete starts empty and does not reuse prior selections", await run("document.querySelector('[data-local-batch-delete]').disabled&&!document.querySelector('[data-local-model-card][aria-pressed=true]')"));
  await click("[data-local-select-all]"); await click("[data-local-batch-delete]");
  await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Delete requires acknowledgement and describes Recycle Bin recovery", await run("document.querySelector('[data-local-batch-confirm]').disabled&&document.querySelector('[data-local-batch-dialog]').textContent.includes('系统回收站')") && destinations.every(fs.existsSync));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  smoke.check("Cancelling delete preserves all model folders", destinations.every(fs.existsSync));
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='dark'");
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click("[data-local-batch-delete]"); await wait("document.querySelector('[data-local-batch-acknowledge]:not(:disabled)')");
  smoke.check("Reopening starts unchecked and the dark narrow confirmation fits", await run("!document.querySelector('[data-local-batch-acknowledge]').checked&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-local-batch-confirm]').getBoundingClientRect().bottom<=innerHeight"));
  await screenshot("local-model-batch-delete-mobile-dark");
  await click("[data-local-batch-acknowledge]"); await click("[data-local-batch-confirm]");
  await wait("!document.querySelector('[data-local-batch-dialog]')");
  smoke.check("Confirmed batch deletion trashes all selected folders and removes them from the scan", destinations.every((folder) => !fs.existsSync(folder)) && await run("![...document.querySelectorAll('[data-local-model-card]')].some(el=>el.textContent.includes('With Preview')||el.textContent.includes('No Preview')||el.textContent.includes('Cancel'))"));
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
}
async function verifyNarrowCenter() {
  await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Narrow global center fits without hiding caption controls", await run("(()=>{const r=document.querySelector('[data-window-download-center]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=32&&r.bottom<=innerHeight})()"));
  await screenshot("titlebar-download-mobile");
  await click("[data-window-download]");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false); await wait("document.documentElement.dataset.windowChrome==='native'");
  smoke.check("Native fullscreen releases caption space", await run("!document.querySelector('[data-window-titlebar]')&&getComputedStyle(document.documentElement).getPropertyValue('--window-chrome-height').trim()==='0px'"));
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true); await wait("document.documentElement.dataset.windowChrome==='custom'");
  smoke.check("Leaving fullscreen restores the download caption entry", await run("Boolean(document.querySelector('[data-window-download]'))"));
}
async function verifyScrollPagination() {
  paginationMode = true;
  await input("[data-civitai-query]", "pagination");
  await run("document.querySelector('[data-civitai-query]').form.requestSubmit()");
  await wait("document.querySelectorAll('[data-civitai-card]').length===12&&document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  await delay(300);
  smoke.check("Pagination waits for downward input without an extra load button", pageRequests[2] === 0 && await run("!document.querySelector('[data-civitai-pagination] button')"));
  await run("document.querySelector('[data-civitai-catalog]').dispatchEvent(new WheelEvent('wheel',{deltaY:100}))"); await delay(100);
  smoke.check("Scrolling away from the bottom does not request another page", pageRequests[2] === 0);
  await run("document.querySelector('[data-civitai-catalog]').scrollTop=1e9");
  await wait("document.querySelectorAll('[data-civitai-card]').length===24&&document.querySelector('[data-civitai-catalog]').getAttribute('aria-busy')==='false'");
  smoke.check("Scrolling the catalog to its bottom appends and deduplicates models", pageRequests[2] === 1);
  await run("(()=>{const el=document.querySelector('[data-civitai-catalog]');el.scrollTop=el.scrollHeight;for(let i=0;i<20;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:100}))})()");
  await wait("document.querySelector('[data-civitai-pagination] button')");
  smoke.check("Continued wheel input at the bottom sends one request and preserves existing cards on failure", pageRequests[3] === 1 && await run("document.querySelectorAll('[data-civitai-card]').length===24"));
  await run("document.querySelector('[data-civitai-catalog]').dispatchEvent(new WheelEvent('wheel',{deltaY:100}))"); await delay(250);
  smoke.check("Failed pagination waits for explicit retry", pageRequests[3] === 1);
  failLastPage = false;
  await click("[data-civitai-pagination] button");
  await wait("document.querySelectorAll('[data-civitai-card]').length===25&&document.querySelector('[data-civitai-pagination]').textContent.includes('已显示全部模型')");
  smoke.check("Retry uses the failed page and appends its models", pageRequests[3] === 2);
  await run("(()=>{const el=document.querySelector('[data-civitai-catalog]');el.scrollTop=el.scrollHeight;el.dispatchEvent(new WheelEvent('wheel',{deltaY:100}))})()"); await delay(250);
  smoke.check("The final page stops further scroll requests", pageRequests[3] === 2);
}
async function main() {
  await app.whenReady(); smoke.installWatchdog(app); smoke.assertBuildFresh({ app });
  protocol.handle("https", fixtureApiResponse);
  const downloadSession = getDownloadSession(); downloadSession.protocol.handle("https", streamingResponse);
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1600, height: 1000, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  registerWindowChrome(win);
  win.webContents.on("console-message", (event) => { if (event.level === "error" && /React|render|hydration|Minified/i.test(event.message)) errors.push(event.message); });
  win.webContents.debugger.attach("1.3");
  try {
    await win.loadURL("app://app/tools/models/civitai"); await wait("document.querySelectorAll('[data-civitai-card]').length===3");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    // 刷新验证紧随下载完成，在本地库移动模型之前检查原始任务与文件对应关系。
    // 后续本地库仍需保留三张实际模型，刷新不能删除完成文件或重下同一个任务。
    // 各阶段按顺序await，既有失败仍交给同一个退出码护栏处理。
    // --catalog-only 只运行本轮布局涉及的分页，复用下方原有请求与断言。
    // 默认入口仍跑全部流程，不能让专项成功掩盖旧综合用例的失败。
    // 窗口、协议、退出码与临时文件隔离沿用同一宿主，不造第二套测试页面。
    if (process.argv.includes("--catalog-only")) {
      await verifyScrollPagination();
    } else {
    await verifyCaptionEntry(); await verifyDownloads(); await verifyRestoredHistory(); await verifyConcurrentOrder(); await verifyLocalAndNarrow(); await verifyScrollPagination(); await verifyDownloadErrors(); await verifyKeySettings();
    }
  } finally { downloadSession.protocol.unhandle("https"); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
// 并行下载像两个固定窗口：各自进度改变，不该让窗口交换座位。
// 两条请求走真实 manager、preload 事件和 Zustand，不能只检查模拟数组。
// 使用不同模型目录，避免文件夹互斥把并行场景退化成串行下载。
// 慢速本机响应可持续数秒，保证采样时两条任务都还有进度事件。
// 新任务依旧在顶部插入；固定位置指插入后的相对顺序不被进度打乱。
// 以任务编号认行，文件名或进度文案改变都不能让排序断言误认对象。
// 不修改真实用户清单，所有文件仍归本专项的临时模型根所有。
// 本例放在历史恢复之后，确认恢复任务与新任务能够共处同一个列表。
// 它放在本地库检查之前，清理失败时后续目录数量也会给出反证。
// 只验证下载中心的行顺序，不涉及创建页的生成队列调度。
// 请求仍由主进程处理，排序修复不能把实际传输移到渲染进程。
// 失败走现有 smoke.check 累计，并由末尾护栏保持非零退出码。
// 后续用例即使成功，也不能把本例记录下来的换位失败覆盖掉。
// 旧实现曾在两条响应同相时误过，故必须错开启动并提高采样频率。
// 这项反证针对真实 DOM；单独比较 manager 的 Map 顺序看不到 UI 缺陷。
async function verifyConcurrentOrder() {
  const ids = [];
  // 第二条任务必须在第一条尚未完成时开始，不能靠两条完成记录冒充并行。
  // 每次启动等待真实 IPC 返回，初始先后顺序因此确定。
  // 两条请求复用已有分块响应和校验哈希，不依赖外网速度。
  for (const name of ["Order A", "Order B"]) {
    const request = { modelType: "LORA", baseModel: "SDXL", modelName: name, fileName: `${name}.safetensors`, downloadUrl: "https://civitai.red/api/download/models/3", category: "Uncategorized", sha256: hash, previewUrl: "" };
    ids.push((await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`)).data.id);
    // 两次下载错开半个网络块，模拟真实用户先后点击启动。
    // 不让两条进度恰好同批到达，避免 React 合批掩盖中间的换位。
    // 这一等待只控制夹具起点，不放慢生产事件或更改排序规则。
    await delay(150);
  }
  // 下载中心与用户截图使用同一组件，不新增测试专属排序入口。
  // 打开前历史验证已关闭浮层，避免这里反而把中心收起。
  // 下方轮询由主进程计时器驱动，隐藏窗口也能正常结束。
  await click("[data-window-download]");
  await wait(`document.querySelectorAll('[data-window-download-center] [data-download-cancel]').length===2`);
  // 预期为 B 在 A 前面；只筛本例编号，已有历史记录仍可正常显示。
  // 每次都重新读取实际 DOM 顺序，不保留初次查询得到的节点数组。
  // 进度检查单独比较收到的字节，防止事件完全不更新也被当成稳定排序。
  // received 来自真实 IPC，而不是读取进度条宽度推断是否下载。
  // 进度条可能因百分比取整看似没动，原始字节不会有这类视觉误差。
  // 历史任务不计入 before，否则它们已经完成会使推进检查必然失败。
  // 读取初始字节发生在两条任务均进入 downloading 后，排除初始化零值。
  // 比较末次字节而非下载速度，速度估计短暂为零不代表传输停止。
  // 不要求两条 received 相等，并发下载本来就可以有不同速率。
  const expected = JSON.stringify([...ids].reverse());
  const before = (await run("window.electronAPI.listModelDownloads()")).data.filter(task => ids.includes(task.id));
  let stable = true;
  // 连续采样跨越多个网络块和节流通知，避免只在事件空隙看一眼。
  // 使用累计失败标记，后续恰好回到原位也不能覆盖曾发生的交换。
  // 固定采样次数给测试设置上限，不等待下载彻底结束才检查。
  // 25ms 间隔用于捕捉先到一条进度、另一条尚未更新的短暂交换。
  // 150ms 慢采样曾跳过这个窗口，不能仅用延长总等待代替密集采样。
  // 主进程 await 使采样逐个进行，不创建一批同时触发的页面请求。
  // 实际执行耗时可以略大于间隔，所以 fixture 为两条任务预留数秒。
  // 查询固定在当前下载中心，未来其他位置复用列表也不会被重复计数。
  // JSON 比较保留数组顺序，用集合比较会漏掉本次要修复的换位。
  for (let sample = 0; sample < 72; sample++) {
    await delay(25);
    stable = await run(`JSON.stringify([...document.querySelectorAll('[data-window-download-center] [data-model-download-task]')].map(el=>el.dataset.modelDownloadTask).filter(id=>${JSON.stringify(ids)}.includes(id)))===${JSON.stringify(expected)}`) && stable;
  }
  // 先证明两条任务均在推进，再报告其位置是否稳定。
  // 若网络夹具没有真正发出新字节，第一条断言应失败而非获得假通过。
  // 独立断言让日志区分“下载没动”和“下载动了但行在交换”。
  // 若任务意外消失，find 得不到字节，推进检查同样不能通过。
  // stable 累计了所有采样，不仅仅核对循环结束时的最后一帧。
  // 两个判据同时通过，才说明传输持续且位置固定。
  const after = (await run("window.electronAPI.listModelDownloads()")).data;
  smoke.check("Both concurrent downloads advance while order is sampled", before.length === 2 && before.every(task => after.find(item => item.id === task.id)?.received > task.received));
  smoke.check("Concurrent progress keeps newest-first rows in fixed positions", stable);
  // 删除本例任务并等待生产清理，以免后续本地库数量断言受新增模型影响。
  // 使用正式 IPC，不直接删目录或把 store 清空来隐藏残留。
  // 移除已由现有回归覆盖；本例只负责恢复测试开始前的历史列表。
  // 不取消其他测试创建的历史任务，保留后续恢复和删除断言的前提。
  // 等待移除返回后才关浮层，避免留下尚未结束的删除请求。
  // Escape 沿用用户可用的关闭方式，不直接拆卸下载中心 DOM。
  for (const id of ids) await run(`window.electronAPI.removeModelDownload(${JSON.stringify(id)})`);
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
}
async function verifyDownloadErrors() {
  // 认证、错误页面和网络失败都必须在下一条任务开始以前移除。
  // 网络分支另外让原目录不存在，重现旧目录校验阻止注销记录的情况。
  // 所有失败仍由真实下载请求产生，不能直接向列表塞入一条预设错误。
  // 网络失败沿用现有“无法连接下载服务器”词条，不能拿 timeout 的“下载连接”来匹配。
  // 同时核对 code 与可见文案，若分类错误，失败详情应打印任务实际状态帮助判断。
  // 不因文案检查失败而放宽错误分类，网络异常仍必须是 network。
  for (const [id, code, text] of [[401, "auth", "服务器拒绝下载"], [500, "response", "下载服务器返回了错误响应或网页内容"], [408, "network", "无法连接下载服务器"]]) {
    const request = { modelType: "LORA", baseModel: "SDXL", modelName: `Error fixture ${id}`, fileName: `error-${id}.safetensors`, downloadUrl: `https://civitai.red/api/download/models/${id}`, category: "Uncategorized", sha256: "", previewUrl: "" };
    const result = await run(`window.electronAPI.startModelDownload(${JSON.stringify(request)})`);
    await click("[data-window-download]"); await wait("document.querySelector('[data-window-download-center]')");
    await wait(`document.querySelector('[data-model-download-task="${result.data.id}"] [role=alert]')`);
    const tasks = (await run("window.electronAPI.listModelDownloads()")).data;
    // 详情只打印本机夹具的状态和错误码，不输出真实用户路径或下载授权。
    // 可见文字读取失败时不能只展示笼统“未通过”，应保留服务器分类的反证。
    // JSON 摘要不含 modelName、URL、owner 等与当前分类判据无关的信息。
    smoke.check(`Download manager distinguishes ${code} from connection timeout`, tasks.find((item) => item.id === result.data.id)?.error === code && await run(`document.querySelector('[data-model-download-task="${result.data.id}"] [role=alert]').textContent.includes(${JSON.stringify(text)})`), JSON.stringify(tasks.filter(item => item.id === result.data.id).map(item => ({ status: item.status, error: item.error }))));
    smoke.check(`Failed ${code} response creates no model file`, !fs.existsSync(result.data.filePath));
    // 移走模型文件夹保留测试现场，原位置缺失不会删除外部位置的资源。
    // 这不是改变配置根或传入任意路径，任务和设置仍来自当前测试应用。
    // 只对网络错误模拟缺失，另外两种失败保留正常目录作为配对对照。
    if (code === "network") fs.renameSync(result.data.folderPath, result.data.folderPath + "-external");
    // 实际点击行内 X，不调用 store 私有状态或直接移除 DOM。
    // click 等待交互收尾后再轮询，不触发下一条下载来刷新旧记录。
    // 同一个窗口和 preload 保持挂载，证明删除不依赖页面重新加载。
    await click(`[data-model-download-task="${result.data.id}"] [data-download-remove]`);
    // DOM 消失必须在当前失败用例结束前成立，超时就进入原冒烟失败出口。
    // 有界等待来自原主进程计时器，不依赖隐藏窗口可能暂停的动画帧。
    // 任务行已经失败，X 应执行清理而不是把它改成另一个可重试状态。
    await wait(`!document.querySelector('[data-model-download-task="${result.data.id}"]')`);
    // 核对真实 IPC 列表而不只看 UI，排除本地隐藏但后台记录仍存活的假修复。
    // 检查原目录没有被重新创建，不能为满足旧校验制造新的空模型目录。
    // 没有新增任务或模型扫描作为前置，网络恢复也不是移除这条记录的条件。
    smoke.check(`Failed ${code} X removes task without a new download`, !(await run("window.electronAPI.listModelDownloads()")).data.some(item => item.id === result.data.id) && !fs.existsSync(result.data.folderPath));
    // 读取生产写入的清单，不通过 fixture 修改 JSON 假装持久化成功。
    // 磁盘断言与 IPC 断言分别约束持久化与内存 Map，二者不能互相替代。
    // 正常移除等待持久化后才返回，因此这里无需给文件写入增加任意延迟。
    const queue = JSON.parse(fs.readFileSync(path.join(root, "browser/model-download-queue.json"), "utf8"));
    // 只有原编号应该消失，其他已有完成记录仍由前面的恢复历史断言保护。
    // 不清空全部清单来使本例通过，已有 completed 记录仍保留在同一 JSON。
    // 本机夹具不校验真实 C 站的代理和限速，仅验证异常后的清理因果链。
    smoke.check(`Failed ${code} removal is already persisted`, !queue.jobs.some(job => job.task.id === result.data.id));
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  }
}
async function verifyKeySettings() {
  await win.loadURL("app://app/settings");
  await wait("document.querySelector('#civitai-api-key')&&!document.querySelector('#civitai-api-key').disabled");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click();document.querySelector('#civitai-api-key').scrollIntoView({block:'center'})");
  smoke.check("Civitai settings explain the supplied Security & Apps registration flow", await run("document.body.textContent.includes('登录 → Security & Apps → Add API Key')"));
  await input("#civitai-api-key", "test-ui-credential-1234");
  await click("[data-civitai-key-save]");
  await wait("document.querySelector('[data-civitai-key-status]').dataset.civitaiKeyStatus==='configured'");
  smoke.check("Saving clears the key input and exposes only masked status", await run("document.querySelector('#civitai-api-key').value===''&&document.querySelector('#civitai-api-key').type==='password'&&document.querySelector('[data-civitai-key-status]').textContent.includes('1234')&& !document.body.textContent.includes('test-ui-credential')"));
  await screenshot("civitai-key-configured");
  await win.loadURL("app://app/settings");
  await wait("document.querySelector('[data-civitai-key-status]')?.dataset.civitaiKeyStatus==='configured'");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  smoke.check("Civitai key status survives renderer reload without returning the key", (await run("window.electronAPI.civitaiKeyStatus()")).data.tail === "1234");
  await click("[data-civitai-key-clear]");
  await wait("document.querySelector('[data-civitai-key-status]').dataset.civitaiKeyStatus==='missing'");
  smoke.check("Clear removes the saved credential", (await run("window.electronAPI.civitaiKeyStatus()")).data.configured === false);
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false, error }); });
