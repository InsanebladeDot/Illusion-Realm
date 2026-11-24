/** 自动事件验证正式静态UI；真实PNG、SQLite与文件协议，不运行AI推理、不算人工验收。 */
const fs = require("node:fs"), path = require("node:path");
const { nativeImage } = require("electron");
const library = require("./canvas-library-fixture");
const slider = '[data-canvas-node=compare] [role=slider]';
const compare = '[data-canvas-node=compare] [data-image-compare]';

async function restore(ctx, document) {
  await library.writeCanvas(ctx, document);
  await new Promise(resolve => { ctx.win.webContents.once("did-finish-load", resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait("document.querySelector('[data-canvas-node=compare]')");
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
}

async function setup(ctx, ready) {
  const document = await library.readCanvas(ctx);
  const file = path.join(ctx.root, "compare-result.png");
  const bitmap = Buffer.alloc(160 * 90 * 4);
  for (let index = 0; index < bitmap.length; index += 4) { bitmap[index + 2] = 255; bitmap[index + 3] = 255; }
  fs.writeFileSync(file, nativeImage.createFromBitmap(bitmap, { width: 160, height: 90 }).toPNG());
  const media = file => ({ kind: "image", name: path.basename(file), path: file, size: fs.statSync(file).size });
  const data = { kind: "image", title: "compare", content: "", prompt: "", ratio: "16/9" };
  const node = (id, x, patch) => ({ id, position: { x, y: 180 }, data: { ...data, title: id, ...patch } });
  const nodes = [node("source", 50, { media: media(path.resolve("scripts/fixtures/video-composition/image.png")) }), node("upscale", 650, { mode: "upscale", ...(ready ? { media: media(file) } : {}) }), node("compare", 1250, { mode: "compare", card: { style: "rectangle", width: 500, height: 282 } })];
  const edges = [["source", "upscale"], ["upscale", "compare"]].map(([source, target]) => ({ id: source, source, target, sourceHandle: "out", targetHandle: "in" }));
  await restore(ctx, { ...document, nodes, edges });
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
}

async function checkMenu(ctx) {
  await ctx.run("document.querySelector('.react-flow__pane').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:500,clientY:300}))");
  await ctx.wait("document.querySelector('[data-canvas-menu]')");
  ctx.smoke.check("Right-click directly opens the complete node menu", await ctx.run("!!document.querySelector('[data-canvas-image-category]')&&!document.querySelector('[data-assistant-item=add]')"));
  await ctx.pointer('[data-canvas-image-category]');
  await ctx.click('[data-assistant-item=compare]');
  await ctx.wait("document.querySelector('[data-canvas-node] [data-image-compare-empty]')");
  ctx.smoke.check("Add node / Image / Compare images creates one read-only comparison node", await ctx.run("document.querySelectorAll('[data-canvas-node]').length===1&&!document.querySelector('[data-canvas-node] .hy-submit')&&!document.querySelector('[data-canvas-node] .react-flow__handle-right')"));
  await ctx.key("z", ["control"]);
  await ctx.wait("document.querySelectorAll('[data-canvas-node]').length===0");
  ctx.smoke.check("Comparison creation uses original undo", true);
  await checkToolbarMenu(ctx);
}

// 加号与右键必须通向同一分类；截图记录实际侧列，不能只检查菜单文字存在。
async function checkToolbarMenu(ctx) {
  await ctx.click('[data-canvas-toolbar] [aria-label="添加节点"]');
  ctx.smoke.check("Add menu groups image actions instead of listing comparison at the root", await ctx.run("!!document.querySelector('[data-canvas-image-category]')&&!document.querySelector('[data-node-kind=compare]')&&!document.querySelector('[data-node-kind=image]')"));
  await ctx.run("document.querySelector('[data-canvas-image-category]').focus()");
  await ctx.key('Right');
  await ctx.wait("document.querySelector('[data-assistant-column=\"1\"]')");
  await ctx.key('Left');
  ctx.smoke.check("Left arrow returns to the parent column", await ctx.run("!document.querySelector('[data-assistant-column=\"1\"]')&&!!document.querySelector('[data-canvas-menu]')"));
  await ctx.click('[data-canvas-image-category]');
  await ctx.wait("document.querySelector('[data-assistant-column=\"1\"]')");
  ctx.smoke.check("Image side menu contains only Image and Compare images", await ctx.run("[...document.querySelectorAll('[data-assistant-column=\"1\"] [data-assistant-item]')].map(e=>e.dataset.assistantItem).join('|')==='image|compare'"));
  await ctx.shot('114-add-node-image-menu-dark');
  await ctx.pointer('[data-assistant-column="1"] [data-node-kind=image]');
  await ctx.wait("document.querySelectorAll('[data-canvas-node]').length===1");
  ctx.smoke.check("Toolbar Image creates an ordinary image node", await ctx.run("document.querySelector('[data-canvas-node]').dataset.kind==='image'&&!document.querySelector('[data-image-compare-empty]')"));
  await ctx.key('z', ['control']);
  await ctx.wait("document.querySelectorAll('[data-canvas-node]').length===0");
}

// 捕获真实渲染像素，而非只查clipPath；左右必须分别来自蓝原图和红结果。
async function checkPixels(ctx) {
  const rect = await ctx.run(`(()=>{const r=document.querySelector('${compare}').getBoundingClientRect();return {x:Math.ceil(r.left),y:Math.ceil(r.top),width:Math.floor(r.width)-2,height:Math.floor(r.height)-2}})()`);
  const shot = await ctx.win.webContents.capturePage(rect);
  const bitmap = shot.toBitmap(), size = shot.getSize();
  const pixel = fraction => { const at = (Math.floor(size.height * .5) * size.width + Math.floor(size.width * fraction)) * 4; return [...bitmap.subarray(at, at + 3)]; };
  const left = pixel(.2), right = pixel(.8);
  ctx.smoke.check("Rendered pixels show original left and processed right", left[0] > left[2] && right[2] > 220 && right[0] < 30);
}

async function checkDrag(ctx) {
  const before = await ctx.run("document.querySelector('[data-canvas-node=compare]').closest('.react-flow__node').style.transform");
  const position = await ctx.run(`(()=>{const r=document.querySelector('${slider}').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", ...position });
  ctx.win.webContents.sendInputEvent({ type: "mouseDown", ...position, button: "left", clickCount: 1 });
  // Electron移动事件须显式带按住标记；分开两拍，让产品有机会建立真实指针捕获。
  await new Promise(resolve => setTimeout(resolve, 80));
  ctx.win.webContents.sendInputEvent({ type: "mouseMove", x: position.x - 60, y: position.y, modifiers: ["leftButtonDown"] });
  await new Promise(resolve => setTimeout(resolve, 80));
  ctx.win.webContents.sendInputEvent({ type: "mouseUp", x: position.x - 60, y: position.y, button: "left", clickCount: 1 });
  await ctx.wait(`Number(document.querySelector('${slider}').getAttribute('aria-valuenow'))<45`);
  ctx.smoke.check("Divider drag changes reveal without moving node", await ctx.run(`document.querySelector('[data-canvas-node=compare]').closest('.react-flow__node').style.transform===${JSON.stringify(before)}`));
  await ctx.run(`document.querySelector('${slider}').focus()`);
  await ctx.key("Home");
  await ctx.wait(`document.querySelector('${slider}').getAttribute('aria-valuenow')==='0'`);
  await ctx.key("End");
  await ctx.wait(`document.querySelector('${slider}').getAttribute('aria-valuenow')==='100'`);
  ctx.smoke.check("Keyboard divider reaches both bounds", true);
}

async function checkReady(ctx) {
  await setup(ctx, true);
  await ctx.wait(`document.querySelector('${compare}[data-compare-ready=true]')`);
  await ctx.wait("document.querySelector('.react-flow__viewport').getBoundingClientRect().width>0");
  ctx.smoke.check("Upscale input resolves its original and own output with no generation panel", await ctx.run(`document.querySelectorAll('${compare} img').length===2&&!document.querySelector('[data-canvas-node=compare] .hy-generation-panel')`));
  await ctx.shot("110-compare-dark");
  await checkPixels(ctx);
  await checkDrag(ctx);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  const document = await library.readCanvas(ctx);
  ctx.smoke.check("SQLite stores comparison identity and links without duplicated media", document.nodes.find(node => node.id === "compare").data.mode === "compare" && !document.nodes.find(node => node.id === "compare").data.media && document.edges.length === 2);
  await restore(ctx, document);
  await ctx.wait(`document.querySelector('${compare}[data-compare-ready=true]')`);
  ctx.smoke.check("Reopening restores two-image comparison", true);
}

async function checkTheme(ctx) {
  await require("./check-minimax-image-edit").changeTheme(ctx, "light");
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  ctx.win.setSize(960, 720);
  await ctx.wait("innerWidth<=960");
  // offscreen窗口先更新innerWidth，图引擎的ResizeObserver晚一拍；再点适配使用新容器尺寸。
  await new Promise(resolve => setTimeout(resolve, 250));
  await ctx.click('[data-canvas-viewport] [aria-label="适配全部"]');
  // 等目标真正进入可见范围才截图，DOM存在不能证明窄窗口看得见。
  await ctx.wait(`(()=>{const r=document.querySelector('${compare}').getBoundingClientRect();return r.right<=innerWidth&&r.left>=160&&r.top>=44&&r.bottom<=innerHeight})()`);
  await ctx.shot("111-compare-light-narrow");
  ctx.smoke.check("Light narrow comparison retains divider and original theme", await ctx.run(`!!document.querySelector('${slider}')&&document.documentElement.dataset.theme==='light'&&document.documentElement.scrollWidth<=innerWidth+1`));
  await ctx.click('[data-canvas-toolbar] [aria-label="添加节点"]');
  await ctx.click('[data-canvas-image-category]');
  await ctx.wait("document.querySelector('[data-assistant-column=\"1\"]')");
  ctx.smoke.check("Light narrow image side menu stays inside the viewport", await ctx.run("(()=>{const r=document.querySelector('[data-assistant-column=\"1\"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
  await ctx.shot('115-add-node-image-menu-light-narrow');
  await ctx.key('Escape'); await ctx.key('Escape');
}

// 普通两图和超分输入共用展示；坏结果必须退回原图，修好文件后显式重试才恢复对比。
async function checkOrdinaryAndRetry(ctx) {
  const document = await library.readCanvas(ctx);
  const nodes = document.nodes.map(node => node.id === "upscale" ? { ...node, data: { ...node.data, mode: undefined } } : node);
  const edges = ["source", "upscale"].map(source => ({ id: source, source, target: "compare", sourceHandle: "out", targetHandle: "in" }));
  await restore(ctx, { ...document, nodes, edges });
  await ctx.wait(`document.querySelector('${compare}[data-compare-ready=true]')`);
  ctx.smoke.check("Ordinary two-image input follows connection order", await ctx.run(`document.querySelector('${compare} [class*=original] img').alt==='image.png'`));
  const file = path.join(ctx.root, "repaired-result.png");
  const bytes = fs.readFileSync(nodes.find(node => node.id === "upscale").data.media.path);
  // 新路径确实缺失，避免覆盖已解码文件后浏览器仍复用旧缓存，让夹具制造假成功。
  const broken = nodes.map(node => node.id === "upscale" ? { ...node, data: { ...node.data, media: { ...node.data.media, path: file } } } : node);
  await restore(ctx, { ...document, nodes: broken, edges });
  await ctx.wait(`document.querySelector('${compare} [class*=result] [data-media-status=error]')`);
  ctx.smoke.check("Failed result preserves full original without divider", await ctx.run(`!document.querySelector('${slider}')&&document.querySelector('${compare} [class*=original] [data-media-status=ready]')!==null`));
  fs.writeFileSync(file, bytes);
  await ctx.click(`${compare} [class*=status] button`);
  await ctx.wait(`document.querySelector('${compare}[data-compare-ready=true]')`);
  ctx.smoke.check("Retry loads repaired real result", true);
  await ctx.run("document.querySelector('[data-canvas-node=compare] .hy-node-card').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.wait("document.querySelector('[data-network-content=compare] [data-compare-ready=true]')");
  await ctx.run("document.querySelector('[data-network-content=compare] [role=slider]').focus()");
  await ctx.key("Home");
  ctx.smoke.check("Network preview reuses comparison and keeps slider arrows local", await ctx.run("document.querySelector('[data-network-content=compare] [role=slider]').getAttribute('aria-valuenow')==='0'"));
  await ctx.key("Escape");
}

async function checkCanvasCompare(ctx) {
  await checkMenu(ctx);
  await setup(ctx, false);
  await ctx.wait(`document.querySelector('${compare} img')?.naturalWidth>0`);
  ctx.smoke.check("Pending upscale displays original alone and no fake result", await ctx.run(`document.querySelectorAll('${compare} img').length===1&&!document.querySelector('${slider}')`));
  await checkReady(ctx);
  await checkOrdinaryAndRetry(ctx);
  await setup(ctx, true);
  await ctx.wait(`document.querySelector('${compare}[data-compare-ready=true]')`);
  await checkTheme(ctx);
}
module.exports = { checkCanvasCompare };
