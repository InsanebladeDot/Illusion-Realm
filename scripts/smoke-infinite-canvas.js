/**
 * 无限画布的真实 Electron 渲染回归，使用新构建的 app:// 页面。
 * 控件click、输入事件与Electron鼠标键盘注入都属于自动验证，不是人工验收。
 * 空白节点不是媒体生成样例，截图不能证明模型生成、上传或媒体播放能力。
 * 账户为游客夹具；草稿通过生产写盘器保存到本用例临时 JSON，绝不接触真实作品。
 * 同一个窗口串行覆盖主题与尺寸，避免多个Electron争抢单实例和资源。
 * 看门狗和构建指纹直接复用项目门禁；失败不得被正常退出覆盖。
 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
// 默认仍验静态导出；开发模式单独命名，避免把 dev 的效果重放证据混成打包证明。
// dev 使用唯一的本机入口，需要先启动项目 Next 开发服务，不支持外部任意 URL。
// 两种运行保持串行，原来的隔离用户目录与生产 preload 不变。
// 开发服务器用于检查 React 资源安装/清理重放，静态回归仍须另外运行。
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: process.env.DIRECTOR_SMOKE === "1" ? "director" : process.env.CANVAS_SMOKE_DEV === "1" ? "infinite-canvas-dev" : "infinite-canvas", timeoutMs: process.env.DIRECTOR_SMOKE === "1" ? 240000 : 100000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-canvas-"));
const rawRun = smoke.createRun();
// 失败保留具体表达式，区分控件尚未挂载和产品返回错误；测试输入不含用户密钥。
const run = async expression => {
  try { return await rawRun(expression); }
  catch (error) { console.error("CANVAS_FAILED_EXPRESSION", expression); throw error; }
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
let win;

// 旧检查只看 React 文案，会漏掉热更新自己的未捕获异常；直接保留浏览器报告的错误。
function watchRuntimeErrors(window) {
  window.webContents.debugger.on("message", (_event, method, params) => {
    if (method === "Runtime.exceptionThrown") errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  window.webContents.on("dom-ready", () => {
    void window.webContents.debugger.sendCommand("Runtime.enable").catch(error => errors.push(String(error)));
  });
}
// 生成专项是这个正式画布宿主的可选场景，不另建一个只展示组件的 HTML 页面。
// 环境开关缺省关闭，原完整画布场景继续按以前顺序运行。
// 打开专项后仍使用同一个 app 协议、preload、游客文档和文件归属服务。
// 外部模型服务被夹具替代，窗口中的 React 与 Electron 生产接线没有替换。
// fixture 只在 app ready 与构建新鲜度确认后安装，不能用过期 out 截图验收。
// 若构建指纹不一致应返回前置失败，不能自动跳过新鲜度检查。
// 专项需要完整生产文件 handlers，否则生成保存返回值无法证明真实文件存在。
// 安装顺序晚于外壳初始化 stub，确保本专项接管的是生产处理器。
// 只对本进程隔离文档写入随机本机服务端口，用户正在运行的应用不受影响。
// service 状态不存入产品默认设置，测试结束后临时目录保留诊断即可。
// main 的 finally 负责关窗口和服务，中途超时也不能遗留监听端口。
// 异常截图在销毁窗口前生成，便于看到实际错误消息与节点选择。
// 截图名称九十九代表失败现场，不能归档成正常验收展示图。
// 失败后继续调用 harness 的非零退出路径，不能使用 app.quit 把错误吞掉。
// 原看门狗仍覆盖整个运行，不为生成专项设置无限等待。
// 每个 DOM wait 还有单步上限，错误会带具体表达式。
// run 包装只增加失败表达式诊断，不改变被测表达式返回值。
// 诊断中的表达式来自测试固定常量，不能输出用户令牌或实际私密正文。
// 自动输入焦点模拟用于离屏 Electron 条件，不冒充真实窗口前台焦点。
// backgroundThrottling 关闭让主进程轮询之外的页面任务能够正常推进。
// 媒体等待仍有主进程兜底，不能依赖隐藏窗口 requestAnimationFrame。
// 只创建一个 BrowserWindow，其他 Electron 冒烟必须等当前进程退出后再运行。
// 不要为了排除残留而批量终止用户 electron.exe，本脚本只拥有自己启动的窗口。
// 生成路径包括图片保存、画布导入与节点回填，不能只替换 generateImage 返回值。
// 远端 fixture 只替换传输，因此还可检查供应商请求 n 是否正确进入边界。
// 本地 fixture 通过真实 HTTP，可检查队列轮询和取消身份。
// 两类证据不混称真实模型推理，也不互相抵扣人工验收缺项。
// 素材查看与生成按钮的关系继续由原节点外壳负责，专项不手动修改媒体 ready。
// 自动重开场景会真正卸载旧 React 页面，可发现依赖全局变量残留的问题。
// 测试根每次随机创建，避免上次结果让节点无需本次请求也能达到 ready 数量。
// 保存文档包含游客账号前提，认证失败不应把生成专项误解释成模型失败。
// 专用远端假密钥与图库根分离，截图与工程包不应包含凭据。
// 被测页面是静态导出 app://，开发 HMR 模式如使用需要单独标识。
// 本轮最终验收使用静态产物，不能把开发截图叫发布构建证据。
// 测试记录会写进 logs 与临时根，交付文档需要给出可复查的位置。
// expected failure 的 IPC 日志是故障注入证据，不表示测试忽略了未处理错误。
// 只有明确的成功断言和 harness 总结果才用于汇报通过项。
// renderer console 收集关注 hydration 与 React 状态错误，不能把所有日志都当无关警告。
// 任务错误正文在产品消息层已脱敏，测试日志仍避免打印真实用户目录和令牌。
// 本轮不启动打包安装器，也不据此宣称安装分发已通过。
// 其他已有场景不因开启专项而被删除，最终还需要另跑缺省完整画布。
// 修改测试选择器要保留真实预期，不能为新 UI 放宽成只要有任意输入就通过。
// 新引用编辑器替代 textarea 时，应查对应 contenteditable，语义目标仍是参数面板。
// 自动鼠标事件仍属于自动验证，不能升级成资源管理器真实拖入证据。
// 同一脚本产出的不同截图按运行根归档，避免混用旧构建与新构建画面。
let generationFixture;
// 专项只替换外部转换响应，复用原窗口、工程库、真实媒体和截图清理。
const promptFixture = process.env.CANVAS_PROMPT_SMOKE === "1" || process.env.CANVAS_WRITING_SMOKE === "1" || process.env.CANVAS_SPEECH_SMOKE === "1" ? require("./lib/check-canvas-prompt-preview").installFixture() : null;

// 测试窗口拥有独立缓存，不终止或接管用户正在使用的应用进程。
// 生产preload与协议真实运行，桌面权限仍由生产桥接约束。
// 软件渲染方便稳定截图，不能据此宣称GPU或高DPI性能已通过。
// DPR 是 Chromium 自动验证维度，不冒充用户在 Windows 设置里人工切换过缩放。
if (process.env.DIRECTOR_SMOKE === "1" && process.env.SMOKE_DPR) app.commandLine.appendSwitch("force-device-scale-factor", process.env.SMOKE_DPR);
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "browser"));
smoke.setWorkDir(root);
smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
// 主进程工程服务和视频任务使用生产实现，只有资产根改为本次隔离目录。
// 注册发生在窗口加载前，preload 首次 invoke 就能找到真实 handler。
// 画布资产写入 root/user，而游客草稿继续放本轮独立 JSON。
// 两者都属于本用例，不触碰用户已运行窗口的真实文件。
// FFmpeg 服务同样使用生产定位器，缺少二进制应产生真实失败。
// 外层构建指纹先核对源码与静态产物，过期页面不能作为本轮运行证据。
// 构建校验失败需重建，不通过跳过 fingerprint 强行截图。
// 本脚本与模块验证命令串行运行，避免 Electron 冒烟互相争抢资源。
// 用户现有应用进程保持原样，测试只拥有自己创建的 BrowserWindow。
require("../apps/electron/src/main/modules/canvas/canvas-project.handlers").registerCanvasProjectHandlers({ root: path.join(root, "user") });
require("../apps/electron/src/main/modules/ffmpeg/index").registerVideoToolIpc();
// 文件改名使用生产图库服务，传回真实磁盘结果，不用固定新路径冒充成功。
// 夹具作用根位于本用例临时目录，用户正在运行的窗口和原图片均不参与。
// 原组件通过正式 preload 调用同一已登记通道，参数形状仍由注册助手拦截。
// 测试只补该窄 handler，避免注册整个图库模块与本脚本已有清单 handler 冲突。
// 文件已存在、同名冲突、PNG 元数据和旁车处理都交给原服务本身执行。
// 这属于真实文件操作证据，生成图片像素仍来自独立的生成返回夹具。
// 路径有效不代表允许其他媒体改名，生产图片服务继续检查图片后缀。
registerHandle(C.FILES_RENAME_GENERATED_IMAGE, (_event, folder, file, name) => require("../apps/electron/src/main/modules/images/generated-images").renameGeneratedImage(folder, file, name));
// 认证使用游客夹具，文档写入则调用生产 JSON 写入器，且强制锁定到本次临时目录。
// 读取只接触这个明确文件；不让生产默认路径回落读取用户的真实配置或凭据。
// failWrites 是失败注入开关，不是成功结果夹具，正常路径必须在磁盘找到真实节点数据。
if (process.env.DIRECTOR_SMOKE === "1") require("../apps/electron/src/main/modules/images/files.handlers").registerFileHandlers();
const documentPath = path.join(root, "illusion-realm.json");
// Euzhi 专项替换的只有外部收费接口；凭据、IPC、素材写盘、React 页面均使用生产实现。
const euzhiFixture = process.env.EUZHI_IMAGE_SMOKE === "1" ? require("./lib/check-euzhi-images").installFixture(root) : null;
// 资料包原状态断言先在深色运行；新增浅色与媒体验证随后用正式主题菜单切换。
// 不把深色 rgba 数值套在白色主题上，也不因此删掉原先的持有、聚焦和模式独立回归。
const seed = require("./lib/guest-session-fixture").withGuestSession({ version: 1, userDataPath: documentPath, settings: { userDataPath: documentPath, paths: {}, locale: "zh-CN", theme: "dark" }, retainedSection: { sentinel: "keep" } });
// 识图专项固定使用已核实视觉型号，其余画布场景仍沿用原偏好。
if (process.env.CANVAS_PROMPT_IMAGES_SMOKE === "1" || process.env.CANVAS_WRITING_SMOKE === "1" || process.env.CANVAS_SPEECH_SMOKE === "1") seed.promptAssistant = { provider: 'glm', model: 'glm-4.6v-flash', models: { glm: 'glm-4.6v-flash' } };
if (process.env.CANVAS_RESIZE_SMOKE === "1") seed.infiniteCanvas = require("./lib/check-canvas-card-resize").seed(root);
if (process.env.CANVAS_TASKS_SMOKE === "1") seed.infiniteCanvas = require("./lib/canvas-task-fixture").seed(root);
fs.writeFileSync(documentPath, JSON.stringify(seed));
let failWrites = false;
const libraryFixture = require("./lib/canvas-library-fixture");
// 菜单与对比专项不需要旧草稿或失败注入，直接用生产工程服务，避免两套测试队列争写迁移标记。
if (![process.env.CANVAS_LIBRARY_SMOKE, process.env.CANVAS_ADD_MENU_SMOKE, process.env.CANVAS_COMPARE_SMOKE].includes("1")) libraryFixture.install(documentPath, () => failWrites);
const diskDocument = () => JSON.parse(fs.readFileSync(documentPath, "utf8"));
registerHandle(C.USER_DATA_READ, () => process.env.CANVAS_RESIZE_SMOKE === "1" ? require("../apps/electron/src/main/storage/sqlite/user-document").loadAt(documentPath) : ({ data: diskDocument(), filePath: documentPath, isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => {
  if (failWrites) throw new Error("intentional-canvas-save-failure");
  const document = { ...data, userDataPath: documentPath, settings: { ...data.settings, userDataPath: documentPath } };
  const write = value => require("../apps/electron/src/main/storage/user-data").writeUserData(value);
  return process.env.CANVAS_RESIZE_SMOKE === "1" ? require("../apps/electron/src/main/storage/sqlite/user-document").saveAt(documentPath, document, write) : write(document);
});
// 外壳服务只提供空初始化，不把它们算作本轮已验证的媒体能力。
// 下面的外壳夹具仅用于水合；画布工程与媒体处理仍走上面的生产注册。
for (const [channel, value] of [
  [C.USER_DATA_GET_DEFAULT_PATH, ""], [C.PATHS_GET_DEFAULT_OUTPUT, root],
  [C.CHANGELOG_READ, ""], [C.MODELS_DOWNLOAD_LIST, { revision: 0, tasks: [] }],
  [C.MODELS_SCAN, []], [C.ACCOUNT_ME, { status: 401, body: { success: false, code: "UNAUTHENTICATED" } }],
  [C.AGENT_CATALOG, { providers: [], models: [] }], [C.AGENT_SECRET_STATUS, {}],
]) registerHandle(channel, () => value);
if (process.env.CANVAS_PROMPT_IMAGES_SMOKE === "1") registerHandle(C.AGENT_CATALOG, (_event, provider) => require("../apps/electron/src/main/modules/agent/provider-catalog").fallback(provider));

// 等待具体可观察条件，最多六秒，条件失效会携带表达式直接失败。
// 主进程计时避免隐藏窗口暂停rAF后无法退出；没有无限重试或自动刷新。
async function wait(expression) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await run(`Boolean(${expression})`)) return;
    await delay(50);
  }
  throw new Error(`Canvas condition timed out: ${expression}`);
}
// click操作实际DOM控件，只用于菜单和工具条，不绕过业务写入节点状态。
// 鼠标拖动走下面的sendInputEvent，不能用setNodes伪造拖动成功。
async function click(selector) {
  await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await delay(100);
}
async function shot(name) {
  await delay(220);
  fs.writeFileSync(path.join(root, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}
// 从真实DOM读中心点，坐标包含应用外壳与当前画布缩放，不猜导航宽度。
// selector只来自本测试常量，不接受用户或外部网络内容。
async function point(selector) {
  return run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
}
async function pointer(selector) {
  const position = await point(selector);
  for (const type of ["mouseMove", "mouseDown", "mouseUp"]) win.webContents.sendInputEvent({ type, ...position, button: "left", clickCount: 1 });
  await delay(120);
}
// 端口验证使用正式 Handle 的语义 click，避免重叠节点的实体坐标遮挡端口。
// 这属于自动事件证据；鼠标拖线仍需人工验收，不能把两者混写。
async function clickPort(selector) {
  await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await delay(100);
}
async function key(keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await delay(130);
}

// 直接读取 Chromium 的计算样式，不比较 CSS 源码字符串或手工指定期望类名。
// 这样能发现宿主全局 hover/focus 规则把资料库样式覆盖掉的真实集成问题。
// 只有绘制值和业务状态被采集，不读取 React 内部状态，也不据此声称人工已验收。
async function controlStyle(selector) {
  return run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e);return {background:s.backgroundColor,color:s.color,outline:s.outlineStyle,shadow:s.boxShadow,weight:s.fontWeight,size:s.fontSize,pressed:e.getAttribute('aria-pressed'),focused:e===document.activeElement}})()`);
}

// 测试前提是四类节点已经存在；工具按钮不触发生成、不插入额外节点。
// 鼠标移入、按住、松开和移开走 Electron 输入；焦点读数来自实际 activeElement。
// 图标按钮没有独立按下色证据，因此按住应等于 hover，而非凭经验添加缩放或粗框。
// 松开只完成点击；离开后的鼠标焦点不应留下悬停底色，也不应凭空取消其他选中项。
async function checkButtonStates() {
  const selector = '[data-canvas-toolbar] button[aria-label=添加节点]';
  await run("document.querySelector('[data-infinite-canvas]').focus()");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
  await delay(240);
  const normal = await controlStyle(selector);
  const position = await point(selector);
  win.webContents.sendInputEvent({ type: "mouseMove", ...position });
  await delay(240);
  const hover = await controlStyle(selector);
  win.webContents.sendInputEvent({ type: "mouseDown", ...position, button: "left", clickCount: 1 });
  await delay(240);
  const held = await controlStyle(selector);
  smoke.check("Toolbar hover and held state do not add host outlines", hover.outline === "none" && held.outline === "none" && hover.background === held.background);
  await shot("14-toolbar-held");
  win.webContents.sendInputEvent({ type: "mouseUp", ...position, button: "left", clickCount: 1 });
  await wait("document.querySelector('[data-canvas-menu]')");
  await checkMenuStates();
  await key("Escape");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
  await run(`document.querySelector(${JSON.stringify(selector)}).blur()`);
  smoke.check("Blur restores the original toolbar appearance", (await controlStyle(selector)).background === normal.background);
}

// 菜单按下比 hover 更亮，正是资料中与普通图标按钮不同的行为；不能统一处理。
// 使用无法创建节点的 disabled 条目验证悬停和语义 click 都不改变图数据。
// 不把不可用条目算入方向键导航，Home/End 应只停在实际可用入口上。
// 这些是生产组件的自动输入证据，实体鼠标、屏幕阅读器和输入法仍单独待验。
async function checkMenuStates() {
  const selector = '[data-canvas-menu] [data-canvas-text-category]';
  const position = await point(selector);
  win.webContents.sendInputEvent({ type: "mouseMove", ...position });
  await delay(200);
  const hover = await controlStyle(selector);
  win.webContents.sendInputEvent({ type: "mouseDown", ...position, button: "left", clickCount: 1 });
  await delay(200);
  const held = await controlStyle(selector);
  smoke.check("Menu has its own held feedback and no extra border", held.background !== hover.background && held.outline === "none");
  await shot("15-menu-held");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4, modifiers: ["leftButtonDown"] });
  win.webContents.sendInputEvent({ type: "mouseUp", x: 4, y: 4, button: "left", clickCount: 1 });
  const disabled = await point('[data-canvas-menu] button:disabled');
  win.webContents.sendInputEvent({ type: "mouseMove", ...disabled });
  await delay(200);
  const before = await run("document.querySelectorAll('[data-canvas-node]').length");
  await click('[data-canvas-menu] button:disabled');
  smoke.check("Disabled menu entries have no hover or action", (await controlStyle('[data-canvas-menu] button:disabled')).background === "rgba(0, 0, 0, 0)" && await run(`document.querySelectorAll('[data-canvas-node]').length===${before}`));
  await run(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await key("End");
  smoke.check("End skips unavailable menu entries", await run("document.activeElement?.hasAttribute('data-canvas-import')"));
  await key("Home");
  smoke.check("Home focuses the first usable entry", await run("document.activeElement?.hasAttribute('data-canvas-text-category')"));
}

// 音频改接真实创作表单，旧的音乐/音色占位选项不再作为验收目标。
// 检查受控种子失焦、键盘可达和与视频隔离；生成链路由音频专项另验。
async function checkModeStates() {
  await pointer('[data-kind=audio] header>svg');
  await click('[data-kind=audio] [data-canvas-workflow] button');
  await wait("document.querySelector('[data-canvas-audio-panel]')");
  await click('[data-canvas-audio-panel] [data-seed-mode=custom]');
  win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
  await run("document.querySelector('[data-infinite-canvas]').focus()");
  const selected = await controlStyle('[data-canvas-audio-panel] [data-seed-mode=custom]');
  smoke.check("Audio seed mode remains selected after pointer leave and blur", selected.pressed === "true" && !selected.focused);
  await shot("16-audio-selected-blurred");
  await run("document.querySelector('[data-canvas-audio-panel] [data-seed-mode=custom]').focus()");
  await key("Tab");
  smoke.check("Keyboard reaches original audio seed input", await run("document.activeElement?.hasAttribute('data-seed-value')"));
  await click('[data-canvas-audio-panel] [data-seed-mode=random]');
  await click('.hy-image-sidebar header button');
  await pointer('[data-kind=video] header>svg');
  smoke.check("Local video keeps an image input independently of audio", await run("!!document.querySelector('[data-kind=video] [data-canvas-reference-inputs] button')"));
  await pointer('[data-kind=text] header>svg');
}

// 比例面板复用同一个胶囊与分段控件，回归关注焦点、关闭和参数归属。
// Escape 不提交比例，也不删除节点；选完比例才经正式 onChange 写入当前节点。
// 外部点击只关闭小浮层，不能把用户刚点到的提示词输入焦点抢回按钮。
// 选择另一个节点会卸载浮层订阅，回到原节点也不应凭空再次展开。
async function checkRatioStates() {
  await pointer('[data-kind=image] header>svg');
  // 模板与比例共用胶囊，两者均可展开，不能再按首个 aria-expanded 定位。
  // 独立标记让此用例仍操作真实比例按钮，而不是放宽焦点与提交断言。
  // 原 Escape、选项和外部点击检查全部保留，继续证明两个浮层各司其职。
  const selector = '[data-kind=image] [data-canvas-image-ratio] .hy-chip[aria-expanded]';
  await click(selector);
  smoke.check("Ratio popup focuses its selected option", await run("document.activeElement===document.querySelector('.hy-ratio-popup [aria-pressed=true]')"));
  await shot("17-ratio-popup-focused");
  await key("Escape");
  smoke.check("Escape closes ratio popup and returns focus", await run(`!document.querySelector('.hy-ratio-popup')&&document.activeElement===document.querySelector(${JSON.stringify(selector)})`));
  await click(selector);
  await click('.hy-ratio-popup button[aria-label="9:16"]');
  smoke.check("Ratio commits to the image and closes popup", await run(`!document.querySelector('.hy-ratio-popup')&&document.querySelector(${JSON.stringify(selector)}).textContent.includes('9:16')`));
  await click(selector);
  await pointer('[data-kind=image] [data-video-prompt]');
  smoke.check("Outside click dismisses ratio popup without stealing focus", await run("!document.querySelector('.hy-ratio-popup')&&document.activeElement===document.querySelector('[data-kind=image] [data-video-prompt]')"));
  await pointer('[data-kind=video] header>svg');
  await pointer('[data-kind=image] header>svg');
  smoke.check("Image ratio survives selection and popup stays closed", await run(`!document.querySelector('.hy-ratio-popup')&&document.querySelector(${JSON.stringify(selector)}).textContent.includes('9:16')`));
}
// 新节点位置通过右键菜单传入，菜单再调用产品的世界坐标转换。
// 不直接导入hook或访问React内部store，因此能发现菜单接线和坐标偏移问题。
async function add(kind, x, y) {
  await run(`(()=>{const e=document.querySelector('.react-flow__pane'),r=e.getBoundingClientRect();e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+${x},clientY:r.top+${y}}))})()`);
  // 图像分类属于添加节点；普通类型仍从原列表直接创建。
  await wait("document.querySelector('[data-canvas-menu]')");
  if (kind === "image") {
    await click('[data-canvas-image-category]');
    await click('[data-assistant-column="1"] [data-node-kind=image]');
  } else if (kind === "text" || kind === "note") {
    // 两种书写节点共用文本分类，仍通过正式二级菜单创建。
    await click('[data-canvas-text-category]');
    await click(`[data-assistant-column="1"] [data-node-kind="${kind}"]`);
  } else await click(`[data-canvas-menu] [data-node-kind="${kind}"]`);
  await wait(`document.querySelector('[data-kind="${kind}"]')`);
  return run("'[data-canvas-node=\"'+document.querySelector('[data-canvas-node][data-selected=true]').dataset.canvasNode+'\"]'");
}
// 文字输入使用原生setter触发React事件，再由焦点离开提交。
// 这是自动事件，不代表已经验证中文输入法、触屏或实体键盘手感。
// 图片正文现在复用 contenteditable，输入夹具也必须走同一个原组件的 input 写回。
// 普通文本框仍调用原生 value setter，不能把输入法组件当 textarea 改一个无效属性。
// 不修改 React fiber 或节点 store，最终是否生效仍由保存文件独立读回验证。
// textContent 保留规范资源 token，视觉名字来自装饰，不把伪元素文字写入正文。
// 这里不模拟中文 composition，实体输入法仍保留人工待验。
async function fill(selector, value) {
  await run(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await delay(60);
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e.isContentEditable)e.textContent=${JSON.stringify(value)};else Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await delay(60);
  // offscreen窗口的原生失焦通知不稳定，明确发送DOM焦点事件验证表单接线。
  // 这是自动事件证据，不能在交付里写成人工点击失焦已经验收。
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));e.blur()})()`);
  await delay(140);
}

// 前提为首次空画布。截图必须保留真实导航，核对新入口紧接创建。
// 节点依次通过共同添加菜单创建，四种参数都应使用同一份表单壳。
async function checkNodes() {
  smoke.check("Entry follows Create in desktop navigation", await run("(()=>{const links=[...document.querySelectorAll('[data-app-nav] a')];return links.findIndex(e=>e.getAttribute('href')==='/canvas')===links.findIndex(e=>e.getAttribute('href')==='/create')+1})()"));
  smoke.check("Initial canvas is empty", await run("document.querySelectorAll('[data-canvas-node]').length===0"));
  await shot("01-empty-dark");
  await click('[data-canvas-toolbar] button[aria-label="添加节点"]');
  await wait("document.querySelector('[data-canvas-menu]')");
  await shot("02-add-menu");
  await key("Escape");
  await add("text", 260, 210);
  await run("document.querySelector('[data-kind=text] [data-canvas-title]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await fill('[data-kind="text"] input', "分镜想法");
  await fill('[data-kind="text"] textarea', "保持角色一致性，先设计画面，再连接视频节点。");
  await shot("03-text-parameters");
  await add("image", 620, 210);
  await shot("04-image-parameters");
  await add("video", 980, 210);
  await shot("05-video-parameters");
  await add("audio", 620, 480);
  await shot("06-audio-parameters");
  smoke.check("All media kinds share cards without fake results", await run("document.querySelectorAll('[data-canvas-node]').length===4&&[...document.querySelectorAll('[data-canvas-node] .hy-submit')].every(e=>e.disabled)&&!document.querySelector('[data-infinite-canvas] video,[data-infinite-canvas] img')"));
}

// 前一步已经创建四种节点，现在单独验证参数归属和命令历史。
// 用同一文本参数跨选择往返，排除把当前激活卡片误当成原节点的情况。
async function checkNodeEditing() {
  await pointer('[data-kind="text"] header>svg');
  smoke.check("Prompt belongs to its original node", await run("document.querySelector('[data-kind=text] textarea')?.value.startsWith('保持角色')"));
  // 输入焦点优先：节点已选中但Delete只能交给输入框，不能删掉整个节点。
  // 断言数量不变只能证明快捷键隔离，不声称输入法合成已实测。
  await run("document.querySelector('[data-kind=text] textarea').focus()");
  smoke.check("Prompt receives actual DOM focus", await run("document.activeElement===document.querySelector('[data-kind=text] textarea')"));
  await key("Delete");
  smoke.check("Delete inside an input does not delete nodes", await run("document.querySelectorAll('[data-canvas-node]').length===4"));
  await fill('[data-kind=text] textarea', "保持角色一致性，先设计画面，再连接视频节点。");
  await run("document.querySelector('[data-kind=text] textarea').blur();document.querySelector('[data-infinite-canvas]').focus()");
  await key("d", ["control"]);
  smoke.check("Duplicate creates an independent instance", await run("document.querySelectorAll('[data-kind=text]').length===2"));
  await fill('[data-kind=text][data-selected=true] textarea', "副本独立提示词");
  await pointer('[data-kind=text] header>svg');
  smoke.check("Editing a duplicate leaves original parameters unchanged", await run("document.querySelector('[data-kind=text][data-selected=true] textarea')?.value.startsWith('保持角色')"));
  await run("(()=>{const e=document.querySelector('.react-flow__node:last-child');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await run("document.querySelector('[data-infinite-canvas]').focus()");
}

// 删除、撤销和重做共用页面快捷键；不调用reducer来伪造历史状态。
// 前一步选中了副本，撤销应恢复这一份副本而不是清空原图。
async function checkHistory() {
  await key("Delete");
  smoke.check("Delete removes only the selection", await run("document.querySelectorAll('[data-canvas-node]').length===4"));
  await key("z", ["control"]);
  smoke.check("Undo restores deleted nodes", await run("document.querySelectorAll('[data-canvas-node]').length===5"));
  await key("z", ["control", "shift"]);
  smoke.check("Redo removes them again", await run("document.querySelectorAll('[data-canvas-node]').length===4"));
}

// 连接通过真实端口点击，文字到图片有效，重复边和回环不会修改图。
// 错误反馈与图中边数同时核对，避免只显示报错却仍悄悄创建无效关系。
async function checkConnections() {
  await clickPort('[data-kind=text] .source');
  await clickPort('[data-kind=image] .target');
  // 连线完成后提示成功，同时核对画布实际建边。
  await wait("document.querySelector('[data-app-toast=success]')?.textContent.includes('已建立本地引用连接')");
  smoke.check("Ports create a real visible edge", await run("document.querySelectorAll('.react-flow__edge').length===1"));
  await clickPort('[data-kind=text] .source');
  await clickPort('[data-kind=image] .target');
  smoke.check("Duplicate edge is rejected with feedback", await run("document.querySelectorAll('.react-flow__edge').length===1&&document.querySelector('[data-app-toast=error]')?.textContent.includes('已连接')"));
  // 图片到文本属于类型不支持，应保留原图并解释原因。
  // 当前没有虚假的引用传播或生成结果，所以只验证图编辑约束。
  await clickPort('[data-kind=image] .source');
  await clickPort('[data-kind=text] .target');
  smoke.check("Incompatible media references are rejected", await run("document.querySelectorAll('.react-flow__edge').length===1&&document.querySelector('[data-app-toast=error]')?.textContent.includes('不支持')"));
  const second = await add("text", 280, 550);
  // 第二个文本节点使双向连接的类型都合法，从而真正抵达防环校验。
  // 若只拿图片连回文本，类型检查会先拒绝，不能证明循环检测有效。
  await clickPort('[data-kind=text] .source');
  await clickPort(`${second} .target`);
  await clickPort(`${second} .source`);
  await clickPort('[data-kind=text] .target');
  smoke.check("Cycle detection rejects a type-compatible return edge", await run("document.querySelectorAll('.react-flow__edge').length===2&&document.querySelector('[data-app-toast=error]')?.textContent.includes('循环')"));
  await pointer(`${second} header>svg`);
  await run("document.querySelector('[data-infinite-canvas]').focus()");
  await key("Delete");
  smoke.check("Deleting a node also deletes its associated edge", await run("document.querySelectorAll('.react-flow__edge').length===1&&document.querySelectorAll('[data-canvas-node]').length===4"));
}

// 以DOM的局部变换读取世界坐标，和屏幕测量分开，避免用同一算法自证正确。
// DOMMatrix读取浏览器已经计算好的矩阵，不访问React Flow的内部store。
async function world() {
  return run("(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector('[data-kind=video]').closest('.react-flow__node')).transform);return {x:m.e,y:m.f}})()");
}

// 移动先发按下，再发带左键标志的多帧事件，符合Electron真实输入契约。
// 初始点来自当前节点，传给产品的仍是屏幕坐标，不能直接改节点位置。
async function dragVideo(cancel = false) {
  const position = await point('[data-kind=video] header>svg');
  win.webContents.sendInputEvent({ type: "mouseDown", ...position, button: "left", clickCount: 1 });
  await delay(80);
  for (const distance of [40, 80]) {
    win.webContents.sendInputEvent({ type: "mouseMove", x: position.x + distance, y: position.y + distance / 4, modifiers: ["leftButtonDown"] });
    await delay(80);
  }
  if (cancel) await key("Escape");
  win.webContents.sendInputEvent({ type: "mouseUp", x: position.x + 80, y: position.y + 20, button: "left", clickCount: 1 });
  await delay(180);
}

// 拖动测试记录屏幕位移，适配视图后按新的zoom换算世界坐标。
// 两次位置读取来自样式，不向产品注入坐标，因此可检测抓取偏移错误。
async function checkDragging() {
  await click('[data-canvas-viewport] button[aria-label="适配全部"]');
  await delay(280);
  await delay(100);
  const zoom = await run("new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a");
  const before = await world();
  await dragVideo();
  const after = await world();
  smoke.check("Dragging preserves grab offset after zoom", zoom < 1 && Math.abs(after.x - before.x - 80 / zoom) < 1 && Math.abs(after.y - before.y - 20 / zoom) < 1);
  // 拖动和选择仍成功，但参数输入区不能顺带弹出；这与下一项 Escape 位置恢复分开判断。
  // 读取的是真正挂载的表单，不以按钮文字或本地变量猜测输入区已经隐藏。
  // 使用前面已有的实际位移，不另用 setNodes 或模拟业务返回值来制造拖动状态。
  smoke.check("Moving a selected node keeps its parameters closed", await run("!document.querySelector('[data-kind=video] [contenteditable]')"));
  await dragVideo(true);
  const cancelled = await world();
  smoke.check("Escape restores original position for a cancelled gesture", Math.abs(cancelled.x - after.x) < 1 && Math.abs(cancelled.y - after.y) < 1);
  await shot("07-connected-dragged");
}

// 观察镜头变化但作品不变，防止错误地用移动全部节点来假装平移画布。
// 真实滚轮事件带Control键，验证页面缩放与画布缩放没有串到一起。
async function checkViewport() {
  const before = await world();
  const pane = await run("(()=>{const r=document.querySelector('.react-flow__pane').getBoundingClientRect();return {x:Math.round(r.right-50),y:Math.round(r.top+110)}})()");
  const old = await run("document.querySelector('.react-flow__viewport').style.transform");
  win.webContents.sendInputEvent({ type: "mouseDown", ...pane, button: "left", clickCount: 1 });
  win.webContents.sendInputEvent({ type: "mouseMove", x: pane.x - 45, y: pane.y + 25, modifiers: ["leftButtonDown"] });
  win.webContents.sendInputEvent({ type: "mouseUp", x: pane.x - 45, y: pane.y + 25, button: "left", clickCount: 1 });
  await delay(150);
  smoke.check("Blank-space drag changes the viewport", await run(`document.querySelector('.react-flow__viewport').style.transform!==${JSON.stringify(old)}`));
  const zoom = await run("new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a");
  win.webContents.sendInputEvent({ type: "mouseWheel", ...pane, deltaX: 0, deltaY: -100, modifiers: ["control"] });
  await delay(250);
  smoke.check("Control wheel zooms the canvas", await run(`Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a-${zoom})>.01`));
  const after = await world();
  smoke.check("Viewport operations leave world coordinates unchanged", before.x === after.x && before.y === after.y);
}

// 显示开关影响真实画布；参数收起后表单卸载，不留下看不见的Tab目标。
// 手掌模式仅切换交互，不写入节点参数，恢复选择模式仍可继续编辑。
async function checkControls() {
  // 工作区接收快捷键焦点时不画浏览器整圈白框；节点业务选框另由原断言覆盖。
  // 这里只读 outline，不用一刀切 shadow:none 抹掉参数胶囊或卡片的正常视觉。
  await run("document.querySelector('[data-infinite-canvas]').focus()");
  smoke.check("Workspace keyboard focus has no browser frame", await run("getComputedStyle(document.querySelector('[data-infinite-canvas]')).outlineStyle==='none'"));
  await click('[data-canvas-viewport] button[aria-label="显示点阵"]');
  smoke.check("Grid switch removes the actual dot layer", await run("!document.querySelector('.react-flow__background')"));
  // 关闭后移走鼠标；图层与 aria-pressed 必须同步，不能只换图标底色。
  win.webContents.sendInputEvent({ type: "mouseMove", x: 4, y: 4 });
  smoke.check("Grid control reports its real disabled display state", await run("document.querySelector('[data-canvas-viewport] [aria-label=显示点阵]').getAttribute('aria-pressed')==='false'"));
  await click('[data-canvas-viewport] button[aria-label="显示点阵"]');
  await click('[data-canvas-viewport] button[aria-label="切换小地图"]');
  smoke.check("Minimap control and engine layer stay in sync", await run("!!document.querySelector('.react-flow__minimap')&&document.querySelector('[data-canvas-viewport] [aria-label=切换小地图]').getAttribute('aria-pressed')==='true'"));
  await click('[data-canvas-viewport] button[aria-label="切换小地图"]');
  await click('[data-canvas-toolbar] button[aria-label="平移画布"]');
  smoke.check("Hand mode disables node dragging", await run("document.querySelectorAll('.react-flow__node.draggable').length===0"));
  await click('[data-canvas-toolbar] button[aria-label="选择节点"]');
  await pointer('[data-kind=video] header>svg');
  await click('[data-kind=video] button[aria-label="收起参数"]');
  smoke.check("Collapsed parameters have no hidden form focus targets", await run("!document.querySelector('[data-kind=video] [contenteditable]')"));
  await click('[data-kind=video] button[aria-label="展开参数"]');
  smoke.check("Parameters reopen for the selected node", await run("!!document.querySelector('[data-kind=video] [contenteditable]')"));
}

// 使用真实主题设置按钮，主题继续沿原生信号进入CSS变量。
// 尺寸覆盖桌面与窄窗口，CDP只是CSS视口测试，不能冒充Windows系统缩放。
async function checkAppearance() {
  await click('[data-theme-trigger]');
  await wait("document.querySelector('[data-theme-option=dark]')");
  await click('[data-theme-option=dark]');
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await wait("document.documentElement.dataset.theme==='dark'");
  await delay(900);
  await shot("08-dark-overview");
  for (const width of [1280, 960, 600]) {
    await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false });
    await delay(350);
    smoke.check(`Toolbar stays inside canvas at ${width}px`, await run("(()=>{const a=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),b=document.querySelector('[data-canvas-toolbar]').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right&&b.bottom<=a.bottom})()"));
    await shot(`09-dark-${width}`);
  }
  smoke.check("Narrow navigation retains the canvas entry", await run("[...document.querySelectorAll('nav a[href=\"/canvas\"]')].some(e=>e.getBoundingClientRect().height>0)"));
}

// 设置和合成器从正式入口打开；点击来自 DOM 自动事件，不冒称人工鼠标验收。
// 浮层关闭时应回到本画布，隐藏的工作区通过 inert 停止参与键盘导航。
// 设置数据会真正改变图引擎开关，未接通服务仍保持原生 disabled。
async function checkReferencePanels() {
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  await delay(200);
  // 语义 click 本身不负责聚焦；先明确 focus，再验证打开前捕获的返回地址。
  // 否则回到 body 也可能被误认为“焦点返回正常”，掩盖 inert 引起的真实缺陷。
  await run("document.querySelector('[data-canvas-toolbar] button[aria-label=画布设置]').focus()");
  await click('[data-canvas-toolbar] button[aria-label="画布设置"]');
  await wait("document.querySelector('.hy-settings')");
  await shot("10-reference-settings");
  smoke.check("Settings reuse scoped library geometry", await run("getComputedStyle(document.querySelector('.hy-settings')).width==='700px'&&!!document.querySelector('[inert]')"));
  await click('.hy-settings [role=switch][aria-label="拖拽吸附网格"]');
  smoke.check("Settings switches retain controlled selection", await run("document.querySelector('.hy-settings [aria-label=拖拽吸附网格]').getAttribute('aria-checked')==='true'"));
  await key("Escape");
  // 工具条收起的动作合法使用 inert；不能把这些局部按钮误判成画布背景仍被禁用。
  // 只核对真正的返回按钮及其祖先，同时要求设置层确实卸载。
  // 若背景还 inert，按钮不可能恢复正常键盘路径，下面的祖先检查会失败。
  smoke.check("Settings returns focus to its real trigger", await run("document.activeElement===document.querySelector('[data-canvas-toolbar] button[aria-label=画布设置]')&&!document.activeElement.closest('[inert]')&&!document.querySelector('.hy-settings')"));
  await add("composition", 450, 340);
  await click('[data-kind=composition] .hy-open-composer');
  await wait("document.querySelector('[data-composition-state=ready]')");
  await shot("11-reference-composition");
  // 原网页真实挂载，空合成器的编辑与编码能力由专项串行回归覆盖。
  // 本场景只核对入口与关闭恢复，不能沿用旧静态外壳的禁用断言。
  smoke.check("Original compositor mounts in isolated iframe", await run("!!document.querySelector('[data-original-composition]').contentDocument.querySelector('.vcd-header')&&!document.querySelector('.hy-composer')"));
  await run("document.querySelector('[data-original-composition]').contentDocument.querySelector('[data-tip=关闭]').click()");
  await wait("!document.querySelector('[data-original-composition]')");
  await run("document.querySelector('[data-infinite-canvas]').focus()");
  await key("Delete");
}

// 正常保存通过生产 writeUserData 写入临时文件，检查文件内容而非只看返回的成功文案。
// 音频模式在本轮后加进 data，createdAt 早于它创建，专门覆盖对象字段插入顺序变化。
// 若签名没有规范化，同样数据虽然已落盘，界面仍会永远显示“未保存”，此等待会失败。
// 再完整刷新 renderer，清空模块缓存和撤销栈；恢复必须重新读磁盘，不能靠旧 Hook 内存。
// retainedSection 是无关文档段，若消失就说明画布覆盖了其他功能的数据。
async function checkPersistence() {
  await click('.hy-project-header [aria-label="保存画布"]');
  await wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const saved = libraryFixture.readCanvas({ documentPath });
  smoke.check("Real project SQLite stores nodes and edges without UI caches", saved.nodes.length === 4 && saved.edges.length === 1 && saved.nodes.every(node => !('selected' in node) && !('measured' in node)));
  smoke.check("Canvas save preserves unrelated user sections", diskDocument().retainedSection?.sentinel === "keep");
  await win.reload();
  await libraryFixture.openProject({ run, wait, click });
  await wait("document.querySelectorAll('[data-canvas-node]').length===4");
  // 重命名之后真实保存并刷新，检验名称不仅在弹窗内出现，也从正式文档恢复。
  // 几何另在标题用例检查，这里不能只凭 DOM 有一段文本就推断它可见。
  // 临时用户文档是当前冒烟自己的文件，不会改用户已命名的画布。
  smoke.check("Saved canvas name returns after reopening", await run("document.querySelector('.hy-project-name strong').textContent==='命名画布·回归'"));
  smoke.check("Reopening restores graph with selection cleared", await run("document.querySelectorAll('.react-flow__edge').length===1&&!document.querySelector('[data-selected=true]')"));
  await pointer('[data-kind=text] header>svg');
  smoke.check("Reopening restores original prompt", await run("document.querySelector('[data-kind=text] textarea').value.startsWith('保持角色')"));
  await shot("12-reopened-real-draft");
  await checkSaveFailure();
}

// 从正式名称按钮打开重命名，不直接派发 reducer 或修改 header.textContent。
// 短名要有足够文字空间，旧固定 210px 标题栏会在这里失败。
// 长名仍应省略且全名保留在 title，不能靠无限扩大标题栏修复挤压。
// 更改窗口后按实际工作区边界核对，不用屏幕宽度减一条猜测的导航宽度。
// 自动 DOM 提交属于界面事件测试，不冒充人工中文输入法或系统缩放验证。
// 每次名称变化都等待实际正文反馈，避免上次弹窗残留造成假通过。
async function renameCanvas(name) {
  // 点击的是产品项目头原按钮，修复不能只在一个独立标题样板里成立。
  // 选择器不取 CSS 模块哈希，界面组织方式改变时仍定位到真实名称输入。
  // fill 使用原生 setter 和输入事件，表单读取的是真实 DOM 值。
  // requestSubmit 触发 React onSubmit，不能用改状态或改文字绕过重命名流程。
  // 预期字符串由样本直接给出，不从 header 读回再当期望互相自证。
  // wait 有上界，命名按钮失效不会让 Electron 永远等待。
  // 提交后只看标题还不够，后面的宽度检查负责证明内容没有被挤没。
  // 弹窗关闭时焦点仍走原 CanvasOverlay，不由测试重新选一个方便的按钮。
  // 该用例不会打开系统文件选择框，验证范围是纯 UI 的名称编辑。
  // 传入长名仍小于既有八十字上限，不用非法输入测试视觉截断。
  // 两次调用共享当前工程，重命名不能顺带清掉已有四张卡片。
  // 保留连接的结果由后续 persistence 与连线场景继续核对。
  // 没有把当前工作区标题写进用户的默认设置或其他路由。
  // 本 helper 不执行保存，区分重命名草稿和落盘成功两个动作。
  // 页面重开后的名称只有通过正式保存流程才会恢复。
  await click('.hy-project-name');
  await fill('[role=dialog] input[name=name]', name);
  await run("document.querySelector('[role=dialog] form').requestSubmit()");
  await wait(`document.querySelector('.hy-project-name strong').textContent===${JSON.stringify(name)}`);
}

// 两种主题和窄窗口都沿用同一个 ProjectHeader，名称不另造浮动文字遮住图标。
// 短名不能只剩一个箭头，读取的是文字元素实际宽度而非按钮总宽度。
// 长名的省略必须由 CSS 产生，不截断保存的 name 来迁就布局。
// 结束后恢复命名样本和窗口大小，后续媒体场景保留原来的视口前提。
// 截图在正式 app:// 工作区产生，选择状态和菜单也来自产品本身。
// 重开检查在后面的 persistence 继续执行，不在此直接向 JSON 写期望名称。
async function checkProjectTitle() {
  // 标题不使用绝对定位叠到保存按钮上，窄屏边界断言负责发现横向侵占。
  // 当前样本包含中文和中点，能覆盖默认字体回退后仍需显示名称的场景。
  // 命名按钮旁还有项目图标、分隔线与设置动作，不能把整个头部宽度都算成名字。
  // 因而短名断言定位 strong，而窄屏断言定位整个 header，两者职责不同。
  // 超长样本由同一短语拼成，字符数稳定，便于后来复现截图而无需个人作品。
  // title 是桌面悬停时读全名的补充，不代替正文里至少显示一部分名称。
  // clientWidth 使用整数而矩形可以是小数，本用例只判断溢出方向，不要求二者相等。
  // 这里没有固定中文字体文件；不同 Windows 字体环境允许字宽不同。
  // 若默认字体改变导致短名超过200像素，仍应保留可读区域并使用既有省略规则。
  // setSize 改的是宿主窗口而非仅给标题加宽度，更能发现外围布局挤压。
  // 导航在当前窗口仍占空间，标题必须服从 main 的真实可用宽度。
  // 本断言不覆盖小于应用最小窗口的任意尺寸，不将无法打开的尺寸记为通过。
  // 保存状态也在标题头中；本场景保留它，避免删掉状态标签换来更多文字空间。
  // 名称恢复后继续媒体用例，可发现重命名意外重建整张画布而丢失媒体的情况。
  // 首先用短名判断最常见状态，避免长名的省略行为掩盖总宽度为零。
  // 七十像素下限对应可读短名区域，并非依赖某一种字体精确字宽。
  // strong 的布局宽度能直接检测截图里只剩箭头的情况。
  // 按钮外层即便有点击面积，只要文字被压成零仍然应该失败。
  // 第一张截图来自深色当前主题，浅色在后面的媒体回归继续使用同一项目头。
  // 长名通过相同重命名入口提交，不直接用 CSS 宽度制造一个伪造的溢出样本。
  // scrollWidth 大于 clientWidth 证明真实内容溢出，不只检查源码里写了 ellipsis。
  // 同时检查 title 保存全名，避免产品先把文档名截短再声称视觉省略。
  // textOverflow 的计算值来自 Chromium，宿主全局规则覆盖会让断言失败。
  // narrow 检查使用实际 canvas 边界，能覆盖应用导航占据的剩余可用空间。
  // 不直接以 window.innerWidth 作为主区宽度，因此不会漏掉导航开合布局。
  // 960×720 是 CSS 窗口验证，不代表操作系统缩放或物理屏幕 DPI 已通过。
  // 窗口调整后等一次布局稳定，再读取矩形，减少测到上个尺寸的可能。
  // 原窗口最终恢复1600×1000，后续真实媒体截图保持原有比较条件。
  // 最后恢复短名，不让几十个字符干扰其他功能的标题可见性判断。
  // 长名数据没有被永久写盘，后续保存使用恢复后的确认名称。
  await renameCanvas("命名画布·回归");
  smoke.check("Named canvas has readable header space", await run("document.querySelector('.hy-project-name strong').getBoundingClientRect().width>=70"));
  await shot("32-readable-canvas-name");
  const long = "需要完整保留的很长画布名称".repeat(5);
  await renameCanvas(long);
  await run("document.querySelector('.hy-project-name').focus()");
  await wait(`[...document.querySelectorAll('[data-hover-tip][data-visible=true]')].some(e=>e.textContent===${JSON.stringify(long)})`);
  smoke.check("Long canvas name truncates visually and retains its full value", await run(`(()=>{const e=document.querySelector('.hy-project-name strong');return e.scrollWidth>e.clientWidth&&e.textContent===${JSON.stringify(long)}&&getComputedStyle(e).textOverflow==='ellipsis'})()`));
  win.setSize(960, 720);
  await delay(180);
  smoke.check("Project header fits the actual narrow workspace", await run("(()=>{const a=document.querySelector('[data-infinite-canvas]').getBoundingClientRect(),b=document.querySelector('.hy-project-header').getBoundingClientRect();return b.left>=a.left&&b.right<=a.right})()"));
  await shot("33-long-canvas-name-narrow");
  win.setSize(1600, 1000);
  await renameCanvas("命名画布·回归");
}

// 保存错误由 IPC 失败注入触发；这里不是把 mock 成功返回值当成落盘证明。
// 错误时原文件字节应保持相同，当前草稿应仍可编辑；随后恢复生产写入验证重试。
// 自动节流失败也在同一个错误边界消费，不允许未处理的 Promise 拒绝。
async function checkSaveFailure() {
  const before = JSON.stringify(libraryFixture.readCanvas({ documentPath }));
  failWrites = true;
  await fill('[data-kind=text] textarea', "失败后保留的真实草稿");
  await click('.hy-project-header [aria-label="保存画布"]');
  await wait("document.querySelector('[data-canvas-save-status]').textContent.includes('保存失败')");
  smoke.check("Failed save retains disk and editable draft", JSON.stringify(libraryFixture.readCanvas({ documentPath })) === before && await run("document.querySelector('[data-kind=text] textarea').value==='失败后保留的真实草稿'"));
  await shot("13-save-error");
  failWrites = false;
  await click('.hy-project-header [aria-label="保存画布"]');
  await wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  smoke.check("Retry confirms actual disk contents", libraryFixture.readCanvas({ documentPath }).nodes.find(node => node.data.kind === "text").data.content === "失败后保留的真实草稿");
}

// 每项都通过正式页面继续操作；下一个场景依赖前一个的真实图状态。
// 按顺序 await，失败不跳过历史或连接检查，也不并发启动第二个 Electron。
// 视频侧栏专项仍走同一正式静态工作区、preload 和真实隔离用户文档。
// 仅缩小检查集合，不跳过构建指纹或错误退出护栏；不宣称其等于全量画布验收。
async function checkPreviewScenarios() {
  const context = { win, run, smoke, root, documentPath, wait, click, shot, key, pointer };
  if (process.env.CANVAS_ADD_MENU_SMOKE === "1") await require("./lib/check-canvas-add-menu").checkCanvasAddMenu(context);
  else if (process.env.CANVAS_RESOURCES_SMOKE === "1") await require("./lib/check-canvas-resources-ui").checkCanvasResources(context);
  else if (process.env.CANVAS_COMPARE_SMOKE === "1") await require("./lib/check-canvas-compare").checkCanvasCompare(context);
  else if (process.env.CANVAS_NETWORK_SMOKE === "1") await require("./lib/check-canvas-network").checkCanvasNetwork(context);
  else return false;
  return true;
}

// 生成专项共用同一正式宿主与服务夹具，只按明确开关选择业务回归。
async function runGenerationScenarios() {
  const ctx = { win, run, smoke, root, documentPath, wait, click, shot, key, pointer, add, fill };
  if (process.env.CANVAS_EUZHI_SMOKE === "1") return require("./lib/check-canvas-generation").checkRemoteImages(ctx, generationFixture.state);
  if (process.env.IMAGE_WORKFLOW_BATCH_SMOKE === "1") return require("./lib/check-canvas-generation").checkWorkflowBatch(ctx, generationFixture.state);
  if (process.env.CANVAS_TASKS_SMOKE === "1") return require("./lib/check-canvas-tasks").checkCanvasTasks(ctx, generationFixture.state);
  if (process.env.CANVAS_AUDIO_CARD_SMOKE === "1") return require("./lib/check-canvas-audio-card").checkAudioCard(ctx, generationFixture.state);
  if (process.env.CANVAS_AUDIO_SMOKE === "1") return require("./lib/check-canvas-audio").checkCanvasAudio(ctx, generationFixture.state);
  if (process.env.SEEDVR2_SMOKE === "1") return require("./lib/check-seedvr2").checkSeedvr2(ctx, generationFixture.state);
  if (process.env.MINIMAX_IMAGE_EDIT_SMOKE === "1") return require("./lib/check-minimax-image-edit").checkMinimaxImageEdit(ctx, generationFixture.state);
  return require("./lib/check-canvas-generation").checkCanvasGeneration(ctx, generationFixture.state);
}

async function runScenarios() {
  if (process.env.CANVAS_SPEECH_SMOKE === "1") return require("./lib/check-prompt-speech").checkPromptSpeech({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill }, promptFixture);
  if (process.env.CANVAS_COMPOSITION_RESOURCES_SMOKE === "1") return require("./lib/check-composition-resources").checkCompositionResources({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer });
  if (process.env.CANVAS_CONTEXT_MENU_SMOKE === "1") return require("./lib/check-canvas-context-menu").checkCanvasContextMenu({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill, add });
  if (process.env.CANVAS_ANNOTATIONS_SMOKE === "1") return require("./lib/check-canvas-annotations").checkCanvasAnnotations({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill, add });
  if (process.env.CANVAS_WRITING_SMOKE === "1") return require("./lib/check-canvas-writing").checkCanvasWriting({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill, add }, promptFixture);
  if (process.env.CANVAS_GLOBAL_RESOURCES_SMOKE === "1") return require("./lib/check-canvas-global-resources-ui").checkCanvasGlobalResources({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill });
  if (promptFixture) return require("./lib/check-canvas-prompt-preview").checkCanvasPromptPreview({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill }, promptFixture);
  if (await checkPreviewScenarios()) return;
  if (process.env.CANVAS_RESIZE_SMOKE === "1") return require("./lib/check-canvas-card-resize").checkCanvasCardResize({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer });
  // 专项仍复用正式静态入口与真实隔离文件；自动鼠标注入不等于人工拖线验收。
  if (process.env.CANVAS_CONNECT_RATIO_SMOKE === "1") return require("./lib/check-canvas-connect-ratio").checkCanvasConnectRatio({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer });
  if (process.env.CANVAS_VIDEO_SETTINGS_SMOKE === "1") return require("./lib/check-canvas-video-settings").checkCanvasVideoSettings({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, fill });
  if (generationFixture) return runGenerationScenarios();
  if (euzhiFixture) return require("./lib/check-euzhi-images").checkEuzhiImages({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, add, fill }, euzhiFixture);
  if (process.env.DIRECTOR_SMOKE === "1") return require("./lib/check-director-runtime").checkDirectorRuntime({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer, setFailWrites: value => { failWrites = value; } });
  await checkNodes();
  await checkNodeEditing();
  await checkHistory();
  await checkConnections();
  await checkDragging();
  await checkViewport();
  await checkControls();
  // 延续同一个正式画布验证短按、长按、键盘箭头与端口装饰，不替换图模型。
  // 注入输入事件属于自动操作，实际鼠标手感仍需人工验收。
  await require("./lib/check-canvas-node-interactions").checkCanvasNodeInteractions({ win, run, smoke, wait, click, shot, key, pointer });
  await checkButtonStates();
  await checkModeStates();
  await checkRatioStates();
  // 复用同一已启动窗口验证节点侧栏，不另开 Electron 或绕过正式保存路径。
  // 自动输入和磁盘证据只证明接线与恢复，不替代人工操作或真实生成验收。
  // 检查结束关闭临时面板，原媒体与工程交换回归继续串行执行。
  await require("./lib/check-canvas-workflow-controls").checkCanvasWorkflowControls({ win, run, smoke, wait, click, shot, key, pointer, fill, documentPath });
  await checkAppearance();
  await checkReferencePanels();
  await checkProjectTitle();
  await checkPersistence();
  // 延续同一真实窗口与临时文档；本地媒体、浅色及资源清理不是独立 HTML 样板。
  // 新模块不复制外壳或重启 Electron，遵守一次一个冒烟的限制。
  await require("./lib/check-canvas-media").checkCanvasMedia({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer });
  await require("./lib/check-canvas-project").checkCanvasProject({ win, run, smoke, root, documentPath, wait, click, shot, key, pointer });
  // 媒体与工程往返后再检查同一交互的浅深主题，截图包含真正解码后的本地视频。
  // 这一阶段不重新写节点内容，也不把静态样例当作真实视频截图。
  await require("./lib/check-canvas-node-interactions").checkCanvasNodeVisuals({ win, run, smoke, wait, click, shot, key, pointer });
}

// 只销毁本用例创建的窗口；失败退出由harness护栏保留非零退出码。
// 先验证新构建，防止截图来自旧导出而错误宣称本轮功能可用。
async function main() {
  await app.whenReady();
  // 开发回归直接读取当前源码；静态回归仍必须核对导出指纹。
  if (process.env.CANVAS_SMOKE_DEV !== "1") smoke.assertBuildFresh({ app });
  if (process.env.CANVAS_GENERATION_SMOKE === "1" || process.env.CANVAS_EUZHI_SMOKE === "1") generationFixture = await require("./lib/canvas-generation-fixture").installCanvasGenerationFixture(root, documentPath);
  if (process.env.CANVAS_TASKS_SMOKE === "1") await require("./lib/canvas-task-fixture").createProject(root, seed.infiniteCanvas);
  const chrome = require("../apps/electron/src/main/core/windows/window-chrome");
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), show: false, width: 1600, height: 1000, webPreferences: { additionalArguments: chrome.windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents);
  win.webContents.debugger.attach("1.3");
  watchRuntimeErrors(win);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    // dev 才切换本机服务，默认行为继续加载带新鲜度指纹的 app:// 导出。
    // 此差异只改变页面来源，真实视频文件仍经同一个 localfile 协议读取。
    // dev 与生产各自输出运行日志，不将 HMR 页面截图标为发布产物截图。
    await win.loadURL(process.env.CANVAS_SMOKE_DEV === "1" ? "http://localhost:3000/canvas" : "app://app/canvas");
    // 页面加载后才启用焦点模拟；加载前尚无 frame，CDP 可能一直等待命令目标。
    // 离屏窗口没有桌面活动焦点，这一设置只补齐自动 CSS :focus 的绘制前提。
    // Tab 和 Enter 仍走 Electron 输入，不将模拟焦点写成实体键盘验收。
    await win.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (process.env.CANVAS_LIBRARY_SMOKE === "1") {
      await wait("document.querySelector('[data-canvas-library]')");
      await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
      await click('[aria-labelledby=update-announcement-title] button');
      await require("./lib/check-canvas-library-ui").checkCanvasLibrary({ win, run, smoke, root, wait, click, shot, key, pointer, add });
    } else {
      await libraryFixture.openProject({ run, wait, click });
      await wait("document.querySelector('[data-infinite-canvas]')");
      await wait("document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')");
      await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
      await click('[aria-labelledby=update-announcement-title] button');
      await runScenarios();
    }
    const failures = errors.filter(message => /hydration|while rendering|Minified React error|TypeError|useInsertionEffect/.test(message));
    if (failures.length) console.error("CANVAS_RENDERER_FAILURES", failures);
    smoke.check("No renderer hydration, React or runtime TypeErrors", failures.length === 0);
  } catch (error) { await shot("99-failure"); throw error; }
  finally { win.destroy(); generationFixture?.close(); }
  console.log("CANVAS_SCREENSHOTS", root);
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.stack); smoke.finish({ app, ok: false }); });
