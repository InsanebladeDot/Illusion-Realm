/** 正式静态画布接线：自动输入、真实 SQLite/文件与播放解码；HTTP 返回夹具，不是模型音质验收。 */
const fs = require("node:fs"), path = require("node:path");
const library = require("./canvas-library-fixture");
const panel = "[data-canvas-audio-panel]", inline = "[data-kind=audio] .hy-generation-panel";
// 音频附件的名称在移除按钮里；悬浮提示改版后不会生成 title 属性。
const uploadedAudio = `${inline} .hy-reference-thumbnail button[aria-label$="audio.wav"]`;

async function save(ctx) {
  const button = '.hy-project-header [aria-label="保存画布"]';
  // 新生成的音频可以先进入播放状态，等工程写入结束再点启用的保存按钮。
  await ctx.wait(`document.querySelector('${button}')?.disabled === false`);
  await ctx.click(button);
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return library.readCanvas(ctx);
}

async function seed(ctx, nodes, edges = []) {
  const value = await library.readCanvas(ctx);
  await library.writeCanvas(ctx, { ...value, nodes, edges });
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node]')");
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
}

function audioNode(id, x, prompt = "") {
  return { id, position: { x, y: 140 }, data: { kind: "audio", title: id, prompt, content: "", ratio: "1/1" } };
}

async function select(ctx, id) {
  await ctx.wait(`document.querySelector('[data-canvas-node=${id}] header>svg')`);
  await ctx.pointer(`[data-canvas-node=${id}] header>svg`);
  await ctx.wait(`document.querySelector('[data-canvas-node=${id}] [data-canvas-workflow] button')`);
  await ctx.click(`[data-canvas-node=${id}] [data-canvas-workflow] button`);
  await ctx.wait(`document.querySelector('${panel}')`);
}

// 空输入、失焦与参数提交分别验证，防止侧栏 Enter 绕过统一箭头发起请求。
async function checkParameters(ctx, state) {
  ctx.smoke.check("Empty audio prompt keeps inline arrow disabled", await ctx.run(`document.querySelector('${inline} .hy-submit').disabled`));
  const before = state.requests.length;
  await ctx.click(".hy-image-sidebar header button");
  await ctx.fill(`${inline} [data-video-prompt]`, "canvas audio fixture");
  await checkDuration(ctx);
  await ctx.click(`${inline} [data-canvas-workflow] button`);
  // 从高级设置编辑，后续检查同一个值是否保存并进入实际音频工作流。
  await ctx.click(`${panel} [data-advanced-settings-toggle]`);
  await ctx.fill(`${panel} [data-advanced-settings] input[name=audio-steps]`, "7");
  await ctx.click(`${panel} [data-seed-mode=custom]`);
  await ctx.fill(`${panel} [data-seed-value]`, "123");
  await ctx.run(`document.querySelector('${panel} form').requestSubmit()`);
  const document = await save(ctx), row = document.nodes.find(node => node.id === "audio-a").data;
  ctx.smoke.check("Settings form submission cannot start audio generation", state.requests.length === before);
  ctx.smoke.check("Shared inline prompt and original settings persist in the current audio node", row.prompt === "canvas audio fixture" && row.audioParameters.steps === 7 && row.audioParameters.durationSeconds === 2.5 && row.audioParameters.seed === "123" && row.audioParameters.random === false);
  await select(ctx, "audio-b");
  ctx.smoke.check("Second audio node has independent defaults", await ctx.run(`document.querySelector('${inline} [data-video-prompt]').textContent===''&&document.querySelector('${panel} [data-seed-mode=random]').getAttribute('aria-pressed')==='true'`));
  await select(ctx, "audio-a");
  ctx.smoke.check("Settings keeps model and advanced fields without prompt, duration, upload or generate", await ctx.run(`!document.querySelector('${panel} [data-video-prompt],${panel} input[type=file],${panel} [data-generate-button],${panel} input[name=audio-duration]')&&!!document.querySelector('${panel} [data-video-loras]')`));
  await ctx.shot("110-audio-node-dark-settings");
  await ctx.click('.hy-image-sidebar header button');
  await ctx.shot("110-audio-node-dark-inline");
}

