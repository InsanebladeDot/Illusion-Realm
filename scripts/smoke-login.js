/** 登录 UI 与真实游客入口：旧文档、窄屏、表单、落盘、重启续用和到期退出；不连接账号服务器。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "login", timeoutMs: 90000 });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-login-")), documentPath = path.join(temp, "user.json");
const errors = [], writes = [];
let win, failSave = false;
let userData = { version: 1, settings: { theme: "light", locale: "zh-CN", paths: {} }, profile: { nickname: "Keep me" } };
app.disableHardwareAcceleration(); app.setPath("userData", path.join(temp, "browser"));
smoke.setWorkDir(temp); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
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
    if(form.elements.confirmPassword)form.elements.confirmPassword.value=${JSON.stringify(confirm)};
    form.requestSubmit(); })()`);
}
async function checkEntry() {
  await load("/create"); await wait("document.querySelector('[data-auth-card]')&&location.pathname==='/login'");
  smoke.check("Old v1 document opens login; direct create route cannot mount business page", await run("!document.querySelector('[data-generate-button]')&&!document.querySelector('nav[aria-expanded]')"));
  smoke.check("Custom titlebar remains above login", await run("document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0"));
  smoke.check("Background asset decodes at original 1042px", await run("new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===1042);img.onerror=()=>resolve(false);img.src='/images/login-background.webp'})"));
  smoke.check("Card is horizontally and vertically centered", await run("(()=>{const r=document.querySelector('[data-auth-card]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<2&&Math.abs(r.top+r.height/2-(innerHeight+32)/2)<45})()"));
  await screenshot("login-wide-light");
  await click("[data-auth-provider=google]");
  smoke.check("Third-party entry clearly says service is not connected", await run("document.body.innerText.includes('Google 登录尚未接入')&&Boolean(document.querySelector('[data-login-page]'))"));
  await click("[data-auth-login]");
  smoke.check("Required inputs prevent empty login submission", await run("!document.querySelector('[data-auth-form]').checkValidity()"));
  await fillForm();
  smoke.check("Valid login form stays on login and reports unavailable account service", await run("document.querySelector('[data-auth-form-message]').textContent.includes('暂不可用')&&location.pathname==='/login'"));
  await click("[data-auth-back]"); await click("[data-auth-register]"); await fillForm("different-password");
  smoke.check("Registration catches different passwords", await run("document.querySelector('[data-auth-form-message]').textContent.includes('不一致')"));
  await fillForm();
  smoke.check("Registration never creates a fake account or saves credentials", await run("document.querySelector('[data-auth-form-message]').textContent.includes('暂不可用')") && !JSON.stringify(writes).includes("fixture-password"));
}
async function checkNarrow() {
  win.setContentSize(320, 500); await delay(200);
  smoke.check("320px registration has no horizontal overflow", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-auth-card]').getBoundingClientRect().right<=innerWidth"));
  smoke.check("Short form stays inside a height-constrained card with top and bottom padding", await run("(()=>{const c=document.querySelector('[data-auth-card]').getBoundingClientRect(),s=document.querySelector('[data-auth-scroll]');return c.top>=32+63&&c.bottom<=innerHeight-31&&s.scrollHeight>s.clientHeight&&document.documentElement.scrollHeight<=innerHeight})()"));
  smoke.check("Short viewport lets user scroll to guest footer", await run("(()=>{const e=document.querySelector('[data-auth-guest]');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=32&&r.bottom<=innerHeight})()"));
  smoke.check("Inner scroll leaves brand, privacy and titlebar fixed", await run("(()=>{const s=document.querySelector('[data-auth-scroll]'),b=document.querySelector('[data-auth-brand]'),f=document.querySelector('[data-auth-card-footer]'),by=b.getBoundingClientRect().top,fy=f.getBoundingClientRect().top;s.scrollTop=0;s.scrollTop=s.scrollHeight;return s.scrollTop>0&&b.getBoundingClientRect().top===by&&f.getBoundingClientRect().top===fy&&f.getBoundingClientRect().bottom<=innerHeight-31&&window.scrollY===0&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0})()"));
  await screenshot("register-narrow-light");
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0"); await click("[data-auth-back]");
  win.setContentSize(390, 844); await delay(200); await click("[data-toolbox-theme]");
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");
  smoke.check("Dark theme changes login card surface", await run("matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('[data-auth-card]')).color==='rgb(237, 237, 237)'"));
  await screenshot("login-narrow-dark");
  await click("[data-auth-register]"); win.setContentSize(600,1100); await delay(200);
  smoke.check("Tall registration shows all content without inner scrolling", await run("(()=>{const s=document.querySelector('[data-auth-scroll]'),c=document.querySelector('[data-auth-card]').getBoundingClientRect();return s.scrollHeight<=s.clientHeight+1&&c.top>=96&&c.bottom<innerHeight-32})()"));
  await screenshot("register-tall-dark"); await click("[data-auth-back]");
}
async function checkSplit() {
  win.setContentSize(1280, 540); await wait("document.querySelector('[data-login-layout=split]')");
  smoke.check("Split uses exact 2:1 columns with panel flush to top, bottom and right", await run("(()=>{const p=document.querySelector('[data-auth-pane]').getBoundingClientRect(),c=document.querySelector('[data-auth-card]').getBoundingClientRect();return Math.abs(p.left/p.width-2)<0.01&&Math.abs(c.left-p.left)<1&&Math.abs(c.right-innerWidth)<1&&c.top===32&&c.bottom===innerHeight})()"));
  smoke.check("Split has one surface with illustration behind rounded corners", await run("(()=>{const p=document.querySelector('[data-auth-pane]'),b=document.querySelector('[data-auth-background]').getBoundingClientRect(),c=getComputedStyle(document.querySelector('[data-auth-card]'));return getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)'&&b.right>p.getBoundingClientRect().left&&c.borderTopLeftRadius==='24px'&&c.borderTopRightRadius==='0px'})()"));
  await click("[data-auth-login]"); await fillForm();
  await run("document.querySelector('[data-auth-scroll]').scrollTop=0");
  smoke.check("Split form starts below fixed brand and does not overlap theme control", await run("(()=>{const s=document.querySelector('[data-auth-scroll]').getBoundingClientRect(),b=document.querySelector('[data-auth-brand]').getBoundingClientRect(),t=document.querySelector('[data-toolbox-theme]').getBoundingClientRect();return s.top>=b.bottom&&b.top>=32&&t.bottom<s.top})()"));
  await screenshot("login-split-dark");
  const point = await run("(()=>{const s=document.querySelector('[data-auth-scroll]');s.scrollTop=0;const r=s.getBoundingClientRect();window.__brandY=document.querySelector('[data-auth-brand]').getBoundingClientRect().top;window.__footerY=document.querySelector('[data-auth-card-footer]').getBoundingClientRect().top;return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({type:'mouseMove',...point}); win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-600,deltaX:0,canScroll:true}); await delay(200);
  smoke.check("Real wheel scrolls inner content while panel, brand, footer and background stay fixed", await run("(()=>{const s=document.querySelector('[data-auth-scroll]');return s.scrollTop>0&&document.querySelector('[data-auth-brand]').getBoundingClientRect().top===window.__brandY&&document.querySelector('[data-auth-card-footer]').getBoundingClientRect().top===window.__footerY&&document.querySelector('[data-auth-background]').getBoundingClientRect().top===32&&window.scrollY===0&&document.documentElement.scrollWidth<=innerWidth})()"));
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
  await delay(450);
  const deadline = userData.entrySession.guest.expiresAt;
  smoke.check("Guest enters homepage and persists exactly one hour", deadline-userData.entrySession.guest.startedAt===3600000 && fs.existsSync(documentPath));
  smoke.check("Guest session shares user document without erasing profile", userData.profile.nickname === "Keep me");
  await load(); await wait("document.querySelector('[data-home-hero-explore]')");
  smoke.check("Full reload preserves guest and original deadline", userData.entrySession.guest.expiresAt === deadline && await run("!document.querySelector('[data-login-page]')"));
  await load("/create"); await wait("document.querySelector('[data-generate-button]')");
  smoke.check("Valid guest can directly open create page without extending deadline", userData.entrySession.guest.expiresAt === deadline);
  win.setContentSize(1050,500); await load("/profile"); await wait("document.querySelector('[data-auth-logout]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await wait("!document.documentElement.classList.contains('page-transition')&&!document.documentElement.classList.contains('theme-ripple')&&document.querySelector('[data-profile-scroll]').scrollHeight>document.querySelector('[data-profile-scroll]').clientHeight");
  const scrollPoint = await run("(()=>{const s=document.querySelector('[data-profile-scroll]');s.scrollTop=0;window.__profileHeaderY=document.querySelector('[data-profile-fixed-header]').getBoundingClientRect().top;window.__profileTabsY=document.querySelector('[role=tablist]').getBoundingClientRect().top;const r=s.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  win.webContents.sendInputEvent({type:'mouseMove',...scrollPoint});
  await delay(100);
  win.webContents.sendInputEvent({type:'mouseWheel',...scrollPoint,deltaY:-600,deltaX:0,canScroll:true}); await delay(200);
  smoke.check("Real wheel scrolls below the tabs while cover, identity, tabs and app chrome remain fixed", await run("(()=>{const s=document.querySelector('[data-profile-scroll]'),nav=document.querySelector('nav[aria-expanded]');return s.scrollTop>0&&document.querySelector('[data-profile-fixed-header]').getBoundingClientRect().top===window.__profileHeaderY&&document.querySelector('[role=tablist]').getBoundingClientRect().top===window.__profileTabsY&&document.querySelector('#main-content').scrollTop===0&&nav.getBoundingClientRect().top===32&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0&&window.scrollY===0&&document.documentElement.scrollHeight<=innerHeight})()"));
  console.log("PROFILE_SCROLL_GEOMETRY",await run("(()=>{const s=document.querySelector('[data-profile-scroll]');return {scrollTop:s.scrollTop,scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,overflow:getComputedStyle(s).overflowY,rootHeight:document.documentElement.scrollHeight,viewport:innerHeight,navTop:document.querySelector('nav[aria-expanded]').getBoundingClientRect().top}})()"));
  await screenshot("profile-content-scroll");
  await run("window.__profileBeforeDialog=document.querySelector('[data-profile-scroll]').scrollTop;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='编辑公开资料').click()");
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
  const nextDeadline = userData.entrySession.guest.expiresAt;
  await run(`Date.now=()=>${nextDeadline};window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))`);
  await wait("document.querySelector('[data-auth-expired]')&&location.pathname==='/login'"); await delay(450);
  smoke.check("Focus after expiry exits automatically and clears persisted guest", userData.entrySession.guest===null && await run("!document.querySelector('[data-generate-button]')"));
  userData.entrySession={guest:{startedAt:Date.now()-3600100,expiresAt:Date.now()-100}};
  await load(); await wait("document.querySelector('[data-auth-card]')");
  smoke.check("Expired record cannot re-enter on restart", await run("location.pathname==='/login'&&!document.querySelector('[data-home-hero-explore]')"));
  userData.entrySession={guest:{startedAt:Date.now(),expiresAt:Date.now()+7200000}};
  await load(); await wait("document.querySelector('[data-auth-card]')");
  smoke.check("Invalid two-hour record cannot extend guest session", await run("location.pathname==='/login'"));
  userData.settings.locale='en'; await load(); await wait("document.querySelector('[data-auth-card]')");
  smoke.check("Login entry reuses English locale with no Chinese form text", await run("document.querySelector('[data-auth-register]').textContent==='Create an account'&&document.querySelector('[data-auth-guest]').textContent.includes('Continue as a guest')"));
  smoke.check("No password ever lands in user JSON", !JSON.stringify(writes).includes("fixture-password"));
  smoke.check("No React render-state or hydration errors", !errors.some(message=>/while rendering|hydration|Minified React error/.test(message)));
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  win=new BrowserWindow({...windowChromeOptions(),show:false,width:1300,height:900,webPreferences:{additionalArguments:windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  win.webContents.on("console-message",event=>{if(event.level==='error')errors.push(event.message)});
  smoke.attachWebContents(win.webContents); const occlusion=await smoke.hardenWindow(win);
  try { await checkEntry(); await checkNarrow(); await checkSplit(); await checkGuest(); }
  finally { occlusion.dispose(); win.destroy(); }
  console.log("LOGIN_SCREENSHOTS",temp); smoke.finish({app,ok:smoke.allPassed()});
}
main().catch(error=>{console.error(error.message);smoke.finish({app,ok:false})});
