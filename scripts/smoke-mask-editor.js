/** Real pointer mask drawing / erasing, PNG pixel contract, upload and resource-card scroll regression. */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), zlib = require("node:zlib");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "mask-editor", timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-mask-ui-")), modelsRoot = path.join(root, "models");
const settings = { paths: { searchPath: modelsRoot }, theme: "light" }, errors = [], uploads = [];
let win;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
require("../apps/electron/userData").readUserData = () => ({ data: { settings } });
require("../apps/electron/ipc-handlers/models.handlers").registerModelHandlers();
require("../apps/electron/ipc-handlers/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: { settings }, filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
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
  throw new Error("Mask UI timeout: " + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function draw(x, y, endX = x) {
  const bounds = await run("(()=>{const el=document.querySelector('[data-mask-surface]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
  const point = value => ({ x: Math.round(bounds.x + bounds.w * value), y: Math.round(bounds.y + bounds.h * y) });
  win.webContents.sendInputEvent({ type: "mouseMove", ...point(x) });
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point(x) });
  for (let i = 1; i <= 8; i++) { win.webContents.sendInputEvent({ type: "mouseMove", ...point(x + (endX - x) * i / 8) }); await delay(15); }
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
  win = new BrowserWindow({ show:false,width:1500,height:980,webPreferences:{offscreen:true,preload:path.join(__dirname,"../apps/electron/preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false} });
  win.webContents.on('console-message',event=>{if(event.level==='error'&&/React|hydration|render|Minified/i.test(event.message))errors.push(event.message);});
  try {
    await win.loadURL('app://app/create');await wait("document.querySelector('[data-generate-button]')");
    await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");await click("[aria-labelledby=update-announcement-title] button");
    await verifyMasks();await verifyModelScroll();smoke.check("No React render or hydration errors",errors.length===0);
    console.log('Visual artifacts: '+root);
  } finally {win.destroy();}
  smoke.finish({app,ok:smoke.allPassed()});
}
main().catch(error=>{console.error(error.message);win?.destroy();smoke.finish({app,ok:false});});