// 时长只通过原浮层编辑；取消不污染确认值，长正文仍保留半高滚动。
async function checkDuration(ctx) {
  const control = `${inline} [data-canvas-parameter=audio-duration]`;
  ctx.smoke.check("Audio is compact, single-output and uses the original seconds picker", await ctx.run(`getComputedStyle(document.querySelector('${inline} [data-video-prompt]')).height==='80px'&&!document.querySelector('${inline} [data-canvas-parameter=batch]')&&document.querySelector('${control}').textContent.includes('5.0')`));
  await ctx.fill(`${inline} [data-video-prompt]`, "audio text ".repeat(150));
  ctx.smoke.check("Long audio prompt scrolls within the half-height editor", await ctx.run(`(()=>{const e=document.querySelector('${inline} [data-video-prompt]');return e.scrollHeight>e.clientHeight&&getComputedStyle(e).height==='80px'})()`));
  await ctx.fill(`${inline} [data-video-prompt]`, "canvas audio fixture");
  await ctx.click(`${control} button`);
  await ctx.click(`${control} button[aria-label="2.0秒"]`);
  await ctx.click(`${control} button`);
  await ctx.click(`${control} button[aria-label="自定义"]`);
  await durationDraft(ctx, `${control} input`, "2.5");
  await ctx.key("Enter");
  ctx.smoke.check("Custom audio duration commits through the reused floating input", await ctx.run(`document.querySelector('${control}').textContent.includes('2.5秒')&&!document.querySelector('${control} input')`));
  await ctx.click(`${control} button`);
  await ctx.click(`${control} button[aria-label="自定义"]`);
  await durationDraft(ctx, `${control} input`, "3.5");
  await ctx.key("Escape");
  ctx.smoke.check("Escape discards unconfirmed audio duration", await ctx.run(`document.querySelector('${control}').textContent.includes('2.5秒')`));
}

// 通用fill会主动失焦并确认数值；这里保持焦点，才能验证Enter确认与Escape取消的区别。
async function durationDraft(ctx, selector, value) {
  await ctx.run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}

async function checkGeneration(ctx, state) {
  const before = state.requests.length;
  // 通过节点的生成按钮提交，使用服务夹具检查调度器收到的步数。
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.querySelector('[data-canvas-node=audio-a] [data-canvas-media=audio][data-media-status=ready]')");
  const document = await save(ctx), media = document.nodes.find(node => node.id === "audio-a").data.media;
  const graph = state.requests[before].prompt;
  ctx.smoke.check("Audio request reuses MiniMax graph with node prompt, steps and custom seed", state.requests.length === before + 1 && Object.values(graph).some(node => node.class_type === "PreviewAudio") && Object.values(graph).some(node => node.inputs.prompt === "canvas audio fixture") && Object.values(graph).some(node => node.class_type === "RandomNoise" && node.inputs.noise_seed === 123) && Object.values(graph).some(node => node.class_type === "BasicScheduler" && node.inputs.steps === 7) && Object.values(graph).some(node => node.class_type === "PrimitiveFloat" && node.inputs.value === 2.5));
  const gallery = path.join(ctx.root, "gallery");
  ctx.smoke.check("Audio saved once in project Audio directory and retains source node identity", fs.existsSync(media.path) && path.basename(path.dirname(media.path)) === "Audio" && document.nodes.length === 2 && (!fs.existsSync(gallery) || fs.readdirSync(gallery).length === 0));
  await ctx.click('[data-canvas-node=audio-a] [aria-label="播放音频"]');
  await ctx.wait("document.querySelector('[data-canvas-node=audio-a] audio').currentTime>0");
  ctx.smoke.check("Generated audio decodes and really advances playback", await ctx.run("!document.querySelector('[data-canvas-node=audio-a] audio').paused"));
  await ctx.click('[data-canvas-node=audio-a] [aria-label="暂停音频"]');
  return document;
}

async function checkCancelAndFailure(ctx, state, document) {
  state.mode = "hold";
  const before = state.requests.length;
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.querySelector('[data-canvas-node=audio-a] [data-canvas-node-loading]')");
  await ctx.wait(`window.electronAPI!==undefined`);
  for (let index = 0; index < 100 && state.requests.length === before; index++) await new Promise(resolve => setTimeout(resolve, 50));
  ctx.smoke.check("Held request reached real shared queue before cancellation", state.requests.length === before + 1);
  await ctx.click('[data-canvas-node=audio-a] [data-canvas-node-loading] button');
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
  ctx.smoke.check("Cancel stops pending audio and preserves previous media", state.requests[before].cancelled && (await save(ctx)).nodes[0].data.media.path === document.nodes[0].data.media.path);
  state.mode = "fail";
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')&&document.querySelector('[data-app-toast=error]')?.textContent.includes('生成失败')");
  ctx.smoke.check("Audio service failure recovers controls without replacing good output", (await save(ctx)).nodes[0].data.media.path === document.nodes[0].data.media.path && await ctx.run(`!document.querySelector('${inline} .hy-submit').disabled`));
  state.mode = "normal";
}

