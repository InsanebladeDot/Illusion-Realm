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
/** 云端图片 UI 冒烟：只走模拟 IPC，验证上传重试、收藏夹与窄屏；不连接后端或图床。 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "cloud-images", timeoutMs: 45000 });
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ir-cloud-images-"));
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const image = { id: "42", ownerId: "7", revision: "1", title: "Fixture", fileName: "fixture.png", mimeType: "image/png", sizeBytes: "68", width: 1, height: 1, visibility: "private", presentationMode: "imageOnly", parseState: "pending", sourceUrl: "https://cloud-image.invalid/42.png", createdAt: "2026-10-15T00:00:00Z" };
const profile = { id: "7", email: "fixture@example.test", displayName: "Fixture", bio: null, role: "user", maintainedLibraries: [], status: "active", revision: "1", emailVerifiedAt: "2026-10-15T00:00:00Z", createdAt: "2026-10-15T00:00:00Z" };
let document = require("./lib/guest-session-fixture").withGuestSession({ version: 1, settings: { locale: "zh-CN", theme: "light", paths: {} } });
const uploads = [], errors = [];
const libraryCalls = [];
let storedImage = { ...image }, hasImage = false, hasItem = true, hasCollection = true;
let collection = { id: "8", ownerId: "7", name: "Fixture collection", description: null, visibility: "private", revision: "1", createdAt: image.createdAt };
const ok = data => ({ status: 200, body: { success: true, code: "OK", data } });
app.disableHardwareAcceleration(); app.setPath("userData", path.join(directory, "browser"));
smoke.setWorkDir(directory); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: document, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, next) => { document = next; });
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => directory);
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ok(profile));
registerHandle(C.CLOUD_IMAGE_UPLOAD, (_event, input) => {
  uploads.push(input);
  if (uploads.length > 1) hasImage = true;
  return uploads.length === 1 ? { status: 503, retryAfter: "1", body: { success: false, code: "SERVICE_UNAVAILABLE" } } : ok(image);
});
registerHandle(C.CLOUD_IMAGE_GET, () => ok(storedImage));
registerHandle(C.CLOUD_COLLECTION_GET, () => ok(collection));
registerHandle(C.CLOUD_COLLECTION_ITEMS, () => ok({ revision: collection.revision, items: hasItem ? [{ imageId: "42", sortOrder: "1", addedAt: image.createdAt }] : [], nextCursor: null }));
registerHandle(C.CLOUD_LIBRARY_REQUEST, (_event, input) => {
  libraryCalls.push(input);
  if (input.action === "listImages") return ok(input.scope === "public" ? Array.from({ length: input.offset ? 1 : 24 }, (_, index) => ({ ...image, id: String(100 + input.offset + index), ownerId: "9", visibility: "public" })) : hasImage ? [storedImage] : []);
  if (input.action === "listCollections") return ok(hasCollection ? [collection] : []);
  if (input.action === "updateImage") storedImage = { ...storedImage, title: input.title, visibility: input.visibility, presentationMode: input.presentationMode, revision: "2" };
  if (input.action === "deleteImage") hasImage = false;
  if (input.action === "createCollection") { collection = { ...collection, id: "9", name: input.name, description: input.description, visibility: input.visibility }; hasCollection = true; return ok(collection); }
  if (input.action === "updateCollection") { collection = { ...collection, name: input.name, description: input.description, visibility: input.visibility, revision: "2" }; return ok(collection); }
  if (input.action === "deleteCollection") hasCollection = false;
  if (input.action === "addItem") hasItem = true;
  if (input.action === "removeItem") hasItem = false;
  return ok(null);
});
const run = smoke.createRun();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(source) {
  for (let i = 0; i < 80; i++) { if (await run(`Boolean(${source})`)) return; await delay(75); }
  throw new Error(`Cloud UI condition timed out: ${source}`);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function capture(win, name) { await delay(150); fs.writeFileSync(path.join(directory, name + ".png"), (await win.webContents.capturePage()).toPNG()); }
async function verifyForm(win) {
  await click('[data-profile-content-tab="cloudImages"]');
  await wait("document.querySelector('[data-cloud-upload-trigger]')?.offsetHeight");
  await click('[data-cloud-upload-trigger]');
  await wait("document.querySelector('[data-cloud-upload]')?.offsetHeight");
  smoke.check("upload defaults are private and image-only", await run("[...document.querySelectorAll('[data-cloud-upload] [data-simple-select-value]')].map(x=>x.dataset.simpleSelectValue).join(',')==='private,imageOnly'"));
  await run(`(() => { const file=new File([Uint8Array.from(atob('${png}'),x=>x.charCodeAt(0))],'fixture.png',{type:'image/png'});const files=new DataTransfer();files.items.add(file);const input=document.querySelector('[data-cloud-upload] input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await wait("document.querySelector('[data-cloud-upload] input:not([type=file])').value==='fixture'");
  await run("document.querySelector('[data-cloud-upload]').requestSubmit()");
  await wait("document.querySelector('[data-cloud-upload] [role=alert]')");
  smoke.check("503 keeps form values and displays failure", await run("document.querySelector('[data-cloud-upload] input:not([type=file])').value==='fixture'"));
  await wait("!document.querySelector('[data-cloud-upload] button[type=submit]').disabled");
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[data-cloud-upload]')");
  await click('[data-cloud-upload-trigger]'); await wait("document.querySelector('[data-cloud-upload]')");
  smoke.check("closing upload keeps selected PNG and retry draft", await run("document.querySelector('[data-cloud-upload] input:not([type=file])').value==='fixture'&&!document.querySelector('[data-cloud-upload] button[type=submit]').disabled"));
  // 切换标签不卸载表单，保证失败重试仍是同一次提交。
  await click('[data-profile-content-tab="cloudCollections"]'); await click('[data-profile-content-tab="cloudImages"]');
  await run("document.querySelector('[data-cloud-upload]').requestSubmit()");
  await wait("document.querySelector('[data-cloud-image-id=\"42\"]')");
  await wait("document.querySelector('[data-cloud-image-id=\"42\"] img')?.naturalWidth===1");
  smoke.check("cloud image URL decodes through the existing image element", await run("document.querySelector('[data-cloud-image-id=\"42\"] img').naturalHeight===1"));
  smoke.check("retry after tab switch keeps UUID and original PNG bytes", uploads.length === 2 && uploads[0].requestId === uploads[1].requestId && Buffer.from(uploads[1].bytes).equals(Buffer.from(png, "base64")));
  smoke.check("success prevents an accidental duplicate upload", await run("document.querySelector('[data-cloud-upload] button[type=submit]').disabled"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[data-cloud-upload]')");
  await run("document.querySelector('[data-cloud-images]').scrollIntoView({block:'start'})");
  await capture(win, "cloud-images-wide");
  const light = await run("getComputedStyle(document.querySelector('[data-cloud-images]')).backgroundColor");
  await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, "[data-theme-trigger]");
  await click("[data-theme-trigger]"); await click('[data-theme-option="dark"]');
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme: dark)').matches");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  smoke.check("cloud images follow existing dark theme tokens", light !== await run("getComputedStyle(document.querySelector('[data-cloud-images]')).backgroundColor"));
  await run("document.querySelector('[data-cloud-images]').scrollIntoView({block:'start'})");
  await capture(win, "cloud-images-dark");
}
async function verifyCollectionAndLayout(win) {
  await click('[data-profile-content-tab="cloudCollections"]');
  await run("document.querySelector('[data-cloud-collections] summary').click()");
  await run("(()=>{const p=[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden);const i=p.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'8');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await run("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('form').requestSubmit()");
  await wait("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('[data-cloud-image-id=\"42\"]')");
  smoke.check("collection resolves item IDs into image cards", await run("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('[data-cloud-image-id=\"42\"]')!==null"));
  await click('[data-profile-content-tab="cloudImages"]');
  await click('[data-cloud-upload-trigger]'); await wait("document.querySelector('[data-cloud-upload]')");
  win.setContentSize(390, 760); await delay(150);
  await run("document.querySelector('[data-cloud-upload]').scrollIntoView({block:'start'})");
  smoke.check("narrow cloud form stays within content width", await run("(()=>{const f=document.querySelector('[data-cloud-upload]'),r=f.getBoundingClientRect();return f.scrollWidth<=f.clientWidth+1&&r.right<=innerWidth})()"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await wait("!document.querySelector('[data-cloud-upload]')");
  await run("document.querySelector('[data-cloud-images]').scrollIntoView({block:'start'})");
  smoke.check("narrow gallery and search stay within content width", await run("(()=>{const p=document.querySelector('[data-cloud-images]');return p.scrollWidth<=p.clientWidth+1&&p.getBoundingClientRect().right<=innerWidth})()"));
  await capture(win, "cloud-images-narrow");
  smoke.check("no React render or hydration errors", !errors.some(value => /while rendering|hydration|Minified React error/.test(value)));
}
// 外观回归：按 profile-templates 的横幅与整页滚动契约验收；云端业务断言保持独立。
async function verifyProfileShell(win) {
  // 参考模板改为 207px 横幅；账户邮箱通过 summary 展开验证，不再要求默认全部展开。
  smoke.check("head and nav preserve 54px application chrome without dividing borders", await run("(()=>{const n=document.querySelector('nav[aria-expanded]'),h=document.querySelector('[data-window-titlebar]');return n.getBoundingClientRect().top===54&&h.getBoundingClientRect().height===54&&getComputedStyle(n).borderRightWidth==='0px'&&getComputedStyle(h).borderBottomWidth==='0px'})()"));
  smoke.check("shared main retains its rounded white surface while profile content owns scrolling", await run("(()=>{const s=getComputedStyle(document.querySelector('[data-app-main]'));return s.borderRadius==='8px'&&s.backgroundColor==='rgb(255, 255, 255)'&&s.overflowY==='hidden'&&getComputedStyle(document.querySelector('[data-profile-scroll]')).overflowY==='auto'})()"));
  smoke.check("wide profile cover matches the 207px reference", await run("document.querySelector('[data-profile-cover]').getBoundingClientRect().height===207"));
  await click('[data-profile-account-details] summary');
  smoke.check("account disclosure retains email and account ID below the name", await run("(()=>{const d=document.querySelector('[data-profile-account-details]');return d.open&&d.innerText.includes('fixture@example.test')&&d.querySelector('summary').textContent.includes('7')})()"));
  await click('[data-profile-account-details] summary');
  await capture(win, "profile-shell-light");
}
async function verifyCollectionViews(win) {
  win.setContentSize(1350, 1000); await delay(150);
  await click('[data-profile-content-tab="cloudCollections"]');
  await run("[...document.querySelectorAll('[data-cloud-collections] button')].find(x=>x.textContent==='返回收藏夹')?.click()");
  await wait("document.querySelector('[data-cloud-collection-id=\"8\"]')");
  const calls = libraryCalls.length;
  await click('[data-cloud-collections] [data-resource-view="list"]');
  await wait("document.querySelector('[data-collection-layout=\"list\"]')");
  await run("document.querySelector('[data-cloud-collections]').scrollIntoView({block:'start'})");
  await capture(win, "profile-collections-list");
  await click('[data-cloud-collections] [data-resource-view="grid"]');
  await wait("document.querySelector('[data-collection-layout=\"grid\"]')");
  smoke.check("collection view switch retains data and performs no requests", libraryCalls.length === calls && await run("document.querySelectorAll('[data-cloud-collection-id=\"8\"]').length===1"));
  smoke.check("wide collection grid uses three columns inside the expanded nav", await run("getComputedStyle(document.querySelector('[data-collection-layout=grid]')).gridTemplateColumns.split(' ').length===3"));
  await capture(win, "profile-collections-grid");
  win.setContentSize(320, 620); await delay(150);
  smoke.check("narrow profile cover matches the 192px reference", await run("document.querySelector('[data-profile-cover]').getBoundingClientRect().height===192"));
  smoke.check("320px profile surface and collection cards do not overflow", await run("(()=>{const p=document.querySelector('[data-app-main]'),c=document.querySelector('[data-cloud-collections]');return p.scrollWidth<=p.clientWidth+1&&c.scrollWidth<=c.clientWidth+1&&c.getBoundingClientRect().right<=innerWidth})()"));
  await run("document.querySelector('[data-cloud-collections]').scrollIntoView({block:'start'})");
  // 新模板由同一个容器滚动横幅、标签与列表；主区和应用标题栏仍固定在自己的外壳中。
  smoke.check("narrow page scroll moves profile content while app chrome stays fixed", await run("(()=>{const h=document.querySelector('[data-profile-fixed-header]'),m=document.querySelector('#main-content'),s=document.querySelector('[data-profile-scroll]');return scrollY===0&&m.scrollTop===0&&s.clientHeight>0&&s.scrollTop>0&&h.getBoundingClientRect().bottom<s.getBoundingClientRect().top&&document.querySelector('[data-window-titlebar]').getBoundingClientRect().top===0})()"));
  await capture(win, "profile-collections-narrow");
  win.setContentSize(1350, 1000); await delay(100);
  await click('[data-profile-content-tab="cloudImages"]');
}
async function setInput(selector, value) {
  await run(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function buttonIn(selector, label) {
  await run(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector + " button")})].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('Button missing');button.click();})()`);
}
async function verifyLibraryWrites(win) {
  win.setContentSize(1350, 1000); await delay(100);
  await setInput('[data-cloud-search]', 'missing name');
  await wait("!document.querySelector('[data-cloud-images] [data-cloud-image-id]')");
  smoke.check("name search filters loaded images", await run("document.querySelector('[data-cloud-images]').innerText.includes('没有匹配的图片')"));
  await setInput('[data-cloud-search]', '');
  await click('[data-cloud-filter]'); await click('[data-cloud-visibility="public"]');
  await wait("!document.querySelector('[data-cloud-images] [data-cloud-image-id]')");
  smoke.check("visibility filter preserves original loaded count", await run("document.querySelector('[data-cloud-summary=loaded] strong').textContent==='1'"));
  await click('[data-cloud-visibility="all"]');
  await setInput('[data-cloud-search]', '42');
  await run("document.querySelector('[data-cloud-images] form[role=search]').requestSubmit()");
  await wait("!document.querySelector('[data-cloud-images] form[role=search] button[type=submit]').disabled");
  smoke.check("numeric search uses ID lookup without duplicating the loaded card", await run("document.querySelectorAll('[data-cloud-images] [data-cloud-image-id=\"42\"]').length===1"));
  await setInput('[data-cloud-search]', '');
  await buttonIn('[data-cloud-image-id="42"]', "编辑图片");
  await wait("document.querySelector('[data-cloud-image-editor]')");
  await setInput("[data-cloud-image-editor] input:not([type=checkbox])", "Updated fixture");
  await run("document.querySelector('[data-cloud-image-editor] form').requestSubmit()");
  await wait("!document.querySelector('[data-cloud-image-editor]')&&document.body.innerText.includes('Updated fixture')");
  smoke.check("image editing sends server revision and reloads saved library", libraryCalls.some(item => item.action === "updateImage" && item.expectedRevision === "1" && item.title === "Updated fixture"));
  await buttonIn('[data-cloud-image-id="42"]', "加入收藏夹");
  // 菜单选项在展开后才挂载，等待真实选项而非伪造原生 change 事件。
  // 选定目标集合后仍由生产表单提交，检查服务器收到的集合 ID。
  await wait("document.querySelector('[data-cloud-add-to-collection] [data-simple-select]>button')");
  await click('[data-cloud-add-to-collection] [data-simple-select]>button');
  await wait("document.querySelector('[data-simple-select-option=\"8\"]')");
  await click('[data-simple-select-option="8"]');
  await buttonIn("[data-cloud-add-to-collection]", "加入收藏夹"); await wait("document.querySelector('[data-cloud-add-to-collection] [role=status]')");
  smoke.check("image card adds selected image to chosen collection", libraryCalls.some(item => item.action === "addItem" && item.imageId === "42" && item.id === "8"));
  await click('[data-profile-content-tab="cloudCollections"]'); await click("[data-cloud-create-collection]");
  await setInput("[data-cloud-collection-editor] input:not([type=checkbox])", "New archive");
  await run("document.querySelector('[data-cloud-collection-editor] form').requestSubmit()");
  await wait("document.querySelector('[data-cloud-collection-id=\"9\"]')");
  smoke.check("new collection uses UUID and default private visibility", libraryCalls.some(item => item.action === "createCollection" && /^[a-f0-9-]{36}$/.test(item.requestId) && item.visibility === "private"));
  await click('[data-cloud-collection-id="9"] button');
  await wait("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('[data-cloud-image-id=\"42\"]')");
  await run("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('[data-cloud-image-id=\"42\"] button.underline').click()");
  await wait("document.body.innerText.includes('此收藏夹暂无可查看的图片')");
  smoke.check("remove from collection does not delete original image", hasImage && libraryCalls.some(item => item.action === "removeItem"));
  await run("[...document.querySelectorAll('[data-cloud-collections] button')].find(x=>x.textContent==='返回收藏夹').click()");
  await buttonIn('[data-cloud-collection-id="9"]', "管理收藏夹"); await wait("document.querySelector('[data-cloud-collection-editor]')");
  await setInput("[data-cloud-collection-editor] input:not([type=checkbox])", "Updated archive");
  await run("document.querySelector('[data-cloud-collection-editor] form').requestSubmit()");
  await wait("!document.querySelector('[data-cloud-collection-editor]')&&document.body.innerText.includes('Updated archive')");
  smoke.check("collection editor sends current revision and refreshes list", libraryCalls.some(item => item.action === "updateCollection" && item.revision === "1" && item.name === "Updated archive"));
  await buttonIn('[data-cloud-collection-id="9"]', "管理收藏夹"); await wait("document.querySelector('[data-cloud-collection-editor]')");
  smoke.check("collection deletion requires acknowledgement", await run("[...document.querySelectorAll('[data-cloud-collection-editor] button')].find(x=>x.textContent==='删除收藏夹').disabled"));
  await click("[data-cloud-collection-editor] input[type=checkbox]"); await buttonIn("[data-cloud-collection-editor]", "删除收藏夹");
  await wait("!document.querySelector('[data-cloud-collection-id=\"9\"]')");
  smoke.check("deleting collection keeps original image", hasImage && !hasCollection);
  await click('[data-profile-content-tab="cloudImages"]');
  await buttonIn('[data-cloud-image-id="42"]', "编辑图片");
  smoke.check("image deletion requires acknowledgement", await run("[...document.querySelectorAll('[data-cloud-image-editor] button')].find(x=>x.textContent==='删除图片').disabled"));
  await click("[data-cloud-image-editor] input[type=checkbox]"); await buttonIn("[data-cloud-image-editor]", "删除图片");
  await wait("!document.querySelector('[data-cloud-image-id=\"42\"]')");
  smoke.check("deleted image disappears after server list refresh", !hasImage);
  await run("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelector('[data-cloud-scope=public]').click()");
  await wait("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelectorAll('[data-cloud-image-id]').length===24");
  smoke.check("public images hide owner-only edit actions", await run("![...document.querySelectorAll('[data-cloud-image-id] button')].some(x=>x.textContent==='编辑图片')"));
  await buttonIn('[role=tabpanel]:not([hidden])', "加载更多");
  await wait("[...document.querySelectorAll('[role=tabpanel]')].find(x=>!x.hidden).querySelectorAll('[data-cloud-image-id]').length===25");
  smoke.check("public image pagination continues from raw page offset", libraryCalls.some(item => item.action === "listImages" && item.scope === "public" && item.offset === 24));
  // 25 张真实组件卡片构成长列表；必须实际滚到最后一张，不能只检查存在滚动条。
  smoke.check("long gallery reaches the final card through the single profile scroller", await run("(()=>{const s=document.querySelector('[data-profile-scroll]');s.scrollTop=0;const y=document.querySelector('[data-profile-cover]').getBoundingClientRect().top;s.scrollTop=s.scrollHeight;const last=[...document.querySelectorAll('[data-cloud-images] [data-cloud-image-id]')].at(-1).getBoundingClientRect(),r=s.getBoundingClientRect();return s.scrollTop>0&&last.bottom<=r.bottom&&last.bottom>r.top&&document.querySelector('[data-profile-cover]').getBoundingClientRect().top<y&&scrollY===0&&document.querySelector('#main-content').scrollTop===0})()"));
  await capture(win, "profile-gallery-scrolled");
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  session.defaultSession.protocol.handle("https", request => request.url.startsWith("https://cloud-image.invalid/")
    ? new Response(Buffer.from(png, "base64"), { headers: { "Content-Type": "image/png" } }) : new Response(null, { status: 404 }));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*"] }, (_details, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1350, height: 900, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); const occlusion = await smoke.hardenWindow(win);
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    await win.loadURL("app://app/profile"); await wait("document.querySelector('[data-profile-content-tab=\"cloudImages\"]')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
    await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
    await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
    await verifyProfileShell(win); await verifyForm(win); await verifyCollectionAndLayout(win); await verifyCollectionViews(win); await verifyLibraryWrites(win);
  }
  finally { occlusion.dispose(); win.destroy(); }
  console.log("CLOUD_UI_SCREENSHOTS", directory); smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error.message); smoke.finish({ app, ok: false }); });
