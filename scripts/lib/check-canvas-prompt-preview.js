/** 静态画布真实组件回归；媒体与持久化是真实本机读写，转换服务明确使用 IPC 替身。 */
const fs = require("node:fs"), path = require("node:path");
const library = require("./canvas-library-fixture");
const panel = "[data-canvas-node=target] .hy-generation-panel";
const preview = `${panel} [data-canvas-parameter=prompt-preview]`;
const editor = `${panel} [data-video-prompt]`;

// 只替代外部文本服务，仍从原工具栏经过 preload、共享 schema 和请求封装。
// 不访问用户令牌或付费服务；hold 用于确定性验证迟到回包不会覆盖新输入。
function installFixture() {
  const { registerHandle } = require("../../apps/electron/src/main/ipc/result");
  const { IPC_CHANNELS: C } = require("../../apps/electron/src/common/ipc-channels");
  const state = { requests: [], hold: false, complete: null, output: null };
  registerHandle(C.PROMPT_TRANSFORM, (_event, request) => {
    state.requests.push(request);
    if (state.failure) throw new Error(state.failure);
    return state.hold ? new Promise(resolve => { state.complete = resolve; }) : state.output ?? `${request.text} transformed`;
  });
  return state;
}

// 输入经生产工程导入复制到受管目录；seed 只建立场景，不把结果直接注入组件状态。
async function media(ctx, kind, file) {
  const document = await library.readCanvas(ctx);
  const input = { name: document.name, workspace: document.workspace, mode: "copy", files: [{ kind, path: file, name: path.basename(file), size: fs.statSync(file).size }] };
  const result = await ctx.run(`window.electronAPI.canvasImportMedia(${JSON.stringify(input)})`);
  if (!result.success) throw Error(result.error);
  return result.data.media[0];
}

async function seed(ctx, data, position = { x: 300, y: 140 }, extras = [], edges = []) {
  const document = await library.readCanvas(ctx);
  await library.writeCanvas(ctx, { ...document, nodes: [{ id: "target", position, data: { title: "Reference preview", content: "", ratio: "16/9", ...data } }, ...extras], edges });
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await ctx.wait("document.querySelector('[data-canvas-node=target] header>svg')");
  await ctx.pointer('[data-canvas-node=target] header>svg');
  await ctx.wait(`document.querySelector('${editor}')`);
}

async function showPreview(ctx, expected) {
  if (!await ctx.run(`!!document.querySelector('${preview} .hy-prompt-preview')`)) await ctx.click(`${preview}>button`);
  await ctx.wait(`document.querySelector('${preview} [data-prompt-conversion-text]')`);
  await ctx.run(`document.querySelector('${preview} .hy-prompt-preview').focus()`);
  if (expected !== undefined) ctx.smoke.check(`Preview displays actual prompt: ${expected}`, await ctx.run(`document.querySelector('${preview} [data-prompt-conversion-text]').textContent===${JSON.stringify(expected)}`));
  ctx.smoke.check("Preview sits immediately before the shared generation arrow", await ctx.run(`document.querySelector('${preview}').nextElementSibling.matches('.hy-submit')`));
  ctx.smoke.check("Preview clears the entire shared action row", await ctx.run(`(()=>{const p=document.querySelector('${preview} .hy-ratio-popup').getBoundingClientRect(),f=document.querySelector('${panel} .hy-panel-footer').getBoundingClientRect();return p.bottom<=f.top})()`));
}

// DOM 事件用于工具栏，键盘 Escape 用真实 Electron 输入；没有人工点击证据。
async function translate(ctx) {
  await ctx.run(`document.querySelector('${panel} [data-assistant-options]').focus()`);
  await ctx.click(`${panel} [data-assistant-translate]`);
}