async function checkReferences(ctx, state, document) {
  const source = document.nodes.find(node => node.id === "audio-a"), target = audioNode("audio-ref", 600, "Use @audio1 for ambience");
  await seed(ctx, [source, target], [{ id: "audio-edge", source: source.id, target: target.id, sourceHandle: "out", targetHandle: "in" }]);
  await select(ctx, target.id);
  await ctx.click('.hy-image-sidebar header button');
  ctx.smoke.check("Linked audio uses the reference template duration default", await ctx.run(`document.querySelector('${inline} [data-canvas-parameter=audio-duration]>button').textContent==='5.0秒'`));
  const before = state.requests.length, uploads = state.uploads;
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.querySelector('[data-canvas-node=audio-ref] [data-canvas-media=audio][data-media-status=ready]')");
  const graph = state.requests[before].prompt;
  ctx.smoke.check("Linked reference uploads once and submits official Audio 1 tag", state.uploads === uploads + 1 && Object.values(graph).some(node => node.class_type === "LoadAudio" && /reference-.*\.wav$/.test(node.inputs.audio)) && Object.values(graph).some(node => String(node.inputs.prompt).includes("<Audio 1>")));
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  ctx.win.setSize(960, 820);
  await ctx.click(`${inline} [data-canvas-workflow] button`);
  await ctx.wait(`document.querySelector('${panel}')`);
  await ctx.shot("111-audio-node-light-narrow-settings");
  ctx.smoke.check("Light narrow settings scroll without duplicate generation UI", await ctx.run(`(()=>{const p=document.querySelector('${panel}'),s=p.getBoundingClientRect();return s.left>=0&&s.right<=innerWidth&&getComputedStyle(p.querySelector('form>div')).overflowY==='auto'&&!p.querySelector('[data-video-prompt],input[type=file],[data-generate-button]')})()`));
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  await revealInline(ctx);
  await ctx.shot("111-audio-node-light-narrow-inline");
  await save(ctx);
}

// 节点输入处于世界坐标，适配全部只包住卡片；像移动地图一样平移视口来完整查看输入。
// 用实际鼠标拖空白验证可达性，不改产品样式、不直接写 ReactFlow 的镜头状态。
async function revealInline(ctx) {
  const point = await ctx.run(`(()=>{const p=document.querySelector('.react-flow__pane').getBoundingClientRect(),r=document.querySelector('${inline}').getBoundingClientRect();return {x:Math.round(p.right-16),y:Math.round(r.top-12),dx:Math.min(0,Math.floor(p.right-24-r.right)),dy:Math.min(0,Math.floor(p.bottom-150-r.bottom))}})()`);
  const end = { x: point.x + point.dx, y: point.y + point.dy };
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
  ctx.win.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...end, modifiers: ["leftButtonDown"] });
  ctx.win.webContents.sendInputEvent({ type: "mouseUp", ...end, button: "left", clickCount: 1 });
  await ctx.wait(`(()=>{const r=document.querySelector('${inline}').getBoundingClientRect();return r.left>=160&&r.right<=innerWidth&&r.top>=45&&r.bottom<innerHeight-100})()`);
  ctx.smoke.check("Narrow canvas pan exposes the full prompt and enabled inline arrow", await ctx.run(`!document.querySelector('${inline} .hy-submit').disabled`));
}

async function checkVideoLoras(ctx) {
  ctx.win.setSize(1600, 1000);
  const video = { ...audioNode("video-lora", 100), data: { kind: "video", title: "Video", prompt: "", content: "", ratio: "16/9", workflow: "minimax" } };
  await seed(ctx, [video]);
  await ctx.pointer('[data-canvas-node=video-lora] header>svg');
  await ctx.click('[data-canvas-node=video-lora] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-video-loras]')");
  await ctx.click('.hy-image-sidebar [data-extension-picker-trigger]');
  await ctx.wait("document.querySelector('[data-resource-card]')");
  await ctx.click('[data-resource-selection-mode=multiple]');
  await ctx.click('[data-resource-card] [data-resource-model-picker]');
  await ctx.wait("document.querySelector('[data-resource-version-grid]')");
  ctx.smoke.check("Video reuses original extension selector and sees all four deep-folder weights", await ctx.run("document.querySelectorAll('[data-resource-version-grid] [data-resource-card]').length===4&&!document.querySelector('[data-resource-version-grid]').textContent.includes('Excluded')"));
  await ctx.shot("112-minimax-deep-lora-versions");
  for (const index of [1, 2, 3, 4]) await ctx.click(`[data-resource-version-grid] [data-resource-card]:nth-child(${index}) [data-resource-model-select]`);
  await ctx.click('[data-resource-model-done]');
  await ctx.click('[data-resource-confirm]');
  const document = await save(ctx), loras = document.nodes[0].data.workflowLoras.minimax;
  ctx.smoke.check("Confirmed video LoRAs retain distinct file identities and Minimax relative names", loras.length === 4 && new Set(loras.map(item => item.name)).size === 4 && loras.every(item => /^minimax[/\\]/i.test(item.name)));
  await ctx.click('.hy-image-sidebar header button');
}

