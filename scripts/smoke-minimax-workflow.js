/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * window-chrome：复用同一份窗口装饰配置与启动参数。
 * protocol：使用客户端的 app:// 与 localfile:// 协议实现。
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * window.handlers：窗口和主题 IPC 隶属 core 的系统交互边界。
 * proxy：复用 ComfyUI 代理进行上传、模型查询或生成。
 * index：窗口加载迁移后的真实 preload 桥接文件。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * window-chrome：窗口样式和传给 preload 的标记必须配套，不能各自猜测当前装饰模式。
 * protocol：Next 静态资源含绝对 URL，必须保持应用同源加载。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * window.handlers：handler 仍通过统一结果封装注册，不因移动改变参数和错误码。
 * proxy：ComfyUI 是独立的生成服务，不等同于账户后端。
 * index：contextIsolation 保持启用，CommonJS 本地依赖仍需要 sandbox 为 false。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 * window-chrome：标题栏参数仍由主进程传入，渲染层不直接调用 Electron。
 * protocol：协议定位失败属于资源路径问题，应先于界面样式判断排查。
 * user-data：读文档时的路径解析继续委托统一根目录，不能改成模块旁的文件。
 * window.handlers：主题通知与窗口操作属于不同注册函数，使用时应保留原调用范围。
 * proxy：生成和文件下载的失败语义继续由代理汇总给 IPC 调用方。
 */
