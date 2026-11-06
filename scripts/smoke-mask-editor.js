/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** Real pointer mask drawing / erasing, PNG pixel contract, upload and resource-card scroll regression. */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), zlib = require("node:zlib");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "mask-editor", timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-mask-ui-")), modelsRoot = path.join(root, "models");
const settings = { paths: { searchPath: modelsRoot }, theme: "light" }, errors = [], uploads = [];
let win;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: { settings } });
require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers();
// 正式标题栏首次读取窗口状态，隔离测试也要注册完整有限窗口桥接。
// 只注册主题会让window:control产生无handler错误，掩盖真正的渲染问题。
require("../apps/electron/src/main/core/windows/window.handlers").registerWindowHandlers();
// 窗口控制与主题设置是分开的注册器，测试两者都需接入正式实现。
// 不用写入HTML颜色来模拟主题，否则会遗漏nativeTheme与媒体查询同步。
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession({ settings }), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => ({ revision: 0, tasks: [] }));
for (const channel of [C.AGENT_SECRET_STATUS, C.PROMPT_SECRET_STATUS, C.CIVITAI_KEY_STATUS]) registerHandle(channel, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, file) => fs.existsSync(file) ? "data:image/png;base64," + fs.readFileSync(file).toString("base64") : null);
registerHandle(C.COMFY_UPLOAD_IMAGE, (_event, _address, file) => {
  uploads.push(file);
  return { name: file.filename, subfolder: "mask-fixture", type: "input" };
});
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const run = source => win.webContents.executeJavaScript(source, true);
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(100); }
  console.error('UI diagnostic', await run("document.querySelector('[data-canny-result]')?.textContent"));
  throw new Error("Mask UI timeout: " + source);
}
async function click(selector) { await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function draw(x, y, endX = x) {
  const bounds = await run("(()=>{const el=document.querySelector('[data-mask-surface]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
  const point = value => ({ x: Math.round(bounds.x + bounds.w * value), y: Math.round(bounds.y + bounds.h * y) });
  // 滚动后等待 Chromium 提交命中测试区域，再发真实指针事件，避免点到旧位置。
  await delay(120);
  await wait(`document.elementFromPoint(${point(x).x},${point(x).y})?.closest('[data-mask-surface]')`);
  win.webContents.sendInputEvent({ type: "mouseMove", ...point(x) });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point(x) });
  for (let i = 1; i <= 8; i++) { win.webContents.sendInputEvent({ type: "mouseMove", modifiers:["leftButtonDown"], ...point(x + (endX - x) * i / 8) }); await delay(15); }
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point(endX) }); await delay(150);
}
function decodePng(bytes) {
  const chunks = [], buffer = Buffer.from(bytes); let width, height;
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset), kind = buffer.toString("ascii", offset + 4, offset + 8), data = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (kind === "IDAT") chunks.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) { if (raw[y * (stride + 1)] !== 0) throw new Error("Expected lossless filter-0 export"); raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1)); }
  return { width, height, pixel: (x, y) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)] };
}
// 独立导出入口不再接受upload布尔参数，避免旧测试调用已删除的验证动作。
// 正式产品仍编码当前四个通道，本辅助仅取mask与image两份做旧能力对照。
// 读取实际Blob URL的字节，不能通过页面截图推断透明区域RGB。
// 导出控件完成后等待图像解码，空src或破损PNG都不能通过尺寸前置。
// 尺寸640×480来自这个脚本固定素材，与新工作区专项512×320互为补充。
// 主进程独立解码filter-0 PNG，避免浏览器清掉透明RGB导致假失败。
// 调用方无需先点生成导出预览，单独下载按钮就是用户明确的导出动作。
// 下载对话框由测试会话拦截，导出Blob与像素验证仍完整执行。
// Canny下载另有指定路径的真实保存检查，不被此拦截吞掉。
// 导出不应增加uploads数组，真实上传行为已由生成队列专项覆盖。
// 移除手动验证控件是产品要求，测试应更新预期而非恢复无用按钮。
// 填充和擦除后重复读取导出，证明每次取的是当前文档而非旧预览。
// 错误时直接让冒烟失败，不把无输出回退成全黑mask。
// hidden预览只提供已编码字节的观察点，不属于视觉通道布局的一部分。
// 这组旧回归与新布局测试使用不同素材尺寸，能够补充缩放坐标检查。
// 不读取真实模型或上传到用户服务，uploads仅是隔离handler的记录。
// 单独导出不应改变shared queue或任务阶段。
// 调用者检查两份输出各自像素，不能因为mask正确就默认alpha PNG也正确。
// 原RGB与反向alpha是独立约束，透明中心和未画边角共同构成正反对照。
// 脚本仍在生产静态导出运行，并由外层build fingerprint防止读旧产物。
// 所有导出等待有单步和总超时，缺结果不会无限挂住测试。
// 服务端验证功能移除后，PNG本地正确性仍需继续保留机器断言。
// 正式生成上传和模型补丁接线由另一专项完成，两种结论不能互相冒充。
// 截图用于人工核对暗色和窄屏，不能代替这些逐像素条件。
// 测试仅管理自己创建的窗口，不停止桌面其他Electron应用。
// 测试完成保留隔离目录和日志，失败可按这次实际字节进一步排查。
// 此辅助不验证操作系统下载目录权限，系统保存检查仅在Canny分支执行。
// 旧涂抹、擦除、撤销和导出语义仍是本脚本的兼容目标。
async function exportsPixels() {
  await click("[data-mask-export]");
  await wait("document.querySelector('[data-mask-preview=mask]')?.complete&&document.querySelector('[data-mask-preview=mask]')?.naturalWidth===640&&!document.querySelector('[data-mask-export]').disabled");
  const bytes = await run("Promise.all(['mask','image'].map(async kind=>[...new Uint8Array(await(await fetch(document.querySelector('[data-mask-preview='+kind+']').src)).arrayBuffer())]))");
  return bytes.map(decodePng);
}
async function verifyNavigation() {
  // 普通图片页已移除 Canny，必须通过编辑标签进入边缘工具。
  // 导航和设置菜单的全套回归由 create-layout 保留，这里只建立本工具前置。
  // 不调用 React 内部 state，不以手工挂载组件绕过正式页面入口。
  smoke.check('Ordinary image page no longer exposes edge detection',await run("!document.querySelector('[data-canny-enable]')"));
  await run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(el=>el.textContent.trim()==='编辑').click()");
  await click('#edge-edit-tab');await wait("document.querySelector('[data-canny-panel]')");
}
async function importCanny(bytes, name = "source.png", type = "image/png") {
  await run(`(()=>{const el=document.querySelector('[data-canny-source] input[type=file]'),d=new DataTransfer();d.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));el.files=d.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function dragThreshold(selector, fraction) {
  const rect = await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,value:Number(e.value)}})()`);
  const y = Math.round(rect.y + rect.h / 2), x = value => Math.round(rect.x + 8 + (rect.w - 16) * value);
  await delay(120);
  win.webContents.sendInputEvent({ type:"mouseMove", x:x(rect.value), y });
  win.webContents.sendInputEvent({ type:"mouseDown", button:"left", clickCount:1, x:x(rect.value), y });
  for (let i=1;i<=5;i++) { win.webContents.sendInputEvent({ type:"mouseMove", modifiers:["leftButtonDown"], x:x(rect.value+(fraction-rect.value)*i/5), y }); await delay(20); }
  win.webContents.sendInputEvent({ type:"mouseUp", button:"left", clickCount:1, x:x(fraction), y }); await delay(100);
}
async function verifyCannyInput() {
  smoke.check("Edge editor enables detection and inversion by default", await run("Boolean(document.querySelector('[data-canny-panel]'))&&document.querySelector('[data-canny-invert]').getAttribute('aria-pressed')==='true'"));
  // 检测已经默认开启，不能沿用旧图片页的“先开启”步骤反而把面板关闭。
  // 本次进入正式边缘工具后直接操作已有阈值，不再展开无关生成高级区。
  await wait("document.querySelector('[data-canny-panel]')");
  await dragThreshold("[data-interval-lower]", .2);
  smoke.check("Lower threshold responds to actual pointer drag", await run("Math.abs(Number(document.querySelector('[data-interval-lower]').value)-.2)<.025"));
  await dragThreshold("[data-interval-upper]", .8);
  smoke.check("Upper threshold responds to actual pointer drag", await run("Math.abs(Number(document.querySelector('[data-interval-upper]').value)-.8)<.025"));
  await run("document.querySelector('[data-interval-lower]').focus()");
  win.webContents.sendInputEvent({type:"keyDown",keyCode:"End"}); win.webContents.sendInputEvent({type:"keyUp",keyCode:"End"}); await delay(100);
  smoke.check("Keyboard cannot move lower threshold beyond upper", await run("document.querySelector('[data-interval-lower]').value===document.querySelector('[data-interval-upper]').value"));
  await run("document.querySelector('[data-interval-lower]').focus()");
  win.webContents.sendInputEvent({type:"keyDown",keyCode:"Home"}); win.webContents.sendInputEvent({type:"keyUp",keyCode:"Home"}); await delay(100);
  smoke.check("Threshold keyboard Home reaches zero", await run("document.querySelector('[data-interval-lower]').value==='0'"));
  // 默认已启用反转，不再切换为关闭。
  // 注入 Worker 启动失败，验证失败能收尾且重试能重新启动，避免只测成功路径。
  await run("(()=>{window.__originalWorker=window.Worker;window.Worker=class{constructor(){throw new Error('Injected worker startup failure')}}})()");
  await importCanny([...fs.readFileSync(path.join(root, "source.png"))]);
  await wait("document.querySelector('[data-canny-source] img')?.naturalWidth===640");
  await wait("document.querySelector('[data-canny-retry]')");
  smoke.check("Failed Worker load stops spinner and exposes retry",await run("document.querySelector('[data-canny-result]').getAttribute('aria-busy')==='false'&&!document.querySelector('[data-canny-output]')"));
  await run("window.Worker=window.__originalWorker;delete window.__originalWorker");
  await click("[data-canny-retry]"); await wait("document.querySelector('[data-canny-output]')?.naturalWidth===640");
  smoke.check("Retry starts a fresh Worker and produces output",await run("!document.querySelector('[data-canny-retry]')"));
  await click("[data-canny-preview]"); await wait("document.querySelector('[data-image-preview-overlay]')");
  smoke.check("Original image opens existing shared preview", await run("document.querySelector('[data-image-preview-overlay] img').naturalWidth===640"));
  await click("[data-image-preview-overlay] button");
  await importCanny([1,2,3], "broken.png"); await wait("document.querySelector('[data-canny-panel] [role=alert]')");
  smoke.check("Invalid image reports error and retains previous valid source", await run("document.querySelector('[data-canny-source] img').naturalWidth===640"));
  await importCanny([...fs.readFileSync(path.join(root, "source.png"))]);
  await wait("!document.querySelector('[data-canny-panel] [role=alert]')");
  await click("[data-canny-enable]"); await click("[data-canny-enable]");
  smoke.check("Disable and re-enable preserve original, inversion and threshold", await run("Boolean(document.querySelector('[data-canny-source] img'))&&document.querySelector('[data-canny-invert]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-interval-lower]').value==='0'"));
  await wait("document.querySelector('[data-canny-output]')?.naturalWidth===640");
  const inverted = await readCannyPixels();
  smoke.check("OpenCV inversion turns a flat image white at original dimensions", inverted.width===640 && inverted.height===480 && inverted.pixels.every((value,index)=>index%4===3||value===255));
  await click("[data-canny-invert]"); await wait("document.querySelector('[data-canny-output]')?.naturalWidth===640");
  const flat = await readCannyPixels();
  smoke.check("OpenCV finds no edges in a constant image", flat.pixels.every((value,index)=>value===(index%4===3?255:0)));
  await verifyCannyConversion();
}
async function readCannyPixels() {
  return run("(()=>{const img=document.querySelector('[data-canny-output]'),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,pixels:[...ctx.getImageData(0,0,c.width,c.height).data]}})()");
}
async function setCannyThresholds(lower, upper) {
  await run(`(()=>{for(const [key,value] of [['upper',1],['lower',${lower}],['upper',${upper}]]){const el=document.querySelector('[data-interval-'+key+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await delay(200); await wait("document.querySelector('[data-canny-output]')?.naturalWidth>0");
}
async function verifyCannyConversion() {
  // 低对比度方块：高阈值时消失，低阈值时出现，避免仅验证生成了某张黑白图。
  const png = await run("(()=>{const c=document.createElement('canvas');c.width=128;c.height=96;const x=c.getContext('2d');x.fillStyle='#808080';x.fillRect(0,0,128,96);x.fillStyle='#a0a0a0';x.fillRect(32,24,64,48);return c.toDataURL('image/png').split(',')[1]})()");
  await importCanny([...Buffer.from(png,'base64')],"square.png");
  await setCannyThresholds(.95,1);
  smoke.check("High thresholds suppress low-contrast edges", (await readCannyPixels()).pixels.every((value,index)=>value===(index%4===3?255:0)));
  await setCannyThresholds(.01,.05);
  const edges = await readCannyPixels(), white=edges.pixels.filter((value,index)=>index%4===0&&value===255).length;
  smoke.check("Low thresholds detect rectangle contours without resizing", edges.width===128&&edges.height===96&&white>100&&white<400);
  smoke.check("Converted PNG is opaque binary grayscale", edges.pixels.every((value,index)=>index%4===3?value===255:(value===0||value===255)&&value===edges.pixels[index-index%4]));
  await click("[data-canny-invert]"); await wait("document.querySelector('[data-canny-output]')?.naturalWidth===128");
  const inverted=await readCannyPixels();
  smoke.check("Invert computes exact pixel complement", inverted.pixels.every((value,index)=>value===(index%4===3?255:255-edges.pixels[index])));
  await click("[data-canny-output-preview]"); await wait("document.querySelector('[data-image-preview-overlay]')");
  smoke.check("Detected image reuses shared full-size preview", await run("document.querySelector('[data-image-preview-overlay] img').naturalWidth===128"));
  await click("[data-image-preview-overlay] button");
  const download=new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error('Canny download timeout')),5000);win.webContents.session.once('will-download',(_event,item)=>{item.setSavePath(path.join(root,'canny-export.png'));item.once('done',(_event,state)=>{clearTimeout(timer);state==='completed'?resolve(item):reject(new Error(state));});});});
  await click("[data-canny-download]"); const item=await download;
  const exported=nativeImage.createFromPath(path.join(root,'canny-export.png'));
  smoke.check("Download writes actual original-size PNG output", item.getFilename()==='square_canny.png'&&exported.getSize().width===128&&exported.getSize().height===96);
  // 快速替换及关闭时不能留下旧结果。
  await importCanny([...fs.readFileSync(path.join(root,'source.png'))]);
  await importCanny([...Buffer.from(png,'base64')],"latest.png");
  await wait("document.querySelector('[data-canny-output]')?.naturalWidth===128");
  smoke.check("Rapid replacement displays only latest source result", await run("document.querySelector('[data-canny-source] img').naturalWidth===128"));
  await click("[data-canny-enable]");
  smoke.check("Disabling detection removes result from the UI", await run("!document.querySelector('[data-canny-output]')"));
  await click("[data-canny-enable]"); await wait("document.querySelector('[data-canny-output]')?.naturalWidth===128");
}
// 页面已切换真实暗色主题，探针通过CSS变量解析当前前景色。
// 先等主题转场结束，旧快照中的颜色不能被误判为最终产品样式。
// 探针只添加临时span，读取后马上删除，不覆盖产品class或style。
// 断言还要求data-theme与原生媒体查询一致，排除只改HTML标记的伪主题。
// 对照色来自主题契约而非目标元素自身，目标仍保留亮色时会失败。
async function hasDarkForeground(selector) {
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme: dark)').matches&&!document.documentElement.classList.contains('theme-ripple')");
  return run("(()=>{const p=document.createElement('span');p.style.color='var(--foreground)';document.body.append(p);const expected=getComputedStyle(p).color;p.remove();return getComputedStyle(document.querySelector("+JSON.stringify(selector)+")).color===expected})()");
}
async function verifyCannyLayout() {
  await run("document.querySelector('[data-canny-panel]').scrollIntoView({block:'start'})");
  smoke.check("Wide rail displays original and result side by side", await run("(()=>{const a=document.querySelector('[data-canny-source]').getBoundingClientRect(),b=document.querySelector('[data-canny-result]').getBoundingClientRect();return b.left>a.right&&Math.abs(a.top-b.top)<2})()"));
  fs.writeFileSync(path.join(root,"canny-wide-light.png"),(await win.webContents.capturePage()).toPNG());
  await click("[data-theme-trigger]"); await click("[data-theme-option=dark]");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  win.setSize(320,720); await delay(350);
  await run("document.querySelector('[data-canny-panel]').scrollIntoView({block:'start'})");
  smoke.check("Narrow rail stacks image panes and keeps all content within viewport", await run("(()=>{const a=document.querySelector('[data-canny-source]').getBoundingClientRect(),b=document.querySelector('[data-canny-result]').getBoundingClientRect(),p=document.querySelector('[data-canny-panel]');return b.top>=a.bottom&&p.scrollWidth<=p.clientWidth&&document.documentElement.scrollWidth<=innerWidth})()"));
  // 暗色前景来自当前配色token，不能把旧版#ededed写死成唯一正确颜色。
  // 用独立探针解析var(--foreground)，同时要求原生媒体查询处于dark。
  smoke.check("Dark theme reaches edge detection panel", await hasDarkForeground('[data-canny-panel]'));
  fs.writeFileSync(path.join(root,"canny-narrow-dark.png"),(await win.webContents.capturePage()).toPNG());
  await click("[data-canny-source] button[aria-label]");
  smoke.check("Removing original clears original and processed preview", await run("!document.querySelector('[data-canny-source] img')&&!document.querySelector('[data-canny-preview]')&&!document.querySelector('[data-canny-output]')"));
  win.setSize(1500,980); await delay(200);
  await click("[data-theme-trigger]"); await click("[data-theme-option=light]");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
}
async function verifyMasks() {
  await run("document.querySelector('#mask-edit-tab').click()"); await wait("document.querySelector('[data-mask-editor]')");
  const bytes = [...fs.readFileSync(path.join(root, "source.png"))];
  await run(`(()=>{const el=document.querySelector('[data-mask-import]'),d=new DataTransfer();d.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],'source.png',{type:'image/png'}));el.files=d.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('[data-mask-surface]')?.getBoundingClientRect().width>200");
  const [empty] = await exportsPixels();
  smoke.check("An empty mask is black and exports at original 640 × 480 dimensions", empty.width === 640 && empty.height === 480 && empty.pixel(320,240).join() === '0,0,0,255');
  await draw(.2,.5,.6);
  const [mask, image] = await exportsPixels();
  smoke.check("Painted pixels are white; untouched pixels are black", mask.pixel(256,240).join() === '255,255,255,255' && mask.pixel(600,20).join() === '0,0,0,255');
  smoke.check("ComfyUI alpha is inverse coverage and preserves original RGB under full transparency", image.pixel(256,240).join() === '180,100,20,0' && image.pixel(600,20).join() === '180,100,20,255');
  // 本地导出不应上传；真实工作流上传另由共用队列专项覆盖。
  // 同时检查旧验证控件已移除，避免隐藏的入口继续制造远端副作用。
  smoke.check("Standalone export does not upload and obsolete validation controls are absent", uploads.length===0 && await run("!document.querySelector('[data-mask-upload]')&&!document.querySelector('[data-mask-upload-result]')"));
  await click("[data-mask-mode=erase]"); await draw(.4,.5);
  smoke.check("Eraser removes coverage without altering original RGB", (await exportsPixels())[0].pixel(256,240)[0] === 0);
  await click("[data-mask-action=undo]"); smoke.check("Undo restores erased coverage", (await exportsPixels())[0].pixel(256,240)[0] === 255);
  await click("[data-mask-action=redo]"); smoke.check("Redo restores erasing", (await exportsPixels())[0].pixel(256,240)[0] === 0);
  await click("[data-mask-settings]");
  await run("(()=>{const el=document.querySelector('[data-mask-color]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'#000000');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await click("[data-mask-settings]");
  await click("[data-mask-mode=draw]"); await draw(.7,.3);
  smoke.check("Black display color still exports a white mask", (await exportsPixels())[0].pixel(448,144)[0] === 255);
  await click("[data-mask-action=clearCanvas]"); smoke.check("Clear returns the mask to black", (await exportsPixels())[0].pixel(448,144)[0] === 0);
  await click("[data-theme-trigger]"); await click("[data-theme-option=dark]");
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme: dark)').matches");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  win.setSize(390,844); await delay(300);
  await draw(.5,.5);
  smoke.check("Narrow viewport retains original-coordinate brush alignment", (await exportsPixels())[0].pixel(320,240)[0] === 255);
  smoke.check("Mask editor follows the actual native dark theme", await hasDarkForeground('[data-mask-editor]'));
  smoke.check("Mask editor fits narrow viewport without horizontal overflow", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-mask-editor]').getBoundingClientRect().right<=innerWidth"));
  await run("document.querySelector('[data-mask-editor]').scrollTop=0");
  fs.writeFileSync(path.join(root,"mask-narrow-dark.png"),(await win.webContents.capturePage()).toPNG());
}
async function verifyModelScroll() {
  win.setSize(1300,900); await delay(300);
  await click("[data-theme-trigger]"); await click("[data-theme-option=light]");
  await wait("document.documentElement.dataset.theme==='light'&&!matchMedia('(prefers-color-scheme: dark)').matches");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  await wait("!document.documentElement.classList.contains('theme-ripple')");
  await run("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='图片').click()");
  await wait("document.querySelector('[data-extension-picker-trigger]')"); await click("[data-extension-picker-trigger]");
  await wait("document.querySelector('[data-lora-model-picker]')");
  smoke.check("Only one selection switch exists and sits left of search", await run("(()=>{const b=document.querySelector('[data-resource-selection-mode]'),s=document.querySelector('[data-resource-dialog] input');return document.querySelectorAll('[data-resource-selection-mode]').length===1&&b.getAttribute('aria-checked')==='false'&&b.getBoundingClientRect().right<s.getBoundingClientRect().left})()"));
  await click("[data-lora-model-picker]"); await wait("document.querySelector('[data-resource-model-scroll]')");
  smoke.check("Nested model dialog has no selection switch", await run("!document.querySelector('[aria-labelledby=model-version-dialog-title] [data-resource-selection-mode]')"));
  await wait("[...document.querySelectorAll('[data-resource-model-scroll] img')].every(img=>img.complete&&img.naturalWidth>0)");
  smoke.check("Every nested card retains its full 4:5 cover including distant rows", await run("[...document.querySelectorAll('[data-resource-model-option]')].every(el=>{const r=el.children[0].getBoundingClientRect();return r.height>100&&Math.abs(r.height/r.width-1.25)<.02})"));
  const bounds = await run("(()=>{const e=document.querySelector('[data-resource-model-scroll]'),r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.top+80),overflow:e.scrollHeight>e.clientHeight}})()");
  smoke.check("Model list overflows inside a dedicated scroll container", bounds.overflow);
  win.webContents.sendInputEvent({ type:"mouseMove", x:bounds.x, y:bounds.y }); await delay(100);
  win.webContents.sendInputEvent({ type:"mouseWheel", x:bounds.x, y:bounds.y, deltaY:-500, deltaX:0, canScroll:true }); await delay(300);
  smoke.check("Actual mouse wheel scrolls model dialog", await run("document.querySelector('[data-resource-model-scroll]').scrollTop>0"));
  fs.writeFileSync(path.join(root,"model-dialog-scroll.png"),(await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('[data-resource-model-scroll]').scrollTop=0");
  const first = await run("document.querySelector('[data-resource-model-option]').getAttribute('data-resource-model-option')");
  await click("[data-resource-model-option] [data-resource-model-select]");
  smoke.check("Single selection closes child and awaits outer confirm", await run("!document.querySelector('[data-resource-model-scroll]')&&Boolean(document.querySelector('[data-resource-confirm]'))"));
  smoke.check("Selected badge clears the toolbar divider", await run("(()=>{const e=document.querySelector('[data-resource-dialog] .group'),badge=e.querySelector('span.absolute'),toolbar=document.querySelector('[data-resource-selection-mode]').parentElement.parentElement.parentElement;return !badge||badge.getBoundingClientRect().top>toolbar.getBoundingClientRect().bottom})()"));
  await click("[data-resource-confirm]");
  smoke.check("Selection returns original model ID to the image adapter", await run(`document.querySelector('[data-selected-extension]')?.getAttribute('data-selected-extension')===${JSON.stringify(first)}`));
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  const bitmap = Buffer.alloc(640*480*4); for (let i=0;i<bitmap.length;i+=4) {bitmap[i]=20;bitmap[i+1]=100;bitmap[i+2]=180;bitmap[i+3]=255;}
  const png = nativeImage.createFromBitmap(bitmap,{width:640,height:480}).toPNG(); fs.writeFileSync(path.join(root,"source.png"),png);
  for(let i=0;i<12;i++){const folder=path.join(modelsRoot,"loras","Anima","Style",`Model ${i}`);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,`model-${i}.safetensors`),'fixture');fs.writeFileSync(path.join(folder,'logo.png'),png);}
  win = new BrowserWindow({ ...windowChromeOptions(), show:false,width:1500,height:980,webPreferences:{additionalArguments:windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/src/preload/index.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false} });
  // 蒙版导出的正式Blob仍参与像素读取，只拦截下载对话框的系统副作用。
  // Canny下载具有自己的保存路径验证，按文件名前缀保留该独立检查。
  win.webContents.session.on('will-download',(event,item)=>{if(item.getFilename().startsWith('mask_'))event.preventDefault();});
  win.webContents.on('console-message',event=>{if(event.level==='error'&&/React|hydration|render|Minified/i.test(event.message))errors.push(event.message);});
  try {
    await win.loadURL(process.env.SMOKE_CREATE_URL || 'app://app/create');await wait("document.querySelector('[data-generate-button]')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");await click("[aria-labelledby=update-announcement-title] button");
    await verifyNavigation(); await verifyCannyInput(); await verifyCannyLayout();
    await verifyMasks();await verifyModelScroll();smoke.check("No React render or hydration errors",errors.length===0);
    console.log('Visual artifacts: '+root);
  } finally {win.destroy();}
  smoke.finish({app,ok:smoke.allPassed()});
}
main().catch(error=>{console.error(error.message);win?.destroy();smoke.finish({app,ok:false});});