// CDP 只提供真实磁盘 File；原上传控件、工程复制、SQLite、归档读写均执行生产代码。
async function checkUploadedReference(ctx, state) {
  // 兼容旧批量工程：保留字段可以重开，但单次生成必须只发送一份请求。
  const legacy = audioNode("uploaded", 300, "@audio1 ambience");
  legacy.data.audioParameters = { count: 6 };
  await seed(ctx, [legacy]);
  await select(ctx, "uploaded");
  await ctx.click('.hy-image-sidebar header button');
  const source = path.resolve("scripts/fixtures/video-composition/audio.wav");
  // 共用原媒体测试的选择器拦截；从节点加号进入生产资源库，再交给真正的文件输入。
  await require("./check-canvas-media").chooseFiles(ctx, [source], `${inline} .hy-reference-add`);
  await ctx.wait(`document.querySelector('${uploadedAudio}')`);
  const saved = await save(ctx), data = saved.nodes[0].data, reference = data.audioParameters.reference;
  ctx.smoke.check("Original audio upload creates managed reference without replacing output", !data.media && fs.existsSync(reference.path) && path.basename(path.dirname(reference.path)) === "Audio" && reference.path !== source);
  const archive = require("../../apps/electron/src/main/modules/canvas/project-archive"), file = path.join(ctx.root, "audio.ircanvas");
  await archive.writeArchive(file, saved);
  const restored = await archive.readArchive(file, path.join(ctx.root, "restored")), copy = restored.nodes[0].data.audioParameters.reference;
  ctx.smoke.check("Portable project carries reference audio and restores identical bytes independently", copy.path !== reference.path && fs.readFileSync(copy.path).equals(fs.readFileSync(source)));
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx); await select(ctx, "uploaded");
  ctx.smoke.check("Reopened SQLite audio node restores uploaded reference and prompt", await ctx.run(`!!document.querySelector('${uploadedAudio}')&&document.querySelector('${inline} [data-video-prompt]').textContent.includes('@audio1')`));
  await ctx.click('.hy-image-sidebar header button');
  const before = state.requests.length;
  ctx.smoke.check("Legacy audio batch value does not restore a batch control", await ctx.run(`!document.querySelector('${inline} [data-canvas-parameter=batch]')`));
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.querySelector('[data-canvas-node=uploaded] [data-canvas-media=audio][data-media-status=ready]')");
  ctx.smoke.check("Legacy count six still produces exactly one request and one audio card", state.requests.length === before + 1 && (await save(ctx)).nodes.length === 1);
}

async function checkCanvasAudio(ctx, state) {
  await checkGptSovits(ctx, state);
  if (process.env.CANVAS_GSV_ONLY === "1") return;
  await seed(ctx, [audioNode("audio-a", 300), audioNode("audio-b", 900)]);
  await select(ctx, "audio-a"); await checkParameters(ctx, state);
  const document = await checkGeneration(ctx, state);
  await checkCancelAndFailure(ctx, state, document);
  await checkReferences(ctx, state, document);
  await checkUploadedReference(ctx, state);
  await checkVideoLoras(ctx);
}

