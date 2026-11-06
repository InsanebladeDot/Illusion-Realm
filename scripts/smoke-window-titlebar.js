/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 */
/** Verify caption pixels during real route/panel transitions, with a negative control for the root-snapshot bug. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeTheme } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
// 释放内存接生产 handler，再用本机 HTTP 夹具代替真实 ComfyUI 服务。
// 这样按钮、preload、参数校验、结果包装和固定 /free 请求都会被实际执行。
// 其余模型、账号和文件 IPC 继续由当前脚本原有夹具隔离。
const http = require("node:http");
// 先注册生产通道；后面已有 COMFY_LIST_MODELS 夹具会只覆盖模型查询。
// 新释放通道不能用直接返回成功的 handler 替身，否则 UI 与服务断开的回归会漏检。
// 注册动作本身不连接网络，HTTP 服务将在窗口加载前绑定随机本机端口。
require("../apps/electron/src/main/modules/comfy/comfy.handlers").registerComfyHandlers();
// 服务地址只写入临时用户文档夹具，不影响当前用户的实际设置。
// hold 模式将响应留在主进程，测试可明确控制等待态何时结束。
// 这像把回执暂时放在柜台，按钮必须等收到回执后才能恢复可点击。
// 503 模式提供真实 HTTP 失败，不能通过界面本地改状态模拟报错。
// 计数在请求到达 HTTP 层后递增，能够发现 preload 重复转发。
let memoryAddress = "";
let memoryReply;
let memoryMode = "hold";
let memoryCalls = 0;
// 本地端口只处理本轮请求，不读取图片、模型、账号或 API 密钥。
// 请求流主动读取并丢弃，测试不需要把上传字节保存在主进程。
// 成功响应保持为空，与真实 ComfyUI /free 保持相同的读取边界。
// 所有分支都能由最后的 closeAllConnections 清理，失败时不会留下端口。
// 不在这里计算显存或模拟“已经卸载完成”，只控制服务是否接受请求。
// 请求 payload 的精确断言由 verify-comfy-generation 的真实 HTTP 回归覆盖。
// UI 冒烟重点是顶栏位置、忙碌状态、重复点击和用户能看到的错误反馈。
// 这里没有后台轮询计时器，所有等待复用当前脚本的有界主进程轮询。
const memoryServer = http.createServer((req, res) => {
  // resume 只负责排空流，不代表这里已经解析或验证了 JSON 内容。
  // 严格 payload 断言另在协议回归中执行，这里不要把收到连接误称为请求校验通过。
  // reply 是服务端尚未结束的响应，浏览器仍在等待它，所以可稳定观察按钮忙碌状态。
  // hold 分支不调用 end，测试阶段明确结束它时才会把回执交给生产请求器。
  // reject 分支立即给出非成功状态，按钮必须从真实 IPC 失败结果恢复。
  // memoryCalls 是服务器观察到的次数，和浏览器中点击事件次数相互独立。
  // 若按钮只在本地显示 busy 却没有发出命令，后续主进程计数等待会超时。
  // 若按钮被双击后发出两条命令，后续严格相等的计数断言会失败。
  req.resume();
  memoryCalls++;
  memoryReply = res;
  if (memoryMode === "reject") res.writeHead(503).end();
});
// 生产配置与状态监听必须一并安装，测试才覆盖自定义按钮对应的系统窗口行为。
// 不伪造最大化通知；按钮测试使用独立可见窗口，保留主截图窗口的固定尺寸。
// 模型与账号仍使用下方隔离 IPC，不涉及真实生成或账号请求。
const { windowChromeOptions, windowChromeArguments, registerWindowChrome } = require("../apps/electron/src/main/core/windows/window-chrome");
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
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 全屏与窗口控制沿用生产注册入口，测试不能额外注入总会成功的假窗口 handler。
// 参数验证失败必须返回 INVALID_ARGUMENT，真实最小化和关闭则由系统执行。
// 主题像素测试与按钮测试共享白名单，但每次动作只能影响发送者窗口。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
// 临时文档只改变本轮 ComfyUI 地址，界面仍通过真实 settings store 恢复它。
// 不直接在浏览器改 store，防止测试绕过项目现有用户数据恢复链路。
// 每次加载不同主题都返回相同夹具地址，确保两个主题按钮连接同一服务。
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { paths: {}, comfyServerUrl: memoryAddress, theme, locale: "zh-CN" } }), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => temp);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
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
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
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
  if (!await run(`Boolean(document.querySelector('nav[aria-expanded] a[href="${route}"]'))`)) {
    await run("document.querySelector('[data-account-menu-trigger]').click()");
    await wait(`document.querySelector('[data-sidebar-account-menu] a[href="${route}"]')`);
  }
  await run(`(() => {
    window.__captionReady = false; window.__captionSkipped = false;
    const links = document.querySelectorAll('nav[aria-expanded] a[href="${route}"], [data-sidebar-account-menu] a[href="${route}"]');
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
      color: (()=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;ctx.fillStyle=getComputedStyle(header).backgroundColor;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)})() };
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
  // 44px head 内的40px头像上下仅留2px；原先距边2px采样会落到圆形抗锯齿。
  // 改取外侧1px的实心背景带，仍跨四个横坐标检查转场是否覆盖顶栏。
  // 保持原颜色容差与负向快照对照，不能用放宽色差来容忍真正的页面遮挡。
  return [0.1, 0.3, 0.5, 0.7].every((fraction) => [1, rect.height - 1].every((y) => {
    const offset = (Math.round((rect.top + y) * scale) * stride + Math.round((rect.left + rect.width * fraction) * scale)) * 4;
    return Math.abs(bitmap[offset] - color[2]) <= 2 && Math.abs(bitmap[offset + 1] - color[1]) <= 2 && Math.abs(bitmap[offset + 2] - color[0]) <= 2;
  }));
}

async function checkRoute(route, name) {
  await navigate(route);
  smoke.check(name + ": caption remains visible in animation pixels", await captionPixelsMatch(name));
  // 真实路由动画暂停在中间帧，不能只检查静止页面的 computed background。
  // 采样位于导航文字与底部插画之间，避免把真实图标误判为透底像素。
  // 两种主题都验证，透明导航不能靠浅色页面恰巧同色掩盖回归。
  smoke.check(name + ": nav stays opaque during page movement", await navPixelsMatch());
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
  await checkSharedMain(name);
}

/**
 * nav 的像素必须匹配 shell 色；透明背景可能让 main 转场快照显露。
 * 输入窗口是当前固定宽度截图窗口，窄屏隐藏 nav 时不使用此断言。
 * 采样中间空白带，避开顶部菜单、边框、底部插画与抗锯齿文字。
 * 颜色通过 Chromium canvas 解析，兼容 CSS 变量值为 rgb 或 color()。
 * Bitmap 是 BGRA，比较时须反转RGB，容差2允许截图颜色量化。
 * 同时检查 computed alpha，防止截图背景碰巧同色时产生恒真结果。
 * 此辅助函数只读取页面和截图，不修改导航样式或系统窗口状态。
 */