async function checkAssistant(ctx, state, raw, official) {
  const before = state.requests.length;
  await ctx.key("Escape");
  await translate(ctx);
  await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(`${raw} transformed`)}`);
  const request = state.requests[before];
  ctx.smoke.check("Assistant receives official markers and a marker-preservation instruction", state.requests.length === before + 1 && request.text === official && request.instruction.includes("<Audio N>"));
  ctx.smoke.check('Translated text retains editable resource chips', await ctx.run(`!!document.querySelector('${editor} [data-media-reference]')`));
  await showPreview(ctx, `${official} transformed`);
  await ctx.key('Escape');
  await ctx.click(`${panel} [data-assistant-undo]`);
  ctx.smoke.check("Assistant undo restores the original @ draft", await ctx.run(`document.querySelector('${editor}').textContent===${JSON.stringify(raw)}`));
}

// 错号、漏号和超长都必须保留原稿；测试只替代外部响应，仍走实际工具栏及输入组件。
async function checkRejectedTranslations(ctx, state, image) {
  await seed(ctx, { kind: 'image', workflow: 'minimax-image-edit', prompt: 'Use @picture1', inputImages: [image] });
  for (const output of ['Missing all markers', 'Wrong <Picture 9>', '<Picture 1>' + 'x'.repeat(4100)]) {
    state.output = output;
    const count = state.requests.length;
    await translate(ctx);
    await ctx.wait(`!document.querySelector('${panel} [data-assistant-translate]').disabled`);
    ctx.smoke.check('Invalid or oversized translations preserve the draft and chip', state.requests.length === count + 1 && await ctx.run(`document.querySelector('${editor}').textContent==='Use @picture1'&&!!document.querySelector('${editor} [data-media-reference]')`));
  }
  state.output = null;
  state.hold = true;
  await translate(ctx);
  await ctx.wait(`document.querySelector('${panel} [data-assistant-translate]').disabled`);
  for (let index = 0; index < 100 && !state.complete; index++) await new Promise(resolve => setTimeout(resolve, 20));
  if (!state.complete) throw Error('held reference request missing');
  await showPreview(ctx); await ctx.click(`${preview} [role=switch]`); await ctx.key('Escape');
  state.complete('Translated <Picture 1>'); state.hold = false; state.complete = null;
  await ctx.wait(`document.querySelector('${panel} [data-assistant-result]')`);
  await ctx.click(`${panel} [data-assistant-result] button`);
  ctx.smoke.check('Manual apply cannot bypass changed reference settings', await ctx.run(`document.querySelector('${editor}').textContent==='Use @picture1'&&!!document.querySelector('${panel} [data-assistant-result]')`));
  await ctx.shot('127-transcreation-reference-protection');
}

// 在三类真实节点读实际排版，防止共用组件仍被类型专属样式拉成两套尺寸。
async function checkPanelLayout(ctx, kind) {
  ctx.smoke.check(`${kind} uses the compact input and a single unobstructed footer`, await ctx.run(`(()=>{const p=document.querySelector('${panel}'),a=p.querySelector('.hy-panel-options'),s=p.querySelector('.hy-panel-submit'),r=s.getBoundingClientRect();return getComputedStyle(p.querySelector('.hy-reference-prompt')).height==='80px'&&a.getBoundingClientRect().height<=32&&[...a.children].every(e=>e.getBoundingClientRect().right<=r.left)&&Math.abs(a.getBoundingClientRect().bottom-r.bottom)<2})()`));
}

async function checkImageAndVideo(ctx, state, image) {
  for (const kind of ["image", "video"]) {
    await seed(ctx, { kind, workflow: kind === "image" ? "minimax-image-edit" : "minimax-reference", prompt: "Use @picture1", inputImages: [image] });
    await checkPanelLayout(ctx, kind);
    ctx.smoke.check("Footer options do not overlap submit controls", await ctx.run(`(()=>{const s=document.querySelector('${panel} .hy-panel-submit').getBoundingClientRect();return [...document.querySelector('${panel} .hy-panel-options').children].every(e=>e.getBoundingClientRect().right<=s.left)})()`));
    // 检查实际缩放与中心圆，六齿轮外轮廓本身不必等宽高，不能拿外接框当拉伸证据。
    if (kind === "image") ctx.smoke.check("Image footer remains one row with an undistorted settings glyph", await ctx.run(`(()=>{const p=document.querySelector('${panel}'),a=p.querySelector('.hy-panel-options'),s=p.querySelector('.hy-panel-submit'),icon=s.querySelector('.hy-icon-button svg'),m=icon.querySelector('circle').getScreenCTM(),r=icon.getBoundingClientRect();return a.getBoundingClientRect().height<=32&&Math.abs(a.getBoundingClientRect().bottom-s.getBoundingClientRect().bottom)<2&&Math.abs(m.a-m.d)<.001&&Math.abs(r.width-r.height)<.1})()`));
    await showPreview(ctx, "Use <Picture 1>");
    ctx.smoke.check("Conversion starts enabled and explains the actual input mapping", await ctx.run(`document.querySelector('${preview} [role=switch]').getAttribute('aria-checked')==='true'&&document.querySelector('${preview} [data-canvas-prompt-mappings]').textContent.includes('<Picture 1>')`));
    await ctx.click(`${preview} [role=switch]`);
    ctx.smoke.check("Disabling conversion shows the raw prompt without a misleading mapping", await ctx.run(`document.querySelector('${preview} [data-prompt-conversion-text]').textContent==='Use @picture1'&&!document.querySelector('${preview} [data-canvas-prompt-mappings]')`));
    await ctx.click('.hy-project-header [aria-label="保存画布"]');
    await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
    const saved = await library.readCanvas(ctx);
    ctx.smoke.check("Conversion choice persists on the selected node", saved.nodes.find(node => node.id === 'target').data.promptConversion === false);
    const requestIndex = state.requests.length;
    await translate(ctx);
    await ctx.wait(`document.querySelector('${editor}').textContent==='Use @picture1 transformed'`);
    ctx.smoke.check("Disabled conversion also passes raw references to the prompt assistant", state.requests[requestIndex].text === 'Use @picture1');
    await ctx.click(`${panel} [data-assistant-undo]`);
    await showPreview(ctx, 'Use @picture1');
    await ctx.click(`${preview} [role=switch]`);
    await ctx.shot(`120-${kind}-prompt-preview-dark`);
    await checkAssistant(ctx, state, "Use @picture1", "Use <Picture 1>");
  }
}

// 无引用不发送；音频回包恢复编辑引用，预览继续显示 Audio，不制造生成任务。
async function checkAudioAndMissing(ctx, state, audio) {
  await seed(ctx, { kind: "audio", prompt: "Use @audio1", audioParameters: { reference: audio } });
  await checkPanelLayout(ctx, "audio");
  await showPreview(ctx, "Use <Audio 1>");
  await ctx.shot("121-audio-prompt-preview-dark");
  await checkAssistant(ctx, state, "Use @audio1", "Use <Audio 1>");
  state.output = "Use <Audio 1>";
  await translate(ctx);
  await ctx.wait(`document.querySelector('${editor}').textContent==='Use @audio1'`);
  state.output = null;
  await ctx.fill(editor, "Missing @audio2");
  await showPreview(ctx);
}

async function checkMissing(ctx, state) {
  ctx.smoke.check("Missing reference displays an explicit preview error", await ctx.run(`!!document.querySelector('${preview} [data-prompt-conversion-error]')`));
  const before = state.requests.length;
  await ctx.key("Escape");
  await translate(ctx);
  await ctx.wait(`!document.querySelector('${panel} [data-assistant-translate]').disabled`);
  ctx.smoke.check("Invalid reference never reaches the transformation service", state.requests.length === before);
}

// 同一实例在请求中继续编辑，旧结果只能进入待确认区；撤销以应用前真实文字为准。
async function checkConflict(ctx, state) {
  await ctx.fill(editor, "Use @audio1");
  state.hold = true;
  await translate(ctx);
  await ctx.wait(`document.querySelector('${panel} [data-assistant-translate]').disabled`);
  for (let i = 0; i < 100 && !state.complete; i++) await new Promise(resolve => setTimeout(resolve, 20));
  if (!state.complete) throw Error("prompt fixture did not receive request");
  await ctx.fill(editor, "New @audio1");
  state.complete("Old <Audio 1>"); state.hold = false; state.complete = null;
  await ctx.wait(`document.querySelector('${panel} [data-assistant-result]')`);
  ctx.smoke.check("Late transform keeps the newer raw draft intact", await ctx.run(`document.querySelector('${editor}').textContent==='New @audio1'`));
  await ctx.click(`${panel} [data-assistant-result] button`);
  await ctx.click(`${panel} [data-assistant-undo]`);
  ctx.smoke.check("Confirmed replacement undo restores the draft present at confirmation", await ctx.run(`document.querySelector('${editor}').textContent==='New @audio1'`));
}

// 用 DOM 指针事件核对两个入口的绘制样式；不触发系统选择框，也不冒充实体鼠标验收。
async function checkSharedTips(ctx) {
  await ctx.key('Escape');
  const styles = [];
  for (const selector of ['.hy-project-header .hy-icon-button[aria-label]', `${panel} .hy-panel-options .hy-chip`]) {
    await ctx.run(`document.querySelector('${selector}').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}))`);
    await ctx.wait("document.querySelector('[data-hover-tip][data-visible=true]')");
    styles.push(await ctx.run("(()=>{const e=document.querySelector('[data-hover-tip][data-visible=true]'),s=getComputedStyle(e);return [s.backgroundColor,s.color,s.fontSize,s.borderRadius,s.padding].join('|')})()"));
    ctx.smoke.check('Canvas tooltips use the common component without a native title', await ctx.run(`!document.querySelector('${selector}').hasAttribute('title')`));
    await ctx.run(`document.querySelector('${selector}').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}))`);
  }
  ctx.smoke.check('Workflow and import tips have identical typography and surface', styles[0] === styles[1]);
  await ctx.run(`document.querySelector('${panel} .hy-panel-options .hy-chip').focus()`);
  await ctx.wait("document.querySelector('[data-hover-tip][data-visible=true]')");
  await ctx.shot('124-shared-canvas-hover-tip');
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
}

// 输入事件走原 contenteditable；关闭转换时既不装饰旧引用，也不能继续搜全局素材。
async function checkReferencesDisabled(ctx, raw) {
  await ctx.click(`${preview} [role=switch]`);
  ctx.smoke.check('Disabling conversion removes resource chips without deleting the raw prompt', await ctx.run(`!document.querySelector('${editor} [data-media-reference]')&&document.querySelector('${editor}').textContent===${JSON.stringify(raw)}`));
  await ctx.key('Escape');
  await ctx.run(`(()=>{const e=document.querySelector('${editor}');e.focus();e.textContent='@';const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  ctx.smoke.check('Typing @ with conversion disabled leaves no resource menu', await ctx.run("!document.querySelector('[data-prompt-media-menu]')"));
  await ctx.fill(editor, raw);
  await showPreview(ctx, raw);
  await ctx.click(`${preview} [role=switch]`);
  ctx.smoke.check('Enabling conversion restores resource chips for the original inputs', await ctx.run(`!!document.querySelector('${editor} [data-media-reference]')`));
}

async function setCustomLabel(ctx, kind, value) {
  await ctx.fill(`${preview} input[data-reference-label=${kind}]`, value);
  await ctx.run(`document.querySelector('${preview} [data-reference-labels] button').click()`);
}

// 三类节点共用同一个参数组件，逐一保存、整页重开，防止只改预览未写入工程。
async function checkCustomLabels(ctx, state, image, audio) {
  for (const kind of ['image', 'video', 'audio']) {
    const type = kind === 'audio' ? 'audio' : 'image', label = type === 'audio' ? 'Voice' : 'XXX';
    const raw = type === 'audio' ? 'Use @audio1' : 'Use @picture1';
    const data = kind === 'audio' ? { kind, audioParameters: { reference: audio } } : { kind, workflow: kind === 'image' ? 'minimax-image-edit' : 'minimax-reference', inputImages: [image] };
    await seed(ctx, { ...data, prompt: raw });
    await showPreview(ctx);
    await setCustomLabel(ctx, type, label);
    await showPreview(ctx, `Use <${label} 1>`);
    await ctx.shot(`125-${kind}-custom-prefix`);
    await checkAssistant(ctx, state, raw, `Use <${label} 1>`);
    await showPreview(ctx);
    await setCustomLabel(ctx, type, 'two words');
    ctx.smoke.check('Invalid custom prefixes show an error without changing conversion', await ctx.run(`!!document.querySelector('${preview} [role=alert]')&&document.querySelector('${preview} [data-prompt-conversion-text]').textContent==='Use <${label} 1>'`));
    await ctx.key('Escape');
    await ctx.click('.hy-project-header [aria-label="保存画布"]');
    await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
    ctx.smoke.check('Custom prefix is saved on its own node', (await library.readCanvas(ctx)).nodes[0].data.promptReferenceLabels[type] === label);
    await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
    await library.openProject(ctx);
    await ctx.wait("document.querySelector('[data-canvas-node=target] header>svg')");
    await ctx.pointer('[data-canvas-node=target] header>svg');
    await showPreview(ctx, `Use <${label} 1>`);
    await checkReferencesDisabled(ctx, raw);
    await ctx.key('Escape');
  }
}

// 非 MiniMax 默认只编辑文字；用户应用前缀后才启用引用，恢复默认会收回这项自定义。
async function checkGenericWorkflow(ctx, image) {
  await seed(ctx, { kind: 'image', workflow: 'anima-edit', prompt: 'Use @picture1', inputImages: [image] });
  ctx.smoke.check('Non-MiniMax defaults to ordinary text without resource chips', await ctx.run(`!document.querySelector('${editor} [data-media-reference]')`));
  await showPreview(ctx, 'Use @picture1');
  await setCustomLabel(ctx, 'image', 'Ref');
  await showPreview(ctx, 'Use <Ref 1>');
  ctx.smoke.check('An explicit custom prefix enables the same resource editor', await ctx.run(`!!document.querySelector('${editor} [data-media-reference]')`));
  await ctx.run(`document.querySelectorAll('${preview} [data-reference-labels] button')[1].click()`);
  await showPreview(ctx, 'Use @picture1');
  ctx.smoke.check('Restore defaults clears custom mode without changing the raw draft', await ctx.run(`!document.querySelector('${editor} [data-media-reference]')`));
  await ctx.key('Escape');
}

// 从实际菜单切换，确认旧连线不阻止文生图，也不会留下缩略图、加号或 @ 引用。
async function checkTextOnlyWorkflow(ctx, image) {
  const source = { id: 'source', position: { x: -600, y: 10 }, data: { kind: 'image', title: 'Source', prompt: '', content: '', ratio: '16/9', media: image } };
  const edges = [{ id: 'edge', source: 'source', target: 'target', sourceHandle: 'out', targetHandle: 'in' }];
  await seed(ctx, { kind: 'image', workflow: 'minimax-image-edit', prompt: 'Use @picture1', inputImages: [image], promptReferenceLabels: { image: 'Ref' } }, undefined, [source], edges);
  ctx.smoke.check('Editing shows both linked and imported images', await ctx.run(`document.querySelectorAll('${panel} .hy-reference-thumbnail').length===2`));
  await ctx.click('[data-canvas-node=target] .hy-panel-options [data-canvas-workflow] .hy-chip');
  await ctx.click('[data-assistant-item=local]');
  await ctx.click('[data-assistant-item=anima-series]');
  await ctx.click('[data-assistant-item=anima]');
  ctx.smoke.check('Text-to-image hides all imported and linked image controls', await ctx.run(`!document.querySelector('${panel} [data-canvas-reference-inputs]')&&!document.querySelector('${editor} [data-media-reference]')`));
  await showPreview(ctx, 'Use @picture1');
  ctx.smoke.check('Text-to-image has no resource mappings despite custom labels', await ctx.run(`!document.querySelector('${preview} [data-canvas-prompt-mappings]')`));
  await ctx.key('Escape');
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const saved = await library.readCanvas(ctx);
  ctx.smoke.check('Text-to-image saves the selected workflow and retains inactive inputs', saved.nodes.find(node => node.id === 'target').data.workflow === 'anima' && saved.nodes.find(node => node.id === 'target').data.inputImages.length === 1 && saved.edges.length === 1);
  await ctx.shot('126-text-to-image-no-reference-inputs');
}

// 点开同一分组检查默认勾选和手动切换，不能先手动选择再断言默认值。
async function openCanvasMossPresets(ctx) {
  const item = name => `[data-prompt-assistant-menu] [data-assistant-item=${name}]`;
  await ctx.click(`${panel} [data-assistant-options]`);
  await ctx.click(item('presets'));
  await ctx.click(item('presets-moss'));
  await ctx.wait(`document.querySelector('${item('moss-caption')}') && document.querySelector('${item('moss-composition-json')}')`);
  return item;
}

// 窄窗口容不下第四列，验证阅读框留在应用内，长正文能滚，菜单仍保持打开。
async function checkCanvasPresetReader(ctx, item) {
  await ctx.click(`${item} + [data-preset-view]`);
  await ctx.wait("document.querySelector('[data-preset-reader-text]')");
  const usable = await ctx.run(`(() => {
    const card = document.querySelector('[data-preset-reader]').getBoundingClientRect();
    const text = document.querySelector('[data-preset-reader-text]');
    text.scrollTop = text.scrollHeight;
    const footer = document.querySelector('[data-preset-reader-use]').getBoundingClientRect();
    return card.left>=0 && card.right<=innerWidth && card.top>=0 && card.bottom<=innerHeight
      && text.scrollTop>0 && footer.bottom<=card.bottom;
  })()`);
  ctx.smoke.check('Canvas Moss reader stays inside the narrow window with a scrollable text area', usable);
  await ctx.shot('128-canvas-moss-preset-reader');
  await checkExpandedPresetReader(ctx);
  await ctx.key('Escape');
  await ctx.wait("!document.querySelector('[data-preset-reader]') && document.querySelector('[data-prompt-assistant-menu]')");
}

async function checkExpandedPresetReader(ctx) {
  await ctx.click('[data-preset-reader-size]');
  await ctx.wait("document.querySelector('[data-preset-reader-expanded]')");
  // 用主区的实测边界对照放大页，侧栏和标题栏不应被覆盖。
  const result = await ctx.run(`(() => {
    const main = document.querySelector('[data-app-main]');
    const reader = document.querySelector('[data-preset-reader-expanded]');
    const pageBox = main.getBoundingClientRect(), readerBox = reader.getBoundingClientRect();
    const close = reader.querySelector('[data-preset-reader-close]').getBoundingClientRect();
    const copy = reader.querySelector('[data-preset-reader-copy]').getBoundingClientRect();
    const toggle = reader.querySelector('[data-preset-reader-size]').getBoundingClientRect();
    const area = ['left','top','right','bottom'].every(key => Math.abs(pageBox[key] - readerBox[key]) < 2);
    return area && main.firstElementChild.inert && close.right < copy.left && toggle.top < close.top;
  })()`);
  ctx.smoke.check('Expanded reader covers only main and separates the close button from its actions', result);
  await ctx.shot('129-canvas-moss-expanded-reader');
  await ctx.key('Escape');
  await ctx.wait("document.querySelector('[data-preset-reader]:not([data-preset-reader-expanded])')");
  // 上一个用例已滚到底，来回切换后也应继续显示末段。
  const restored = await ctx.run(`(() => {
    const body = document.querySelector('[data-preset-reader-text]');
    return !document.querySelector('[data-app-main]').firstElementChild.inert
      && body.scrollHeight - body.clientHeight - body.scrollTop < 3;
  })()`);
  ctx.smoke.check('Escape restores the anchored card and keeps its reading position', restored);
}

async function checkCanvasMossPresets(ctx, state) {
  const { load } = require('./load-director-source');
  const data = path.resolve('apps/next/src/data');
  const { MOSS_CAPTION_INSTRUCTION } = load(path.join(data, 'moss-caption-instruction.ts'));
  const { MOSS_COMPOSITION_INSTRUCTION } = load(path.join(data, 'moss-composition-instruction.ts'));
  const prompt = 'A girl on the left';
  // 用非正方形自定义尺寸，验证请求取的是节点出图参数，而不是卡片大小或默认画幅。
  await seed(ctx, { kind: 'image', workflow: 'moss', prompt, imageParameters: { moss: { size: {
    mode: 'custom', aspectRatio: '3:2', customWidth: 1200, customHeight: 800, scale: 1,
  } } } });
  const naturalRequest = state.requests.length;
  const item = await openCanvasMossPresets(ctx);
  ctx.smoke.check('Canvas Moss starts with natural language selected', await ctx.run(`!!document.querySelector('${item('moss-caption')} svg')`));
  await ctx.key('Escape');
  await ctx.wait("!document.querySelector('[data-prompt-assistant-menu]')");
  await translate(ctx);
  await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(`${prompt} transformed`)}`);
  ctx.smoke.check('Canvas Moss natural language preset transforms the prompt', state.requests[naturalRequest].instruction.startsWith(MOSS_CAPTION_INSTRUCTION));

  const result = { summary: { caption: 'A girl on the left.' }, items: [
    { label: 'character', caption: 'A girl on the left.', bbox: [-350, -550, 350, -50] },
  ], bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' };
  const jsonRequest = state.requests.length;
  await openCanvasMossPresets(ctx);
  await checkCanvasPresetReader(ctx, item('moss-composition-json'));
  await ctx.click(item('moss-composition-json'));
  await ctx.wait("!document.querySelector('[data-prompt-assistant-menu]')");
  // 只替换供应商回包，保留真实的尺寸校验和输入框回填。
  state.output = JSON.stringify(result);
  await translate(ctx);
  await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(state.output)}`);
  const request = state.requests[jsonRequest];
  ctx.smoke.check('Canvas Moss JSON uses the actual image output dimensions and updates the prompt', request.instruction.startsWith(MOSS_COMPOSITION_INSTRUCTION) && request.instruction.includes('W=1200 pixels, H=800 pixels'));
}