async function checkMiniMaxVoice(ctx) {
  const add = `${inline} .hy-reference-add[aria-label="插入音频"]`;
  const menu = "[data-canvas-voice-menu]";
  // 在 MiniMax 默认入口验证工具栏精简后，音色和本地上传仍可从音频面板进入。
  await ctx.wait(`document.querySelector(${JSON.stringify(add)})`);
  ctx.smoke.check("Audio attachments say Insert audio and show no prompt resource tools", await ctx.run(`!document.querySelector('${inline} [data-create-prompt-tools]') && !!document.querySelector(${JSON.stringify(add)})`));
  const catalog = await ctx.run("window.electronAPI.canvasReferenceVoices()");
  const voice = catalog.data.find(item => item.role === "凯文" && item.tone === "坚定");
  await ctx.click(`${inline} [data-canvas-voice] button`);
  await hoverVoiceItem(ctx, `${menu} [data-assistant-column="0"] [aria-label="凯文"]`);
  await hoverVoiceItem(ctx, `${menu} [data-assistant-column="1"] [aria-label="坚定"]`);
  const clip = `${menu} [data-assistant-column="2"] [aria-label=${JSON.stringify(voice.media.name)}]`;
  await ctx.wait(`document.querySelector(${JSON.stringify(clip)})`);
  await ctx.click(clip);
  // 验证音色反映到公共轻提示，画布内不会同时留下旧的提示文字。
  await ctx.wait("document.querySelector('[data-app-toast=success]')?.textContent.includes('已选用 凯文 · 坚定 的录音。')");
  ctx.smoke.check("Voice selection uses the global toast without a duplicate canvas message", await ctx.run("!document.querySelector('[data-canvas-message]')"));
  await ctx.wait(`!document.querySelector('${menu}') && document.querySelector('${inline} .hy-reference-thumbnail')`);
  const { reference } = (await save(ctx)).nodes[0].data.audioParameters;
  ctx.smoke.check("MiniMax attaches the selected voice as its reference audio", reference.name === voice.media.name && fs.readFileSync(reference.path).equals(fs.readFileSync(voice.media.path)));
  await ctx.click(`${inline} .hy-reference-thumbnail button`);
}

// 从现有节点的附件按钮导入真实文件，空参考时不应产生 HTTP 请求。
async function checkGptSovits(ctx, state) {
  await seed(ctx, [audioNode("gpt-audio", 300, "The sky is bright.")]);
  await select(ctx, "gpt-audio");
  await ctx.click('.hy-image-sidebar header button');
  await checkMiniMaxVoice(ctx);
  await ctx.click(`${inline} [data-canvas-parameter=audio-engine] .hy-chip`);
  await ctx.click(`${inline} [aria-label="GPT-SoVITS"]`);
  const initial = state.requests.length, initialUploads = state.uploads;
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.body.textContent.includes('请添加一段 3–10 秒的参考音频。')");
  ctx.smoke.check("GPT-SoVITS requires one reference and hides MiniMax duration", state.requests.length === initial && state.uploads === initialUploads && await ctx.run(`!document.querySelector('${inline} [data-canvas-parameter=audio-duration]')`));
  await checkNarrowVoiceMenu(ctx);
  await checkVoiceMenu(ctx);
  // 该工作流只有一个参考槽，换成自定义录音之前先移除内置样本。
  await ctx.click(`${inline} .hy-reference-thumbnail button`);
  await ctx.wait(`document.querySelector('${inline} .hy-reference-add')`);
  await checkCustomVoice(ctx);
  const source = path.resolve("scripts/fixtures/video-composition/audio.wav");
  await require("./check-canvas-media").chooseFiles(ctx, [source], `${inline} .hy-reference-add`);
  await ctx.wait(`document.querySelector('${uploadedAudio}')`);
  await setGptSovitsParameters(ctx);
  await ctx.click(`${inline} .hy-submit`);
  await ctx.wait("document.querySelector('[data-canvas-node=gpt-audio] [data-canvas-media=audio][data-media-status=ready]')");
  const request = state.requests[initial], document = await save(ctx);
  checkGptSovitsResult(ctx, state, request, initial, initialUploads, document, source);
  await ctx.shot("113-gpt-sovits-generated");
}

const CUSTOM_VOICE = { role: "测试角色", tone: "平静", transcript: "你听到了吗?" };
const VOICE_FORM = "[data-canvas-voice-import]";
const VOICE_MENU = "[data-canvas-voice-menu]";

async function openCustomVoiceForm(ctx) {
  await ctx.click(`${inline} [data-canvas-voice] button`);
  await ctx.wait(`document.querySelector('${VOICE_MENU} [data-assistant-item=add-voice]')`);
  await ctx.click(`${VOICE_MENU} [data-assistant-item=add-voice]`);
  await ctx.wait(`document.querySelector('${VOICE_FORM} input[name=role]') === document.activeElement`);
  for (const [name, value] of Object.entries(CUSTOM_VOICE)) await ctx.fill(`${VOICE_FORM} input[name=${name}]`, value);
}

