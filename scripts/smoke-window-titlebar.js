/** Verify caption pixels during real route/panel transitions, with a negative control for the root-snapshot bug. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "window-titlebar", timeoutMs: 90000 });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-caption-smoke-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = smoke.createRun();
let win;
let theme = "light";
app.disableHardwareAcceleration();
app.setPath("userData", path.join(temp, "browser"));
smoke.setWorkDir(temp);
smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: { version: 1, settings: { paths: {}, theme, locale: "zh-CN" } }, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => temp);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: [] }));

async function wait(source) {
  for (let i = 0; i < 100; i++) {
    if (await run(`Boolean(${source})`)) return;
    await delay(50);
  }
  throw new Error("Caption condition timed out: " + source);
}

async function load(route) {
  console.log("Loading caption fixture: " + route);
  await win.loadURL("app://app" + route);
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await wait("document.querySelector('[data-window-titlebar]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await delay(300);
  await run(`(() => {
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = (callback) => {
      const transition = original(callback);
      window.__captionTransition = transition;
      window.__captionReady = false;
      transition.ready.then(() => {
        for (const animation of document.getAnimations()) {
          if (!animation.effect?.pseudoElement?.startsWith('::view-transition')) continue;
          animation.pause(); animation.currentTime = 170;
        }
        window.__captionReady = true;
      }).catch(() => { window.__captionSkipped = true; });
      return transition;
    };
  })()`);
}

async function finishTransition() {
  await run("document.getAnimations().filter(a=>a.effect?.pseudoElement?.startsWith('::view-transition')).forEach(a=>a.finish())");
  await wait("!document.documentElement.classList.contains('page-transition')");
}

async function navigate(route) {
  await run(`(() => {
    window.__captionReady = false; window.__captionSkipped = false;
    const links = document.querySelectorAll('nav[aria-expanded] a[href="${route}"]');
    const link = links[links.length - 1];
    if (!link) throw new Error('Navigation link missing');
    link.click();
  })()`);
  await wait("window.__captionReady || window.__captionSkipped");
  if (await run("window.__captionSkipped")) throw new Error("View transition unexpectedly skipped");
  await wait(`document.querySelector('[data-page-transition]')?.dataset.pageTransition === ${JSON.stringify(route)}`);
}

async function captionPixelsMatch(name) {
  const geometry = await run(`(() => {
    const header = document.querySelector('[data-window-titlebar]');
    return { rect: header.getBoundingClientRect().toJSON(), width: innerWidth,
      color: getComputedStyle(header).backgroundColor.match(/\\d+/g).slice(0,3).map(Number) };
  })()`);
  await delay(80);
  const image = await win.webContents.capturePage();
  const scale = image.getSize().width / geometry.width;
  const bitmap = image.toBitmap();
  const stride = image.getSize().width;
  const { rect, color } = geometry;
  if (process.env.SMOKE_CAPTION_SCREENSHOTS) {
    fs.mkdirSync(process.env.SMOKE_CAPTION_SCREENSHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.SMOKE_CAPTION_SCREENSHOTS, name + ".png"), image.toPNG());
  }
  return [0.1, 0.3, 0.5, 0.7].every((fraction) => [2, rect.height - 2].every((y) => {
    const offset = (Math.round((rect.top + y) * scale) * stride + Math.round((rect.left + rect.width * fraction) * scale)) * 4;
    return Math.abs(bitmap[offset] - color[2]) <= 2 && Math.abs(bitmap[offset + 1] - color[1]) <= 2 && Math.abs(bitmap[offset + 2] - color[0]) <= 2;
  }));
}

async function checkRoute(route, name) {
  await navigate(route);
  smoke.check(name + ": caption remains visible in animation pixels", await captionPixelsMatch(name));
  smoke.check(name + ": caption snapshot is static and above all page groups", await run(`(() => {
    const css = (name) => getComputedStyle(document.documentElement, '::view-transition-group(' + name + ')');
    const header = document.querySelector('[data-window-titlebar]');
    const z = Number(css('window-titlebar').zIndex);
    return header.getBoundingClientRect().top === 0 && getComputedStyle(header).viewTransitionName === 'window-titlebar'
      && css('window-titlebar').animationName === 'none'
      && ['root','app-sidebar','page-content','page-panel'].every(name=>z>(parseFloat(css(name).zIndex) || 0));
  })()`));
  await finishTransition();
  smoke.check(name + ": temporary snapshot name is cleaned up", await run("getComputedStyle(document.querySelector('[data-window-titlebar]')).viewTransitionName === 'none'"));
}

async function checkNegativeControl() {
  await load("/tools");
  const style = await win.webContents.insertCSS("html.page-transition [data-window-titlebar] { view-transition-name: none !important; }");
  try {
    await navigate("/");
    smoke.check("Negative control: DOM z-index alone cannot protect caption from homepage snapshot", !(await captionPixelsMatch("negative-control")));
    await finishTransition();
  } finally { await win.webContents.removeInsertedCSS(style); }
}

async function checkContentStack() {
  await run(`(() => {
    const curtain = document.createElement('div'); curtain.id = 'caption-stacking-fixture';
    curtain.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#ff0000';
    document.querySelector('#main-content').append(curtain);
  })()`);
  smoke.check("Even a page tool with z-index 999999 stays below caption", await captionPixelsMatch("high-page-layer"));
  await run("document.querySelector('#caption-stacking-fixture').remove();document.querySelector('[data-window-download]').click()");
  await wait("document.querySelector('[data-window-download-center]')");
  smoke.check("Download entry still works and panel stays below caption", await run("document.querySelector('[data-window-download-center]').getBoundingClientRect().top >= document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom"));
  await run("document.querySelector('[data-window-download-center] button').click()");
}

async function checkPanelTransition() {
  await run(`(() => {
    const root = document.documentElement; root.classList.add('page-transition'); root.dataset.pageDirection = 'forward';
    window.__captionReady = false;
    const transition = document.startViewTransition(() => {
      const panel = document.createElement('div'); panel.dataset.imageDetailPanel = '';
      panel.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#ff0000';
      document.body.append(panel);
    });
    transition.finished.finally(() => { root.classList.remove('page-transition'); delete root.dataset.pageDirection; }).catch(() => {});
  })()`);
  await wait("window.__captionReady");
  smoke.check("Shared image-panel transition cannot paint over caption", await captionPixelsMatch("panel-transition"));
  await finishTransition();
  await run("document.querySelector('[data-image-detail-panel]').remove()");
}

async function checkVisibility() {
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, false);
  await wait("!document.querySelector('[data-window-titlebar]')");
  smoke.check("Fullscreen hides custom caption and removes reserved height", await run("getComputedStyle(document.documentElement).getPropertyValue('--window-chrome-height').trim()==='0px'"));
  win.webContents.send(C.WINDOW_CHROME_VISIBILITY, true);
  await wait("document.querySelector('[data-window-titlebar]')");
  smoke.check("Restored caption keeps original height and top position", await run("(()=>{const r=document.querySelector('[data-window-titlebar]').getBoundingClientRect();return r.top===0&&r.height===32})()"));
}

async function createWindow() {
  win = new BrowserWindow({ ...windowChromeOptions(), width: 1300, height: 900, show: false, webPreferences: {
    additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"),
    contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
  } });
  smoke.attachWebContents(win.webContents);
  win.webContents.debugger.attach("1.3");
  return smoke.hardenWindow(win);
}

async function checkThemes() {
  for (theme of ["light", "dark"]) {
    nativeTheme.themeSource = theme;
    await load("/");
    await checkRoute("/tools", theme + "-home-to-tools");
    await checkRoute("/", theme + "-tools-to-home");
    await checkRoute("/create", theme + "-home-to-create");
    await checkContentStack();
    await checkPanelTransition();
  }
}

async function checkNarrow() {
  win.setContentSize(390, 844);
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1.25, mobile: false });
  await load("/");
  smoke.check("Narrow fixture uses 390px viewport at DPR 1.25", await run("innerWidth === 390 && devicePixelRatio === 1.25"));
  await wait("document.querySelector('[data-home-hero-explore]')");
  await run("window.__captionReady=false;document.querySelector('[data-home-hero-explore]').click()");
  await wait("window.__captionReady");
  smoke.check("390px at DPR 1.25: caption pixels remain intact", await captionPixelsMatch("narrow-dpr"));
  await finishTransition();
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const occlusion = await createWindow();
  try {
    await checkNegativeControl();
    await checkThemes();
    await checkNarrow();
    await checkVisibility();
  } finally { occlusion.dispose(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false }); });