async function navPixelsMatch() {
  // getBoundingClientRect包含nav在head下方的偏移，不能直接以窗口y比例代替。
  // 采样前读取innerWidth，用实际截图宽度计算DPR而非假定当前显示缩放为100%。
  // 多个横纵采样点避免只读到一块偶然与底色相同的页面区域。
  // 右侧border不属于surface采样，细边框自身由创建布局专项核对。
  const geometry = await run("(()=>{const n=document.querySelector('[data-app-nav]'),r=n.getBoundingClientRect(),c=document.createElement('canvas'),x=c.getContext('2d');c.width=c.height=1;x.fillStyle=getComputedStyle(n).backgroundColor;x.fillRect(0,0,1,1);return{rect:r.toJSON(),width:innerWidth,color:Array.from(x.getImageData(0,0,1,1).data)}})()");
  // 两次读数之间不依赖页面 rAF，窗口被遮挡也能完成截图采样。
  // alpha 必须不透明，否则实际下方内容变化时会透出。
  // 此处返回 false 而非抛出，使负向对照能确认错误样式被检测到。
  const image = await win.webContents.capturePage(), bitmap = image.toBitmap(), size = image.getSize(), scale = size.width / geometry.width;
  const { rect, color } = geometry;
  return color[3] === 255 && [0.3, 0.65].every(x => [0.46, 0.5].every(y => { const offset = (Math.round((rect.top + rect.height * y) * scale) * size.width + Math.round((rect.left + rect.width * x) * scale)) * 4; return [0,1,2].every(channel => Math.abs(bitmap[offset + channel] - color[2 - channel]) <= 2); }));
}

/**
 * 配对负对照让导航透明，并让下层内容使用红色，暴露原先同色背景掩盖的风险。
 * 通过真实导航进入创建页，转场仍由产品 startPageNavigation 启动。
 * 先检查故障状态被拒绝，再移除注入样式，在相同转场快照上恢复不透明导航。
 * ViewTransition 快照在生成时捕获样式，移除 CSS 后要重新导航才会更新快照。
 * 所以正对照使用返回主页的第二次真实转场，不拿静态 DOM 替代截图。
 * finally 清理测试 CSS，避免影响后续两主题测试或负向caption对照。
 * 模拟的是视觉下层内容，不模拟 ComfyUI、模型推理或真实图片文件。
 */
async function checkNavNegativeControl() {
  // 使用主页作为起点，创建页作为目标，负对照沿用用户报告的入口切换。
  // 注入样式不修改nav尺寸或快照层级，只取消表面的不透明度。
  // 红色外壳使透明区颜色差异明确，避免「页面碰巧同色」的无效负对照。
  await load("/");
  const css = await win.webContents.insertCSS("[data-app-shell] [data-app-nav]{background:transparent !important}[data-app-shell]{background:#ff0000 !important;background-image:none !important}");
  // 透明导航会被 alpha 与像素检查识别，不能把截图颜色正确当作唯一充分条件。
  // 运行在动画中间帧，保持与用户报告的页面切换场景一致。
  // 当前 main 容器保留真实转场方向与时长，此处不替换页面导航实现。
  try { await navigate("/create"); smoke.check("Negative control: transparent nav is rejected during route transition", !(await navPixelsMatch())); await finishTransition(); }
  finally { await win.webContents.removeInsertedCSS(css); }
  // 新快照重新捕获已恢复的不透明 nav，正负两例覆盖同一个检测函数。
  // 返回主页同时证明透明夹具清理完成，不能污染后续主题采样。
  // 断言失败继续由 smoke harness 写入非零退出码。
  await navigate("/"); smoke.check("Paired control: opaque nav survives route transition", await navPixelsMatch()); await finishTransition();
}