async function checkCustomVoice(ctx) {
  const { dialog } = require("electron");
  const original = dialog.showOpenDialog;
  const source = path.resolve("scripts/fixtures/video-composition/audio.wav");
  const directory = path.join(ctx.root, "user", "Character Voices");
  const file = path.join(directory, CUSTOM_VOICE.role, CUSTOM_VOICE.tone, "你听到了吗？.wav");
  await openCustomVoiceForm(ctx);
  // 系统框只模拟选择结果，用户目录的落盘、扫描和工程引用都走正式 IPC。
  try {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    await ctx.click(`${VOICE_FORM} button[type=submit]`);
    await ctx.wait(`document.querySelector('${VOICE_FORM} button[type=submit]')?.disabled === false`);
    ctx.smoke.check("Canceling the file picker keeps voice fields and creates no library", !fs.existsSync(directory) && await ctx.run(`document.querySelector('${VOICE_FORM} input[name=transcript]').value === ${JSON.stringify(CUSTOM_VOICE.transcript)}`));
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    await ctx.click(`${VOICE_FORM} button[type=submit]`);
    await ctx.wait("document.querySelector('[data-app-toast=success]')?.textContent.includes('已添加 测试角色 · 平静')");
    await ctx.shot("116-custom-voice-saved");
    ctx.smoke.check("Voice library stores the original bytes at the role/tone/transcript path", fs.readFileSync(file).equals(fs.readFileSync(source)));
    await checkVoiceImportRejections(ctx, file);
    await selectCustomVoice(ctx, file);
  } finally { dialog.showOpenDialog = original; }
}

async function checkVoiceImportRejections(ctx, file) {
  const invalidRequest = { ...CUSTOM_VOICE, role: "../escaped" };
  const invalid = await ctx.run(`window.electronAPI.canvasAddReferenceVoice(${JSON.stringify(invalidRequest)})`);
  ctx.smoke.check("Voice import rejects traversal at the IPC boundary", !invalid.success && invalid.code === "INVALID_ARGUMENT");
  // 对同名文件从正式入口再选一次，已有音频字节必须保持原样。
  const previous = fs.readFileSync(file);
  const duplicate = await ctx.run(`window.electronAPI.canvasAddReferenceVoice(${JSON.stringify(CUSTOM_VOICE)})`);
  ctx.smoke.check("Matching transcripts never overwrite an existing clip", !duplicate.success && duplicate.error === "voice-already-exists" && fs.readFileSync(file).equals(previous));
}

async function selectCustomVoice(ctx, file) {
  const name = path.basename(file);
  for (const label of [CUSTOM_VOICE.role, CUSTOM_VOICE.tone, name]) {
    const selector = `${VOICE_MENU} [aria-label=${JSON.stringify(label)}]`;
    await ctx.wait(`document.querySelector(${JSON.stringify(selector)})`);
    await ctx.click(selector);
  }
  await ctx.wait(`!document.querySelector('${VOICE_MENU}') && document.querySelector('${inline} .hy-reference-thumbnail')`);
  const audio = (await save(ctx)).nodes[0].data.audioParameters;
  ctx.smoke.check("Custom voice is selectable and its filename fills the GPT-SoVITS transcript", audio.reference.name === name && audio.reference.path !== file && audio.gptSovits.transcript === "你听到了吗？");
  await ctx.click(`${inline} .hy-reference-thumbnail button`);
  await ctx.wait(`document.querySelector('${inline} .hy-reference-add')`);
}

async function hoverVoiceItem(ctx, selector) {
  await ctx.wait(`document.querySelector(${JSON.stringify(selector)})`);
  const point = await ctx.run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...point });
}

async function checkNarrowVoiceMenu(ctx) {
  const menu = "[data-canvas-voice-menu]";
  const voice = `${inline} [data-canvas-voice] button`;
  const [width, height] = ctx.win.getSize();
  try {
    // 725px 放不下缩窄后的完整三级菜单，仍要能点进语气这一级。
    ctx.win.setSize(725, height);
    await ctx.wait("innerWidth === 725");
    await ctx.click(voice);
    await ctx.wait(`document.querySelector('${menu} [aria-label="凯文"]')`);
    await ctx.click(`${menu} [aria-label="凯文"]`);
    await ctx.click(`${menu} [aria-label="坚定"]`);
    ctx.smoke.check("Narrow canvas keeps all three voice levels reachable by click", await ctx.run(`document.querySelectorAll('${menu} [data-assistant-column]').length === 1 && !!document.querySelector('${menu} [data-gsv-voice-play]')`));
    await ctx.key("Escape");
  } finally {
    ctx.win.setSize(width, height);
    await ctx.wait(`innerWidth === ${width}`);
  }
}

