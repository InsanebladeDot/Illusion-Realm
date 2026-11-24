/** H3 集成证据：正式 React 页面和生产 IPC/写盘；HTTP 返回固定图片，不能证明 GPU 推理。 */
const fs = require("node:fs"), path = require("node:path");
const { nativeImage } = require("electron");
const library = require("./canvas-library-fixture");
const EDIT_LORA = "Minimax/H3_image/fixture-edit.safetensors";

async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return library.readCanvas(ctx);
}

async function restore(ctx, document) {
  await library.writeCanvas(ctx, document);
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node]')");
}

// 两个上游 ID 故意反序，第三张直接导入；请求槽必须按生产规则重新排序。
async function canvasSetup(ctx) {
  await ctx.add("image", 250, 150);
  const document = await save(ctx);
  const file = path.join(ctx.root, "reference.png");
  fs.copyFileSync(path.resolve("scripts/fixtures/video-composition/image.png"), file);
  const media = { kind: "image", path: file, name: "reference.png", size: fs.statSync(file).size };
  const source = id => ({ id, position: { x: 50, y: id === "image-2" ? 40 : 410 }, data: { kind: "image", title: id, content: "", prompt: "", ratio: "1/1", media } });
  const target = { id: "target", position: { x: 560, y: 150 }, data: { kind: "image", title: "H3 multi-reference", prompt: "Edit @picture1 using @image2 and @picture3", content: "", ratio: "1/1", workflow: "minimax-image-edit", batchSize: 6, workflowLoras: { "minimax-image-edit": [{ id: "0", name: EDIT_LORA, strength: -0.5 }] }, inputImages: [media], imageParameters: { "minimax-image-edit": { seed: "42", seedMode: "custom" } } } };
  const edges = ["image-10", "image-2"].map(id => ({ id: `edge-${id}`, source: id, target: "target", sourceHandle: "out", targetHandle: "in" }));
  await restore(ctx, { ...document, nodes: [source("image-10"), source("image-2"), target], edges });
  await ctx.pointer('[data-canvas-node=target] header>svg');
  await ctx.wait("document.querySelector('[data-canvas-node=target] .hy-submit')");
}

async function checkCanvas(ctx, state) {
  // 仅补充服务清单中的测试名称；响应图片是固定夹具，不证明该权重兼容或已加载。
  state.names.push(EDIT_LORA);
  await canvasSetup(ctx);
  const requestCount = state.requests.length;
  ctx.smoke.check("Image edit has no batch control", await ctx.run("!document.querySelector('[data-canvas-node=target] [data-canvas-parameter=batch]')"));
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await ctx.wait("document.querySelectorAll('[data-canvas-media=image][data-media-status=ready]').length===3");
  const graph = state.requests.at(-1).prompt, document = await save(ctx);
  ctx.smoke.check("H3 uploads all three inputs into distinct graph slots", state.uploads === 3 && graph["26"].inputs.image === "fixture-input/reference-1.png" && graph["h3-source-1"].inputs.image === "fixture-input/reference-2.png" && graph["h3-source-2"].inputs.image === "fixture-input/reference-3.png");
  ctx.smoke.check("H3 uses real template output and user instruction", graph["9"].inputs.prompt === "Edit <Picture 1> using <Picture 2> and <Picture 3>" && graph["12"].inputs.noise_seed === 42 && !graph["20"] && graph["16"].class_type === "SaveImage");
  const target = document.nodes.find(node => node.id === "target");
  ctx.smoke.check("Legacy x6 edits submit once with the saved LoRA", state.requests.length === requestCount + 1 && graph.ir_video_lora_0.inputs.lora_name === EDIT_LORA && graph.ir_video_lora_0.inputs.strength_model === -0.5 && target.data.workflowLoras["minimax-image-edit"][0].name === EDIT_LORA);
  ctx.smoke.check("H3 result saved and imported into original node", target.data.media.path.includes("Picture") && nativeImage.createFromPath(target.data.media.path).getSize().width === 1024 && document.nodes.length === 3);
  await ctx.shot("80-h3-canvas-result-http-fixture");
  await checkCustomCanvasRequest(ctx, state);
  await checkCanvasSettings(ctx);
  const previous = (await save(ctx)).nodes.find(node => node.id === 'target').data.media.path;
  state.mode = "hold"; const before = state.requests.length;
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await ctx.wait("document.querySelector('[data-infinite-canvas] [data-canvas-node-loading] button')");
  await ctx.click('[data-infinite-canvas] [data-canvas-node-loading] button');
  await ctx.wait("!document.querySelector('[data-infinite-canvas] [data-canvas-node-loading] button')");
  ctx.smoke.check("Cancelled H3 preserves previous canvas result", (await save(ctx)).nodes.find(node => node.id === "target").data.media.path === previous && state.requests.length >= before);
  state.mode = "normal";
}

