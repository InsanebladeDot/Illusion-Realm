/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * account.handlers：复用账户入口的真实参数验证和身份切换逻辑。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * account.handlers：游客进入继续先清除本地凭据，不复用会发起后端请求的注销流程。
 */
/** 登录 UI 与真实游客入口：旧文档、窄屏、落盘、长期续用及主动退出；不连接账号服务器。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "login", timeoutMs: 90000 });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-login-")), documentPath = path.join(temp, "user.json");
const errors = [], writes = [];
let win, failSave = false;
let userData = { version: 1, settings: { theme: "light", locale: "zh-CN", paths: {} }, profile: { nickname: "Keep me" } };
app.disableHardwareAcceleration(); app.setPath("userData", path.join(temp, "browser"));
smoke.setWorkDir(temp); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
// 清理凭据使用真实账户 handler，账户文件仅位于本脚本隔离的 userData 目录。
// 后面的登录注册和资料接口仍由夹具覆盖，不会连接真实账户后端。
// 这样可以验证游客进入的新增前置条件，而不拿空返回替代本地清理。
require("../apps/electron/src/main/modules/account/account.handlers").registerAccountHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: userData, filePath: documentPath, isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => {
  if (failSave) throw new Error("Fixture storage unavailable");
  userData = data; writes.push(data); fs.writeFileSync(documentPath, JSON.stringify(data));
});
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => documentPath);
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => temp);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.COMFY_LIST_MODELS, () => ({ checkpoints: [], loras: [] }));
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHENTICATED" } }));
const unavailable = () => ({ status: 503, body: { success: false, code: "SERVICE_UNAVAILABLE" } });
registerHandle(C.ACCOUNT_LOGIN, unavailable);
registerHandle(C.ACCOUNT_REGISTER, unavailable);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = smoke.createRun();
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(60); }
  throw new Error("Login condition timed out: " + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function load(route = "/") { await win.loadURL("app://app" + route); await wait("!document.querySelector('[data-auth-loading]')"); }
async function screenshot(name) {
  await delay(150); fs.writeFileSync(path.join(temp, name + ".png"), (await win.webContents.capturePage()).toPNG());
}
async function fillForm(confirm = "fixture-password") {
  await run(`(() => { const form=document.querySelector('[data-auth-form]');
    form.elements.email.value='guest@example.test'; form.elements.password.value='fixture-password';
    if(form.elements.displayName)form.elements.displayName.value='Fixture Artist';
    if(form.elements.confirmPassword)form.elements.confirmPassword.value=${JSON.stringify(confirm)};
    form.requestSubmit(); })()`);
  await delay(100);
}
async function checkEntry() {
  await load("/create"); await wait("document.querySelector('[data-auth-card]')&&location.pathname==='/login'");
  smoke.check("Old v1 document opens login; direct create route cannot mount business page", await run("!document.querySelector('[data-generate-button]')&&!document.querySelector('nav[aria-expanded]')"));
  smoke.check("Custom titlebar remains above login", await run("document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0"));
  smoke.check("Background asset decodes at original 1042px", await run("new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===1042);img.onerror=()=>resolve(false);img.src='/images/login-background.webp'})"));
  // 居中参照是 head 下方的可用视口，顶栏缩短后其中心也会上移。
  // 水平中心仍取整个视口，垂直中心则包含实际 head 底边的偏移。
  // 保留原容差以涵盖卡片高度约束，不把旧 54px 作为页面坐标。
  smoke.check("Card is horizontally and vertically centered", await run("(()=>{const r=document.querySelector('[data-auth-card]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<2&&Math.abs(r.top+r.height/2-(innerHeight+document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom)/2)<45})()"));
  await screenshot("login-wide-light");
  await click("[data-auth-provider=google]");
  smoke.check("Third-party entry clearly says service is not connected", await run("document.body.innerText.includes('Google 登录尚未接入')&&Boolean(document.querySelector('[data-login-page]'))"));
  await click("[data-auth-login]");
  smoke.check("Required inputs prevent empty login submission", await run("!document.querySelector('[data-auth-form]').checkValidity()"));
  await fillForm();
  smoke.check("Valid login form stays on login and reports unavailable account service", await run("document.querySelector('[data-auth-form-message]').textContent==='账户服务暂时不可用，请稍后重试。'&&location.pathname==='/login'"));
  await click("[data-auth-back]"); await click("[data-auth-register]"); await fillForm("different-password");
  smoke.check("Registration catches different passwords", await run("document.querySelector('[data-auth-form-message]').textContent.includes('不一致')"));
  await fillForm();
  smoke.check("Registration never creates a fake account or saves credentials", await run("document.querySelector('[data-auth-form-message]').textContent==='账户服务暂时不可用，请稍后重试。'") && !JSON.stringify(writes).includes("fixture-password"));
}
async function checkNarrow() {
  win.setContentSize(320, 500); await delay(200);
  smoke.check("320px registration has no horizontal overflow", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-auth-card]').getBoundingClientRect().right<=innerWidth"));
  // 320×500 注册页需要滚动，卡片仍须给顶部状态区域保留原有 56px。
  // 顶部距离从实际 head 底边计算，减少顶栏高度不能让卡片侵入拖动区。
  // 同时要求内部可滚且文档不增高，防止把被裁掉的内容误当布局成功。
  smoke.check("Short form stays inside a height-constrained card with top and bottom padding", await run("(()=>{const c=document.querySelector('[data-auth-card]').getBoundingClientRect(),s=document.querySelector('[data-auth-scroll]');return c.top>=document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom+56&&c.bottom<=innerHeight-16&&s.scrollHeight>s.clientHeight&&document.documentElement.scrollHeight<=innerHeight})()"));
  // 滚动到游客入口后必须完整可见，尤其不能被更短的固定顶栏盖住。
  // 读取真实 head 底边与视口底边，分别约束入口的上下边缘。
  // scrollIntoView 使用现有页面滚动容器，不直接移动按钮或改动定位。
  smoke.check("Short viewport lets user scroll to guest footer", await run("(()=>{const e=document.querySelector('[data-auth-guest]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom&&r.bottom<=innerHeight})()"));
  smoke.check("Inner scroll moves brand with form and leaves privacy and titlebar fixed", await run("(()=>{const s=document.querySelector('[data-auth-scroll]'),b=document.querySelector('[data-auth-brand]'),f=document.querySelector('[data-auth-card-footer]');s.scrollTop=0;const by=b.getBoundingClientRect().top,fy=f.getBoundingClientRect().top;s.scrollTop=s.scrollHeight;return s.scrollTop>0&&b.getBoundingClientRect().top<by&&f.getBoundingClientRect().top===fy&&f.getBoundingClientRect().bottom<=innerHeight-16&&window.scrollY===0&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0})()"));
  await screenshot("register-narrow-light");
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0"); await click("[data-auth-back]");
  win.setContentSize(390, 844); await delay(200); await click("[data-toolbox-theme]");
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
  // 默认深色使用原型的蓝黑文字；固定设计值能捕获 token 被旧主题覆盖的回归。
  // 这里只验证本地主题渲染，不代表账号服务或系统主题切换已经联调。
  smoke.check("Dark theme changes login card surface", await run("matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('[data-auth-card]')).color==='rgb(212, 222, 248)'"));
  await screenshot("login-narrow-dark");
  await click("[data-auth-register]"); win.setContentSize(600,1100); await delay(200);
  smoke.check("Tall registration shows all content without inner scrolling", await run("(()=>{const s=document.querySelector('[data-auth-scroll]'),c=document.querySelector('[data-auth-card]').getBoundingClientRect();return s.scrollHeight<=s.clientHeight+1&&c.top>=96&&c.bottom<innerHeight-32})()"));
  await screenshot("register-tall-dark"); await click("[data-auth-back]");
}
async function checkSplit() {
  win.setContentSize(1280, 540); await wait("document.querySelector('[data-login-layout=split]')");
  // 分栏卡片需要紧贴 head 下沿，不能留下原 54px 高度造成的空带。
  // 固定右侧与底部边界继续独立验证，避免只证明卡片宽度正确。
  // 420–480px 宽度契约保留，顶栏压缩不会触发另一套认证布局。
  smoke.check("Split uses bounded 420-480px panel flush to top, bottom and right", await run("(()=>{const p=document.querySelector('[data-auth-pane]').getBoundingClientRect(),c=document.querySelector('[data-auth-card]').getBoundingClientRect();return p.width>=420&&p.width<=480&&Math.abs(c.left-p.left)<1&&Math.abs(c.right-innerWidth)<1&&c.top===document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom&&c.bottom===innerHeight})()"));
  smoke.check("Split has one surface with illustration behind rounded corners", await run("(()=>{const p=document.querySelector('[data-auth-pane]'),b=document.querySelector('[data-auth-background]').getBoundingClientRect(),c=getComputedStyle(document.querySelector('[data-auth-card]'));return getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)'&&b.right>p.getBoundingClientRect().left&&c.borderTopLeftRadius==='24px'&&c.borderTopRightRadius==='0px'})()"));
  await click("[data-auth-login]"); await fillForm();
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0");
  smoke.check("Split brand scrolls inside content and starts below theme control", await run("(()=>{const s=document.querySelector('[data-auth-scroll]'),b=document.querySelector('[data-auth-brand]').getBoundingClientRect(),t=document.querySelector('[data-toolbox-theme]').getBoundingClientRect();return s.contains(document.querySelector('[data-auth-brand]'))&&b.top>=t.bottom&&document.querySelector('[data-auth-form]').getBoundingClientRect().top>=b.bottom})()"));
  await screenshot("login-split-dark");
  const point = await run("(()=>{const s=document.querySelector('[data-auth-scroll]');s.scrollTop=0;const r=s.getBoundingClientRect();window.__brandY=document.querySelector('[data-auth-brand]').getBoundingClientRect().top;window.__footerY=document.querySelector('[data-auth-card-footer]').getBoundingClientRect().top;return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({type:'mouseMove',...point}); win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-600,deltaX:0,canScroll:true}); await delay(200);
  // 实际滚轮只能移动表单与品牌内容，背景图仍从当前 head 下方铺开。
  // 顶栏从 54px 缩短后，背景若保留旧 top 会在上沿留出 10px 缝隙。
  // 同时检查页脚及根滚动位置，确保几何修正没有把滚动转移到整个窗口。
  smoke.check("Real wheel moves brand and form while panel, footer and background stay fixed", await run("(()=>{const s=document.querySelector('[data-auth-scroll]');return s.scrollTop>0&&document.querySelector('[data-auth-brand]').getBoundingClientRect().top<window.__brandY&&document.querySelector('[data-auth-card-footer]').getBoundingClientRect().top===window.__footerY&&document.querySelector('[data-auth-background]').getBoundingClientRect().top===document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom&&window.scrollY===0&&document.documentElement.scrollWidth<=innerWidth})()"));
  await screenshot("login-split-scrolled-dark");
  await click("[data-toolbox-theme]"); await wait("document.documentElement.dataset.theme==='light'&&!document.documentElement.classList.contains('theme-ripple')");
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0"); await screenshot("login-split-light");
  win.setContentSize(1300, 900); await wait("document.querySelector('[data-login-layout=centered]')");
  smoke.check("Resize to centered mode preserves the same form, email and password", await run("document.querySelector('[data-auth-form=login]')?.elements.email.value==='guest@example.test'&&document.querySelector('[data-auth-form]').elements.password.value==='fixture-password'"));
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0");
  await click("[data-auth-back]"); win.setContentSize(1600,760); await wait("document.querySelector('[data-login-layout=split]')");
  await screenshot("login-split-landing-dark");
  win.setContentSize(390, 844); await delay(150);
}
async function checkGuest() {
  failSave = true; await click("[data-auth-guest]"); await wait("document.querySelector('[data-login-page] [role=alert]')");
  smoke.check("Storage failure leaves guest outside application with retryable error", await run("location.pathname==='/login'&&!document.querySelector('[data-auth-guest]').disabled") && !userData.entrySession?.guest);
  failSave = false; await click("[data-auth-guest]"); await wait("location.pathname==='/'&&document.querySelector('[data-home-hero-explore]')");
  // 更新公告异步读取静态 changelog；必须等弹窗真正出现后关闭，才开始后续滚轮用例。
  // 过早的可选点击可能什么也没点到，随后公告打开会正确锁住个人页，导致测试假红。
  // 此操作同时落盘已读记录，后续刷新仍走正式水合流程，不直接篡改 CSS 或弹窗状态。
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await click('[aria-labelledby=update-announcement-title] button');
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await delay(450);
  // 新记录明确为 v2 且不保存截止时间，不使用极大的伪无限时间戳。
  // 必须真的写入隔离 JSON，不能只让界面暂时看起来进入成功。
  // startedAt 是首次进入时间，后面的刷新和路由切换必须保留它。
  // 原用户资料也在同一文档，后续断言检查迁移没有覆盖其他 section。
  // 当前格式基准必须先通过，才能据此评价后面的旧格式迁移结果。
  // 不以“仍在首页”替代落盘检查，防止重启后丢失入口的回归。
  const startedAt = userData.entrySession.guest.startedAt;
  smoke.check("Guest enters homepage and persists a versioned record without a deadline", userData.entrySession.guest.version===2 && !('expiresAt' in userData.entrySession.guest) && fs.existsSync(documentPath));
  smoke.check("Guest session shares user document without erasing profile", userData.profile.nickname === "Keep me");
  await load(); await wait("document.querySelector('[data-home-hero-explore]')");
  // 真正 reload 会销毁页面状态，再从同一用户文档读取长期记录。
  // 若只是把定时器时间延长，旧截止时间字段断言仍会发现差异。
  // 本轮不要求刷新时重建游客，否则不能证明首次进入记录得到保留。
  smoke.check("Full reload preserves permanent guest and original entry time", userData.entrySession.guest.startedAt === startedAt && await run("!document.querySelector('[data-login-page]')"));
  await load("/create"); await wait("document.querySelector('[data-generate-button]')");
  // 创建页必须能直接挂载真实生成按钮，而不是只能访问首页样例。
  // 该检查验证入口权限，不调用真实模型或消耗 GPU 进行图片生成。
  // 生成链路由独立的 Anima/视频冒烟验证，登录测试不伪造推理成功。
  smoke.check("Permanent guest directly opens the generation page without renewing its record", userData.entrySession.guest.startedAt === startedAt);
  win.setContentSize(1050,500); await load("/profile"); await wait("document.querySelector('[data-auth-logout]')");
  // 与本用例无关的弹窗必须已关闭；滚动锁测试随后只打开真实资料编辑弹窗。
  await wait("!document.querySelector('[aria-modal=true]')");
  await wait("!document.documentElement.classList.contains('page-transition')&&!document.documentElement.classList.contains('theme-ripple')&&document.querySelector('[data-profile-scroll]').scrollHeight>document.querySelector('[data-profile-scroll]').clientHeight");
  const scrollPoint = await run("(()=>{const s=document.querySelector('[data-profile-scroll]');s.scrollTop=0;window.__profileHeaderY=document.querySelector('[data-profile-fixed-header]').getBoundingClientRect().top;window.__profileTabsY=document.querySelector('[role=tablist]').getBoundingClientRect().top;const r=s.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({type:'mouseMove',...scrollPoint});
  await delay(100);
  win.webContents.sendInputEvent({type:'mouseWheel',...scrollPoint,deltaY:-600,deltaX:0,canScroll:true}); await delay(200);
  // 参考模板采用整页内滚动；横幅与标签一起位移，但根页面、导航和标题栏不得跟随。
  // 个人中心整体内容可滚动，但 nav 的 top 始终等于实际 head 底边。
  // 读取两块固定区域的几何关系，比固定 54px 更能发现缩短顶栏后的断层。
  // main 与文档滚动仍必须为零，避免边框内边距导致意外双重滚动。
  smoke.check("Real wheel scrolls cover, identity and tabs together while app chrome stays fixed", await run("(()=>{const s=document.querySelector('[data-profile-scroll]'),nav=document.querySelector('nav[aria-expanded]');return s.scrollTop>0&&document.querySelector('[data-profile-fixed-header]').getBoundingClientRect().top<window.__profileHeaderY&&document.querySelector('[role=tablist]').getBoundingClientRect().top<window.__profileTabsY&&document.querySelector('#main-content').scrollTop===0&&nav.getBoundingClientRect().top===document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0&&window.scrollY===0&&document.documentElement.scrollHeight<=innerHeight})()"));
  console.log("PROFILE_MODAL_STATE",await run("[...document.querySelectorAll('[aria-modal=true]')].map(e=>({title:e.getAttribute('aria-labelledby'),text:e.textContent.slice(0,120)}))"));
  console.log("PROFILE_SCROLL_GEOMETRY",await run("(()=>{const s=document.querySelector('[data-profile-scroll]');return {scrollTop:s.scrollTop,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,overflow:getComputedStyle(s).overflowY,rootHeight:document.documentElement.scrollHeight,viewport:innerHeight,navTop:document.querySelector('nav[aria-expanded]').getBoundingClientRect().top}})()"));
  await screenshot("profile-content-scroll");
  await run("window.__profileBeforeDialog=document.querySelector('[data-profile-scroll]').scrollTop;document.querySelector('.pr-cover-actions>button:last-child').click()");
  await wait("document.querySelector('[aria-labelledby=edit-profile-title]')");
  // 等待遮罩提交到合成线程，再发送真实滚轮，避免事件仍命中上一帧背景。
  await delay(150);
  win.webContents.sendInputEvent({type:'mouseWheel',...scrollPoint,deltaY:600,deltaX:0,canScroll:true}); await delay(150);
  smoke.check("Existing profile modal locks the inner content without losing its scroll position", await run("getComputedStyle(document.querySelector('[data-profile-scroll]')).overflowY==='hidden'&&document.querySelector('[data-profile-scroll]').scrollTop===window.__profileBeforeDialog"));
  await click('[aria-labelledby=edit-profile-title] button[aria-label="关闭"]');
  smoke.check("Closing the existing modal restores inner content scrolling", await run("getComputedStyle(document.querySelector('[data-profile-scroll]')).overflowY==='auto'"));
  await click("[data-auth-logout]");
  await wait("document.querySelector('[data-auth-card]')&&location.pathname==='/login'"); await delay(400);
  smoke.check("Explicit guest logout returns to login without erasing profile", userData.entrySession.guest===null&&userData.profile.nickname==='Keep me');
  await click("[data-auth-guest]"); await wait("document.querySelector('[data-home-hero-explore]')");
  // 把页面时钟推进十年再触发 focus/visibilitychange，不能因时间跳变退出。
  // Date.now 只在当前页面覆盖，下一次真实 load 会恢复标准时钟。
  // 不能只检查 JSON 尚未清空，还必须确认业务页面没有被登录页替换。
  // 这项反向对照直接针对旧版按窗口恢复检查一小时有效期的行为。
  // 时间推进比原一小时大得多，避免把轻微延长有效期误当无限期支持。
  // 仍触发旧版绑定的两类事件，可以直接发现遗留的到期监听器。
  // 页面时钟与主进程时钟隔离，不修改操作系统时间或其他应用会话。
  const farFuture = Date.now() + 10 * 365 * 86400000;
  await run(`Date.now=()=>${farFuture};window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))`); await delay(400);
  smoke.check("Ten years later focus keeps guest inside the local application", userData.entrySession.guest.version===2 && await run("Boolean(document.querySelector('[data-home-hero-explore]'))&&!document.querySelector('[data-login-page]')"));
  // 无版本旧格式的截止时间已经过去多年，仍应升级为无截止时间的 v2。
  // 开始和结束共用同一基准，避免测试本身在两次 Date.now 之间出现毫秒差。
  // 直接重启创建页验证旧记录迁移，而不是先用新游客按钮覆盖旧数据。
  // 等待写盘后核对 v2 与原始开始时间，确认兼容没有靠创建新游客实现。
  const oldStartedAt = Date.now() - 10 * 365 * 86400000;
  userData.entrySession={guest:{startedAt:oldStartedAt,expiresAt:oldStartedAt+3600000}};
  await load("/create"); await wait("document.querySelector('[data-generate-button]')"); await delay(400);
  smoke.check("Restart migrates an expired legacy guest and preserves generation access", userData.entrySession.guest.version===2 && userData.entrySession.guest.startedAt===oldStartedAt && !('expiresAt' in userData.entrySession.guest));
  // 形状损坏的旧记录仍要拒绝，不能因为取消到期检查就接受任意本地对象。
  // 此处两小时不符合历史一小时契约，区别于上一个合法但已到期的记录。
  // 有效期被取消并不代表解析校验被取消；无记录仍需明确选择进入方式。
  // 合法旧记录与非法旧记录相邻执行，迁移代码无条件放行会在这里失败。
  // 重启读取前直接修改夹具输入，使旧对象确实进入正式的解析分支。
  const invalidStartedAt = Date.now();
  userData.entrySession={guest:{startedAt:invalidStartedAt,expiresAt:invalidStartedAt+7200000}};
  await load(); await wait("document.querySelector('[data-auth-card]')");
  // 最后留在登录页，供后面的英语文案和密码不落盘检查使用。
  // 此断言失败会直接结束整个冒烟，不把错误迁移描述为成功进入。
  // 判断的是实际路由与登录卡片，不只检查主进程夹具中的字段。
  smoke.check("Malformed legacy record still returns to the explicit login entry", await run("location.pathname==='/login'"));
  userData.settings.locale='en'; await load(); await wait("document.querySelector('[data-auth-card]')");
  smoke.check("Login entry reuses English locale with no Chinese form text", await run("document.querySelector('[data-auth-register]').textContent==='Create an account'&&document.querySelector('[data-auth-guest]').textContent.includes('Continue as a guest')"));
  smoke.check("No password ever lands in user JSON", !JSON.stringify(writes).includes("fixture-password"));
  smoke.check("No React render-state or hydration errors", !errors.some(message=>/while rendering|hydration|Minified React error/.test(message)));
}
async function checkLayoutMatrix() {
  await click('[data-auth-login]'); await fillForm();
  await run("void(window.__originalAuthForm=document.querySelector('[data-auth-form]'))");
  const sizes = [[1440,900],[1920,1080],[1280,540],[390,844],[320,500],
    [1535,900],[1536,900],[1119,640],[1120,640],[1280,639],[1280,640],[1280,641]];
  for (const [width,height] of sizes) {
    win.setContentSize(width,height); await delay(180);
    const split=width>=1536||(width>=1120&&height<=640);
    // 矩阵中的卡片上边界与当前 head 对齐，短屏不再沿用历史 54px 阈值。
    // 各语言与分栏样式继续共享原高度约束，不为新高度放宽卡片底边检查。
    // 这里依据实际标题栏位置判断，以免 CSS 更改后回归脚本仍检查旧布局。
    smoke.check(`Login ${width}x${height}: breakpoint, preserved form, no overflow`, await run(`(()=>{
      const card=document.querySelector('[data-auth-card]').getBoundingClientRect(),form=document.querySelector('[data-auth-form]');
      return document.querySelector('[data-login-layout]').dataset.loginLayout===${JSON.stringify(split?'split':'centered')}
        &&card.width<=${split?480:420}+1&&card.right<=innerWidth&&card.top>=document.querySelector('[data-window-titlebar]').getBoundingClientRect().bottom&&card.bottom<=innerHeight
        &&form===window.__originalAuthForm&&form.elements.email.value==='guest@example.test'
        &&form.elements.password.value==='fixture-password'&&document.documentElement.scrollWidth<=innerWidth
        &&document.querySelectorAll('[data-auth-card-footer]').length===1;
    })()`));
    if(width===1440||width===1920)await screenshot(`login-${width}x${height}-light`);
  }
  win.webContents.debugger.attach('1.3');
  for(const dpr of [1.25,1.5]) {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:dpr,mobile:false}); await delay(200);
    smoke.check(`Login DPR ${dpr}: same form and no overflow`,await run("document.querySelector('[data-auth-form]')===window.__originalAuthForm&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0"));
    await screenshot(`login-1440x900-dpr${dpr}`);
  }
  await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride'); win.webContents.debugger.detach();
  await click('[data-auth-back]'); win.setContentSize(390,844); await delay(150);
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win=new BrowserWindow({...windowChromeOptions(),show:false,width:1300,height:900,webPreferences:{additionalArguments:windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/src/preload/index.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  win.webContents.on("console-message",event=>{if(event.level==='error')errors.push(event.message)});
  smoke.attachWebContents(win.webContents); const occlusion=await smoke.hardenWindow(win);
  try { await checkEntry(); await checkNarrow(); await checkSplit(); await checkLayoutMatrix(); await checkGuest(); }
  finally { occlusion.dispose(); win.destroy(); }
  console.log("LOGIN_SCREENSHOTS",temp); smoke.finish({app,ok:smoke.allPassed()});
}
main().catch(error=>{console.error(error.message);smoke.finish({app,ok:false})});