async function checkCanvasPromptPreview(ctx, state) {
  const image = await media(ctx, "image", path.resolve("scripts/fixtures/video-composition/image.png"));
  if (process.env.CANVAS_PROMPT_IMAGES_SMOKE === "1") return require("./check-prompt-images").checkCanvasImages(ctx, state, seed, image);
  const audio = await media(ctx, "audio", path.resolve("scripts/fixtures/video-composition/audio.wav"));
  await checkCustomLabels(ctx, state, image, audio);
  await checkGenericWorkflow(ctx, image);
  await checkTextOnlyWorkflow(ctx, image);
  await require("./check-prompt-reference-delete").checkPromptReferenceDelete(ctx, seed, image, audio);
  await checkImageAndVideo(ctx, state, image);
  await checkRejectedTranslations(ctx, state, image);
  await checkAudioAndMissing(ctx, state, audio);
  await checkMissing(ctx, state);
  await checkConflict(ctx, state);
  await checkSharedTips(ctx);
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  ctx.win.setSize(960, 820);
  // 主题扩散层结束后再注入真实鼠标，否则遮罩会消费拖动，不能据此误判画布。
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')&&innerWidth===960");
  await require("./check-canvas-audio").revealInline(ctx);
  // 截图先确认拖动结束后的稳定画面，避免尚在队列里的鼠标松开把新浮层关掉。
  await ctx.shot("122-audio-footer-light-narrow");
  await showPreview(ctx, "New <Audio 1>");
  await ctx.shot("122-audio-prompt-preview-light-narrow");
  ctx.smoke.check("Narrow light popup remains inside the main viewport", await ctx.run(`(()=>{const r=document.querySelector('${preview} .hy-ratio-popup').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));
  ctx.win.setSize(960, 1000);
  // 离屏缓冲与窗口内容区实测差1px；只给尺寸舍入留1px容差，控件避让断言仍严格保留。
  const [, height] = ctx.win.getContentSize();
  console.log("PROMPT_VIEWPORT", { requestedHeight: 1000, actualHeight: height, renderer: await ctx.run("({height:innerHeight,dpr:devicePixelRatio})") });
  await ctx.wait(`innerWidth===960&&Math.abs(innerHeight-${height})<=1`);
  await seed(ctx, { kind: "image", workflow: "minimax-image-edit", prompt: "Use @picture1", inputImages: [image] }, { x: 100, y: 140 });
  ctx.smoke.check("Narrow light image footer retains a single row without overlap", await ctx.run(`(()=>{const p=document.querySelector('${panel}'),a=p.querySelector('.hy-panel-options'),s=p.querySelector('.hy-panel-submit');return a.getBoundingClientRect().height<=32&&[...a.children].every(e=>e.getBoundingClientRect().right<=s.getBoundingClientRect().left)})()`));
  await ctx.shot("123-image-footer-light-narrow");
  await checkCanvasMossPresets(ctx, state);
  console.log("PROMPT_PREVIEW_EVIDENCE", { automaticEvents: true, transformIpcMock: state.requests.length, realInference: false, manual: false });
}

module.exports = { installFixture, checkCanvasPromptPreview, seedPromptNode: seed };
