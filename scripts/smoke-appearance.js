/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 */
/** 外观 UI 回归：模拟本机用户文档，验证真实顶栏入口、明暗配色、字体、持久化与窄屏，不连接后台。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "appearance", timeoutMs: 60000 });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-appearance-"));
let document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { theme: "light", locale: "zh-CN", paths: {} } });
const errors = [];
// 记录的是原生窗口加载底色，不再把原生caption overlay当作主题同步目标。
// 自定义按钮由head DOM绘制；底色只防止页面尚未提交时窗口边缘出现旧主题。
// 真正的按钮存在性和背景继承在每个明暗/色板组合中另外断言。
let shellWindowColor = "";
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 自定义head挂载会读取初始最大化状态，测试必须安装真实窗口控制入口。
// 仅提供生产允许动作，不添加总会成功的假窗口操作handler。
// 账号/模型/文件等业务仍沿用下方隔离夹具，不连接真实服务。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, next) => { document = next; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => directory);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
const run = smoke.createRun(), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(source) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await run(`Boolean(${source})`)) return; await delay(60); }
  throw new Error("Appearance condition timed out: " + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(40); }
async function capture(win, name) {
  await delay(100); fs.writeFileSync(path.join(directory, name + ".png"), (await win.webContents.capturePage()).toPNG());
}
async function load(win) {
  await win.loadURL("app://app/profile"); await wait("document.querySelector('[data-profile-fixed-header]')");
  await delay(150);
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
}
async function openAppearance() {
  await click("[data-window-appearance]"); await wait("document.querySelector('[data-theme-dialog]')");
  // 先等已有的全局弹窗入场动画结束，几何断言不把缩放中间帧误判为滚动位移。
  await delay(250);
}
async function closeAppearance() {
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await wait("!document.querySelector('[data-theme-dialog]')");
}
function luminance(rgb) {
  return rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
async function readAccent() {
  return run(`(() => {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
    const nav=getComputedStyle(document.querySelector('nav [aria-current=page]'));
    const button=getComputedStyle(document.querySelector('[data-color-preset][aria-pressed=true] .bg-accent-fill'));
    return {text:rgb(nav.color),background:rgb(nav.backgroundColor),fill:rgb(button.backgroundColor),onFill:rgb(button.color)};
  })()`);
}
async function checkModesAndColors(win) {
  // 个人主页入口已移至账户菜单；切到创建页检查 nav 的真实选中态。
  await closeAppearance(); await click('nav[aria-expanded] a[href="/create"]');
  await wait("document.querySelector('[data-generate-button]')&&!document.documentElement.classList.contains('page-transition')");
  await openAppearance();
  for (const mode of ["light", "dark"]) {
    await click(`[data-theme-option=${mode}]`);
    await wait(`document.documentElement.dataset.theme==='${mode}'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches===${mode === "dark"}`);
    const shellColors = new Set();
    for (const preset of ["default", "sand", "rose", "teal", "sunset", "forest", "ocean", "graphite"]) {
      await click(`[data-color-preset=${preset}]`); await wait(`document.documentElement.dataset.colorPreset==='${preset}'`);
      await delay(230); // 导航原本有颜色过渡，对比度按最终显示值判断。
      const colors = await readAccent();
      smoke.check(`${mode}/${preset}: navigation and button labels have readable contrast`, contrast(colors.text, colors.background) >= 4.5 && contrast(colors.fill, colors.onFill) >= 4.5);
      // 最新参考要求 head、nav 和外壳留白共用同一实色，取消先前的 head 混色。
      // 从各真实 DOM 区域读取结果，防止 token 同名却被更具体的 CSS 覆盖。
      // 逐一切换明暗及八种色板，捕获写死白色或保留上一配色的回归。
      const shell = await run("(()=>{const color=s=>getComputedStyle(document.querySelector(s)).backgroundColor;return {head:color('[data-window-titlebar]'),nav:color('nav[aria-expanded]'),outer:color('[data-app-shell]')}})()");
      shellColors.add(shell.head);
      // head 与 nav 必须同时匹配 shell，三者互相相等才表示完整外壳连续。
      // 按钮透明背景由下一项独立检查，不能用按钮颜色代表整个标题栏。
      smoke.check(`${mode}/${preset}: head, nav and surrounding shell use one opaque background`, shell.head === shell.nav && shell.nav === shell.outer);
      // 每种主题与色板都保留三枚React按钮，不重新显示原生overlay。
      // 按钮表面透明并继承整条head底色，确保主题提交与页面是同一绘制来源。
      // 同时核对原生窗口加载底色，避免导航加载或窗口缩放时露出上一次主题。
      // 此处验证最终颜色一致性；不把截图通过描述成已经测量动画性能。
      smoke.check(`${mode}/${preset}: custom caption shares head paint and native window fallback follows shell`, shellWindowColor === await run("getComputedStyle(document.documentElement).getPropertyValue('--shell-background').trim()") && await run("document.querySelectorAll('[data-window-control]').length===3&&Array.from(document.querySelectorAll('[data-window-control]')).every(b=>getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')"));
      if (preset === "teal") await capture(win, `appearance-${mode}`);
    }
    smoke.check(`${mode}: all eight presets change the actual shell background`, shellColors.size === 8);
  }
  // 创建页由 rail/stage/side 各自绘制中性表面，透明 main 负责显示栏间外壳色。
  // 用独立元素解析 --background，再与真实 rail 比较，不把旧的单块 main 底色作为契约。
  // 其他色板不应把作品表面染成外壳强调色，透明与内容中性色必须同时满足。
  smoke.check("palette selection keeps the create surface neutral", await run("(()=>{const p=document.createElement('span');p.style.background='var(--background)';document.body.append(p);const expected=getComputedStyle(p).backgroundColor;p.remove();return getComputedStyle(document.querySelector('[data-app-main]')).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('[data-create-rail]')).backgroundColor===expected})()"));
  await click("[data-theme-option=system]"); await wait("document.documentElement.dataset.themePreference==='system'&&!document.documentElement.classList.contains('theme-ripple')");
  smoke.check("system mode reuses the native theme preference", nativeTheme.themeSource === "system");
  await closeAppearance(); await load(win); await openAppearance();
}
async function checkFontsAndPersistence(win) {
  await click("[data-color-preset=teal]"); await click("[data-ui-font=serif]");
  smoke.check("serif font reaches the page and nav, while code keeps its dedicated font", await run("(()=>{const c=document.createElement('code');c.className='font-mono';document.body.append(c);const p=getComputedStyle(document.querySelector('[data-profile-fixed-header]')).fontFamily,n=getComputedStyle(document.querySelector('nav[aria-expanded]')).fontFamily,m=getComputedStyle(c).fontFamily;c.remove();return p.includes('Georgia')&&n===p&&!m.includes('Georgia')})()"));
  await delay(400);
  smoke.check("appearance saves to the existing settings section", document.settings.colorPreset === "teal" && document.settings.uiFont === "serif");
  await closeAppearance(); await load(win);
  await wait("document.documentElement.dataset.colorPreset==='teal'&&document.documentElement.dataset.uiFont==='serif'");
  smoke.check("full reload restores color and font without losing guest session", Boolean(document.entrySession.guest));
  await openAppearance(); await click("[data-ui-font=sans]");
  smoke.check("sans font applies globally", await run("getComputedStyle(document.body).fontFamily.startsWith('Arial')"));
  await click("[data-appearance-reset]");
  await wait("document.documentElement.dataset.colorPreset==='default'&&document.documentElement.dataset.uiFont==='auto'");
  smoke.check("reset returns all three preferences to defaults", await run("document.documentElement.dataset.themePreference==='system'&&document.documentElement.style.getPropertyValue('--accent-fill')===''") );
  await closeAppearance(); await delay(350);
  document.settings.colorPreset = "invalid"; document.settings.uiFont = { unexpected: true };
  await load(win); await wait("document.documentElement.dataset.colorPreset==='default'&&document.documentElement.dataset.uiFont==='auto'");
  smoke.check("unknown persisted values safely fall back to defaults", true);
}
async function checkNarrowAndKeyboard(win) {
  win.setContentSize(320, 500); await delay(200); await openAppearance();
  smoke.check("320px topbar keeps all action buttons visible and clickable", await run("(()=>{const h=document.querySelector('[data-window-titlebar]').getBoundingClientRect();return [...document.querySelectorAll('[data-window-titlebar] .window-caption-action')].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=h.right+1&&getComputedStyle(e).getPropertyValue('-webkit-app-region')==='no-drag'})})()"));
  smoke.check("short narrow dialog stays below caption and scrolls only its body", await run("(()=>{const d=document.getElementById('appearance-title').closest('[role=dialog]'),r=d.getBoundingClientRect(),s=d.children[1];return r.top>=32&&r.bottom<=innerHeight&&r.right<=innerWidth&&s.scrollHeight>s.clientHeight&&document.documentElement.scrollWidth<=innerWidth})()"));
  const before = await run("document.getElementById('appearance-title').getBoundingClientRect().top");
  await run("document.querySelector('[data-ui-font=serif]').scrollIntoView({block:'center'})");
  smoke.check("scrolling to font choices leaves the dialog title fixed", Math.abs(before - await run("document.getElementById('appearance-title').getBoundingClientRect().top")) <= 1);
  await capture(win, "appearance-narrow-scrolled");
  await run("(()=>{const d=document.getElementById('appearance-title').closest('[role=dialog]'),items=d.querySelectorAll('button');items[items.length-1].focus()})()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" }); await delay(100);
  smoke.check("keyboard Tab stays inside the appearance dialog", await run("document.activeElement===document.getElementById('appearance-title').closest('[role=dialog]').querySelector('button')"));
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await wait("!document.querySelector('[data-theme-dialog]')");
  smoke.check("Escape closes the dialog and returns focus to the topbar", await run("document.activeElement===document.querySelector('[data-window-appearance]')"));
}
async function checkAnchoring(win) {
  smoke.check("appearance is anchored just below its icon without a modal overlay", await run("(()=>{const p=document.querySelector('[data-theme-dialog]'),r=p.getBoundingClientRect(),a=document.querySelector('[data-window-appearance]').getBoundingClientRect();return r.top>=a.bottom&&r.top-a.bottom<=12&&Math.abs(r.right-a.right)<=1&&p.getAttribute('aria-modal')!=='true'&&document.elementFromPoint(100,200)?.closest('[data-app-main],nav')!==null})()"));
  await capture(win, "appearance-anchored");
  // nav 调整顺序后旧坐标 (100,200) 会点到「本地解析」并触发路由切换。
  // 关闭浮层测试必须点击没有业务动作的外壳留白，避免导航与再次打开发生竞争。
  // 右边 8px 固定留白在桌面夹具中始终存在，x=视口宽度-3 位于 main 之外。
  // 仍发送真实指针事件验证 outside 监听，不用直接调用 onClose 绕过产品逻辑。
  const outsideX = await run("innerWidth-3");
  win.webContents.sendInputEvent({type:"mouseDown",button:"left",x:outsideX,y:100,clickCount:1});
  win.webContents.sendInputEvent({type:"mouseUp",button:"left",x:outsideX,y:100,clickCount:1});
  await wait("!document.querySelector('[data-theme-dialog]')");
  smoke.check("clicking outside closes the popover", true);
  await openAppearance(); await click("[data-window-appearance]");
  await wait("!document.querySelector('[data-theme-dialog]')");
  smoke.check("clicking the icon again closes the popover", true);
  await openAppearance();
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 1350, height: 960, show: false, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  // 无边框窗口不再调用setTitleBarOverlay，截获原生背景更新保留真实系统副作用。
  // 这里不替换主题handler，也不人为注入预期色值，记录生产代码实际传入的颜色。
  // 调用原方法后再由每个色板的断言核对，避免监测工具自身掩盖系统调用错误。
  // 背景颜色契约仍只接受六位十六进制字符串，非法值回归沿用原有IPC检查。
  // 该窗口是offscreen颜色夹具，真实最小化与关闭由window-titlebar专项独立覆盖。
  const setBackground = win.setBackgroundColor.bind(win);
  win.setBackgroundColor = color => { shellWindowColor = color; setBackground(color); };
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    await load(win);
    smoke.check("legacy documents start with default color and auto font", await run("document.documentElement.dataset.colorPreset==='default'&&document.documentElement.dataset.uiFont==='auto'"));
    await click("[data-account-menu-trigger]");
    smoke.check("account menu no longer contains a theme entry", await run("!document.querySelector('[data-sidebar-account-menu] [data-theme-trigger]')&&Boolean(document.querySelector('[data-sidebar-account-menu] [data-language-trigger]'))"));
    await click("[data-account-menu-trigger]"); await openAppearance();
    const invalidCaption = await run("window.electronAPI.setThemeSource('light','not-a-color')");
    smoke.check("invalid native caption colors return INVALID_ARGUMENT", invalidCaption.success === false && invalidCaption.code === "INVALID_ARGUMENT");
    smoke.check("appearance is directly before refresh in the topbar", await run("document.querySelector('[data-window-appearance]').nextElementSibling.hasAttribute('data-window-reload')"));
    smoke.check("dialog has 3 theme presets, 8 non-purple color presets and 3 fonts", await run("document.querySelectorAll('button[data-theme-option]').length===3&&document.querySelectorAll('button[data-color-preset]').length===8&&document.querySelectorAll('button[data-ui-font]').length===3"));
    await checkAnchoring(win); await checkModesAndColors(win); await checkFontsAndPersistence(win); await checkNarrowAndKeyboard(win);
    smoke.check("no React render or hydration errors", !errors.some(message => /while rendering|hydration|Minified React error/.test(message)));
  } finally { occlusion.dispose(); win.destroy(); }
  console.log("APPEARANCE_SCREENSHOTS", directory); smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false }); });