// 界面：圆角和留白属于应用父组件，所有路由必须共享；满高工具保留自己的内部滚动。
async function checkSharedMain(name) {
  // 所有被测路由都必须使用同一个有内边距的四边框，不能只修创建页静态截图。
  // 边框在 main 上而非 head/nav 上，故顶栏下方导航区域不会被横线贯穿。
  // 同时验证真实计算样式，避免旧 Tailwind utility 覆盖新外壳规则。
  // 四边框占用 main 的内部空间；外框上沿现在直接贴合 head 下沿。
  // 满高工具仍应自行滚动，下面独立的 scrollWidth 检查会拒绝边框引发的横向溢出。
  // 取消上方空带必须覆盖首页、创建、工具与设置，不能只移动当前页面的内容。
  // 精确比较两个布局盒边缘，防止仅通过背景同色掩盖仍存在的 8px 空白。
  // 深浅主题及窄屏复用此判定，外层4px缝隙不因创建页取消内容padding而丢失。
  // 展示层圆角必须与 main 的实际值一致，既验证桌面也覆盖窄屏的 9px 变化。
  // 首页和创建路由取消展示层padding，其他路由仍保留12px，不能统一改为零来通过断言。
  // 路由由正式main标记读取，测试不根据传入的描述字符串猜测当前页。
  // 圆角、外层边框与缝隙仍共享同一契约，变化仅限展示层内容留白。
  smoke.check(name + ": route uses the shared rounded main inside the application shell", await run(`(() => {
    const main = document.querySelector('[data-app-main]'), header = document.querySelector('[data-window-titlebar]');
    const box = main.getBoundingClientRect(), style = getComputedStyle(main);
    return main.parentElement.hasAttribute('data-app-content-layout') && style.borderRadius === (innerWidth<=820?'9px':'8px')
      && box.top === header.getBoundingClientRect().bottom && box.right <= innerWidth - 8
      && box.bottom <= innerHeight - 40 && main.scrollWidth <= main.clientWidth + 1
      && getComputedStyle(main.firstElementChild).borderRadius === style.borderRadius && ['Top','Right','Bottom','Left'].every(side => style['border'+side+'Width']==='1px' && style['padding'+side]==='4px' && getComputedStyle(main.firstElementChild)['padding'+side]===(['/','/create'].includes(main.dataset.pageTransition)?'0px':'12px'));
  })()`));
  smoke.check(name + ": main corners reveal the continuous shell background", await mainCornersAreClipped());
  if (await run("Boolean(document.querySelector('[data-home-backdrop]'))")) {
    // 首页的展示面没有第二圈12px内边距，背景必须从四边填满内层而不是整个外框。
    // 比较内层surface与背景实际矩形，保留外层4px底色和1px边框的独立检查。
    // 纵向同步验证新高度变量，避免只去掉左右padding却留下底部24px缺口。
    // 背景仍是absolute，不能改成fixed越过nav、顶栏或外壳圆角来凑满屏。
    // 样例品牌文字自身的padding不参与背景边界，内容可读性留白应继续存在。
    // 这项跟随现有路线、深浅主题及窄屏执行，不依赖单张截图的像素猜测。
    // 测试不更改页面高度，只读取当前生产样式计算后的布局结果。
    smoke.check(name + ": homepage background fills the complete inner surface", await run("(()=>{const m=document.querySelector('[data-app-main]').firstElementChild.getBoundingClientRect(),b=document.querySelector('[data-home-backdrop]'),r=b.getBoundingClientRect();return getComputedStyle(b).position==='absolute'&&['top','left','right','bottom'].every(side=>Math.abs(r[side]-m[side])<1)})()"));
  }
  smoke.check(name + ": main preserves the route's scrolling mode", await run(`(() => {
    const main = document.querySelector('[data-app-main]'), style = getComputedStyle(main);
    if (main.dataset.fillViewport !== 'true') return style.overflowY === 'auto';
    return style.overflowY === 'hidden' && main.scrollHeight <= main.clientHeight + 1
      && main.firstElementChild.getBoundingClientRect().bottom <= main.getBoundingClientRect().bottom + 1;
  })()`));
  if (process.env.SMOKE_CAPTION_SCREENSHOTS) {
    fs.mkdirSync(process.env.SMOKE_CAPTION_SCREENSHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.SMOKE_CAPTION_SCREENSHOTS, name + "-layout.png"), (await win.webContents.capturePage()).toPNG());
  }
}

async function mainCornersAreClipped() {
  const value = await run("(()=>{const r=document.querySelector('[data-app-main]').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,color:getComputedStyle(document.querySelector('[data-app-shell]')).backgroundColor.match(/\\d+/g).slice(0,3).map(Number)}})()");
  // 圆角露出的底色与正上方或正下方外壳像素比较，不能跨 nav 边线取邻点。
  // nav 为不透明实心色，shell 另有径向渐变，左右两个区域本来就不完全相同。
  // 竖向取样固定 x，仅离圆角三像素，不会跨入导航或碰到账户分隔线。
  // 保留两色阶容差与四角全部通过的要求，白色内容越界仍会被检测。
  // DOM 收尾信号先于 Chromium 撤下转场快照；从主进程有界等到实际像素提交。
  for (let attempt = 0; attempt < 8; attempt++) {
    const image = await win.webContents.capturePage(), bitmap = image.toBitmap();
    const width = image.getSize().width, scale = width / value.width;
    const clipped = [[value.left + 1, value.top + 1], [value.right - 2, value.top + 1], [value.left + 1, value.bottom - 2], [value.right - 2, value.bottom - 2]].every(([x, y]) => {
      const offset = (Math.round(y * scale) * width + Math.round(x * scale)) * 4;
      // 上角读取 main 顶边之外，下角读取底边之外；两处都属于可见 shell。
      // 使用同一张截图，不修改页面样式，也不依赖隐藏元素后的合成器时序。
      // DPR 沿用当前截图与 CSS 视口宽度的比例，窄屏缩放同样适用。
      const neighbor = (Math.round((y < (value.top + value.bottom) / 2 ? value.top - 2 : value.bottom + 1) * scale) * width + Math.round(x * scale)) * 4;
      return [0,1,2].every(channel => Math.abs(bitmap[offset + channel] - bitmap[neighbor + channel]) <= 2);
    });
    if (clipped) return true;
    await delay(50);
  }
  return false;
}