async function checkVoiceMenu(ctx) {
  const menu = "[data-canvas-voice-menu]";
  const voiceResult = await ctx.run("window.electronAPI.canvasReferenceVoices()");
  const voice = voiceResult.data.find(item => item.role === "凯文" && item.tone === "坚定");
  await ctx.click(`${inline} [data-canvas-voice] button`);
  // 真实鼠标横移通过三列；用内置录音文件检测试听、导入和工程保存。
  await hoverVoiceItem(ctx, `${menu} [data-assistant-column="0"] [aria-label="凯文"]`);
  await hoverVoiceItem(ctx, `${menu} [data-assistant-column="1"] [aria-label="坚定"]`);
  const clip = `${menu} [data-assistant-column="2"] [aria-label=${JSON.stringify(voice.media.name)}]`;
  await ctx.wait(`document.querySelector(${JSON.stringify(clip)})`);
  // 读取真实边界，确认语气缩窄后录音列紧贴其右边，鼠标不会划过空隙。
  const readBounds = `(() => {
    const [role, tone, clip] = [...document.querySelectorAll('${menu} [data-assistant-column]')].map(node => node.getBoundingClientRect());
    return { role: role.width, tone: tone.width, clip: clip.width, gap: clip.left - tone.right };
  })()`;
  const matchesBounds = `(({ role, tone, clip, gap }) => Math.abs(tone - role / 2) < 1 && Math.abs(clip - role) < 1 && Math.abs(gap) < 1)(${readBounds})`;
  await ctx.wait(matchesBounds);
  ctx.smoke.check("Tone column is half width and the recording column meets its right edge", await ctx.run(matchesBounds), JSON.stringify(await ctx.run(readBounds)));
  await ctx.click(`${menu} [data-assistant-column="2"] [data-gsv-voice-play]`);
  await ctx.wait("document.querySelector('[data-gsv-voice-preview]').currentTime > 0");
  ctx.smoke.check("Preview plays without replacing the reference slot", !(await save(ctx)).nodes[0].data.audioParameters.reference);
  await ctx.shot("114-gpt-sovits-voice-menu");
  await ctx.click(clip);
  // 录音先复制到工程，再写节点，保存要等选用动作真正完成。
  await ctx.wait(`!document.querySelector('${menu}') && document.querySelector('${inline} .hy-reference-thumbnail')`);
  await checkSelectedVoice(ctx, voice);
}

async function checkSelectedVoice(ctx, voice) {
  const audio = (await save(ctx)).nodes[0].data.audioParameters;
  const reference = audio.reference;
  ctx.smoke.check("Voice selection copies the chosen recording into project Audio", path.basename(path.dirname(reference.path)) === "Audio" && fs.readFileSync(reference.path).equals(fs.readFileSync(voice.media.path)));
  // 文件名是台词，移除 WAV 扩展名后，应在输入框与保存后的工程中看到同一行。
  const transcript = path.parse(voice.media.path).name;
  const field = "[data-canvas-gpt-sovits] [data-gpt-sovits-transcript]";
  await ctx.click(`${inline} [data-canvas-workflow] button`);
  await ctx.wait(`document.querySelector('${field}')`);
  const displayed = await ctx.run(`document.querySelector('${field}').value`);
  ctx.smoke.check("Voice selection fills and saves the reference transcript from the WAV name", !/^audio[_-]/i.test(transcript) && audio.gptSovits.transcript === transcript && displayed === transcript);
  await ctx.click('.hy-image-sidebar header button');
}

async function checkGptSovitsWeights(ctx) {
  const entry = "[data-gsv-weight-summary]";
  const gpt = '[data-resource-model-option="GPT_weights/fixture.ckpt"]';
  const sovits = '[data-resource-model-option="SoVITS_weights/fixture.pth"]';
  const shows = (selector, text) => `document.querySelector(${JSON.stringify(selector)}).textContent.includes(${JSON.stringify(text)})`;
  ctx.smoke.check("Weight summary reads both defaults from the workflow", await ctx.run(`${shows(entry, "s1v3.ckpt")} && ${shows(entry, "s2Gv2ProPlus.pth")}`));
  await ctx.click(entry);
  await ctx.wait(`document.querySelector(${JSON.stringify(gpt)})`);
  ctx.smoke.check("Weight cards use a graphic when the model has no cover", await ctx.run(`!!document.querySelector(${JSON.stringify(`${gpt} [data-resource-cover-placeholder] svg`)})`));
  await ctx.click(gpt);
  // 取消一次后重开，再确认整对；后续检查提交到 ComfyUI 的图也收到相同的权重。
  await ctx.key("Escape");
  ctx.smoke.check("Escape discards the draft and returns focus to the weight summary", await ctx.run(`${shows(entry, "s1v3.ckpt")} && document.activeElement.matches('${entry}')`));
  await ctx.click(entry);
  await ctx.wait(`document.querySelector(${JSON.stringify(gpt)})`);
  await ctx.click(gpt);
  await ctx.click('[data-gsv-slot=sovits]');
  await ctx.click(sovits);
  await ctx.shot("115-gpt-sovits-weight-picker");
  await ctx.click('[data-gsv-confirm]');
  ctx.smoke.check("Confirm shows both selected weights in the summary", await ctx.run(`${shows(entry, "fixture.ckpt")} && ${shows(entry, "fixture.pth")}`));
}

