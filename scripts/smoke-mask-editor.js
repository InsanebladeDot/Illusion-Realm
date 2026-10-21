/** Real pointer mask drawing / erasing, PNG pixel contract, upload and resource-card scroll regression. */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), zlib = require("node:zlib");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/window-chrome");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "mask-editor", timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-mask-ui-")), modelsRoot = path.join(root, "models");
const settings = { paths: { searchPath: modelsRoot }, theme: "light" }, errors = [], uploads = [];
let win;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/userData").readUserData = () => ({ data: { settings } });
require("../apps/electron/ipc-handlers/models.handlers").registerModelHandlers();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession({ settings }), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.MODELS_DOWNLOAD_LIST, () => []);
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
async function exportsPixels(upload = false) {
  await click(upload ? "[data-mask-upload]" : "[data-mask-export]");
  await wait("document.querySelector('[data-mask-preview=mask]')?.complete&&document.querySelector('[data-mask-preview=mask]')?.naturalWidth===640&&!document.querySelector('[data-mask-export]').disabled");
  const bytes = await run("Promise.all(['mask','image'].map(async kind=>[...new Uint8Array(await(await fetch(document.querySelector('[data-mask-preview='+kind+']').src)).arrayBuffer())]))");
  return bytes.map(decodePng);
}
async function verifyNavigation() {
  smoke.check("Settings replaces toolbox in nav; profile, toolbox and updates leave nav", await run("Boolean(document.querySelector('nav[aria-expanded] a[href=\"/settings\"]'))&&![...document.querySelectorAll('nav[aria-expanded] a')].some(a=>['/profile','/tools','/updates'].includes(a.getAttribute('href')))"));
  await click("[data-account-menu-trigger]");
  smoke.check("Avatar menu retains profile and language, adds tools and updates, removes settings", await run("(()=>{const m=document.querySelector('[data-sidebar-account-menu]');return ['/profile','/tools','/updates'].every(h=>m.querySelector('a[href=\"'+h+'\"]'))&&!m.querySelector('a[href=\"/settings\"]')&&Boolean(m.querySelector('[data-language-trigger]'))})()"));
  await click("[data-sidebar-account-menu] a[href='/tools']"); await wait("location.pathname==='/tools'");
  smoke.check("Toolbox menu entry navigates and dismisses account menu", await run("!document.querySelector('[data-sidebar-account-menu]')"));
  await click("nav[aria-expanded] a[href='/create']"); await wait("document.querySelector('[data-canny-enable]')");
  await wait("!document.documentElement.classList.contains('page-transition')");
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
  smoke.check("Edge detection is disabled by default", await run("!document.querySelector('[data-canny-panel]')&&document.querySelector('[data-canny-enable]').getAttribute('aria-checked')==='false'"));
  await click("[data-advanced-settings-toggle]"); await click("[data-canny-enable]");
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
  await click("[data-canny-invert]");
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
async function verifyCannyLayout() {
  await run("document.querySelector('[data-canny-panel]').scrollIntoView({block:'start'})");
  smoke.check("Wide rail displays original and result side by side", await run("(()=>{const a=document.querySelector('[data-canny-source]').getBoundingClientRect(),b=document.querySelector('[data-canny-result]').getBoundingClientRect();return b.left>a.right&&Math.abs(a.top-b.top)<2})()"));
  fs.writeFileSync(path.join(root,"canny-wide-light.png"),(await win.webContents.capturePage()).toPNG());
  await click("[data-theme-trigger]"); await click("[data-theme-option=dark]");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  win.setSize(320,720); await delay(350);
  await run("document.querySelector('[data-canny-panel]').scrollIntoView({block:'start'})");
  smoke.check("Narrow rail stacks image panes and keeps all content within viewport", await run("(()=>{const a=document.querySelector('[data-canny-source]').getBoundingClientRect(),b=document.querySelector('[data-canny-result]').getBoundingClientRect(),p=document.querySelector('[data-canny-panel]');return b.top>=a.bottom&&p.scrollWidth<=p.clientWidth&&document.documentElement.scrollWidth<=innerWidth})()"));
  smoke.check("Dark theme reaches edge detection panel", await run("getComputedStyle(document.querySelector('[data-canny-panel]')).color==='rgb(237, 237, 237)'"));
  fs.writeFileSync(path.join(root,"canny-narrow-dark.png"),(await win.webContents.capturePage()).toPNG());
  await click("[data-canny-source] button[aria-label]");
  smoke.check("Removing original clears original and processed preview", await run("!document.querySelector('[data-canny-source] img')&&!document.querySelector('[data-canny-preview]')&&!document.querySelector('[data-canny-output]')"));
  win.setSize(1500,980); await delay(200);
  await click("[data-theme-trigger]"); await click("[data-theme-option=light]");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
}
async function verifyMasks() {
  await run("[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Edit')).click()"); await wait("document.querySelector('[data-mask-editor]')");
  const bytes = [...fs.readFileSync(path.join(root, "source.png"))];
  await run(`(()=>{const el=document.querySelector('[data-mask-import]'),d=new DataTransfer();d.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],'source.png',{type:'image/png'}));el.files=d.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('[data-mask-surface]')?.getBoundingClientRect().width>200");
  const [empty] = await exportsPixels();
  smoke.check("An empty mask is black and exports at original 640 × 480 dimensions", empty.width === 640 && empty.height === 480 && empty.pixel(320,240).join() === '0,0,0,255');
  await draw(.2,.5,.6);
  const [mask, image] = await exportsPixels(true);
  smoke.check("Painted pixels are white; untouched pixels are black", mask.pixel(256,240).join() === '255,255,255,255' && mask.pixel(600,20).join() === '0,0,0,255');
  smoke.check("ComfyUI alpha is inverse coverage and preserves original RGB under full transparency", image.pixel(256,240).join() === '180,100,20,0' && image.pixel(600,20).join() === '180,100,20,255');
  const uploaded = decodePng(Buffer.from(uploads.at(-1).dataBase64,'base64'));
  smoke.check("Existing upload bridge sends alpha PNG and displays LoadImage MASK output reference", uploaded.pixel(256,240)[3] === 0 && await run("(()=>{const j=JSON.parse(document.querySelector('[data-mask-upload-result]').textContent);return j.MASK[1]===1&&j.maskInput.inputs.image.startsWith('mask-fixture/')})()"));
  await click("[data-mask-mode=erase]"); await draw(.4,.5);
  smoke.check("Eraser removes coverage without altering original RGB", (await exportsPixels())[0].pixel(256,240)[0] === 0);
  await click("[data-mask-action=undo]"); smoke.check("Undo restores erased coverage", (await exportsPixels())[0].pixel(256,240)[0] === 255);
  await click("[data-mask-action=redo]"); smoke.check("Redo restores erasing", (await exportsPixels())[0].pixel(256,240)[0] === 0);
  await run("(()=>{const el=document.querySelector('[data-mask-color]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'#000000');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await click("[data-mask-mode=draw]"); await draw(.7,.3);
  smoke.check("Black display color still exports a white mask", (await exportsPixels())[0].pixel(448,144)[0] === 255);
  await click("[data-mask-action=clearCanvas]"); smoke.check("Clear returns the mask to black", (await exportsPixels())[0].pixel(448,144)[0] === 0);
  await click("[data-theme-trigger]"); await click("[data-theme-option=dark]");
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme: dark)').matches");
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  win.setSize(390,844); await delay(300);
  await draw(.5,.5);
  smoke.check("Narrow viewport retains original-coordinate brush alignment", (await exportsPixels())[0].pixel(320,240)[0] === 255);
  smoke.check("Mask editor follows the actual native dark theme", await run("matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('[data-mask-editor]')).color==='rgb(237, 237, 237)'"));
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
  win = new BrowserWindow({ ...windowChromeOptions(), show:false,width:1500,height:980,webPreferences:{additionalArguments:windowChromeArguments(),offscreen:true,preload:path.join(__dirname,"../apps/electron/preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false} });
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