async function checkNegativeControl() {
  await load("/tools");
  // 仅负向对照恢复旧版全窗口背景，证明顶栏快照保护仍能识别原来的遮挡问题。
  const style = await win.webContents.insertCSS("html.page-transition [data-window-titlebar] { view-transition-name: none !important; } html.page-transition [data-home-backdrop] { position: fixed !important; inset: 0 !important; }");
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
  // 系统全屏恢复必须重新占用最新的 44px，不能落回先前 54px 的旧布局。
  // 直接读取恢复后的实际矩形，同时确认顶部仍贴齐窗口坐标原点。
  // 真实窗口按钮继续由后续指针操作覆盖，此处只核对保留空间。
  smoke.check("Restored caption keeps configured height and top position", await run("(()=>{const r=document.querySelector('[data-window-titlebar]').getBoundingClientRect();return r.top===0&&r.height===44})()"));
}

/**
 * 系统窗口事件需要从主进程轮询，不依赖最小化后会暂停的页面 rAF。
 * predicate 是当前独立窗口的系统状态读取，最多等待5秒。
 * 超时明确报出动作名，避免把未执行的最小化/关闭误判成通过。
 * 等待上限也覆盖CI桌面不可用、系统动画异常及窗口被其他进程销毁。
 * 每次轮询只读状态，不重试按钮点击，避免重复切换最大化掩盖问题。
 */
async function waitNative(predicate, label) { for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(50); } throw new Error("Native caption condition timed out: " + label); }

/**
 * 使用真实指针点击窗口控件，不以 DOM click 绕过 no-drag 命中规则。
 * 调用前 run 已临时绑定到独立窗口，因此坐标是该窗口的 CSS 坐标。
 * 指针命中按钮中心，避开1px缩放边缘与系统窗口resize区域。
 * mouseDown/mouseUp 配对才能触发真实按钮点击，不额外发送合成 DOM 事件。
 * 目标按钮必须可见；缺失或布局跑出屏幕会在坐标读取或系统状态等待中失败。
 * 测试仅处理自定义窗口按钮，不控制鼠标到其他程序或操作用户文件。
 */