// 读取测试 HTTP 服务实际收到的图，确保自定义前缀与关闭开关都作用于请求。
async function checkCustomCanvasRequest(ctx, state) {
  const preview = '[data-canvas-node=target] [data-canvas-parameter=prompt-preview]';
  await ctx.click(`${preview}>button`);
  await ctx.fill(`${preview} input[data-reference-label=image]`, 'XXX');
  await ctx.run(`(()=>{const e=document.querySelector('${preview} [data-reference-labels] button');e.focus();e.click()})()`);
  ctx.smoke.check('Applying a prefix preserves focus inside the existing popover', await ctx.run(`document.querySelector('${preview} .hy-prompt-preview').contains(document.activeElement)`));
  await ctx.key('Escape');
  ctx.smoke.check('Applying a prefix leaves Escape able to close its popover', await ctx.run(`!document.querySelector('${preview} .hy-prompt-preview')`));
  let before = state.requests.length;
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await waitForSubmission(state, before);
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
  await save(ctx);
  ctx.smoke.check('H3 actual HTTP request uses the custom image prefix', state.requests.length === before + 1 && state.requests.at(-1).prompt['9'].inputs.prompt === 'Edit <XXX 1> using <XXX 2> and <XXX 3>');
  await ctx.click(`${preview}>button`);
  await ctx.click(`${preview} [role=switch]`);
  await ctx.key('Escape');
  before = state.requests.length;
  await ctx.click('[data-canvas-node=target] .hy-submit');
  await waitForSubmission(state, before);
  await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
  await save(ctx);
  ctx.smoke.check('H3 actual HTTP request preserves raw @ references when disabled', state.requests.length === before + 1 && state.requests.at(-1).prompt['9'].inputs.prompt === 'Edit @picture1 using @image2 and @picture3');
}

async function checkCanvasSettings(ctx) {
  await ctx.click('[data-canvas-node=target] [data-canvas-workflow] .hy-chip');
  await ctx.click('[data-assistant-item=local]'); await ctx.click('[data-assistant-item=minimax-image-series]');
  await ctx.click('[data-assistant-item=minimax-image-edit]');
  ctx.smoke.check("H3 workflow selection leaves parameter settings closed", await ctx.run("!document.querySelector('.hy-image-sidebar')"));
  await ctx.click('[data-canvas-node=target] .hy-panel-submit [data-canvas-workflow] button');
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-minimax-image-settings]')");
  ctx.smoke.check("Canvas directly mounts Create H3 settings and saved LoRA", await ctx.run("!!document.querySelector('.hy-image-sidebar [data-video-local-unet]')&&!!document.querySelector('.hy-image-sidebar [data-selected-extension]')"));
  await ctx.shot("81-h3-canvas-settings");
  await ctx.click('.hy-image-sidebar [data-extension-picker-trigger]');
  await ctx.wait("document.querySelector('[aria-labelledby=extension-select-dialog-title]')");
  await ctx.key('Escape');
  await ctx.wait("!document.querySelector('[aria-labelledby=extension-select-dialog-title]')");
  ctx.smoke.check("Escape closes the shared LoRA picker while keeping edit settings", await ctx.run("!!document.querySelector('.hy-image-sidebar [data-minimax-image-settings]')"));
  await ctx.run("document.querySelector('.hy-image-sidebar [data-selected-extension] p span').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.wait("document.querySelector('.hy-image-sidebar [data-selected-extension] input[type=number]')");
  await ctx.fill('.hy-image-sidebar [data-selected-extension] input[type=number]', '0');
  await ctx.key('Enter');
  await ctx.click('.hy-image-sidebar header button');
  const document = await save(ctx);
  ctx.smoke.check("Changing LoRA weight through the reused row saves zero exactly", document.nodes.find(node => node.id === 'target').data.workflowLoras['minimax-image-edit'][0].strength === 0);
}

