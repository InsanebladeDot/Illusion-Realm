/** 正式画布自动回归；图片是真实 PNG，鼠标/键盘是 Electron 注入，不算人工验收。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nativeImage } = require('electron');
const NODE = '[data-canvas-node=resize-image]';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function seed(root) {
  const pixels = Buffer.alloc(180 * 320 * 4);
  for (let y = 0; y < 320; y++) for (let x = 0; x < 180; x++) {
    const offset = (y * 180 + x) * 4;
    pixels.set([Math.round(y * .7), Math.round(x * 1.3), 180, 255], offset);
  }
  const file = path.join(root, 'portrait.png');
  fs.writeFileSync(file, nativeImage.createFromBitmap(pixels, { width: 180, height: 320 }).toPNG());
  return { version: 1, name: '图片缩放回归', edges: [], nodes: [{ id: 'resize-image', position: { x: 180, y: 140 },
    data: { kind: 'image', title: 'portrait', prompt: '', content: '', ratio: '1/1',
      media: { kind: 'image', path: file, name: 'portrait.png', size: fs.statSync(file).size } } }] };
}

async function geometry(ctx, node = NODE) {
  return ctx.run(`(()=>{const n=document.querySelector('${node}'),r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
}

// 屏幕位置来自实际 DOM；缩放后的世界单位计算仍由生产图库完成。
async function drag(ctx, selector, dx, dy, cancel = false, node = NODE) {
  // 历史恢复按产品约定清掉选择，重新右键指定图片再测试缩放，不能要求隐藏控件仍能操作。
  if (!await ctx.run(`!!document.querySelector('${node} [data-card-resizers]')`)) {
    await ctx.run(`document.querySelector('${node}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))`);
    await ctx.key('Escape');
  }
  // 左右边中点属于连接端口的扩展热区；缩放在同一边的四分之一处命中，两种操作都应保留。
  const fraction = selector.includes('.line.left') || selector.includes('.line.right') ? .25 : .5;
  const point = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height*${fraction})}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  ctx.win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(point.x + dx * i / 8), y: Math.round(point.y + dy * i / 8), button: 'left' });
    await delay(20);
  }
  if (cancel) await ctx.key('Escape');
  ctx.win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + dx, y: point.y + dy, button: 'left', clickCount: 1 });
  await delay(200);
}

async function checkResize(ctx) {
  await ctx.wait(`document.querySelector('${NODE} img')?.naturalWidth===180`);
  await ctx.pointer(`${NODE} .hy-node-card`);
  await ctx.shot('80-image-before');
  const before = await geometry(ctx);
  assert.equal(await ctx.run(`getComputedStyle(document.querySelector('${NODE} img')).objectFit`), 'cover');
  for (const [edge, cursor] of [['left', 'ew-resize'], ['right', 'ew-resize'], ['top', 'ns-resize'], ['bottom', 'ns-resize'], ['bottom.right', 'nwse-resize']]) {
    assert.equal(await ctx.run(`getComputedStyle(document.querySelector('${NODE} .react-flow__resize-control.${edge}')).cursor`), cursor);
  }
  await drag(ctx, `${NODE} .react-flow__resize-control.handle.bottom.right`, 100, 70);
  const after = await geometry(ctx);
  assert.ok(Math.abs(after.w - before.w - 100) < 2 && Math.abs(after.h - before.h - 70) < 2);
  await ctx.shot('81-image-resized');
  await ctx.key('z', ['control']);
  assert.ok(Math.abs((await geometry(ctx)).w - before.w) < 2);
  await ctx.key('y', ['control']);
  assert.ok(Math.abs((await geometry(ctx)).w - after.w) < 2);
  await drag(ctx, `${NODE} .react-flow__resize-control.line.left`, -40, 0);
  const left = await geometry(ctx);
  assert.ok(Math.abs(left.x - after.x + 40) < 2 && Math.abs(left.w - after.w - 40) < 2);
  await drag(ctx, `${NODE} .react-flow__resize-control.line.top`, 0, -30, true);
  assert.ok(Math.abs((await geometry(ctx)).y - left.y) < 2);
  ctx.smoke.check('image cover, five cursors, corner/left resize, undo/redo and Escape restoration', true);
}

async function checkPan(ctx) {
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  const cursor = "getComputedStyle(document.querySelector('.react-flow__pane')).cursor";
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: 1200, y: 650 });
  assert.equal(await ctx.run(cursor), 'default');
  ctx.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  await ctx.wait("document.querySelector('[data-infinite-canvas]').dataset.canvasHand==='true'");
  assert.equal(await ctx.run(cursor), 'grab');
  // 失焦属于 DOM 自动事件，单独报告，不冒充真正切换到别的桌面应用。
  await ctx.run("window.dispatchEvent(new Event('blur'))");
  await ctx.wait("document.querySelector('[data-infinite-canvas]').dataset.canvasHand==='false'");
  ctx.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  assert.equal(await ctx.run(cursor), 'default');
  ctx.smoke.check('Space pan resets on simulated window blur without a stuck hand cursor', true);
  await ctx.pointer('[data-canvas-toolbar] button[aria-label="平移画布"]');
  assert.equal(await ctx.run(cursor), 'grab');
  await ctx.pointer('[data-canvas-toolbar] button[aria-label="选择节点"]');
  assert.equal(await ctx.run(cursor), 'default');
}

async function checkOtherEdgesAndZoom(ctx) {
  // 三个边分别操作后撤销，不能只检查光标就宣称四边都能改尺寸。
  const before = await geometry(ctx);
  for (const [edge, dx, dy] of [['right', 30, 0], ['bottom', 0, 25], ['top', 0, -20]]) {
    await drag(ctx, `${NODE} .react-flow__resize-control.line.${edge}`, dx, dy);
    const changed = await geometry(ctx);
    assert.ok(Math.abs(changed.w - before.w - dx) < 2);
    assert.ok(Math.abs(changed.h - before.h - Math.abs(dy)) < 2);
    await ctx.key('z', ['control']);
    assert.ok(Math.abs((await geometry(ctx)).h - before.h) < 2);
  }
  ctx.win.webContents.sendInputEvent({ type: 'mouseWheel', x: 1150, y: 650, deltaY: -120, deltaX: 0, modifiers: ['control'], canScroll: true });
  await delay(300);
  const scale = await ctx.run("new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a");
  assert.notEqual(scale, 1);
  const zoomed = await geometry(ctx);
  await drag(ctx, `${NODE} .react-flow__resize-control.line.right`, 40, 0);
  assert.ok(Math.abs((await geometry(ctx)).w - zoomed.w - 40) < 2);
  await ctx.key('z', ['control']);
  await ctx.click('[data-canvas-viewport] .hy-zoom-value');
  assert.ok(Math.abs((await geometry(ctx)).w - before.w) < 2);
  ctx.smoke.check('all four edges resize and undo; zoomed resizing preserves world coordinates', true);
}

async function checkCanvasCardResize(ctx) {
  await checkResize(ctx);
  await checkOtherEdgesAndZoom(ctx);
  await checkPan(ctx);
  await ctx.key('s', ['control']);
  await ctx.wait("document.querySelector('[data-canvas-save-status]')?.textContent.includes('已保存')");
  const saved = require("./canvas-library-fixture").readCanvas(ctx);
  assert.equal(saved.nodes[0].data.card.style, 'custom');
  assert.ok(saved.nodes[0].data.card.width > 600);
  assert.equal(JSON.parse(fs.readFileSync(ctx.documentPath)).infiniteCanvas, undefined);
  await ctx.win.reload();
  await require("./canvas-library-fixture").openProject(ctx);
  await ctx.wait(`document.querySelector('${NODE} img')?.naturalWidth===180`);
  assert.ok((await geometry(ctx)).w > 600);
  await ctx.shot('82-image-reopened');
  ctx.smoke.check('real SQLite save and page reload retain card geometry without media changes', true);
  await checkThemesAndTools(ctx);
}

async function checkThemesAndTools(ctx) {
  await changeTheme(ctx, 'light');
  ctx.win.setSize(960, 720);
  await delay(200);
  await ctx.shot('83-image-light-narrow');
  await ctx.win.loadURL('app://app/tools');
  await ctx.wait("document.querySelector('[data-tool-category=video]')");
  for (const theme of ['light', 'dark']) {
    await changeTheme(ctx, theme);
    await ctx.pointer('[data-tool-category=image]');
    const point = await ctx.run("(()=>{const r=document.querySelector('[data-tool-category=video]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    await delay(120);
    assert.equal(await ctx.run("getComputedStyle(document.querySelector('[data-tool-category=video]')).outlineStyle"), 'none');
    assert.equal(await ctx.run("document.querySelector('[data-tool-category=image]').getAttribute('aria-selected')"), 'true');
    await ctx.shot(`84-tools-hover-${theme}`);
  }
  ctx.smoke.check('light narrow canvas and both toolbox themes retain selection without hover outlines', true);
}

async function changeTheme(ctx, theme) {
  // 通过正式主题菜单同时改变偏好和原生媒体查询，避免只采到被旧偏好覆盖前的一帧。
  await ctx.click('[data-theme-trigger]');
  await ctx.wait(`document.querySelector('[data-theme-option=${theme}]')`);
  await ctx.click(`[data-theme-option=${theme}]`);
  await require('./sidebar-menu-fixture').closeAppearance(ctx.run);
  await ctx.wait(`document.documentElement.dataset.theme==='${theme}' && matchMedia('(prefers-color-scheme:dark)').matches===${theme === 'dark'}`);
  await delay(300);
}

module.exports = { seed, checkCanvasCardResize, changeTheme, geometry, drag };
