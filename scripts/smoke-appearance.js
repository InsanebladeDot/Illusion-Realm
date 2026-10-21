/** 外观 UI 回归：模拟本机用户文档，验证真实顶栏入口、明暗配色、字体、持久化与窄屏，不连接后台。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "appearance", timeoutMs: 60000 });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-appearance-"));
let document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { theme: "light", locale: "zh-CN", paths: {} } });
const errors = [];
let captionColor = "";
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
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
      const shell = await run("(()=>{const color=s=>getComputedStyle(document.querySelector(s)).backgroundColor;return {head:color('[data-window-titlebar]'),nav:color('nav[aria-expanded]'),outer:color('[data-app-shell]')}})()");
      shellColors.add(shell.head);
      smoke.check(`${mode}/${preset}: head, nav and surrounding shell use the same background`, shell.head === shell.nav && shell.nav === shell.outer);
      smoke.check(`${mode}/${preset}: native caption buttons use the selected shell color`, captionColor === await run("getComputedStyle(document.documentElement).getPropertyValue('--shell-background').trim()"));
      if (preset === "teal") await capture(win, `appearance-${mode}`);
    }
    smoke.check(`${mode}: all eight presets change the actual shell background`, shellColors.size === 8);
  }
  smoke.check("palette selection keeps the create surface neutral", await run("getComputedStyle(document.querySelector('[data-app-main]')).backgroundColor==='rgb(30, 30, 30)'"));
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
  win.webContents.sendInputEvent({type:"mouseDown",button:"left",x:100,y:200,clickCount:1});
  win.webContents.sendInputEvent({type:"mouseUp",button:"left",x:100,y:200,clickCount:1});
  await wait("!document.querySelector('[data-theme-dialog]')");
  smoke.check("clicking outside closes the popover", true);
  await openAppearance(); await click("[data-window-appearance]");
  await wait("!document.querySelector('[data-theme-dialog]')");
  smoke.check("clicking the icon again closes the popover", true);
  await openAppearance();
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({ ...windowChromeOptions(), width: 1350, height: 960, show: false, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  const setOverlay = win.setTitleBarOverlay.bind(win);
  win.setTitleBarOverlay = options => { captionColor = options.color; setOverlay(options); };
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