async function checkGptSovitsTiming(ctx, sidebar) {
  const speed = `${sidebar} input[name=gsv-speed]`;
  const interval = `${sidebar} input[name=gsv-interval]`;
  await ctx.click(`${sidebar} [data-advanced-settings-toggle]`);
  // 用不同于模板的语速和 0 秒间隔，能抓到漏传字段和把 0 当成空值的错误。
  ctx.smoke.check("Advanced speech timing defaults to the original workflow values", await ctx.run(`document.querySelector('${speed}').valueAsNumber === 1 && document.querySelector('${interval}').valueAsNumber === 0.15`));
  await ctx.fill(speed, "1.35");
  await ctx.fill(interval, "0");
}

async function setGptSovitsParameters(ctx) {
  await ctx.click(`${inline} [data-canvas-workflow] button`);
  await ctx.wait("document.querySelector('[data-canvas-gpt-sovits]')");
  const sidebar = "[data-canvas-gpt-sovits]";
  ctx.smoke.check("Both GPT-SoVITS languages default to automatic", await ctx.run(`document.querySelectorAll('${sidebar} [data-simple-select-value=auto]').length === 2`));
  await checkGptSovitsWeights(ctx);
  await checkGptSovitsTiming(ctx, sidebar);
  await ctx.fill(`${sidebar} [data-gpt-sovits-transcript]`, "这是参考录音。");
  // 两套语言故意不同，任何字段交叉都会在实际提交的图上暴露。
  await ctx.click(`${sidebar} [data-gpt-sovits-field=text-language]`);
  await ctx.click('[data-simple-select-option="en"]');
  await ctx.click(`${sidebar} [data-gpt-sovits-field=cut]`);
  await ctx.click('[data-simple-select-option="不切"]');
  await ctx.shot("112-gpt-sovits-settings");
  await ctx.click('.hy-image-sidebar header button');
}

function checkGptSovitsResult(ctx, state, request, initial, initialUploads, document, source) {
  const graph = request.prompt, data = document.nodes[0].data;
  ctx.smoke.check("Exactly one GPT-SoVITS task uploads and uses ComfyUI's returned relative path", state.requests.length === initial + 1 && state.uploads === initialUploads + 1 && graph["3"].inputs.audio === `fixture-input/reference-${state.uploads}.wav`);
  ctx.smoke.check("GPT-SoVITS submits both confirmed weights and keeps the two text inputs distinct", graph["1"].inputs.gpt === "GPT_weights/fixture.ckpt" && graph["1"].inputs.sovits === "SoVITS_weights/fixture.pth" && data.audioParameters.gptSovits.gptWeight === graph["1"].inputs.gpt && data.audioParameters.gptSovits.sovitsWeight === graph["1"].inputs.sovits && graph["2"].inputs.text === "The sky is bright." && graph["2"].inputs.language === "en" && graph["2"].inputs.cut === "不切" && graph["4"].inputs.transcript === "这是参考录音。" && graph["4"].inputs.language === "auto");
  const timing = graph["5"].inputs, saved = data.audioParameters.gptSovits;
  ctx.smoke.check("Edited speech timing reaches the synth node and survives save", timing.speed === 1.35 && timing.interval === 0 && saved.speed === 1.35 && saved.interval === 0);
  // 读盘核对声音字节，节点内只有媒体索引以及可恢复的参数。
  ctx.smoke.check("The temporary preview is saved in project Audio and returned to the same node", document.nodes.length === 1 && data.audioParameters.engine === "gpt-sovits" && data.audioParameters.gptSovits.textLanguage === "en" && data.media.path !== data.audioParameters.reference.path && path.basename(path.dirname(data.media.path)) === "Audio" && fs.readFileSync(data.media.path).equals(fs.readFileSync(source)));
}

module.exports = { checkCanvasAudio, revealInline };