/** Exercise Minimax defaults, loader overrides, local picking and two-frame uploads through the production renderer and real preload. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/src/common/ipc-channels");
const { registerHandle } = require("../apps/electron/src/main/ipc/result");
const { windowChromeOptions, windowChromeArguments } = require("../apps/electron/src/main/core/windows/window-chrome");
// 尺寸专项使用独立名称，日志中的绿灯不能被误读为整套视频回归通过。
// 两个模式仍使用同一个护栏，异常和断言失败都返回非零退出码。
// 这里只改变报告名称，不改变完整模式的检查范围或超时约定。
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: process.argv.includes("--loaders-only") ? "workflow-loaders" : process.argv.includes("--resolution-only") ? "minimax-resolution" : "minimax-workflow", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-minimax-ui-"));
smoke.setWorkDir(root);
const modelsRoot = path.join(root, "models");
const template = JSON.parse(fs.readFileSync(path.join(__dirname, "../apps/next/src/data/comfy/videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json"), "utf8"));
const referenceTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "../apps/next/src/data/comfy/videoWorkflower/minnimax/minimax h3 参考视频.json"), "utf8"));
const unet = "Minimax\\Local Model\\custom-unet.safetensors";
const alternatives = { "105:6": unet, "105:13": "Other\\custom-clip.safetensors", "105:11": "Other\\video-vae.safetensors", "105:24": "Other\\audio-vae.safetensors", "105:121": "Minimax\\turbo-a.safetensors", "105:133": "Minimax\\turbo-b.safetensors" };
const loaderKeys = { UNETLoader: "unet_name", CLIPLoader: "clip_name", VAELoader: "vae_name", LoraLoaderModelOnly: "lora_name" };
const responses = { checkpoints: [], loras: [alternatives["105:121"], alternatives["105:133"], "Anima\\wrong-lora.safetensors"], diffusion_models: [unet, "Anima\\anima.safetensors"], clip: [], text_encoders: [alternatives["105:13"]], vae: [alternatives["105:11"], alternatives["105:24"]] };
for (const node of [...Object.values(template), ...Object.values(referenceTemplate)]) {
  const category = { UNETLoader: "diffusion_models", CLIPLoader: "text_encoders", VAELoader: "vae", LoraLoaderModelOnly: "loras" }[node.class_type];
  if (category) responses[category].push(node.inputs[loaderKeys[node.class_type]]);
}
responses.loras.push('Minimax\\Turbo\\Adapter\\turbo-local.safetensors', 'Minimax\\Turbo\\Second Adapter\\second.safetensors');
responses.diffusion_models.push('Minimax\\Style\\First Model\\first.safetensors', 'Minimax\\Style\\Second Model\\second-unet.safetensors');
const requests = [], prompts = [], uploads = [], errors = [];
let server, win, modelListCalls = 0, failLists = false;
let imageExtensionUi, imageParameterUi, imageSizeUi, videoFixtureBytes;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/src/main/core/protocol").registerAppProtocol();
const settings = { paths: { searchPath: modelsRoot, diffusionModelsPath: path.join(modelsRoot, "diffusion_models") }, theme: "light", outputPath: root };
require("../apps/electron/src/main/storage/user-data").readUserData = () => ({ data: { settings } });
require("../apps/electron/src/main/modules/models/models.handlers").registerModelHandlers();
require("../apps/electron/src/main/core/windows/window.handlers").registerThemeHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require("./lib/guest-session-fixture").withGuestSession({ settings }), filePath: "", isNew: false }));
registerHandle(C.USER_DATA_WRITE, () => undefined);
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => "");
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => root);
registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
registerHandle(C.CHANGELOG_READ, () => "");
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: "UNAUTHORIZED" } }));
registerHandle(C.MODELS_DOWNLOAD_LIST, () => []);
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, protection: "", tail: "" }));
registerHandle(C.COMFY_LIST_MODELS, async () => { modelListCalls++; if (failLists) throw new Error("fixture-unavailable"); return require("../apps/electron/src/main/modules/comfy/proxy").listComfyModels(`127.0.0.1:${server.address().port}`); });
registerHandle(C.COMFY_UPLOAD_IMAGE, (_event, _address, file) => { uploads.push(file); return require("../apps/electron/src/main/modules/comfy/proxy").uploadImageToComfy(`127.0.0.1:${server.address().port}`, file); });
registerHandle(C.COMFY_GENERATE, (_event, prompt) => { prompts.push(prompt); return { promptId: `fixture-${prompts.length}`, images: [], videos: [] }; });
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, file) => fs.existsSync(file) ? "data:image/png;base64," + fs.readFileSync(file).toString("base64") : null);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (source) => win.webContents.executeJavaScript(source, true);
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(100); }
  throw new Error("Minimax UI timeout: " + source);
}
async function click(selector) { await require("./lib/sidebar-menu-fixture").revealSidebarPreference(run, selector); await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
async function dismissAnnouncement() {
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await click("[aria-labelledby=update-announcement-title] button");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  smoke.check("Announcement is dismissed before interacting with video controls", true);
}
async function captureSettings(name, selector = "[data-video-model-toggle]") {
  await run(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);
  await delay(500);
  fs.writeFileSync(path.join(root, name), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
async function verifyPointerSelection() {
  const bounds = await run("(()=>{const el=document.querySelector('[data-video-model-slot=\"105:13\"] button[aria-haspopup=listbox]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  await delay(100);
  win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...bounds });
  win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...bounds });
  await wait("document.querySelector('[role=listbox]')");
  smoke.check("Model dropdown is reachable by real pointer input without an overlay", true);
  smoke.check("CLIP dropdown includes locally scanned text_encoders", await run("document.querySelector('[role=listbox]').textContent.includes('local-clip')"));
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
}
async function upload(selector, name, mime = 'image/png') {
  const bytes = [...nativeImage.createFromBitmap(Buffer.from([20, 100, 180, 255]), { width: 1, height: 1 }).toPNG()];
  await run(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const data=new DataTransfer();data.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],${JSON.stringify(name)},{type:${JSON.stringify(mime)}}));el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await delay(100);
}
async function importMediaBatch(files, drop = false) {
  const selector = '[data-reference-import]';
  await wait(`document.querySelector('${selector}')`);
  const bytes = [...nativeImage.createFromBitmap(Buffer.from([20, 100, 180, 255]), { width: 1, height: 1 }).toPNG()];
  await run(`(()=>{const el=document.querySelector('${selector}'),data=new DataTransfer();for(const [name,mime] of ${JSON.stringify(files)})data.items.add(new File([new Uint8Array(mime.startsWith('video/')?${JSON.stringify(videoFixtureBytes)}:${JSON.stringify(bytes)})],name,{type:mime}));if(${drop})document.querySelector('[data-reference-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));else{el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await delay(100);
}
async function removeReference(kind, number) {
  await click(`[data-reference-kind=${kind}][data-reference-number="${number}"] [data-reference-remove]`);
}
// 真实浏览器录制小视频，验证解码首帧；不能把 PNG 改名成视频来冒充成功。
async function createVideoFixture() {
  return run(`new Promise((resolve,reject)=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
    const context=canvas.getContext('2d');context.fillStyle='rgb(20,100,180)';context.fillRect(0,0,64,48);
    const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
    const timer=setTimeout(()=>{track.stop();reject(new Error('Video fixture timed out'))},3000);
    recorder.ondataavailable=event=>chunks.push(event.data);
    recorder.onerror=()=>{clearTimeout(timer);track.stop();reject(new Error('Video fixture recording failed'))};
    recorder.onstop=async()=>{clearTimeout(timer);track.stop();try{resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())])}catch(error){reject(error)}};
    recorder.start();track.requestFrame();
    setTimeout(()=>{context.fillStyle='rgb(200,40,60)';context.fillRect(0,0,64,48);track.requestFrame()},120);
    setTimeout(()=>recorder.stop(),250);
  })`);
}
async function submit() {
  const before = prompts.length;
  await run("document.querySelector('[data-video-create-panel]').requestSubmit()");
  for (let i = 0; i < 100 && prompts.length === before; i++) await delay(50);
  if (prompts.length !== before + 1) throw new Error("Video prompt was not submitted");
  await wait("!document.querySelector('[data-video-create-panel] button[type=submit]').disabled");
  return prompts.at(-1);
}
function assertDefaults(prompt) {
  for (const [id, node] of Object.entries(template)) {
    const key = loaderKeys[node.class_type];
    if (key && node.class_type !== 'LoraLoaderModelOnly') smoke.check(`Default loader ${id} matches the workflow exactly`, prompt[id].inputs[key] === node.inputs[key]);
  }
  for (const id of ["105:15", "105:91", "105:107", "105:111"]) assert.deepEqual(prompt[id], template[id]);
  assert.equal(prompt['105:104'].inputs.width, template['105:104'].inputs.width);
  assert.equal(prompt['105:104'].inputs.height, template['105:104'].inputs.height);
  assert.equal(prompt['105:9'].inputs.steps, template['105:9'].inputs.steps);
  verifyLoraChain(prompt, 0);
  smoke.check("Resolution, duration, seed, sampling and audio/video wiring remain template defaults", true);
}
async function verifyDefaults() {
  smoke.check("Model settings start collapsed and do not request lists", await run("!document.querySelector('[data-video-model-settings]')&&document.querySelector('[data-video-model-toggle]').getAttribute('aria-expanded')==='false'") && modelListCalls === 0);
  smoke.check("Video main model uses the shared cover button rather than the workflow card", await run("Boolean(document.querySelector('[data-video-local-unet] button[aria-haspopup=dialog]'))"));
  smoke.check("Video starts without template LoRAs and users add extensions themselves", await run("document.querySelectorAll('[data-video-loras] [data-selected-extension]').length===0"));
  assert.deepEqual(await extensionUiSnapshot(), imageExtensionUi);
  smoke.check("Image and video use identical extension button markup, typography, colors and sizing", true);
  await captureSettings("minimax-shared-extensions.png", "[data-video-loras]");
  await setPrompt('A character walks towards the door.');
  await upload("[data-video-create-panel] input[type=file]", "first.png");
  const prompt = await submit(); assertDefaults(prompt);
  smoke.check("First-frame-only mode omits last_frame instead of duplicating the first image", prompt["114"].inputs.image === "frames/uploaded-1.png" && !prompt['105:104'].inputs.last_frame && await run("!document.querySelector('[data-video-last-frame]')"));
  smoke.check("User prompt replaces the sample and writes the actual MiniMax node", prompt["105:104"].inputs.prompt === "A character walks towards the door.");
  await click('[data-video-frame-mode=both]');
  smoke.check("First and last upload slots share the same row", await run("(()=>{const a=document.querySelector('[data-video-first-frame]').getBoundingClientRect(),b=document.querySelector('[data-video-last-frame]').getBoundingClientRect();return Math.abs(a.y-b.y)<1&&a.right<=b.left})()"));
  await upload("[data-video-last-frame] input[type=file]", "first.png");
  const separate = await submit();
  const lastId = separate['105:104'].inputs.last_frame[0];
  smoke.check("Updated template dynamically creates a last-frame input with independent uploads", separate["114"].inputs.image === "frames/uploaded-2.png" && separate[lastId].inputs.image === "frames/uploaded-3.png" && uploads.at(-1).filename.startsWith("last_") && uploads.at(-1).filename !== uploads.at(-2).filename);
}
async function setPrompt(text) {
  await run(`(()=>{const el=document.querySelector('[data-video-prompt]');el.textContent=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
}
function extensionUiSnapshot() {
  return run("(()=>{const button=document.querySelector('[data-extension-picker-trigger]');return [...button.querySelectorAll('*'),button].map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,classes:el.getAttribute('class'),fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius,height:s.height}})})()");
}
function parameterUiSnapshot() {
  return run("(()=>{const row=document.querySelector('[data-generation-parameter=steps]');return [row,...row.querySelectorAll('*')].map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,classes:el.getAttribute('class'),fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,borderColor:s.borderColor,borderRadius:s.borderRadius,gap:s.gap,padding:s.padding,width:el.matches('input[type=number]')?s.width:null}})})()");
}
async function sizeUiSnapshot() {
  // 比对元素、排序后的属性和实际样式；SSR 的注释与属性顺序不属于 UI 差异。
  // 真实点击素材菜单后指针会留在尺寸按钮上，先移出，确保两侧比较的都是非 hover 状态。
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 0, y: 0 }); await delay(350);
  return run("(()=>{const root=document.querySelector('[data-size-selector]');return [root,...root.querySelectorAll('*')].map(el=>{const s=getComputedStyle(el);return {tag:el.tagName,text:el.textContent,attributes:[...el.attributes].filter(a=>a.name!=='style').map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0])),value:el instanceof HTMLInputElement?el.value:null,color:s.color,background:s.backgroundColor,fontSize:s.fontSize,borderRadius:s.borderRadius}})})()");
}
async function chooseSlot(id, name) {
  await click(`[data-video-model-slot="${id}"] button[aria-haspopup=listbox]`);
  await run(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent===${JSON.stringify(name)}).click()`); await delay(100);
}
async function setParameter(name, value) {
  await run(`(()=>{const el=document.querySelector('[data-video-generation-settings] [data-generation-parameter="${name}"] input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(value))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(100);
}
async function verifyGenerationParameters() {
  await click('[data-video-create-panel] [data-advanced-settings-toggle]');
  assert.deepEqual(await parameterUiSnapshot(), imageParameterUi);
  smoke.check("Image and video reuse the complete parameter row with identical labels, hints, slider colors and input sizing", true);
  smoke.check("Advanced settings read the new four-step template and hide total frame count", await run("[...document.querySelectorAll('[data-video-generation-settings] input[type=number]')].map(el=>el.value).join(',')==='4,24,5'&&!document.querySelector('[data-generation-parameter=frames]')"));
  smoke.check("Frame summary displays the aligned actual video length", await run("document.querySelector('[data-video-frame-summary]').textContent.includes('5.17')"));
  await setParameter('steps', 8); await setParameter('fps', 30); await setParameter('duration', 2.5);
  const timed = await submit();
  smoke.check("Generation steps update the new inline BasicScheduler value", timed['105:9'].inputs.steps === 8);
  smoke.check("FPS affects both output playback and frame-count computation", timed['105:91'].inputs.fps === 30 && timed['105:107'].inputs.expression === template['105:107'].inputs.expression.replaceAll('a * 24', 'a * 30'));
  smoke.check("Video duration reaches the existing primitive and computes aligned actual duration internally", timed['105:111'].inputs.value === 2.5 && await run("document.querySelector('[data-video-frame-summary]').textContent.includes('3.00')"));
  await setParameter('fps', 120); await setParameter('duration', 60);
  const limited = await submit();
  smoke.check("High FPS clamps duration to the official frame limit instead of submitting an invalid length", limited['105:111'].inputs.value <= 3592 / 120);
  await click('[data-video-parameters-reset]'); assertDefaults(await submit());
  await captureSettings('minimax-generation-settings.png', '[data-video-generation-settings]');
}
async function verifyImageReferences() {
  const raw = '@image1 @图1 @Image1 IMAGE1 @image2';
  await setPrompt(raw);
  smoke.check("Image aliases render blue inline references with text-sized thumbnails", await run("document.querySelectorAll('[data-video-prompt] [data-image-reference]').length===5&&[...document.querySelectorAll('[data-video-prompt] [data-image-reference] img')].every(el=>Math.abs(el.getBoundingClientRect().height-parseFloat(getComputedStyle(el).fontSize))<1)"));
  smoke.check("Decorating references preserves their plain-text spelling", await run(`document.querySelector('[data-video-prompt]').textContent===${JSON.stringify(raw)}`));
  // 视频预览与新音频入口使用同一个展示组件，先用首尾帧别名检查转换。
  // 只读内容必须保留五个引用，不能修改或去重用户正在编辑的正文。
  // 原稿仍是 raw，展开结果应是技能要求的 Picture 大写与空格格式。
  // 通过真实 details 点击验证展示，不能只读转换函数返回值代替界面。
  // 生成尚未发生，预览动作不能上传首尾帧或提交任务。
  await click('[data-video-create-panel] [data-prompt-conversion] summary');
  smoke.check('Video conversion preview matches the exact submitted H3 markers', await run("document.querySelector('[data-video-create-panel] [data-prompt-conversion-text]').textContent==='<Picture 1> <Picture 1> <Picture 1> <Picture 1> <Picture 2>'"));
  await click('[data-video-prompt] [data-image-reference="2"]');
  await wait("document.querySelector('[aria-label=关闭预览]')");
  smoke.check("Reference opens the existing gallery with the last frame selected", await run("Boolean(document.querySelector('[aria-label=关闭预览]'))"));
  await click('[aria-label=关闭预览]');
  const prompt = await submit();
  smoke.check("Reference aliases normalize to official Picture markers only when submitted", prompt['105:104'].inputs.prompt === '<Picture 1> <Picture 1> <Picture 1> <Picture 1> <Picture 2>');
  await captureSettings('minimax-image-references.png', '[data-video-frame-inputs]');
  await click('[data-video-frame-mode=first]');
  const before = prompts.length;
  await run("document.querySelector('[data-video-create-panel]').requestSubmit()"); await delay(200);
  smoke.check("Disabled last-frame reference blocks submission instead of referencing an absent image", prompts.length === before && await run("document.body.textContent.includes('第 2 张图片尚未上传')"));
  await setPrompt('A character walks towards the door.');
  smoke.check("Switching back to first frame retains the last upload without using it", !(await submit())['105:104'].inputs.last_frame);
  await click('[data-video-frame-mode=both]');
  smoke.check("Switching back to two frames restores the uploaded last-frame slot", await run("Boolean(document.querySelector('[data-video-last-frame] img'))"));
}
async function verifyPromptEditing() {
  await setPrompt('prefix suffix');
  await run("(()=>{const el=document.querySelector('[data-video-prompt]');el.focus();const r=document.createRange();r.setStart(el.firstChild,7);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);})()");
  await win.webContents.insertText('@image1 '); await delay(100);
  smoke.check("Typing a reference mid-sentence preserves the caret and surrounding text", await run("(()=>{const el=document.querySelector('[data-video-prompt]'),r=getSelection().getRangeAt(0).cloneRange();r.selectNodeContents(el);r.setEnd(getSelection().anchorNode,getSelection().anchorOffset);return el.textContent==='prefix @image1 suffix'&&r.toString().length===15})()"));
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))"); await delay(100);
  smoke.check("Undo restores the undecorated original prompt", await run("document.querySelector('[data-video-prompt]').textContent==='prefix suffix'"));
  await run("(()=>{const el=document.querySelector('[data-video-prompt]');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.textContent='中文 @图1';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));})()");
  smoke.check("IME composition is not interrupted by reference decoration", await run("!document.querySelector('[data-video-prompt] [data-image-reference]')"));
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))"); await delay(100);
  smoke.check("Finishing Chinese composition decorates its reference without losing text", await run("document.querySelector('[data-video-prompt]').textContent==='中文 @图1'&&Boolean(document.querySelector('[data-video-prompt] [data-image-reference]'))"));
  const pastedText = JSON.stringify('line1\n@image1');
  await run(`(()=>{const el=document.querySelector('[data-video-prompt]');el.focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);const data=new DataTransfer();data.setData('text/plain',${pastedText});data.setData('text/html','<b>ignored</b>');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}));})()`); await delay(100);
  smoke.check("Multiline paste is plain text and never inserts external HTML", await run(`document.querySelector('[data-video-prompt]').textContent===${pastedText}&&!document.querySelector('[data-video-prompt] b')`));
  await setPrompt('A character walks towards the door.');
}
async function typeMention(text, offset = text.length) {
  await setPrompt(text);
  await run(`(()=>{const el=document.querySelector('[data-video-prompt]');el.focus();const r=document.createRange();r.setStart(el.firstChild,${offset});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
}
async function verifyMediaMentions() {
  await run("document.querySelector('[data-video-prompt]').scrollIntoView({block:'center'})"); await delay(100);
  await typeMention('prefix @ suffix', 8);
  await wait("document.querySelector('[data-prompt-media-menu]')");
  smoke.check("Bare @ opens image/video/audio categories", await run("document.querySelectorAll('[data-prompt-media-category]').length===3&&!document.querySelector('[data-prompt-media-option]')"));
  await click('[data-prompt-media-category=image]');
  smoke.check("At-sign opens a rectangular list of only current-task imported images with thumbnails", await run("document.querySelectorAll('[data-prompt-media-option]').length===2&&document.querySelectorAll('[data-prompt-media-option] img').length===2&&document.querySelector('[data-prompt-media-menu]').parentElement===document.body"));
  fs.writeFileSync(path.join(root, 'minimax-mention-search.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  const bounds = await run("(()=>{const r=document.querySelector('[data-prompt-media-option=\"image-2\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...bounds });
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...bounds }); await delay(100);
  smoke.check("Click inserts the chosen reference at the caret and preserves surrounding text", await run("document.querySelector('[data-video-prompt]').textContent==='prefix @image2 suffix'&&!document.querySelector('[data-prompt-media-menu]')&&Boolean(document.querySelector('[data-image-reference=\"2\"] img'))"));
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))"); await delay(100);
  smoke.check("Mention insertion participates in prompt undo history", await run("document.querySelector('[data-video-prompt]').textContent==='prefix @ suffix'"));
  await typeMention('@尾');
  smoke.check("At-sign searches frame labels", await run("document.querySelectorAll('[data-prompt-media-option]').length===1&&Boolean(document.querySelector('[data-prompt-media-option=\"image-2\"]'))"));
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))"); await delay(100);
  smoke.check("Enter confirms the filtered reference without inserting a newline", await run("document.querySelector('[data-video-prompt]').textContent==='@image2 '&&!document.querySelector('[data-prompt-media-menu]')"));
  await typeMention('@');
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))"); await delay(100);
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))"); await delay(100);
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))"); await delay(100);
  smoke.check("Arrow keys and Tab select the second imported image", await run("document.querySelector('[data-video-prompt]').textContent==='@image2 '"));
  await typeMention('@first');
  smoke.check("Filename search finds imported media", await run("document.querySelectorAll('[data-prompt-media-option]').length===2"));
  await typeMention('@not-found');
  smoke.check("Unmatched searches show an empty state rather than unrelated media", await run("!document.querySelector('[data-prompt-media-option]')&&document.querySelector('[data-prompt-media-menu]').textContent.includes('没有匹配的素材')"));
  await run("document.querySelector('[data-video-prompt]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await delay(100);
  smoke.check("Escape closes suggestions and preserves the query", await run("!document.querySelector('[data-prompt-media-menu]')&&document.querySelector('[data-video-prompt]').textContent==='@not-found'"));
  await click('[data-video-frame-mode=first]'); await typeMention('@');
  await click('[data-prompt-media-category=image]');
  smoke.check("Disabled last-frame mode excludes that image from suggestions", await run("document.querySelectorAll('[data-prompt-media-option]').length===1"));
  await click('[data-video-frame-mode=both]'); await setPrompt('A character walks towards the door.');
}
async function verifyResolution() {
  // 仍使用真实渲染进程和生产选择器，不能只在测试里计算预期宽高。
  // 图片与视频的视觉控件继续复用，但 H3 的提示、上限和步进允许不同。
  // 只比较每个节点的外观属性，避免把新的模型约束误判为样式回归。
  // 文本与输入限制由下方独立断言验证，不再要求错误的“完全同值”。
  // 1:1 两侧均为 1024，比较发生在同一窗口和相同主题下。
  // 结构或字体、颜色、圆角改变仍会导致这组配对对照失败。
  // 比较不移除节点，所以错误增加或丢失一个输入控件仍会报错。
  // 不比较标签文本是因为视频需要说明自身的对齐要求。
  // 不比较 max 属性是因为图片上限 1500 对 H3 并非合法边长。
  // 自定义输入属性在 verifyCustomResolutionLimits 内有明确的固定预期。
  await click('[data-video-resolution] [data-size-preset="1:1"]');
  const visual = ({ tag, color, background, fontSize, borderRadius }) => ({ tag, color, background, fontSize, borderRadius });
  assert.deepEqual((await sizeUiSnapshot()).map(visual), imageSizeUi.map(visual));
  smoke.check("Image and video reuse the size control structure and styling with model-specific limits", true);
  await click('[data-video-resolution] [data-size-preset="16:9"]');
  smoke.check("Default dimensions come directly from the simplified template without MP controls", await run("document.querySelector('[data-video-resolution] [data-size-dimensions]').textContent==='1344 × 768'&&!document.querySelector('[data-generation-parameter=megapixels]')"));
  smoke.check("Compact size slider exposes the 0.1–1 range with 0.1 increments", await run("(()=>{const el=document.querySelector('[data-size-scale] input[type=range]');return el.min==='0.1'&&el.max==='1'&&el.step==='0.1'&&el.getBoundingClientRect().width<=64})()"));
  await setSizeScale(0.5);
  const half = await submit();
  smoke.check("Half scale writes half of the base width and height without losing preset selection", half['105:104'].inputs.width === 672 && half['105:104'].inputs.height === 384 && await run("document.querySelector('[data-size-preset=\"16:9\"]').getAttribute('aria-pressed')==='true'"));
  await setSizeScale(0.1);
  const small = await submit();
  // 最小倍率按基准尺寸直接对齐 32，不能先按图片的 8 像素舍入。
  // 768×0.1 的最近合法值是 64，而不是旧链路产生的 96。
  // 同时核对页面和最终提交，防止界面仍显示 136×80 这样的旧尺寸。
  // 此时仍是 16:9 预设，计算基准为 1344×768，不是上一次半尺寸。
  // 原始宽高比标签保留，并不表示像素舍入后比例一定数学上完全相等。
  // 最小倍率后的重复缩放由后续断言验证，不能累计乘上已经对齐的结果。
  smoke.check("Minimum scale displays the exact 32-aligned dimensions sent to H3", small['105:104'].inputs.width === 128 && small['105:104'].inputs.height === 64 && await run("document.querySelector('[data-size-dimensions]').textContent==='128 × 64'"));
  await setSizeScale(0.5);
  const repeated = await submit();
  smoke.check("Repeated scaling always uses the original dimensions instead of accumulating shrinkage", repeated['105:104'].inputs.width === 672 && repeated['105:104'].inputs.height === 384);
  await setSizeScale(1);
  const full = await submit();
  smoke.check("Full scale restores the exact original dimensions", full['105:104'].inputs.width === 1344 && full['105:104'].inputs.height === 768);
  await click('[data-video-resolution] [data-size-preset="2:3"]');
  const portrait = await submit();
  smoke.check("Choosing a preset writes direct video width/height without a ResolutionSelector", portrait['105:104'].inputs.width === 832 && portrait['105:104'].inputs.height === 1216 && !Object.values(portrait).some(node => node.class_type === 'ResolutionSelector'));
  await click('[data-video-resolution] [data-size-preset="5:6"]');
  const aligned = await submit();
  // 5:6 原始分桶未对齐 32；保留比例按钮，但实际像素须立即显示。
  // 这组对照会发现只改提交层却仍展示 1000×1200 的不一致。
  // 提交保留真实节点定位，不把测试预期注入生产工作流。
  // 1000 距离 992 更近，1200 在中点按既定规则向上取为 1216。
  // 这正好同时覆盖向下和向上取整，避免单纯向下截断也能通过。
  // 预设按钮仍保留训练分桶标注；此处检查的是实际尺寸摘要。
  smoke.check("Unaligned presets immediately display the same aligned dimensions submitted to H3", aligned['105:104'].inputs.width === 992 && aligned['105:104'].inputs.height === 1216 && await run("document.querySelector('[data-size-dimensions]').textContent==='992 × 1216'"));
  await click('[data-video-resolution] [data-size-preset=custom]');
  for (const name of ['width', 'height']) {
    // 数字输入先保留草稿，必须模拟失焦才执行 H3 的范围与对齐校正。
    // 输入事件后等待 React 更新，再 blur，不能用旧回调提交上一次草稿。
    // 这里继续核对最终工作流，不把文本编辑测试替代模型尺寸保护。
      // 513 位于合法范围内但不满足 32 步进，确认校正仍在结束编辑后发生。
      // 两条边分别提交，避免同批输入的旧闭包覆盖已确认的另一条边。
      // 提交任务前已完成 blur，工作流必须读取新尺寸而非之前的预设值。
    await run(`(()=>{const el=document.querySelector('[data-size-dimension=${name}]');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'513');el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
    await run(`document.querySelector('[data-size-dimension=${name}]').blur()`); await delay(40);
  }
  const custom = await submit();
  // 513 用来验证数字输入的自动取整，不依赖键盘 step 自增行为。
  // 自定义状态必须保留，不能通过偷偷切回预设来得到合法尺寸。
  // 下方另外验证最初报错相关的 400，覆盖奇数 latent 边长风险。
  smoke.check("Custom dimensions align in both the form and submitted video node", custom['105:104'].inputs.width === 512 && custom['105:104'].inputs.height === 512 && await run("document.querySelector('[data-size-preset=custom]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-size-dimensions]').textContent==='512 × 512'"));
  await setSizeScale(0.5);
  const customHalf = await submit();
  smoke.check("Custom dimensions can also be proportionally scaled", customHalf['105:104'].inputs.width === 256 && customHalf['105:104'].inputs.height === 256);
  await setSizeScale(1);
  await verifyCustomResolutionLimits();
  await captureSettings('minimax-shared-size.png', '[data-video-resolution]');
  await click('[data-video-resolution] [data-size-preset="16:9"]');
  smoke.check("Returning to a preset resets scale, hides custom inputs and restores workflow dimensions", !await run("document.querySelector('[data-size-dimension]')") && await run("document.querySelector('[data-size-scale] input').value==='1'") && (await submit())['105:104'].inputs.width === template['105:104'].inputs.width);
}
/**
 * 用页面实际输入重现 400×400 的尺寸风险，而非直接修改提交对象。
 * 本脚本拦截生成请求，所以只证明 UI、preload 和工作流参数一致。
 * 不把这项无 GPU 冒烟描述为视频生成成功或画面质量验证。
 * 输入 400 应显示并提交 416，latent 空间边长因此可被 2 整除。
 * step 属性只是提示，脚本还直接输入越界值检查程序层夹取。
 * 1500 必须向下限制为 1472，不能四舍五入到越界的 1504。
 * 最后提交上限画面，保证输入框、尺寸摘要和工作流三者一致。
 * 两个值均通过原生事件进入 React，绕开 HTML 原生有效性拦截。
 * 因此能证明即使用户粘贴越界值，回调也会限制实际参数。
 * 不使用键盘逐字输入，避免把数字输入框的文本编辑行为混入本例。
 * 参考图上传内容在本例保持不变，只验证生成尺寸的安全边界。
 */
