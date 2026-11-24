/** 真实节点、级联菜单、调色器和保存重开回归；没有外部 AI 请求替身。 */
const library = require('./canvas-library-fixture');
const IMAGE = '[data-kind=image]';
const NOTE = '[data-kind=note]';
const EDITOR = '[data-canvas-annotation-editor]';
const TEXT = `${EDITOR} [data-annotation-text]`;
const TAG = '[data-canvas-annotation]';

async function save(ctx) {
  // 通用 fill 会主动失焦检查提交边界；本功能按约定从标注输入框按回车保存。
  await ctx.run(`document.querySelector('${TEXT}').focus()`);
  await ctx.key('Enter');
  await ctx.wait(`!document.querySelector('${EDITOR}')`);
}

async function context(ctx, node = IMAGE) {
  const point = await ctx.run(`(()=>{const r=document.querySelector('${node} .hy-node-card').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  for (const type of ['mouseMove','mouseDown','mouseUp']) ctx.win.webContents.sendInputEvent({type,...point,button:'right',clickCount:1});
  await ctx.wait("document.querySelector('[data-assistant-item=add-annotation]')");
}

async function add(ctx, text, color, node = IMAGE) {
  await context(ctx, node);
  await ctx.pointer('[data-assistant-item=add-annotation]');
  await ctx.wait(`document.querySelector('${TEXT}')===document.activeElement`);
  await ctx.fill(TEXT, text);
  if (color) await ctx.click(`${EDITOR} [data-annotation-color="${color}"]`);
  await save(ctx);
}

async function checkFirst(ctx) {
  await ctx.add('image', 340, 320);
  await checkNativeCreate(ctx);
  await checkCompositionCreate(ctx);
  await context(ctx);
  await ctx.pointer('[data-assistant-item=add-annotation]');
  await ctx.wait(`document.querySelector('${TEXT}')===document.activeElement`);
  await ctx.key('Enter');
  ctx.smoke.check('Empty annotation cannot create a tag', await ctx.run(`!!document.querySelector('${EDITOR}')&&!document.querySelector('${TAG}')`));
  // 首次新建走真实键入，不替输入框补焦点，以暴露菜单到编辑器的交接问题。
  await ctx.win.webContents.insertText('第一镜');
  ctx.smoke.check('Native right-click and typing reach the annotation input', await ctx.run(`document.querySelector('${TEXT}').value==='第一镜'`));
  await ctx.click(`${EDITOR} [data-annotation-color="#ef4444"]`);
  await ctx.run(`document.querySelector('${TEXT}').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}))`);
  ctx.smoke.check('Composition Enter does not save the label', await ctx.run(`!!document.querySelector('${EDITOR}')&&!document.querySelector('${TAG}')`));
  await ctx.shot('annotations-input');
  await ctx.key('Enter');
  await ctx.wait(`document.querySelector('${IMAGE} ${TAG}')`);
  ctx.smoke.check('Enter saves text and selected color on the node', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='第一镜'&&getComputedStyle(document.querySelector('${IMAGE} ${TAG}')).backgroundColor==='rgb(239, 68, 68)'`));
  await context(ctx);
  await ctx.click('[data-assistant-item=add-annotation]');
  await ctx.wait(`document.querySelector('${TEXT}')`);
  await ctx.fill(TEXT, '取消的草稿');
  await ctx.key('Escape');
  await ctx.wait(`!document.querySelector('${EDITOR}')`);
  ctx.smoke.check('Escape discards draft without removing the node', await ctx.run(`document.querySelectorAll('${IMAGE} ${TAG}').length===1&&document.querySelectorAll('${IMAGE}').length===1`));
}

async function checkEditAndCap(ctx) {
  await ctx.click(`${IMAGE} ${TAG}`);
  await ctx.wait(`document.querySelector('${TEXT}')`);
  await ctx.fill(TEXT, '自定义标注');
  await ctx.click('[data-annotation-custom]');
  for (const [channel, value] of [['red', '18'], ['green', '52'], ['blue', '86']]) await ctx.fill(`[data-color-channel=${channel}]`, value);
  await ctx.run("document.querySelector('[data-color-channel=blue]').focus()");
  await ctx.key('Enter');
  ctx.smoke.check('RGB Enter keeps the annotation draft open', await ctx.run(`!!document.querySelector('${EDITOR}')`));
  await ctx.pointer('[data-annotation-save]');
  await ctx.wait(`!document.querySelector('${EDITOR}')`);
  ctx.smoke.check('Existing annotation uses shared RGB color controls', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='自定义标注'&&getComputedStyle(document.querySelector('${IMAGE} ${TAG}')).backgroundColor==='rgb(18, 52, 86)'`));
  for (let i = 2; i <= 8; i++) await add(ctx, `标注${i}`, '#fde047');
  await context(ctx);
  ctx.smoke.check('Eighth tag disables add', await ctx.run(`document.querySelectorAll('${IMAGE} ${TAG}').length===8&&document.querySelector('[data-assistant-item=add-annotation]').disabled`));
  await ctx.pointer('[data-assistant-item=add-annotation]');
  await ctx.wait("Array.from(document.querySelectorAll('[data-hover-tip][data-visible=true]')).some(e=>e.textContent.includes('8'))");
  ctx.smoke.check('Full node explains the cap through the shared tooltip', true);
  await ctx.key('Escape');
  await checkPlacement(ctx, 'Eight labels follow the requested order with 12px stems and clear ports');
  await checkResizeAndZoom(ctx);
  await ctx.shot('annotations-eight');
  await ctx.click(`${IMAGE} ${TAG}`);
  await ctx.wait(`document.querySelector('${TEXT}')`);
  await ctx.fill(TEXT, '满额仍可编辑');
  await save(ctx);
  ctx.smoke.check('Full node can still edit existing annotations', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='满额仍可编辑'`));
}