// 文件选择由自动 DataTransfer 注入，不宣称点过系统文件选择器。
async function importReferences(ctx) {
  const bytes = [...fs.readFileSync(path.resolve("scripts/fixtures/video-composition/image.png"))];
  await ctx.run(`(()=>{const input=document.querySelector('[data-edit-references] input[type=file]'),data=new DataTransfer();for(let i=0;i<2;i++)data.items.add(new File([new Uint8Array(${JSON.stringify(bytes)})],'same-name.png',{type:'image/png'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ctx.wait("document.querySelectorAll('[data-edit-references] img').length===2");
}

async function checkCreate(ctx, state) {
  await ctx.click('[data-app-nav] a[href="/create"]');
  await ctx.wait("document.querySelector('[data-create-mode-tabs]')");
  await ctx.run("[...document.querySelectorAll('[data-create-mode-tabs] button')].find(e=>e.textContent.trim()==='编辑').click()");
  await ctx.wait("document.querySelector('[data-anima-form]')");
  ctx.smoke.check("Create defaults to H3 before Anima without Anima dependency instructions", await ctx.run("document.querySelector('[aria-label=文字编辑模型]').dataset.optionValue==='minimax-image-edit'&&!document.querySelector('[data-anima-form]').textContent.includes('git clone')"));
  ctx.smoke.check("Create reuses the same MiniMax LoRA controls", await ctx.run("!!document.querySelector('[data-anima-form] [data-minimax-image-settings] [data-video-loras] [data-extension-picker-trigger]')"));
  await changeTheme(ctx, "light");
  await importReferences(ctx); await ctx.fill('[data-anima-instruction]', "H3 two reference edit fixture");
  const uploads = state.uploads, requestCount = state.requests.length;
  state.mode = "hold";
  await ctx.click('[data-anima-run]');
  await ctx.wait("document.querySelector('[data-anima-stop]')&&!document.querySelector('[data-anima-stop]').disabled");
  ctx.smoke.check("Busy footer shows only one row of buttons without visible waiting or stop text", await ctx.run("document.querySelector('[data-anima-status]').classList.contains('sr-only')&&document.querySelector('[data-anima-stop]').textContent===''&&document.querySelector('[data-anima-stop]').getBoundingClientRect().top===document.querySelector('[data-anima-run]').getBoundingClientRect().top"));
  await ctx.shot("84-h3-compact-busy-footer");
  await waitForSubmission(state, requestCount);
  state.requests.at(-1).held = false;
  state.mode = "normal";
  await ctx.wait("document.querySelector('[data-anima-stage] img')&& !document.querySelector('[data-anima-run]').disabled");
  ctx.smoke.check("Create H3 sends both same-name references and accepts SaveImage output", state.uploads === uploads + 2 && !!state.requests.at(-1).prompt["h3-source-1"] && await ctx.run("!document.querySelector('[data-anima-download]').disabled"));
  await checkHover(ctx);
  await ctx.shot("82-h3-create-light-http-fixture");
  await checkCreateChoices(ctx);
}

/** 切换模板不能清空 H3 输入，Anima 恢复自己的依赖与资源。 */
async function checkCreateChoices(ctx) {
  await ctx.click('[aria-label=文字编辑模型]');
  ctx.smoke.check("Editing choices keep H3 first and Anima second", await ctx.run("[...document.querySelectorAll('[role=option]')].map(e=>e.textContent.trim()).join('|')==='MiniMax H3|Anima'"));
  await ctx.run("document.querySelectorAll('[role=option]')[1].click()");
  ctx.smoke.check("Switch to Anima keeps its original model and dependency UI", await ctx.run("!!document.querySelector('[data-anima-models]')&&document.querySelector('[data-anima-form]').textContent.includes('git clone')"));
  await ctx.click('[aria-label=文字编辑模型]'); await ctx.run("document.querySelectorAll('[role=option]')[0].click()");
  ctx.smoke.check("Switch back restores H3 prompt and two references", await ctx.run("document.querySelector('[data-anima-instruction]').textContent==='H3 two reference edit fixture'&&document.querySelectorAll('[data-edit-references] img').length===2"));
  await changeTheme(ctx, "dark");
  ctx.win.setSize(760, 820);
  ctx.smoke.check("Narrow dark H3 form remains inside viewport", await ctx.run("document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('[data-anima-form]').getBoundingClientRect().width>0"));
  await checkHover(ctx);
  await ctx.shot("83-h3-create-dark-narrow");
}

// 使用产品主题菜单，同时等待信号和媒体查询，避免只改宿主却截到旧颜色。
async function changeTheme(ctx, theme) {
  await ctx.click('[data-theme-trigger]');
  await ctx.wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await ctx.click(`[data-theme-option=${theme}]`);
  await require("./sidebar-menu-fixture").closeAppearance(ctx.run);
  await ctx.wait(`document.documentElement.dataset.theme==='${theme}'&&matchMedia('(prefers-color-scheme: dark)').matches===${theme==='dark'}`);
}

// 主进程轮询有明确上限，不用旧任务存在代替新请求已经收到。
async function waitForSubmission(state, before) {
  for (let attempt=0;attempt<100;attempt++) {
    if (state.requests.length>before) return;
    await new Promise(resolve=>setTimeout(resolve,60));
  }
  throw Error("H3 fixture did not receive a new request");
}

// 实体输入由 Electron 注入；检查计算样式，不用源码选择器存在性充当视觉证据。
async function checkHover(ctx) {
  const selector='[aria-label=文字编辑模型]';
  const point=await ctx.run(`(()=>{const e=document.querySelector('${selector}');e.blur();const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({type:'mouseMove',...point});
  await ctx.wait(`document.querySelector('${selector}').matches(':hover')`);
  ctx.smoke.check('Button hover adds no global outline',await ctx.run(`getComputedStyle(document.querySelector('${selector}')).outlineStyle==='none'`));
}

// 保留编辑的三张输入切换文生图；检查服务实际收到的请求，不能只看加号被隐藏。
async function checkTextOnlyRequests(ctx, state) {
  const document = await save(ctx);
  for (const remote of [false, true]) {
    const nodes = document.nodes.map(node => node.id !== 'target' ? node : { ...node, data: { ...node.data, workflow: 'anima', mode: 'text', batchSize: 1, remoteImage: remote ? { provider: 'euzhi', model: 'gpt-image-2.5-sunburst', size: '1024x1024', quality: 'medium' } : undefined } });
    await restore(ctx, { ...document, nodes });
    await ctx.pointer('[data-canvas-node=target] header>svg');
    await ctx.wait("document.querySelector('[data-canvas-node=target] .hy-submit')");
    const requests = remote ? state.remote : state.requests, before = requests.length, uploads = state.uploads;
    await ctx.click('[data-canvas-node=target] .hy-submit');
    await waitForSubmission({ requests }, before);
    await ctx.wait("!document.querySelector('[data-canvas-node-loading]')");
    const saved = await save(ctx);
    ctx.smoke.check(`${remote ? 'Remote' : 'Local'} text-to-image submits without uploading inactive images`, requests.length === before + 1 && state.uploads === uploads && (remote ? requests.at(-1).endpoint === 'generations' : !Object.values(requests.at(-1).prompt).some(node => node.class_type === 'LoadImage')));
    ctx.smoke.check('Generating text-to-image preserves saved attachments and edges', saved.edges.length === 2 && saved.nodes.find(node => node.id === 'target').data.inputImages.length === 1);
  }
}

async function checkMinimaxImageEdit(ctx, state) {
  await checkCanvas(ctx, state);
  await checkTextOnlyRequests(ctx, state);
  await checkCreate(ctx, state);
  console.log("H3_EDIT_EVIDENCE", { automaticEvents: true, httpFixture: state.requests.length, uploads: state.uploads, realInference: false, manual: false });
}
module.exports = { checkMinimaxImageEdit, checkCreate, changeTheme };