async function verifyCustomResolutionLimits() {
  // 使用原生 value setter 触发 React 受控输入，行为与手动编辑一致。
  // 每边分别触发事件，覆盖只改宽或高时保留另一边的回调逻辑。
  // 生成请求通过既有 submit 捕获，不绕过正式的视频参数构建器。
  for (const side of ['width', 'height']) {
    // 数字输入先保留草稿，必须模拟失焦才执行 H3 的范围与对齐校正。
    // 输入事件后等待 React 更新，再 blur，不能用旧回调提交上一次草稿。
    // 这里继续核对最终工作流，不把文本编辑测试替代模型尺寸保护。
      // 400 正是既有 shape 报错的回归尺寸，失焦后应显示并提交 416。
      // 页面摘要和工作流节点由后续同一断言比较，不能只让屏幕看起来合法。
      // 这里只调整提交时机，不放开视频模型的分辨率限制。
    await run(`(()=>{const el=document.querySelector('[data-size-dimension=${side}]');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'400');el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
    await run(`document.querySelector('[data-size-dimension=${side}]').blur()`); await delay(40);
  }
  const aligned = await submit();
  // 摘要和两个输入框都要变为 416，不能只改变其中某一个显示。
  // 约束来自生产组件的 props，新增样式不应覆盖 input 的原生属性。
  // 比较的节点是模板中的真实 H3 节点，不是人为添加的测试节点。
  smoke.check("400px custom dimensions display and submit as 416px with 32px constraints", aligned['105:104'].inputs.width === 416 && aligned['105:104'].inputs.height === 416 && await run("document.querySelector('[data-size-dimensions]').textContent==='416 × 416'&&[...document.querySelectorAll('[data-size-dimension]')].every(el=>el.value==='416'&&el.step==='32'&&el.min==='64'&&el.max==='1472')"));
  for (const side of ['width', 'height']) {
    // 数字输入先保留草稿，必须模拟失焦才执行 H3 的范围与对齐校正。
    // 输入事件后等待 React 更新，再 blur，不能用旧回调提交上一次草稿。
    // 这里继续核对最终工作流，不把文本编辑测试替代模型尺寸保护。
      // 1500 故意超过当前视频表单上限，用户确认后仍须回到 1472。
      // 最大值在正式适配层处理，夹具不先把 1500 替换成预期结果。
      // 大图无限制只属于图片入口，不能随共享草稿控件泄漏到视频。
    await run(`(()=>{const el=document.querySelector('[data-size-dimension=${side}]');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1500');el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
    await run(`document.querySelector('[data-size-dimension=${side}]').blur()`); await delay(40);
  }
  const maximum = await submit();
  // 对最大边界单独断言，避免仅检查“是 32 倍数”却放行 1504。
  // 该上限来自当前产品表单范围，不是宣称 H3 只能生成这么大。
  // 后续测试会切回预设，因此不把此处的超大草稿带到其他断言。
  smoke.check("Custom upper bound stays aligned inside the existing form range", maximum['105:104'].inputs.width === 1472 && maximum['105:104'].inputs.height === 1472 && await run("document.querySelector('[data-size-dimensions]').textContent==='1472 × 1472'"));
}
async function setSizeScale(scale) {
  await run(`(()=>{const el=document.querySelector('[data-size-scale] input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(String(scale))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
}
async function verifyServerNames() {
  const originalClips = [...responses.text_encoders], originalLoras = [...responses.loras];
  const clip = template['105:13'].inputs.clip_name.replace(/^Minimax/, 'minimax');
  const name = 'turbo-local.safetensors';
  const moved = `Minimax\\Relocated\\${name}`;
  responses.text_encoders = originalClips.map((value) => value === template['105:13'].inputs.clip_name ? clip : value);
  responses.loras = originalLoras.filter((value) => value.split('\\').pop() !== name).concat(moved);
  await run("[...document.querySelectorAll('[data-video-model-settings] button')].find(el=>el.textContent.includes('恢复工作流默认')).click()");
  await click('[data-video-loras] [data-extension-picker-trigger]');
  await wait("document.querySelector('[data-lora-model-picker]')");
  await pickLoraModelCard(0); await click('[data-extension-confirm]');
  const resolved = await submit();
  smoke.check("CLIP preserves exact service casing", resolved['105:13'].inputs.clip_name === clip);
  smoke.check("Relocated user LoRA reuses unique basename matching before submission", Object.values(resolved).some(node => node.class_type === 'LoraLoaderModelOnly' && node.inputs.lora_name === moved));
  for (const candidates of [[], [`Minimax\\One\\${name}`, `Minimax\\Two\\${name}`], [`Anima\\${name}`]]) {
    responses.loras = originalLoras.filter((value) => value.split('\\').pop() !== name).concat(candidates);
    const before = prompts.length;
    await run("document.querySelector('[data-video-create-panel]').requestSubmit()");
    await delay(300);
    await wait("!document.querySelector('[data-video-create-panel] button[type=submit]').disabled");
    const label = candidates.length === 1 ? "Matching a basename cannot select an incompatible workflow family" : candidates.length ? "Ambiguous LoRA names prompt exact path selection instead of guessing" : "Missing LoRAs are rejected before ComfyUI submission";
    smoke.check(label, prompts.length === before && await run("document.body.textContent.includes('未在 ComfyUI 中找到')"));
  }
  responses.text_encoders = originalClips; responses.loras = originalLoras;
}
async function verifyOverrides() {
  await click("[data-video-model-toggle]"); await wait("document.querySelector('[data-video-model-settings]')&&!document.querySelector('[data-video-model-refresh]').disabled");
  smoke.check("Lists reuse native ComfyUI model endpoints including text_encoders", requests.includes("/models/diffusion_models") && requests.includes("/models/text_encoders") && requests.includes("/models/vae"));
  smoke.check("Advanced settings contain only CLIP and the two VAEs", await run("document.querySelectorAll('[data-video-model-slot]').length===3&&!document.querySelector('[data-video-model-slot=\"105:6\"]')&&!document.querySelector('[data-video-model-slot=\"105:121\"]')"));
  smoke.check("Auxiliary model labels and paths share one horizontal row without duplicate text", await run("[...document.querySelectorAll('[data-video-model-slot]')].every(row=>{const label=row.querySelector('span'),trigger=row.querySelector('button'),a=label.getBoundingClientRect(),b=trigger.getBoundingClientRect();return !row.querySelector('p')&&Math.abs(a.y+a.height/2-b.y-b.height/2)<2&&a.right<=b.left})"));
  await verifyPointerSelection();
  await captureSettings("minimax-wide-light.png");
  await click("[data-video-local-unet] button"); await wait("document.querySelector('[aria-labelledby=model-select-dialog-title] h3')");
  smoke.check("Local picker reuses Minimax folder under the Anima diffusion root and excludes Anima", await run("document.querySelector('[aria-labelledby=model-select-dialog-title]').textContent.includes('custom-unet')&&!document.querySelector('[aria-labelledby=model-select-dialog-title]').textContent.includes('anima-only')"));
  await verifyMainModelCategory();
  await run("[...document.querySelectorAll('[aria-labelledby=model-select-dialog-title] h3')].find(el=>el.textContent==='Local Model').closest('.group').querySelectorAll('button').forEach(el=>{if(el.textContent.trim()==='选择')el.click()})");
  await click('[data-resource-confirm]');
  await wait("document.querySelector('[data-video-local-unet]').textContent.includes('custom-unet')&&!document.querySelector('[data-video-local-unet] button').disabled");
  smoke.check("Choosing a model updates its cover banner", await run("Boolean(document.querySelector('[data-video-local-unet] img'))"));
  await captureSettings("minimax-model-banner.png", "[data-video-local-unet]");
  await verifyLocalLora();
  for (const [id, name] of Object.entries(alternatives)) if (["105:13", "105:11", "105:24"].includes(id)) await chooseSlot(id, name);
  const prompt = await submit();
  for (const [id, name] of Object.entries(alternatives)) if (["105:6", "105:13", "105:11", "105:24"].includes(id)) smoke.check(`Loader ${id} receives the selected relative name`, prompt[id].inputs[loaderKeys[prompt[id].class_type]] === name);
  verifyLoraChain(prompt, 2);
  for (const [id, node] of Object.entries(template)) {
    if (loaderKeys[node.class_type] || ["105:104", "114", "135", "105:9", "105:16"].includes(id)) continue;
    assert.deepEqual(prompt[id], node);
  }
  smoke.check("Custom LoRA chains preserve unrelated image, audio and sampling nodes", true);
  smoke.check("Selected names are relative rather than absolute local filesystem paths", !JSON.stringify(prompt).includes(modelsRoot));
  await verifyLoraEditing();
}
function verifyLoraChain(prompt, count) {
  const entries = Object.entries(prompt).filter(([, node]) => node.class_type === "LoraLoaderModelOnly");
  assert.equal(entries.length, count);
  let link = ["105:6", 0];
  for (const [id, node] of entries) { assert.deepEqual(node.inputs.model, link); link = [id, 0]; }
  assert.deepEqual(prompt["105:9"].inputs.model, link);
  assert.deepEqual(prompt["105:16"].inputs.model, link);
  smoke.check(`${count} LoRAs form a valid chain consumed by both scheduler and guider`, true);
}
async function verifyLoraEditing() {
  const weight = "[data-video-loras] [data-selected-extension] input[type=range]";
  await run(`(()=>{const el=document.querySelector('${weight}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0.65');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await delay(100);
  const prompt = await submit(); verifyLoraChain(prompt, 2);
  smoke.check("LoRA weights are submitted and removed defaults are omitted", Object.values(prompt).some((node) => node.class_type === "LoraLoaderModelOnly" && node.inputs.strength_model === 0.65) && !prompt["105:121"] && !prompt["105:133"]);
  await click("[data-video-loras] [data-extension-picker-trigger]"); await wait("document.querySelector('[aria-labelledby=extension-select-dialog-title] h3')");
  await pickLoraModelCard(0);
  await click("[aria-labelledby=extension-select-dialog-title] button[aria-label='关闭']");
  smoke.check("Closing an unconfirmed batch leaves the selected LoRA list unchanged", await run("document.querySelectorAll('[data-video-loras] [data-selected-extension]').length===2"));
  while (await run("Boolean(document.querySelector('[data-video-loras] [data-selected-extension]'))")) await click("[data-video-loras] [data-selected-extension] button[aria-label]");
  verifyLoraChain(await submit(), 0);
}
async function verifyLocalLora() {
  await click("[data-video-loras] [data-extension-picker-trigger]");
  await wait("document.querySelector('[aria-labelledby=extension-select-dialog-title] h3')");
  smoke.check("LoRA picker reuses category cards and excludes Anima", await run("document.querySelector('[aria-labelledby=extension-select-dialog-title]').textContent.includes('Turbo')&&!document.querySelector('[aria-labelledby=extension-select-dialog-title]').textContent.includes('Wrong')"));
  smoke.check("LoRA category restores the card popup trigger and removes native dropdowns", await run("Boolean(document.querySelector('[data-lora-model-picker]'))&&!document.querySelector('[aria-labelledby=extension-select-dialog-title] select')"));
  await delay(300);
  fs.writeFileSync(path.join(root, "minimax-lora-library.png"), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await verifyNestedLoraDialog();
  smoke.check('Video LoRA defaults to single selection and always has a confirmation footer', await run("document.querySelector('[data-resource-selection-mode=multiple]').getAttribute('aria-checked')==='false'&&Boolean(document.querySelector('[data-resource-confirm]'))"));
  await click('[data-resource-selection-mode=multiple]');
  await pickLoraModelCard(0); await pickLoraModelCard(1);
  smoke.check("Batch selections do not apply before confirmation", await run("document.querySelectorAll('[data-video-loras] [data-selected-extension]').length===0"));
  await click("[data-extension-confirm]");
  await wait("!document.querySelector('[aria-labelledby=extension-select-dialog-title]')");
  const prompt = await submit();
  verifyLoraChain(prompt, 2);
  const names = Object.values(prompt).filter((node) => node.class_type === "LoraLoaderModelOnly").map((node) => node.inputs.lora_name);
  smoke.check("Batch adds only both chosen Minimax LoRAs without template defaults", names.length === 2 && names.includes('Minimax\\Turbo\\Adapter\\turbo-local.safetensors') && names.includes('Minimax\\Turbo\\Second Adapter\\second.safetensors'));
}
// 主模型与 LoRA 必须走同一套分类 / 模型卡片，仍返回精确的模型文件路径。
async function verifyMainModelCategory() {
  const dialog = '[aria-labelledby=model-select-dialog-title]';
  smoke.check('Main model header shares category/font controls and only includes the selection-mode switch', await run(`(()=>{const el=document.querySelector('${dialog}');return el.querySelectorAll('[role=switch]').length===1&&el.querySelector('[data-resource-selection-mode]')&&el.querySelector('[aria-label="字体大小"]')&&el.querySelectorAll('h3').length===2&&el.textContent.includes('Style')&&!el.textContent.includes('无需选择')})()`));
  await captureSettings('main-model-category-library.png', dialog);
  await click('[data-resource-model-picker]');
  await wait("document.querySelectorAll('[data-resource-model-option] img').length===2");
  smoke.check('Main model category opens two model cards with distinct names and covers', await run("(()=>{const cards=[...document.querySelectorAll('[data-resource-model-option]')];return cards.some(el=>el.textContent.includes('First Model'))&&cards.some(el=>el.textContent.includes('Second Model'))&&new Set(cards.map(el=>el.querySelector('img').src)).size===2})()"));
  await captureSettings('main-model-category-models.png', '[aria-labelledby=model-version-dialog-title]');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await delay(100);
  smoke.check('Main model nested Escape keeps the category library open', await run("Boolean(document.querySelector('[aria-labelledby=model-select-dialog-title]'))&&!document.querySelector('[aria-labelledby=model-version-dialog-title]')"));
  await click('[data-resource-model-picker]');
  await wait("document.querySelector('[data-resource-model-option]')");
  await run("[...document.querySelectorAll('[data-resource-model-option]')].find(el=>el.textContent.includes('Second Model')).querySelector('[data-resource-model-select]').click()");
  smoke.check('Main model selection waits for the same confirmation footer as extensions', await run("Boolean(document.querySelector('[aria-labelledby=model-select-dialog-title]'))"));
  await click('[data-resource-confirm]');
  await wait("!document.querySelector('[aria-labelledby=model-select-dialog-title]')");
  smoke.check('Grouped main model selection submits the exact file rather than the category path', (await submit())['105:6'].inputs.unet_name==='Minimax\\Style\\Second Model\\second-unet.safetensors');
  await click('[data-video-local-unet] button');
  await wait("document.querySelector('[data-resource-model-picker]')");
  smoke.check('Reopening main model category restores its selected card', await run("document.querySelector('[data-resource-model-picker]').textContent.includes('Second Model')"));
}
async function pickLoraModelCard(index) {
  await click('[data-lora-model-picker]');
  await wait("document.querySelector('[data-lora-model-option]')");
  await run(`document.querySelectorAll('[data-lora-model-option]')[${index}].querySelector('[data-resource-model-select]').click()`); await delay(100);
  if (await run("Boolean(document.querySelector('[data-resource-model-done]'))")) await click('[data-resource-model-done]');
  await wait("!document.querySelector('[aria-labelledby=model-version-dialog-title]')");
}
async function verifyNestedLoraDialog() {
  await run("document.querySelector('[data-lora-model-picker]').focus()");
  await click('[data-lora-model-picker]');
  await wait("document.querySelector('[data-lora-model-option] img')");
  smoke.check('Nested LoRA popup displays two model names and each model uses its own cover', await run("(()=>{const cards=[...document.querySelectorAll('[data-lora-model-option]')];return cards.length===2&&cards.some(el=>el.textContent.includes('Adapter'))&&cards.some(el=>el.textContent.includes('Second Adapter'))&&new Set(cards.map(el=>el.querySelector('img').src)).size===2})()"));
  smoke.check('Nested LoRA popup is portaled above the category library', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-version-dialog-title]');return el.parentElement===document.body&&Number(getComputedStyle(el).zIndex)>Number(getComputedStyle(document.querySelector('[aria-labelledby=extension-select-dialog-title]')).zIndex)})()"));
  smoke.check('Nested LoRA model cards are reachable by real pointer hit testing', await run("(()=>{const el=document.querySelector('[data-lora-model-option] [data-resource-model-select]'),r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()"));
  await captureSettings('minimax-lora-model-cards.png','[aria-labelledby=model-version-dialog-title]');
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await delay(100);
  smoke.check('Escape closes only the model popup and preserves category selections', await run("!document.querySelector('[aria-labelledby=model-version-dialog-title]')&&Boolean(document.querySelector('[aria-labelledby=extension-select-dialog-title]'))&&document.activeElement.matches('[data-lora-model-picker]')"));
}
async function verifyFailureAndReset() {
  await run("[...document.querySelectorAll('[data-video-model-settings] button')].find(el=>el.textContent.includes('恢复工作流默认')).click()");
  assertDefaults(await submit());
  const before = modelListCalls; await click("[data-video-model-refresh]");
  await wait("!document.querySelector('[data-video-model-refresh]').disabled");
  smoke.check("Explicit refresh bypasses the renderer TTL cache", modelListCalls === before + 1);
  failLists = true; await click("[data-video-model-refresh]"); await wait("document.querySelector('[data-video-model-settings] [role=alert]')");
  smoke.check("Unavailable server lists show a useful error and retain local/default choices", await run("document.querySelector('[data-video-model-settings]').textContent.includes('本地扫描')"));
  assertDefaults(await submit());
  await chooseSlot("105:13", "Minimax\\local-clip.safetensors");
  await chooseSlot("105:11", "Minimax\\local-video-vae.safetensors");
  await chooseSlot("105:24", "Minimax\\local-audio-vae.safetensors");
  const local = await submit();
  smoke.check("Offline settings select CLIP from text_encoders and both VAEs from local vae", local['105:13'].inputs.clip_name === 'Minimax\\local-clip.safetensors' && local['105:11'].inputs.vae_name === 'Minimax\\local-video-vae.safetensors' && local['105:24'].inputs.vae_name === 'Minimax\\local-audio-vae.safetensors');
  failLists = false;
  await click("[data-theme-trigger]");
  await click("[data-theme-option=dark]");
  // 默认暗色已由 workspace-shell.css 改为 #1b2336，旧中性灰期望会永久等待。
  // 同时检查原生媒体查询、主题标记与真实背景，不能只看某个按钮已被点击。
  // 固定当前默认色板作为独立期望，避免控件和 body 同时错色却相互比较通过。
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('[data-video-model-settings]')).backgroundColor==='rgb(27, 35, 54)'");
  smoke.check("Model controls follow the native dark theme through the actual theme selector", true);
  await require("./lib/sidebar-menu-fixture").closeAppearance(run);
  win.setSize(390, 844);
  await wait("innerWidth<=390");
  await delay(300);
  smoke.check("Narrow model controls fit inside the creation form", await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-video-model-settings]').getBoundingClientRect().right<=innerWidth"), await run("JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,right:document.querySelector('[data-video-model-settings]').getBoundingClientRect().right})"));
  await captureSettings("minimax-narrow.png");
  await captureSettings("minimax-parameters-narrow-dark.png", "[data-video-generation-settings]");
  smoke.check("All generation parameters fit the narrow dark-theme form", await run("document.querySelector('[data-video-generation-settings]').getBoundingClientRect().right<=innerWidth&&[...document.querySelectorAll('[data-video-generation-settings] input[type=number]')].every(el=>el.getBoundingClientRect().right<=innerWidth)"));
  smoke.check("Compact scale slider fits the narrow form and follows dark theme", await run("document.querySelector('[data-size-scale]').getBoundingClientRect().right<=innerWidth&&document.querySelector('[data-size-scale] input').getBoundingClientRect().width<=64"));
  await verifyNarrowLoraDialog();
  await verifyNarrowMainModelDialog();
  await run("document.querySelector('[data-video-prompt]').scrollIntoView({block:'center'})"); await delay(100);
  await typeMention('@');
  // @ 候选浮层也使用 bg-background，必须同步当前默认暗色而非旧全局灰色。
  // 保留四条边界检查，正确色板不能掩盖窄窗口中被截断或越界的菜单。
  // 这里只校正测试基准，不改变应用色板，也不放宽真正的主题切换条件。
  smoke.check("Media menu stays inside the narrow viewport and follows dark theme", await run("(()=>{const el=document.querySelector('[data-prompt-media-menu]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=40&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(27, 35, 54)'})()"));
  fs.writeFileSync(path.join(root, 'minimax-mention-narrow-dark.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  await run("document.querySelector('[data-size-preset=\"16:9\"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await click('[data-size-preset="16:9"]');
  smoke.check("Clicking outside the prompt closes media suggestions", await run("!document.querySelector('[data-prompt-media-menu]')"));
  await setPrompt('A character walks towards the door.');
  console.log("Visual QA artifacts:", root);
  smoke.check("No React hydration/render errors", errors.length === 0);
}
async function verifyNarrowLoraDialog() {
  const overflow = await run('document.body.style.overflow');
  await click('[data-video-loras] [data-extension-picker-trigger]');
  await click('[data-lora-model-picker]');
  await wait("document.querySelector('[data-lora-model-option] img')");
  // 单栏中的版本选择会替换 main 内容，仍复用 ModelVersionDialog 的 bg-background。
  // 色板与上方 @ 菜单相同；用当前蓝黑色独立期望替换过期的中性灰。
  // 四边检查仍针对真实宿主，不把“改成子页”当作忽略溢出的理由。
  smoke.check('Nested LoRA popup fits the narrow viewport and follows the dark theme', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-version-dialog-title]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(27, 35, 54)'})()"));
  await captureSettings('minimax-lora-model-cards-narrow-dark.png','[aria-labelledby=model-version-dialog-title]');
  await click('[aria-labelledby=model-version-dialog-title] button[aria-label]');
  smoke.check('Closing the nested popup keeps the category library open and scrolling locked', await run("Boolean(document.querySelector('[aria-labelledby=extension-select-dialog-title]'))&&document.body.style.overflow==='hidden'"));
  await click('[aria-labelledby=extension-select-dialog-title] button[aria-label="关闭"]');
  smoke.check('Closing the category library restores its previous page scroll state', await run('document.body.style.overflow') === overflow);
}
async function verifyNarrowMainModelDialog() {
  const overflow = await run('document.body.style.overflow');
  await click('[data-video-local-unet] button');
  await wait("document.querySelector('[data-resource-model-picker]')");
  await captureSettings('main-model-library-narrow-dark.png', '[aria-labelledby=model-select-dialog-title]');
  smoke.check('All shared toolbar controls remain visible and the search moves below the category controls on narrow screens', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-select-dialog-title]'),group=el.querySelector('[aria-label=\"字体大小\"]'),r=group.getBoundingClientRect(),input=el.querySelector('input').getBoundingClientRect();return input.top>=r.bottom&&[...el.querySelectorAll('[role=group] button')].every(button=>{const b=button.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth})})()"));
  await click('[data-resource-model-picker]');
  await wait("document.querySelector('[data-resource-model-option] img')");
  // 主模型和 LoRA 共用版本选择器，主模型入口也必须得到当前主题表面。
  // 单独验证这个调用方，避免只修一种打开路径而遗漏另一种资源子页。
  smoke.check('Main model popup fits the narrow viewport and follows the dark theme', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-version-dialog-title]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(27, 35, 54)'})()"));
  await captureSettings('main-model-cards-narrow-dark.png', '[aria-labelledby=model-version-dialog-title]');
  await click('[aria-labelledby=model-version-dialog-title] button[aria-label]');
  await click('[aria-labelledby=model-select-dialog-title] button[aria-label="关闭"]');
  smoke.check('Main model nested dialogs restore page scrolling when closed', await run('document.body.style.overflow')===overflow);
}
async function switchWorkflow(id) {
  await click('[data-video-create-panel] button[aria-haspopup=listbox]');
  await wait(`document.querySelector('[data-video-workflow-option="${id}"]')`);
  await click(`[data-video-workflow-option="${id}"]`);
}
async function verifyReferenceWorkflow() {
  win.setSize(1500, 980);
  await wait('innerWidth>1000');
  await switchWorkflow('minimax-reference');
  await wait("document.querySelector('[data-video-reference-inputs]')");
  await verifyReferenceDefaults();
  await importReferenceFixture();
  await verifyReferenceGraph();
  await verifyReferenceParameters();
  await verifyReferenceRemoval();
  await verifyReferenceSwitching();
}
async function verifyReferenceDefaults() {
  smoke.check('Reference workflow reuses model and LoRA selectors, without first/last frame controls', await run("Boolean(document.querySelector('[data-video-local-unet]')&&document.querySelector('[data-video-loras]'))&&!document.querySelector('[data-video-frame-inputs]')&&document.querySelectorAll('[data-video-loras] [data-selected-extension]').length===0"));
  smoke.check('Reference dimensions come from its own template rather than the image workflow', await run("document.querySelector('[data-size-dimensions]').textContent==='1152 × 960'"));
  await click('[data-advanced-settings-toggle]');
  await wait("document.querySelector('[data-video-generation-settings]')");
  smoke.check('Reference settings read six steps, 24 FPS and five seconds from the updated graph', await run("document.querySelector('[data-generation-parameter=steps] input[type=number]').value==='6'&&document.querySelector('[data-generation-parameter=fps] input[type=number]').value==='24'&&document.querySelector('[data-generation-parameter=duration] input[type=number]').value==='5'"));
  await setPrompt('A quiet room.');
  const empty = await submit();
  smoke.check('No reference upload is required for text-only input; all template examples are removed', !Object.keys(empty['147:136'].inputs).some(key=>key.startsWith('ref_')&&key.includes('.')) && !Object.values(empty).some(node=>['LoadImage','LoadVideo','GetVideoComponents','LoadAudio','LoraLoaderModelOnly'].includes(node.class_type)) && empty['147:136'].inputs.prompt === 'A quiet room.');
}
async function importReferenceFixture() {
  await verifyReferenceBatchImports();
  await run("document.querySelector('[data-video-prompt]').scrollIntoView({block:'center'})"); await delay(200);
  await typeMention('@');
  smoke.check('The @ menu starts with three resource categories', await run("document.querySelectorAll('[data-prompt-media-category]').length===3&&!document.querySelector('[data-prompt-media-option]')"));
  await click('[data-prompt-media-category=video]');
  smoke.check('Video category shows only the current task video with its first-frame thumbnail', await run("document.querySelectorAll('[data-prompt-media-option]').length===1&&Boolean(document.querySelector('[data-prompt-media-option=video-1] img'))"));
  await click('[data-prompt-media-back]'); await click('[data-prompt-media-category=audio]');
  await click('[data-prompt-media-option=audio-1]');
  smoke.check('Selecting an audio resource inserts its stable token', await run("document.querySelector('[data-video-prompt]').textContent==='@audio1 '&&!document.querySelector('[data-prompt-media-menu]')"));
  await typeMention('@image');
  smoke.check('Typing a category alias directly filters its imported resources', await run("document.querySelectorAll('[data-prompt-media-option]').length===3"));
}
// 通过生产文件选择 / 拖放事件验证超过原上限的导入、类型过滤与稳定编号，不直接写组件状态。
async function verifyReferenceBatchImports() {
  smoke.check('Unified resource import replaces the three tabs', await run("!document.querySelector('[data-reference-tab]')&&Boolean(document.querySelector('[data-reference-import][multiple]'))"));
  videoFixtureBytes = await createVideoFixture();
  await importMediaBatch([['speech.wav','audio/wav'],['motion.webm','video/webm'],['ref1.png','image/png'],['ref2.png','image/png'],['ref3.png','']]);
  await wait("document.querySelector('[data-reference-kind=video] img')?.naturalWidth>0");
  smoke.check('Mixed import classifies files automatically, including MIME-less images, and sorts images before video and audio', await run("[...document.querySelectorAll('[data-reference-grid] [data-reference-kind]')].map(el=>el.dataset.referenceKind).join(',')==='image,image,image,video,audio'"));
  smoke.check('Video cover is its first frame rather than its last frame', await run("(()=>{const img=document.querySelector('[data-reference-kind=video] img'),canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;return Math.abs(r-20)<15&&Math.abs(g-100)<15&&Math.abs(b-180)<15})()"));
  await importMediaBatch([['extra2.webm','video/webm'],['extra3.webm','video/webm'],['extra4.webm','video/webm'],['wrong.txt','text/plain']]);
  smoke.check('Video import accepts more than three and skips only unsupported files', await run("document.querySelector('[data-reference-count=video]').textContent.trim()==='视频 4'&&document.querySelectorAll('[data-reference-kind=video]').length===4&&document.body.textContent.includes('另有 1 个因格式不支持而跳过')"));
  await importMediaBatch([['extra2.wav','audio/wav'],['extra3.wav','audio/wav'],['extra4.wav','audio/wav']], true);
  smoke.check('Batch drag/drop accepts more than three audio references', await run("document.querySelector('[data-reference-count=audio]').textContent.trim()==='音频 4'&&document.querySelectorAll('[data-reference-kind=audio]').length===4"));
  smoke.check('Image imports have stable references and replacement inputs are single-file', await run("[...document.querySelectorAll('[data-reference-kind=image]')].map(el=>el.dataset.referenceNumber).join(',')==='1,2,3'&&document.querySelectorAll('[data-reference-kind=image] img').length===3&&!document.querySelector('[data-reference-kind=image] input').multiple"));
  await importMediaBatch(Array.from({length:9},(_,i)=>[`extra${i+4}.png`,'image/png']));
  smoke.check('Image batch import accepts twelve references and all counts have no limit denominator', await run("document.querySelector('[data-reference-count=image]').textContent.trim()==='图片 12'&&document.querySelectorAll('[data-reference-kind=image] img').length===12&&[...document.querySelectorAll('[data-reference-count]')].every(el=>!el.textContent.includes('/'))"));
  smoke.check('Resource thumbnails are square, arranged horizontally and wrap to a new row', await run("(()=>{const tiles=[...document.querySelectorAll('[data-reference-grid] [data-reference-kind]')].map(el=>el.getBoundingClientRect());return tiles.every(r=>Math.abs(r.width-r.height)<1)&&tiles[1].left>tiles[0].left&&tiles.at(-1).top>tiles[0].top})()"), await run("JSON.stringify([...document.querySelectorAll('[data-reference-grid] [data-reference-kind]')].map(el=>{const r=el.getBoundingClientRect();return {kind:el.dataset.referenceKind,w:r.width,h:r.height,x:r.x,y:r.y}}))"));
  await verifyExpandedReferenceGraph();
  for (let number=4;number<=12;number++) await removeReference('image',number);
  for (const kind of ['video','audio']) for (let number=2;number<=4;number++) await removeReference(kind,number);
  await captureSettings('reference-import-grid.png','[data-video-reference-inputs]');
}
// 超过原 9/3/3 上限后，检查真实上传结果、动态端口和视频 IMAGES 连接；高编号图片仍能预览。
async function verifyExpandedReferenceGraph() {
  await upload('[data-reference-kind=image][data-reference-number="12"] input','replacement12.png');
  smoke.check('Replacing an image beyond the old limit keeps its reference number', await run("document.querySelector('[data-reference-kind=image][data-reference-number=\"12\"] button').title.includes('replacement12.png')"));
  await setPrompt('@image12 @video4 @audio4');
  await click('[data-video-prompt] [data-image-reference="12"]');
  await wait("document.querySelector('[data-image-preview-overlay]')");
  smoke.check('The twelfth image opens the shared image preview', await run("document.querySelector('[data-image-preview-overlay]').textContent.includes('12 / 12')"));
  await click('[aria-label=关闭预览]');
  const before = uploads.length;
  const graph = await submit(), inputs = graph['147:136'].inputs;
  smoke.check('References beyond the old limits normalize and all twenty files upload', inputs.prompt === '<Picture 12> <Video 4> <Audio 4>' && uploads.length === before + 20);
  for (const [kind, group, count] of [['image','images',12],['video','videos',4],['audio','audios',4]]) {
    const ports = Object.keys(inputs).filter(key=>key.startsWith(`ref_${group}.`));
    assert.equal(ports.length,count);
    for (let index=0;index<count;index++) {
      const node = graph[inputs[`ref_${group}.ref_${kind}_${index}`][0]];
      assert.equal(node.class_type,kind === 'image' ? 'LoadImage' : kind === 'video' ? 'GetVideoComponents' : 'LoadAudio');
      if (kind === 'video') assert.equal(graph[node.inputs.video[0]].class_type,'LoadVideo');
      assert.equal(inputs[`ref_${group}.ref_${kind}_${index}`][1],0);
    }
    smoke.check(`${count} ${kind} references create consecutive dynamic ports with the correct loader chain`,true);
  }
}
async function verifyReferenceGraph() {
  await setPrompt('@图1, @IMAGE2, IMAGE3. Follow @视频1 and @audio1.');
  const multi = await submit();
  const inputs = multi['147:136'].inputs;
  smoke.check('Three media types normalize to official Minimax reference markers', inputs.prompt === '<Picture 1>, <Picture 2>, <Picture 3>. Follow <Video 1> and <Audio 1>.');
  assert.equal(Object.keys(inputs).filter(key=>key.startsWith('ref_images.')).length,3);
  for (const kind of ['image','video','audio']) {
    const group = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'audios';
    const loader = multi[inputs[`ref_${group}.ref_${kind}_0`][0]];
    if (kind === 'video') {
      assert.equal(loader.class_type,'GetVideoComponents');
      assert.equal(multi[loader.inputs.video[0]].class_type,'LoadVideo');
      assert.match(multi[loader.inputs.video[0]].inputs.file,/\.webm$/);
    } else {
      assert.equal(loader.class_type,kind === 'image' ? 'LoadImage' : 'LoadAudio');
      assert.match(loader.inputs[kind === 'image' ? 'image' : 'audio'],kind === 'image' ? /\.png$/ : /\.wav$/);
    }
  }
  smoke.check('Dynamic ports wire each uploaded file to the proper official loader', true);
  smoke.check('Production upload transport preserves video/audio bytes, names and MIME types', requests.includes('/upload/image') && uploads.slice(-5).map(item=>item.filename.split('_')[0]).join(',') === 'image,image,image,video,audio');
  assert.deepEqual(multi['147:124'].inputs.model,['147:127',0]);
  assert.deepEqual(multi['147:126'].inputs.model,['147:127',0]);
  for (const id of ['147:123','147:129','147:130','147:150','153']) assert.deepEqual(multi[id],referenceTemplate[id]);
  smoke.check('Reference workflow keeps sampling, output, timing and seed wiring; default LoRA is removed', true);
  await captureSettings('minimax-reference-media.png','[data-video-reference-inputs]');
}
async function verifyReferenceRemoval() {
  await removeReference('image',2);
  await setPrompt('@image1 with @image3 and @video1, @audio1.');
  const sparse = await submit();
  smoke.check('Removing a middle image keeps UI IDs stable and compacts official ordinals at submission', sparse['147:136'].inputs.prompt === '<Picture 1> with <Picture 2> and <Video 1>, <Audio 1>.' && !sparse['147:136'].inputs['ref_images.ref_image_2']);
  await setPrompt('@image2');
  const before = prompts.length, beforeUploads = uploads.length;
  await run("document.querySelector('[data-video-create-panel]').requestSubmit()"); await delay(250);
  smoke.check('Removed references are rejected before uploads or generation', prompts.length === before && uploads.length === beforeUploads && await run("document.body.textContent.includes('素材引用 @image2 不存在')"));
  await setPrompt('@image3');
  await captureSettings('minimax-reference-size.png','[data-video-resolution]');
}
async function verifyReferenceParameters() {
  await setParameter('steps',12); await setParameter('fps',30); await setParameter('duration',2.5);
  await setSizeScale(0.5);
  const prompt = await submit();
  smoke.check('Shared generation controls update reference steps, output FPS and duration', prompt['147:124'].inputs.steps===12 && prompt['147:130'].inputs.fps===30 && prompt['147:149'].inputs.value===2.5 && prompt['147:150'].inputs.expression===referenceTemplate['147:150'].inputs.expression.replaceAll('a * 24','a * 30'));
  smoke.check('Shared size scaling updates the reference generation node', prompt['147:136'].inputs.width===576 && prompt['147:136'].inputs.height===480);
  await click('[data-video-parameters-reset]'); await setSizeScale(1);
}
async function verifyReferenceSwitching() {
  await switchWorkflow('minimax');
  smoke.check('Switching back restores original dimensions, prompt and first/last frame mode', await run("document.querySelector('[data-size-dimensions]').textContent==='1344 × 768'&&document.querySelector('[data-video-frame-mode=both]').getAttribute('aria-pressed')==='true'&&!document.querySelector('[data-video-reference-inputs]')"));
  await switchWorkflow('minimax-reference');
  smoke.check('Reference workflow retains its own prompt and imported media when switching back', await run("document.querySelector('[data-video-prompt]').textContent==='@image3'&&document.querySelectorAll('[data-reference-kind=image] img').length===2"));
  win.setSize(390,844); await wait('innerWidth<=390'); await delay(200);
  smoke.check('Reference upload grid fits narrow dark-theme layouts', await run("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('[data-video-reference-inputs]').getBoundingClientRect().right<=innerWidth"));
  await captureSettings('minimax-reference-narrow-dark.png','[data-video-reference-inputs]');
  smoke.check('Reference integration introduces no React render or hydration errors', errors.length===0);
}
// 辅助模型专项复用本文件的生产 preload、本机 HTTP 服务及独立用户目录。
// --loaders-only 不跑上传与生成，它验证各入口的字段和草稿归属。
// 模型文件是几字节夹具，仅供扫描清单，不声称真实权重已加载到 GPU。
// 点击模式标签走实际事件，不能直接往 window 注入 store。
// 每次只找有几何尺寸的面板，编辑页隐藏保留的实例不能充当当前页面。
// 轮询有上限；找不到预期入口时保留明确失败，而非跳过整个场景。
// 本函数仅切换模式；展开状态、选项和重置由后续用例独立断言。
// Role TTS 的名称保留产品显示，不用猜测内部 mode 字符串。
// 前置页面是 /create，模式切换不触发新窗口或绕开 AppShell。
// 当前用户文档由已有游客夹具提供，不需要用户自己的账户登录状态。
// 按按钮完整文字匹配，不能误点素材中恰好也叫视频的普通按钮。
// 展开条件同时核对 aria-expanded，重复访问已展开的模式不会反向把它收起。
// 加载完成条件查看刷新按钮是否可点，避免列表尚未回包时误测没有选项。
// 这个等待只用于有独立槽的四个默认模板，SDXL 内置槽由构建器测试另行覆盖。
// 如果入口 DOM 消失，wait 会按已有上限报错，不靠固定长睡眠假定成功。
// 事件执行后还有实际 DOM 轮询，click 返回不等于 React 已完成渲染。
async function openLoaderMode(label) {
  await run(`[...document.querySelectorAll('[data-create-mode-tabs] button')].find(el=>el.textContent.trim()===${JSON.stringify(label)}).click()`);
  await wait("[...document.querySelectorAll('[data-video-model-toggle]')].some(el=>el.getBoundingClientRect().width>0)");
  await run("[...document.querySelectorAll('[data-video-model-toggle]')].find(el=>el.getBoundingClientRect().width>0&&el.getAttribute('aria-expanded')==='false')?.click()");
  await wait("[...document.querySelectorAll('[data-video-model-settings]')].some(el=>el.getBoundingClientRect().width>0&&!el.querySelector('[data-video-model-refresh]')?.disabled)");
}
// 像轮流打开四个抽屉，先给第一个放标签，再检查其余抽屉没有被误贴标签。
// Anima 应有一个 CLIP 和一个 VAE，不能复制视频的三个固定字段。
// MiniMax 视频有视频与音频两种 VAE，必须同时保留而不是按类名去重。
// 无参考 TTS 只有真实音频 VAE；pixel_space 不应出现在可选列表。
// 文字编辑采用自己的草稿，不能继承刚在图片模式选中的自定义文件。
// 断言读取可见 fieldset，不能用隐藏的旧模式数量凑出期待值。
// 切换过程中保留同一页面实例，才能发现跨模式状态串用。
// 选择通过生产 SimpleSelect 菜单执行，不能直接改按钮文字伪造状态。
// 正式下拉选项来自本机 HTTP 服务，路径保留目录分隔符。
// 第一轮选择后再离开图片入口，返回时才能验证草稿确实恢复。
// 恢复默认通过可见按钮执行，不通过清空测试变量让断言通过。
// 重置后选择器应显示工作流默认说明，自定义路径不能继续假装生效。
// 外观入口通过 nativeTheme IPC 改 Chromium 配色，不添加测试专用 dark 类。
// 窄窗截图仍是正式创建页，检验加载行是否撑破页面。
// 截图用于人工复核，模型计数和状态隔离仍由 DOM 断言判定。
// 网络失败场景主动让夹具拒绝列表请求，不改产品组件的 error 属性。
// 列表失败时默认项仍可读；用户无需先删除草稿才能恢复服务。
// 没有提交任务，不消费用户 GPU、API 配额或现有生成队列。
// 本测试不证明 CLIP 与 UNet 的语义兼容性，这仍由实际模型配置决定。
// 真实权重解码和画质属于生成实机回归，不能由几字节夹具代表。
// 四模式期望数量按本仓库当前模板确定，不从产品过滤函数计算期待值。
// 图片与编辑虽然都是 image 用途，仍需逐一进入才能发现漏接某个实际调用方。
// 视频数量是三，能够发现把两个 VAE 按 class_type 合并成一项的问题。
// 音频数量是二，能够发现内部占位 VAE 被误暴露的第三行。
// snapshot.text 只读折叠菜单外的选中值，不把候选列表中存在 custom 算成已选。
// 自定义选项写在图片槽 id=1，视频和音频的冒号 id 应保持自己的默认值。
// 图片选完再访问三个其他模式，最后返回图片验证独立草稿未被初始化抹除。
// 文字编辑也可能有 id=1，独立实例必须仍显示默认而不是套用图片选择。
// 测试不靠各模式使用不同 id 来掩盖状态污染，实际回调边界同样参与验证。
// reset 按钮来自当前可见 fieldset，隐藏表单的同名按钮不能替代本次动作。
// 恢复后的选择检查 custom-clip 已消失，保留旧显示值也会失败。
// 服务器离线在其他模式检查完成后启用，防止把早先失败误当成目标场景。
// 刷新走已有 COMFY_LIST_MODELS IPC，代理失败由真实组件处理。
// 错误提示必须出现，不能只保留默认值而把网络问题静默吞掉。
// 离线后读取按钮里的默认说明，确保列表失败没有把用户选择控件清空。
// 暗色窄窗在失败提示仍可见时截图，同时观察长错误文字的宽度边界。
// 640 像素内容宽度触发创建页单栏，不另加测试专属 CSS 缩放页面。
// 全页 scrollWidth 检查能发现下拉触发器长路径间接撑宽父容器。
// 截图与终端输出保存在同一临时根，方便按日志定位对应场景。
// 本测试没有修改用户模型目录，文件扫描只会读取本轮创建的隔离模型夹具。
// 最后保留截图，不自动删除证据；BrowserWindow 与 HTTP 服务器由 main 清理。
// 运行名称是 workflow-loaders，不能把这个专项通过写成完整 MiniMax 工作流回归。
// 未传 --loaders-only 时仍执行原完整流程，新增分支没有取代既有测试入口。
// 断言累计结果通过 smoke.allPassed 汇总，某一项失败不能被后面截图成功覆盖。
// 测试不改生成队列的任务状态，UI 辅助设置仅做草稿选择与显示验证。
async function verifyWorkflowLoaders() {
  for (const [label, count] of [['图片', 2], ['视频', 3], ['Role TTS', 2], ['编辑', 2]]) {
    await openLoaderMode(label);
    const snapshot = await run("(()=>{const el=[...document.querySelectorAll('[data-video-model-settings]')].find(el=>el.getBoundingClientRect().width>0);return {count:el.querySelectorAll('[data-video-model-slot]').length,text:el.textContent}})()");
    smoke.check(`${label} exposes only its own CLIP/VAE slots`, snapshot.count === count && !snapshot.text.includes('pixel_space') && !snapshot.text.includes(alternatives['105:13']));
    await captureSettings(`workflow-loaders-${count}-${label}.png`, '[data-video-model-section]');
    if (label === '图片') await chooseSlot('1', alternatives['105:13']);
  }
  await openLoaderMode('图片');
  smoke.check('Returning to image restores its own selection', await run("document.querySelector('[data-video-model-slot=\"1\"]').textContent.includes('custom-clip')"));
  await run("[...document.querySelectorAll('[data-video-model-settings] button')].find(el=>el.getBoundingClientRect().width>0&&el.textContent==='恢复工作流默认').click()");
  smoke.check('Reset restores the workflow default', await run("!document.querySelector('[data-video-model-slot=\"1\"]').textContent.includes('custom-clip')"));
  failLists = true;
  await click('[data-video-model-refresh]');
  await wait("document.querySelector('[data-video-model-settings] [role=alert]')");
  smoke.check('Offline lists retain usable workflow defaults', await run("document.querySelector('[data-video-model-slot=\"1\"] button').textContent.includes('工作流默认')"));
  await captureSettings('workflow-loaders-offline.png');
  await click('[data-theme-trigger]');
  await click('[data-theme-option=dark]');
  await require('./lib/sidebar-menu-fixture').closeAppearance(run);
  win.setContentSize(640, 900);
  await captureSettings('workflow-loaders-dark-narrow.png');
  smoke.check('Narrow model settings stay within viewport', await run("document.documentElement.scrollWidth<=innerWidth"));
  console.log('WORKFLOW_LOADERS_SCREENSHOTS', root);
}
async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  for (const [folderName, file, color] of [['First Model', 'first.safetensors', [20, 100, 180, 255]], ['Second Model', 'second-unet.safetensors', [180, 150, 20, 255]]]) {
    const folder = path.join(modelsRoot, 'diffusion_models', 'Minimax', 'Style', folderName);
    fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, file), 'fixture');
    fs.writeFileSync(path.join(folder, 'logo.png'), nativeImage.createFromBitmap(Buffer.from(color), { width: 1, height: 1 }).toPNG());
  }
  for (const [relative, file] of [["diffusion_models/Minimax/Local Model", "custom-unet.safetensors"], ["diffusion_models/Anima/Example", "anima-only.safetensors"], ["loras/Minimax/Turbo/Adapter", "turbo-local.safetensors"], ["loras/Minimax/Turbo/Second Adapter", "second.safetensors"], ["loras/Anima/Wrong/Example", "wrong-lora.safetensors"], ["text_encoders/Minimax", "local-clip.safetensors"], ["vae/Minimax", "local-video-vae.safetensors"], ["vae/Minimax", "local-audio-vae.safetensors"]]) {
    const folder = path.join(modelsRoot, relative); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, file), "fixture");
    const color = file.startsWith('second') ? [180, 150, 20, 255] : [20, 100, 180, 255];
    fs.writeFileSync(path.join(folder, "logo.png"), nativeImage.createFromBitmap(Buffer.from(color), { width: 1, height: 1 }).toPNG());
  }
  server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/upload/image') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const filename = /filename="([^"]+)"/.exec(body.toString())[1];
        const input = uploads.at(-1);
        assert.equal(filename, input.filename);
        assert.ok(body.includes(Buffer.from(input.dataBase64, 'base64')), 'Upload preserves reference file bytes');
        const ext = path.extname(filename);
        const mime = { '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav' }[ext];
        if (mime) assert.ok(body.toString().includes('Content-Type: ' + mime), 'Upload sends the correct media MIME');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: `uploaded-${uploads.length}${ext}`, subfolder: 'frames', type: 'input' }));
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(responses[req.url.split("/").pop()] || []));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  win = new BrowserWindow({ ...windowChromeOptions(), show: false, width: 1500, height: 980, webPreferences: { additionalArguments: windowChromeArguments(), offscreen: true, preload: path.join(__dirname, "../apps/electron/src/preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  win.webContents.debugger.attach("1.3");
  win.webContents.on("console-message", (event) => { if (event.level === "error" && /React|hydration|render|Minified/i.test(event.message)) errors.push(event.message); });
  try {
    await win.loadURL("app://app/create"); await wait("document.querySelector('[data-generate-button]')");
    // offscreen 窗口必须启用焦点仿真，真实 focusout 才能到达 React 的失焦提交。
    // 仿真限于此测试窗口，保留隐藏执行，不改变用户应用的前台焦点。
    // 不手动调用 onBlur，后面的尺寸断言仍经过生产事件与 H3 参数适配。
    // 否则 DOM 虽然显示为聚焦，失焦事件仍可能缺失，造成提交用例假失败。
    // 启用后原有提示词光标测试也使用该窗口真实的焦点生命周期。
    // debugger 连接属于本轮窗口，结束时随窗口销毁，不留下前台应用状态。
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await dismissAnnouncement();
    if (process.argv.includes("--loaders-only")) {
      await verifyWorkflowLoaders();
    } else {
    imageExtensionUi = await extensionUiSnapshot();
    imageParameterUi = await parameterUiSnapshot();
    await click('[data-size-preset="1:1"]');
    await setSizeScale(0.5);
    smoke.check("Image size exposes the same scaling behavior and dimensions", await run("document.querySelector('[data-size-dimensions]').textContent==='512 × 512'&&document.querySelector('[data-size-preset=\"1:1\"]').getAttribute('aria-pressed')==='true'"));
    await setSizeScale(0.1); await setSizeScale(0.5);
    smoke.check("Image scaling also retains original dimensions on repeated changes", await run("document.querySelector('[data-size-dimensions]').textContent==='512 × 512'"));
    await setSizeScale(1);
    imageSizeUi = await sizeUiSnapshot();
    await run("[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='视频').click()");
    await wait("document.querySelector('[data-video-create-panel]')");
    // --resolution-only 单独验证尺寸，使用同样的真实 renderer 和 preload。
    // 仍先上传首尾帧并检查模板默认值，不能用假提交对象替代生成入口。
    // 该模式包含图片侧的对照，确保视频规则没有改变图片的尺寸交互。
    // 它只缩小检查范围，不吞掉断言异常，也不把完整冒烟标记为通过。
    // 不传参数时保留全部原有回归，包括主题、素材和模型选择。
    // 尺寸用例本身不依赖主题切换或服务器离线等无关场景的前置状态。
    // 两条分支最终都走 smoke.finish，退出码仍由实际断言结果决定。
    // 同一进程只运行一条分支，避免重复初始化时模型清单计数失真。
    await verifyDefaults();
    if (process.argv.includes("--resolution-only")) await verifyResolution();
    else { await verifyGenerationParameters(); await verifyMediaMentions(); await verifyImageReferences(); await verifyPromptEditing(); await verifyResolution(); await verifyOverrides(); await verifyFailureAndReset(); await verifyServerNames(); await verifyReferenceWorkflow(); }
    }
  } finally { server.close(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch((error) => { console.error(error.message); server?.close(); smoke.finish({ app, ok: false }); });
