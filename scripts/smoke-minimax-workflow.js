/** Exercise Minimax defaults, loader overrides, local picking and two-frame uploads through the production renderer and real preload. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { app, BrowserWindow, nativeImage } = require("electron");
const { IPC_CHANNELS: C } = require("../apps/electron/ipcChannels");
const { registerHandle } = require("../apps/electron/ipcHandlers");
const smoke = require("./lib/smoke-harness").createSmokeHarness({ name: "minimax-workflow", timeoutMs: 60000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ir-minimax-ui-"));
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
let imageExtensionUi, imageParameterUi, imageSizeUi;
app.disableHardwareAcceleration(); app.setPath("userData", path.join(root, "browser")); smoke.installWatchdog(app);
require("../apps/electron/appProtocol").registerAppProtocol();
const settings = { paths: { searchPath: modelsRoot, diffusionModelsPath: path.join(modelsRoot, "diffusion_models") }, theme: "light", outputPath: root };
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
registerHandle(C.AGENT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.PROMPT_SECRET_STATUS, () => ({ configured: false, source: "none", protection: "", tail: "" }));
registerHandle(C.CIVITAI_KEY_STATUS, () => ({ configured: false, protection: "", tail: "" }));
registerHandle(C.COMFY_LIST_MODELS, async () => { modelListCalls++; if (failLists) throw new Error("fixture-unavailable"); return require("../apps/electron/comfyProxy").listComfyModels(`127.0.0.1:${server.address().port}`); });
registerHandle(C.COMFY_UPLOAD_IMAGE, (_event, _address, file) => { uploads.push(file); return require("../apps/electron/comfyProxy").uploadImageToComfy(`127.0.0.1:${server.address().port}`, file); });
registerHandle(C.COMFY_GENERATE, (_event, prompt) => { prompts.push(prompt); return { promptId: `fixture-${prompts.length}`, images: [], videos: [] }; });
registerHandle(C.FILES_READ_IMAGE_DATA_URL, (_event, file) => fs.existsSync(file) ? "data:image/png;base64," + fs.readFileSync(file).toString("base64") : null);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (source) => win.webContents.executeJavaScript(source, true);
async function wait(source) {
  for (let i = 0; i < 100; i++) { if (await run(`Boolean(${source})`)) return; await delay(100); }
  throw new Error("Minimax UI timeout: " + source);
}
async function click(selector) { await run(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); }
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
async function importMediaBatch(kind, files, drop = false) {
  await click(`[data-reference-tab=${kind}]`);
  const selector = `[data-reference-kind=${kind}] input[multiple]`;
  await wait(`document.querySelector('${selector}')`);
  const bytes = [...nativeImage.createFromBitmap(Buffer.from([20, 100, 180, 255]), { width: 1, height: 1 }).toPNG()];
  await run(`(()=>{const el=document.querySelector('${selector}'),data=new DataTransfer();for(const [name,mime] of ${JSON.stringify(files)})data.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],name,{type:mime}));if(${drop})el.parentElement.querySelector('button').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));else{el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await delay(100);
}
async function removeReference(kind, number) {
  await click(`[data-reference-kind=${kind}] [data-reference-number="${number}"] button[aria-label]`);
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
function sizeUiSnapshot() {
  // 比对元素、排序后的属性和实际样式；SSR 的注释与属性顺序不属于 UI 差异。
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
  smoke.check("Disabled last-frame mode excludes that image from suggestions", await run("document.querySelectorAll('[data-prompt-media-option]').length===1"));
  await click('[data-video-frame-mode=both]'); await setPrompt('A character walks towards the door.');
}
async function verifyResolution() {
  await click('[data-video-resolution] [data-size-preset="1:1"]');
  assert.deepEqual(await sizeUiSnapshot(), imageSizeUi);
  smoke.check("Image and video share the entire size UI, values, limits, slider, hints and markup", true);
  await click('[data-video-resolution] [data-size-preset="16:9"]');
  smoke.check("Default dimensions come directly from the simplified template without MP controls", await run("document.querySelector('[data-video-resolution] [data-size-dimensions]').textContent==='1344 × 768'&&!document.querySelector('[data-generation-parameter=megapixels]')"));
  smoke.check("Compact size slider exposes the 0.1–1 range with 0.1 increments", await run("(()=>{const el=document.querySelector('[data-size-scale] input[type=range]');return el.min==='0.1'&&el.max==='1'&&el.step==='0.1'&&el.getBoundingClientRect().width<=64})()"));
  await setSizeScale(0.5);
  const half = await submit();
  smoke.check("Half scale writes half of the base width and height without losing preset selection", half['105:104'].inputs.width === 672 && half['105:104'].inputs.height === 384 && await run("document.querySelector('[data-size-preset=\"16:9\"]').getAttribute('aria-pressed')==='true'"));
  await setSizeScale(0.1);
  const small = await submit();
  smoke.check("Minimum scale uses shared dimensions before workflow pixel alignment", small['105:104'].inputs.width === 128 && small['105:104'].inputs.height === 96 && await run("document.querySelector('[data-size-dimensions]').textContent==='136 × 80'"));
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
  smoke.check("Video displays the same 5:6 preset as images and aligns only when building its workflow", aligned['105:104'].inputs.width === 992 && aligned['105:104'].inputs.height === 1216 && await run("document.querySelector('[data-size-dimensions]').textContent==='1000 × 1200'"));
  await click('[data-video-resolution] [data-size-preset=custom]');
  for (const name of ['width', 'height']) {
    await run(`(()=>{const el=document.querySelector('[data-size-dimension=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'513');el.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100);
  }
  const custom = await submit();
  smoke.check("Custom dimensions are aligned outside shared UI and reach the video node", custom['105:104'].inputs.width === 512 && custom['105:104'].inputs.height === 512 && await run("document.querySelector('[data-size-preset=custom]').getAttribute('aria-pressed')==='true'"));
  await setSizeScale(0.5);
  const customHalf = await submit();
  smoke.check("Custom dimensions can also be proportionally scaled", customHalf['105:104'].inputs.width === 256 && customHalf['105:104'].inputs.height === 256);
  await setSizeScale(1);
  await captureSettings('minimax-shared-size.png', '[data-video-resolution]');
  await click('[data-video-resolution] [data-size-preset="16:9"]');
  smoke.check("Returning to a preset resets scale, hides custom inputs and restores workflow dimensions", !await run("document.querySelector('[data-size-dimension]')") && await run("document.querySelector('[data-size-scale] input').value==='1'") && (await submit())['105:104'].inputs.width === template['105:104'].inputs.width);
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
  await wait("document.documentElement.dataset.theme==='dark'&&matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('[data-video-model-settings]')).backgroundColor==='rgb(10, 10, 10)'");
  smoke.check("Model controls follow the native dark theme through the actual theme selector", true);
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
  smoke.check("Media menu stays inside the narrow viewport and follows dark theme", await run("(()=>{const el=document.querySelector('[data-prompt-media-menu]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=40&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(10, 10, 10)'})()"));
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
  smoke.check('Nested LoRA popup fits the narrow viewport and follows the dark theme', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-version-dialog-title]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(10, 10, 10)'})()"));
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
  smoke.check('Main model popup fits the narrow viewport and follows the dark theme', await run("(()=>{const el=document.querySelector('[aria-labelledby=model-version-dialog-title]'),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(el).backgroundColor==='rgb(10, 10, 10)'})()"));
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
  smoke.check('The @ menu lists all three images plus current-task video and audio', await run("document.querySelectorAll('[data-prompt-media-menu] [role=option]').length===5&&document.querySelector('[data-prompt-media-menu]').textContent.includes('@video1')&&document.querySelector('[data-prompt-media-menu]').textContent.includes('@audio1')"));
}
// 通过生产文件选择 / 拖放事件验证容量、类型过滤与稳定编号，而非直接写组件状态。
async function verifyReferenceBatchImports() {
  smoke.check('Reference import shows three compact tabs and only one upload group', await run("document.querySelectorAll('[data-reference-tab]').length===3&&document.querySelectorAll('[data-reference-kind]').length===1&&Boolean(document.querySelector('[data-reference-kind=image] input[multiple]'))"));
  await importMediaBatch('video', [['motion.mp4','video/mp4'],['extra2.mp4','video/mp4'],['extra3.mp4','video/mp4'],['overflow.mp4','video/mp4'],['wrong.png','image/png']]);
  smoke.check('Video batch import fills three slots, skips unsupported/excess files and reports the result', await run("document.querySelector('[data-reference-tab=video]').textContent.includes('3/3')&&document.querySelectorAll('[data-reference-kind=video] [data-reference-number]').length===3&&!document.querySelector('[data-reference-kind=video] input[multiple]')&&document.body.textContent.includes('另有 2 个')"));
  await removeReference('video',2); await removeReference('video',3);
  await importMediaBatch('audio', [['speech.wav','audio/wav'],['extra2.wav','audio/wav'],['extra3.wav','audio/wav'],['overflow.wav','audio/wav']], true);
  smoke.check('Audio supports batch drag/drop and caps imports at three slots', await run("document.querySelector('[data-reference-tab=audio]').textContent.includes('3/3')&&document.querySelectorAll('[data-reference-kind=audio] [data-reference-number]').length===3"));
  await removeReference('audio',2); await removeReference('audio',3);
  await importMediaBatch('image', [['ref1.png','image/png'],['ref2.png','image/png'],['ref3.png','image/png']]);
  smoke.check('Image batch import assigns stable image1/image2/image3 references without replacing files', await run("document.querySelector('[data-reference-tab=image]').textContent.includes('3/9')&&[1,2,3].every(n=>Boolean(document.querySelector('[data-reference-kind=image] [data-reference-number=\"'+n+'\"] img')))&&!document.querySelector('[data-reference-number=\"1\"] input').multiple"));
  await importMediaBatch('image', Array.from({length:7},(_,i)=>[`extra${i+4}.png`,'image/png']));
  smoke.check('Image batch import cannot exceed the nine-image workflow limit', await run("document.querySelector('[data-reference-tab=image]').textContent.includes('9/9')&&document.querySelectorAll('[data-reference-kind=image] img').length===9&&!document.querySelector('[data-reference-kind=image] input[multiple]')"));
  for (let number=4;number<=9;number++) await removeReference('image',number);
  await click('[data-reference-tab=image]');
  await run("document.querySelector('[data-reference-tab=image]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))"); await delay(100);
  smoke.check('Keyboard tab switching opens video imports without losing image counts', await run("document.querySelector('[data-reference-tab=video]').getAttribute('aria-selected')==='true'&&document.activeElement.matches('[data-reference-tab=video]')&&document.querySelector('[data-reference-tab=image]').textContent.includes('3/9')&&document.querySelectorAll('[data-reference-kind]').length===1"));
  await click('[data-reference-tab=image]');
  await captureSettings('reference-import-tabs.png','[data-video-reference-inputs]');
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
      assert.match(multi[loader.inputs.video[0]].inputs.file,/\.mp4$/);
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
  await click('[data-reference-kind=image] [data-reference-number="2"] button[aria-label]');
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
        const mime = { '.png': 'image/png', '.mp4': 'video/mp4', '.wav': 'audio/wav' }[ext];
        if (mime) assert.ok(body.toString().includes('Content-Type: ' + mime), 'Upload sends the correct media MIME');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: `uploaded-${uploads.length}${ext}`, subfolder: 'frames', type: 'input' }));
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(responses[req.url.split("/").pop()] || []));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  win = new BrowserWindow({ show: false, width: 1500, height: 980, webPreferences: { offscreen: true, preload: path.join(__dirname, "../apps/electron/preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  win.webContents.debugger.attach("1.3");
  win.webContents.on("console-message", (event) => { if (event.level === "error" && /React|hydration|render|Minified/i.test(event.message)) errors.push(event.message); });
  try {
    await win.loadURL("app://app/create"); await wait("document.querySelector('[data-generate-button]')");
    await dismissAnnouncement();
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
    await verifyDefaults(); await verifyGenerationParameters(); await verifyMediaMentions(); await verifyImageReferences(); await verifyPromptEditing(); await verifyResolution(); await verifyOverrides(); await verifyFailureAndReset(); await verifyServerNames(); await verifyReferenceWorkflow();
  } finally { server.close(); win.destroy(); }
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch((error) => { console.error(error.message); server?.close(); smoke.finish({ app, ok: false }); });