async function checkDeleteUndo(ctx) {
  await ctx.click(`${IMAGE} ${TAG}`);
  await ctx.wait(`document.querySelector('${EDITOR}')`);
  await ctx.click('[data-annotation-remove]');
  await ctx.wait(`document.querySelectorAll('${IMAGE} ${TAG}').length===7`);
  ctx.smoke.check('Deleting one annotation keeps the node', await ctx.run(`document.querySelectorAll('${IMAGE}').length===1`));
  await checkPlacement(ctx, 'Remaining labels fill positions in order after deletion');
  await ctx.key('z', ['control']);
  await ctx.wait(`document.querySelectorAll('${IMAGE} ${TAG}').length===8`);
  ctx.smoke.check('Undo restores deleted tag and color', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='满额仍可编辑'&&getComputedStyle(document.querySelector('${IMAGE} ${TAG}')).backgroundColor==='rgb(18, 52, 86)'`));
  await ctx.add('note', 1100, 320);
  await add(ctx, '便签自己的标注', '#22c55e', NOTE);
  ctx.smoke.check('Same annotation component works on note independently', await ctx.run(`document.querySelectorAll('${NOTE} ${TAG}').length===1&&document.querySelectorAll('${IMAGE} ${TAG}').length===8`));
}

async function checkSaved(ctx) {
  await ctx.key('s', ['control']);
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  await ctx.win.reload();
  await library.openProject(ctx);
  await ctx.wait(`document.querySelectorAll('${IMAGE} ${TAG}').length===8`);
  ctx.smoke.check('Save and reload preserves both nodes annotations', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='满额仍可编辑'&&document.querySelectorAll('${NOTE} ${TAG}').length===1`));
  await require('./sidebar-menu-fixture').revealSidebarPreference(ctx.run, '[data-theme-trigger]');
  await require('./check-canvas-card-resize').changeTheme(ctx, 'light');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.shot('annotations-light');
  await ctx.click(`${NOTE} ${TAG}`);
  await ctx.wait(`document.querySelector('${EDITOR}')`);
  await ctx.run(`document.querySelector('${EDITOR}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:620,clientY:300}))`);
  ctx.smoke.check('Annotation editor right-click cannot open canvas menu', await ctx.run("!document.querySelector('[data-cascade-menu]')"));
  ctx.smoke.check('Editor stays inside window bounds', await ctx.run(`(()=>{const r=document.querySelector('${EDITOR}').parentElement.getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-7&&r.top>=8&&r.bottom<=innerHeight-7})()`));
  await ctx.key('Escape');
}

async function checkCopy(ctx) {
  // 复制节点后只改副本，原牌子与旧撤销快照都不能被原地修改。
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key('c', ['control']);
  await ctx.key('v', ['control']);
  await ctx.wait(`document.querySelectorAll('${NOTE}').length===2`);
  const clone = `${NOTE}[data-selected=true]`;
  await ctx.click(`${clone} ${TAG}`);
  await ctx.wait(`document.querySelector('${TEXT}')`);
  await ctx.fill(TEXT, '副本标注');
  await save(ctx);
  ctx.smoke.check('Copied node annotations edit without changing original', await ctx.run(`Array.from(document.querySelectorAll('${NOTE} ${TAG} span')).map(e=>e.textContent).sort().join('|')===['便签自己的标注','副本标注'].sort().join('|')`));
  await ctx.run(`document.querySelector('${clone}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:620,clientY:300}))`);
  await ctx.click('[data-assistant-item=remove]');
  await ctx.wait(`document.querySelectorAll('${NOTE}').length===1`);
}