async function clickNativeControl(target, action) {
  const point = await run(`(()=>{const r=document.querySelector('[data-window-control="${action}"]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  target.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  target.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
}

/**
 * 创建独立可见窗口验证真实按钮，主截图窗口保留原尺寸和CDP配置。
 * 关闭测试必须使用独立窗口，否则会在后续像素/主题检查前销毁被测页面。
 * 与产品使用同一无边框配置、preload、安全选项及生产窗口事件注册。
 * 模型、账号、文件列表继续来自本脚本的隔离夹具，不连接真实外部服务。
 * 首次页面加载可能出现更新提示，先关闭该提示再操作head，避免遮挡影响点击。
 * 独立窗口最终无论成功失败都销毁，防止冒烟留下孤儿窗口阻塞下次执行。
 * smoke.attachWebContents 在 finally 恢复，之后断言仍读取原截图窗口。
 */
async function checkNativeControls() {
  // 此窗口不使用offscreen，Windows必须真的拥有可最小化的顶层窗口。
  // show:false只用于等待文档加载，加载完成后显式show以支持指针命中。
  // 固定1100px宽保留工具、账户、三个控件，不让紧凑布局掩盖右边缘问题。
  // 不传父窗口关系，避免系统把最小化动作连带应用到截图宿主。
  const child = new BrowserWindow({ ...windowChromeOptions(), width: 1100, height: 760, show: false, webPreferences: { additionalArguments: windowChromeArguments(), preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  // 注册真实系统事件后才加载页面，窗口状态在加载期间变化也不会丢失监听。
  // run临时切换到独立窗口，所有DOM状态都来自被操作的同一个sender。
  // 父窗口webContents保存在win中，finally能够恢复之后的harness诊断目标。
  registerWindowChrome(child); smoke.attachWebContents(child.webContents);
  try {
    await child.loadURL("app://app/"); child.show(); await wait("document.querySelector('[data-window-control=close]')");
    // 提示层仅为夹具首次加载流程，不是窗口控制功能的一部分。
    // 等待消失后再送指针事件，避免点击被可见的页面弹层截获。
    // 标题栏按钮数量和几何同时检查，防止只是藏掉原生按钮却遗漏自定义入口。
    // button所在head必须全宽，旧版138px原生预留区域不能继续留白。
    // 控件右边缘需贴合视口，不能因账户容器增大而溢出或被截断。
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')"); await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()"); await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
    smoke.check("Custom caption: native overlay is disabled and exactly three buttons fill the right edge", windowChromeOptions().frame === false && !windowChromeOptions().titleBarOverlay && await run("(()=>{const h=document.querySelector('[data-window-titlebar]').getBoundingClientRect(),r=document.querySelector('[data-window-controls]').getBoundingClientRect();return document.querySelectorAll('[data-window-control]').length===3&&h.left===0&&Math.abs(h.right-innerWidth)<1&&Math.abs(r.right-innerWidth)<1})()"));
    // 动作校验使用真实 IPC 调用非法字符串，不把 TypeScript 类型当作运行时保护。
    // 目标窗口应完全不变，失败必须有 INVALID_ARGUMENT 而非成功返回默认值。
    // 此例不执行任意窗口方法，证明白名单拒绝 destroy 这样的未授权能力。
    smoke.check("Custom caption: invalid action is rejected at IPC boundary", await run("window.electronAPI.controlWindow('destroy').then(r=>!r.success&&r.code==='INVALID_ARGUMENT')"));
    // 真实指针最大化后同时验证 OS 状态和 React aria-pressed，两端缺一不可。
    // 另一个截图窗口保持还原态，证明主进程只控制发送者窗口。
    // 系统事件可能晚于操作返回，因此有界等待组件实际收到通知。
    // 仅检查child最大化不足以发现错误的全窗口广播，故同时检查win仍未最大化。
    // aria-pressed是真实React输出，能识别主进程成功而renderer状态停留的错误。
    await clickNativeControl(child, "toggle-maximize"); await waitNative(() => child.isMaximized(), "maximize"); await wait("document.querySelector('[data-window-control=toggle-maximize]').getAttribute('aria-pressed')==='true'");
    smoke.check("Custom caption: pointer click maximizes only its sender and shows restore", child.isMaximized() && !win.isMaximized());
    // 再次点击走真实 unmaximize，不能只切换图标或改变CSS尺寸。
    // React 状态由系统通知同步，按钮保持同一个 DOM 元素。
    // 这也验证还原时不会把未知全屏状态误当作最大化。
    await clickNativeControl(child, "toggle-maximize"); await waitNative(() => !child.isMaximized(), "restore"); await wait("document.querySelector('[data-window-control=toggle-maximize]').getAttribute('aria-pressed')==='false'");
    smoke.check("Custom caption: pointer click restores system window and icon", !child.isMaximized());
    // 不经自定义按钮直接调用系统最大化，模拟快捷键或系统菜单操作。
    // 如果前端只按点击反转状态，这个用例会在 aria-pressed 等待中失败。
    // 再由系统还原，为后续最小化与关闭保持稳定窗口位置。
    // 该外部操作保留同一页面实例，验证无需刷新即可收到系统事件。
    // 未重建preload订阅，也未在测试代码中手动发送WINDOW_MAXIMIZED通知。
    child.maximize(); await wait("document.querySelector('[data-window-control=toggle-maximize]').getAttribute('aria-pressed')==='true'"); child.unmaximize(); await wait("document.querySelector('[data-window-control=toggle-maximize]').getAttribute('aria-pressed')==='false'");
    smoke.check("Custom caption: external system maximize/restore events refresh icon", !child.isMaximized());
    // 最小化通过系统状态验证，不以页面不可见或样式 display:none 替代。
    // 原截图窗口仍存活，避免关闭一个工具窗口意外影响其他宿主。
    // 恢复由主进程完成，因为最小化后页面没有可点击的用户界面。
    await clickNativeControl(child, "minimize"); await waitNative(() => child.isMinimized(), "minimize"); smoke.check("Custom caption: pointer click minimizes actual window", child.isMinimized()); child.restore(); await waitNative(() => !child.isMinimized(), "restore after minimize");
    // 独立窗口关闭必须产生原生销毁，不能只把React head从DOM移除。
    // close 保留既有生命周期，脚本不注入 destroy 假处理器。
    // 主截图窗口的存活断言同时覆盖发送者隔离和测试收尾前提。
    // destroyed是系统窗口销毁事实，不用按钮消失或Promise成功当作关闭证据。
    // 即使关闭断言抛错，finally也会释放仍存活的独立窗口。
    await clickNativeControl(child, "close"); await waitNative(() => child.isDestroyed(), "close"); smoke.check("Custom caption: pointer close destroys only its sender", child.isDestroyed() && !win.isDestroyed());
  } finally { if (!child.isDestroyed()) child.destroy(); smoke.attachWebContents(win.webContents); }
}

async function createWindow() {
  win = new BrowserWindow({ ...windowChromeOptions(), width: 1300, height: 900, show: false, webPreferences: {
    additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"),
    contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
  } });
  smoke.attachWebContents(win.webContents);
  // 同生产窗口注册最大化与全屏通知，截图路径也必须具有完整自定义head能力。
  // 可见性回归仍使用已有布尔通知契约，不新增页面权限。
  // 注册不会改变截图固定尺寸，也不启用原生 titleBarOverlay。
  registerWindowChrome(win);
  win.webContents.debugger.attach("1.3");
  return smoke.hardenWindow(win);
}

async function checkThemes() {
  for (theme of ["light", "dark"]) {
    nativeTheme.themeSource = theme;
    await load("/");
    // 每个主题在真实布局中检查入口，不能只证明 JSX 字符串包含红色类名。
    // 位置以相邻外观按钮为基准，避免硬编码旧导航宽度或窗口偏移。
    // 这条检查不点击按钮，因此不会对每个主题额外发送清理请求。
    await checkMemoryLayout(theme);
    await checkRoute("/tools", theme + "-home-to-tools");
    await checkRoute("/", theme + "-tools-to-home");
    await checkRoute("/create", theme + "-home-to-create");
    await checkContentStack();
    await checkPanelTransition();
  }
}

/**
 * 读取浏览器实际几何、SVG 尺寸和 no-drag，拒绝不可点击的装饰图标。
 * 红色由 Chromium 解析，不能只断言存在 text-red-500 类名。
 * 与外观按钮边缘相邻，证明清理入口确实位于工具组左侧。
 * 窄窗也读取真实矩形，图标必须位于可见视口，不能被裁切到外面。
 * 保持既有 17px 图标尺度，新增按钮不应撑高标题栏。
 * 不以视觉截图替代数据流断言，实际点击和失败反馈由后续独立检查覆盖。
 * 图标颜色只检查红通道占优，允许 Tailwind 色彩空间到 RGB 的量化差异。
 * 纵向中心比较实际按钮，确保 head 高度调整后依然垂直对齐。
 * 页面渲染已经由 load 等待，读取值不依赖首次 hydration 的暂态样式。
 * 所有检查加入 smoke 结果，失败必须参与整轮退出码而非只输出警告。
 * DOM 字符串只读取固定 data 标记，不执行从网络或用户文档取得的代码。
 * 旁边外观控件使用既有选择器，位置断言没有复制第二套布局宽度常量。
 */
async function checkMemoryLayout(name) {
  // 颜色不能直接按 CSS 字符串解析：Tailwind 可能给出 oklch 而不是 rgb。
  // 使用浏览器 canvas 转换成 RGBA，再比较各通道，就能兼容当前主题实现。
  // 1×1 画布只用于颜色换算，不是页面截图，也不检查垃圾桶图案像素。
  // 矩形检查来自实际页面 DOM，能发现标题栏工具组把新增按钮挤出可见区。
  // 对右边缘用 1px 容差，是容许子像素布局取整，而非允许额外空白间距。
  // 两个按钮的 top 与 height 同时相等，才足以证明其外框垂直对齐。
  // SVG 自身的 width 单独检查，避免图标在正确按钮外框内却变得异常巨大。
  // no-drag 检查的是最终计算样式，父级标题栏的拖动区域不能覆盖交互区域。
  // 此函数只在已有外观按钮出现后调用，缺少任何一个元素都应使测试失败。
  // 主题来自 nativeTheme，未额外设置 .dark，实际计算颜色必须跟产品走同一路径。
  // 窄窗使用 390px 与非整数 DPR 的现有夹具，能发现 CSS 坐标与像素误用。
  // 这一条只断言新按钮仍可见，不推断其他所有顶栏元素在更窄窗口都可用。
  // 截图文件仍由原 captionPixelsMatch 生成，便于人工查看红色线条的实际效果。
  // 返回布尔值交给 smoke.check，几何失败将保留当前主题名便于定位截图。
  // 不只看红通道大于零，因为蓝紫主题中的普通图标也可能包含红色分量。
  // 红通道必须明显高于绿和蓝，能识别 class 未编译或被主题色覆盖的情况。
  const result = await run(`(() => {
    const button = document.querySelector('[data-window-free-memory]');
    const next = document.querySelector('[data-window-appearance]');
    const r = button.getBoundingClientRect(), n = next.getBoundingClientRect();
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.width = canvas.height = 1;
    ctx.fillStyle = getComputedStyle(button).color;
    ctx.fillRect(0, 0, 1, 1);
    const color = ctx.getImageData(0, 0, 1, 1).data;
    return Math.abs(r.right - n.left) < 1 && r.top === n.top && r.height === n.height
      && r.left >= 0 && r.right <= innerWidth && button.querySelector('svg').getAttribute('width') === '17'
      && color[0] > color[1] * 1.5 && color[0] > color[2] * 1.5
      && getComputedStyle(button).getPropertyValue('-webkit-app-region') === 'no-drag';
  })()`);
  smoke.check(name + ": red memory button precedes appearance and stays visible", result);
}

/**
 * 测真实点击到 HTTP 的整条链，不直接调用 React 事件函数。
 * 第一次请求故意保留响应，确认按钮会禁用并显示 aria-busy。
 * 禁用期间再次点击不能增加请求数，防止用户连续操作造成重复命令。
 * 明确释放空 200 响应，检查中文 Toast 与可重试状态一起恢复。
 * 成功文字只说明发送请求，不能测试成“显存已经释放”这样的错误承诺。
 * 之后返回 503，检查失败不能显示成功，也不能永久卡在禁用态。
 * 最后再次接受请求，验证失败后用户仍能使用同一个按钮重试。
 * 服务端主进程计数与浏览器 busy 分开检查，不能用一个状态证明两件事。
 * 参数非法时调用真实 preload，由实际 validator 返回 INVALID_ARGUMENT。
 * 不合法请求不能抵达 HTTP 服务器，避免只靠前端类型阻止地址注入。
 * 每个阶段都走当前 wait 的上限，不用 rAF 等待不可见页面。
 * 断连与超时在 Node 服务回归中覆盖，这里不重复耗时等待整套超时。
 * 本机夹具接受请求不等同真实 GPU 卸载成功，测试报告须保留这一限制。
 * 生成队列与下载列表仍由原夹具隔离，本例不会操作用户正在运行的任务。
 * 不覆盖 electronAPI，不通过把 bridge 改成固定成功来缩短验证。
 * 失败响应由服务输出，而非在浏览器手动插入错误 Toast。
 * 选择器使用稳定 data 标记，不随当前翻译或主题图标变化而失效。
 * 主进程 waitNative 只读计数，等待失败不会再次点击按钮掩盖问题。
 * HTTP 已接受一次后才释放回执，防止测试偶然跳过 busy 的真实阶段。
 * retry 留到错误后执行，用于发现 catch 分支没有恢复门闩的回归。
 * 错误结束后切回 hold，避免污染脚本后续主题及导航测试。
 * 空成功 Toast 需要包含执行时机，确保用户获知当前任务不会被强制打断。
 * 计数最终固定为三次，涵盖首次、拒绝、手动重试，不能隐藏自动重发。
 * 临时响应与窗口在 main finally 收尾，不会残留测试任务到真实客户端。
 */
async function checkMemoryAction() {
  await load("/");
  // 此时设置已从临时用户文档水合，首个请求应指向随机端口而非默认服务。
  // 非法地址包含路径；如果校验漏掉路径，计数变化会暴露真实网络副作用。
  // 需要同时检查失败码和计数，单凭失败消息可能只是请求碰到了不存在的接口。
  // 参数的 TypeScript 类型无法阻止网页脚本传入脏字符串，因此直接调用真实桥接。
  // 返回 INVALID_ARGUMENT 证明主进程在发出 HTTP 前拒绝了这项输入。
  // 没有把 renderer 的禁止点击当作安全校验，IPC 入口自己也必须成立。
  // 这条负例不修改设置中的正确地址，之后的正例仍可使用原来的测试服务。
  // 页面初始化中的账号和模型读取不会增加这个专用 HTTP 服务器的计数。
  smoke.check("Memory IPC rejects a path without HTTP side effects", await run("window.electronAPI.comfyFreeMemory('localhost:8188/interrupt').then(r=>!r.success&&r.code==='INVALID_ARGUMENT')") && memoryCalls === 0);
  await run("document.querySelector('[data-window-free-memory]').click()");
  // DOM click 用于验证 React 事件到桥接的数据流；它不能证明系统鼠标命中范围。
  // 系统拖拽边界由几何和 no-drag 计算样式检查，窗口控件另有真实指针回归。
  // 先等服务器收到，再等按钮 disabled，避免把刚点击尚未提交的 React 暂态当失败。
  // 两次等待都受主进程计时器限制，即使网页不可见也不会无限等渲染帧。
  // 服务器暂扣回执，所以 disabled 的观察不依赖机器是否刚好足够慢。
  // 真实 HTTP 是此时唯一未结束的操作，没有让 renderer 自己延时制造 busy。
  // 此检查若超时意味着请求链没有到达服务，不应靠再次点击试到成功。
  await waitNative(() => memoryCalls === 1, "memory request received");
  await wait("document.querySelector('[data-window-free-memory]').disabled");
  await run("document.querySelector('[data-window-free-memory]').click()");
  // 原生 disabled 按钮不会处理第二次 DOM click，这覆盖面向用户的防重交互。
  // 组件 ref 还保护同一渲染周期的重入；此处不声称直接覆盖 ref 的内部竞态。
  // aria-busy 单独检查，不能只靠灰色外观推断读屏能获知等待状态。
  // 计数仍须等于一，测试不能把重复请求被服务器接受当作无害。
  // 此时不结束响应，确保状态断言发生在 await 尚未完成的阶段。
  // 如果实现只改变 tooltip 却没有禁用操作，前一条 disabled 等待会先失败。
  smoke.check("Memory button blocks duplicate clicks while waiting", memoryCalls === 1 && await run("document.querySelector('[data-window-free-memory]').getAttribute('aria-busy')==='true'"));
  memoryReply.end();
  // 响应结束时没有 JSON 内容，生产代码若调用 json() 会进入错误提示而不是此正例。
  // 等待条件同时包含可交互状态与接受提示，抓住只修复其一的实现。
  // 文案前缀来自中文临时文档，确保当前测试没有误用英文或缺失 key。
  // 后面的执行时机检查防止把服务回执描述为立即完成显存释放。
  // 不读取任务中心的“成功”状态，因为释放内存不是一个生成任务。
  // 使用全局 role=status 读取用户看到的 Toast，而不是窥探组件私有 state。
  // 接受提示不附带释放字节数，/free 的空响应无法支持这种精确断言。
  // 每个阶段在 Toast 存在时立即断言，不依赖其自动消失的具体延迟。
  await wait("!document.querySelector('[data-window-free-memory]').disabled && document.querySelector('[role=status]').textContent.includes('已发送卸载模型')");
  smoke.check("Memory success explains deferred execution", await run("document.querySelector('[role=status]').textContent.includes('当前任务结束后')"));
  memoryMode = "reject";
  // 仅改变服务器下一次响应状态，同一按钮与同一 preload 方法继续使用。
  // 因此第二次失败不能解释为新窗口未初始化或调用了另一个 API。
  // 成功 Toast 还可能尚未消失，失败等待必须匹配新的错误文字。
  // 若旧成功消息未被替换，用户会被误导，当前条件将一直等到失败上限。
  // 503 的 HTTP 回应发生在服务已经收到请求之后，区别于地址校验拒绝。
  // 请求计数须精确到二，能发现 catch 中自动重发的隐式重试。
  // 错误后的 disabled 也要恢复，才说明 finally 没有遗漏失败路径。
  // 不在测试中读取或转发错误页面，生产错误文案应使用已有国际化消息。
  await run("document.querySelector('[data-window-free-memory]').click()");
  await wait("!document.querySelector('[data-window-free-memory]').disabled && document.querySelector('[role=status]').textContent.includes('无法释放 ComfyUI')");
  smoke.check("Memory HTTP failure is visible and restores interaction", memoryCalls === 2);
  memoryMode = "hold";
  // 再次点击是模拟用户看到失败后主动重试，不能在 catch 内替用户无限重发。
  // 恢复 hold 可以确认请求确实再次到达服务，而不是沿用上一份成功结果。
  // 先等计数三再结束响应，防止 memoryReply 仍指向上一次已结束的连接。
  // 后续接受文字也必须重新出现，错误消息不能在恢复网络后一直残留。
  // 若门闩在 catch 中没有解开，这次点击不会到达服务器，等待会准确失败。
  // 最终计数三包含一次受控拒绝，不把失败从统计分母中删掉。
  // 同一段恢复路径不依赖主题或路由的重新挂载，证明按钮自己能恢复操作。
  await run("document.querySelector('[data-window-free-memory]').click()");
  await waitNative(() => memoryCalls === 3, "memory retry received");
  memoryReply.end();
  await wait("!document.querySelector('[data-window-free-memory]').disabled && document.querySelector('[role=status]').textContent.includes('已发送卸载模型')");
  smoke.check("Memory retry succeeds after a rejected request", memoryCalls === 3);
}

async function checkNarrow() {
  win.setContentSize(390, 844);
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1.25, mobile: false });
  await load("/");
  // 窄窗检查仍以实际视口为准，不能靠宽屏下有入口就宣称响应式可用。
  // 这里只读取布局，避免窄屏测试重新发送释放命令影响动作计数。
  // 若工具组被挤出屏幕，checkMemoryLayout 会产生真实失败。
  await checkMemoryLayout("narrow");
  await checkSharedMain("narrow-home");
  smoke.check("Narrow fixture uses 390px viewport at DPR 1.25", await run("innerWidth === 390 && devicePixelRatio === 1.25"));
  await wait("document.querySelector('[data-home-hero-explore]')");
  await run("window.__captionReady=false;document.querySelector('[data-home-hero-explore]').click()");
  await wait("window.__captionReady");
  smoke.check("390px at DPR 1.25: caption pixels remain intact", await captionPixelsMatch("narrow-dpr"));
  await finishTransition();
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  // 随机端口避免碰到用户真实 ComfyUI，服务只绑定本机回环地址。
  // 首次加载前准备地址，settings 水合从临时文档获得同一个测试目标。
  // 绑定失败由 main catch 报失败，不能回退连接用户的默认 8188 服务。
  // 响应和连接会在窗口测试收尾时关闭，不遗留后台 HTTP 服务。
  // 此处没有额外 Electron 进程，仍遵守一次只跑一个冒烟的约束。
  await new Promise((resolve, reject) => memoryServer.once("error", reject).listen(0, "127.0.0.1", resolve));
  // 只有 listen 完成后才读取 address，避免把尚未绑定的 null 地址写入设置。
  // 端口由系统分配，连续运行测试也不需要占用用户配置的固定生成端口。
  // 测试只保存主机与端口，格式和设置页的真实服务地址一致。
  // 绑定异常会让顶层失败收尾，不能因为地址为空而使用默认 8188 作兜底。
  memoryAddress = `127.0.0.1:${memoryServer.address().port}`;
  const occlusion = await createWindow();
  try {
    // 动作测试在其他导航断言前完成，网络拒绝不能被后续正常 Toast 掩盖。
    // 真实 API 返回之后再进入原标题栏回归，检查新增按钮没有破坏已有行为。
    // 原负向像素与系统窗口检查保留，不能为新入口删除既有验证。
    await checkMemoryAction();
    // 配对nav测试先单独清理注入CSS，再运行原有caption负向对照。
    // 同一脚本内串行操作，未启动第二条Electron冒烟进程。
    // 所有窗口复用当前源码的构建指纹，陈旧out由harness以退出码2拒绝。
    await checkNavNegativeControl();
    await checkNegativeControl();
    await checkThemes();
    // 从真实账户菜单点击设置，证明入口迁移后仍能进入现有设置页。
    // navigate 会等待页面转场开始；收尾后再检查主区，避免读到旧页面快照。
    // 复用既有设置页布局断言；隔离夹具不覆盖密钥服务或真实账号连接。
    await load("/"); await navigate("/settings"); await finishTransition(); await checkSharedMain("settings");
    await checkNarrow();
    await checkVisibility();
    // 按钮操作放最后，避免系统最大化/最小化影响前面的固定视口截图断言。
    // 独立窗口仍属于本次Electron运行，不会与其他冒烟竞争单实例锁。
    // 真实推理、下载取消和退出确认不在该隔离窗口夹具的覆盖范围内。
    await checkNativeControls();
  }
  // 成功或失败都只清理本轮窗口和随机端口，不触碰用户已有 Electron 进程。
  // 挂起响应也由 closeAllConnections 终止，避免等待服务器自然结束而卡住退出。
  // 窗口销毁仍沿用原路径；HTTP 清理不替代 smoke.finish 的退出码护栏。
  // 日志继续由原 harness 写入 smoke-runs.log，失败结果不能被正常退出覆盖。
  // 等待 close 完成，确保下一条冒烟启动前本轮资源已经释放。
  finally {
    occlusion.dispose();
    win.destroy();
    memoryServer.closeAllConnections();
    await new Promise(resolve => memoryServer.close(resolve));
  }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch((error) => { console.error(error.message); smoke.finish({ app, ok: false }); });