async function checkCanvasAnnotations(ctx) {
  await checkFirst(ctx);
  await checkEditAndCap(ctx);
  await checkDeleteUndo(ctx);
  await checkCopy(ctx);
  await checkSaved(ctx);
}

module.exports = { checkCanvasAnnotations };

// 从真实矩形独立推算四边距离，不能只比对位置编号或 CSS 字样。
async function checkPlacement(ctx, label) {
  ctx.smoke.check(label, await ctx.run(`(() => {
    const node = document.querySelector('${IMAGE}');
    const card = node.querySelector('.hy-node-card').getBoundingClientRect();
    const scale = card.width / node.offsetWidth;
    const ports = Array.from(node.querySelectorAll('.react-flow__handle >span')).map(e => e.getBoundingClientRect());
    const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const slots = ['right','bottom','left','top','right','bottom','left','top'];
    return Array.from(node.querySelectorAll('${TAG}')).every((e,i) => {
      const r = e.getBoundingClientRect(), side = slots[i];
      const vertical = side === 'top' || side === 'bottom';
      const stem = getComputedStyle(e,'::before');
      const anchor = vertical ? r.left + parseFloat(stem.left)*scale - card.left : r.top + r.height/2 - card.top;
      const expected = [1,2,4,7].includes(i) ? (vertical?card.width:card.height)-12*scale : 12*scale;
      const gap = {right:r.left-card.right,bottom:r.top-card.bottom,left:card.left-r.right,top:card.top-r.bottom}[side];
      return Math.abs(anchor-expected)<2 && Math.abs(gap-12*scale)<2 &&
        stem[vertical?'height':'width']==='12px' && getComputedStyle(e).paddingLeft==='11px' &&
        !ports.some(port=>overlap(r,port));
    });
  })()`));
}

// 不先点色板或重新聚焦，覆盖用户“直接输入后回车”的实际操作顺序。
async function checkNativeCreate(ctx) {
  await context(ctx);
  await ctx.pointer('[data-assistant-item=add-annotation]');
  await ctx.wait(`document.querySelector('${TEXT}')===document.activeElement`);
  await ctx.win.webContents.insertText('直接回车新建');
  await ctx.key('Enter');
  await ctx.wait(`!document.querySelector('${EDITOR}')`);
  ctx.smoke.check('Typing then Enter creates a label without picking a color or refocusing', await ctx.run(`document.querySelector('${IMAGE} ${TAG} span').textContent==='直接回车新建'`));
  await ctx.key('z', ['control']);
  await ctx.wait(`!document.querySelector('${TAG}')`);
}

// 模拟选词期间的 Enter 与选词结束后的 Enter，实体中文输入法仍需人工验收。
async function checkCompositionCreate(ctx) {
  await context(ctx);
  await ctx.pointer('[data-assistant-item=add-annotation]');
  await ctx.wait(`document.querySelector('${TEXT}')===document.activeElement`);
  await ctx.win.webContents.insertText('中文标注');
  await ctx.run(`document.querySelector('${TEXT}').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))`);
  await ctx.key('Enter');
  ctx.smoke.check('Composition session prevents an early Enter from saving', await ctx.run(`!!document.querySelector('${EDITOR}')&&!document.querySelector('${TAG}')`));
  await ctx.run(`document.querySelector('${TEXT}').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))`);
  await ctx.key('Enter');
  await ctx.wait(`!document.querySelector('${EDITOR}')`);
  ctx.smoke.check('Enter after composition ends creates the Chinese label', await ctx.run(`document.querySelector('${TAG} span').textContent==='中文标注'`));
  await ctx.key('z', ['control']);
  await ctx.wait(`!document.querySelector('${TAG}')`);
}

async function checkResizeAndZoom(ctx) {
  const before = await require('./check-canvas-card-resize').geometry(ctx, IMAGE);
  await require('./check-canvas-card-resize').drag(ctx, `${IMAGE} .react-flow__resize-control.handle.bottom.right`, 60, 40, false, IMAGE);
  const after = await require('./check-canvas-card-resize').geometry(ctx, IMAGE);
  ctx.smoke.check('Annotation overlay leaves card resize handles usable', Math.abs(after.w-before.w-60)<2 && Math.abs(after.h-before.h-40)<2);
  await checkPlacement(ctx, 'Resized card retains all eight attachment positions');
  await ctx.key('z', ['control']);
  // 只操作生产画布缩放入口，不给测试节点手写 transform。
  ctx.win.webContents.sendInputEvent({type:'mouseWheel',x:1350,y:700,deltaY:-120,deltaX:0,modifiers:['control'],canScroll:true});
  await ctx.wait("Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a-1)>.01");
  await checkPlacement(ctx, 'Canvas zoom scales stems with the card without shifting slots');
  await ctx.click('[data-canvas-viewport] .hy-zoom-value');
  await ctx.wait("Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a-1)<.001");
}
