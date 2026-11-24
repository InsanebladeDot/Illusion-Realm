/** 隔离工程中的真实菜单回归；连续鼠标移动验证通道，不用 DOM.click 跳过中间空区。 */
const NODE = '[data-kind=note]';
const ROOT = '[data-cascade-menu] [data-assistant-column="0"]';
const CHILD = '[data-cascade-menu] [data-assistant-column="1"]';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function move(ctx, point) {
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(point.x), y: Math.round(point.y) });
  await delay(40);
}

async function point(ctx, selector) {
  return ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
}

async function open(ctx, edge = false) {
  // 边缘场景只改变右键锚点；其他场景在真实节点中心按右键。
  if (edge) await ctx.run(`document.querySelector('${NODE}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-12,clientY:innerHeight-12}))`);
  else {
    const position = await point(ctx, `${NODE} .hy-node-card`);
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) ctx.win.webContents.sendInputEvent({ type, x: Math.round(position.x), y: Math.round(position.y), button: 'right', clickCount: 1 });
  }
  await ctx.wait(`!!document.querySelector('${ROOT}')`);
}

async function measure(ctx) {
  // 子列挂载后定位器才会写入实测高度，短轮询等待布局完成，并保留失败尺寸。
  let geometry;
  for (let attempt = 0; attempt < 10; attempt++) {
    geometry = await ctx.run(`(()=>{const a=document.querySelector('${ROOT}').getBoundingClientRect(),b=document.querySelector('${CHILD}').getBoundingClientRect();return {equal:Math.abs(a.height-b.height)<1&&Math.abs(a.top-b.top)<1,x:b.left+b.width/2,inside:b.left>=8&&b.right<=innerWidth-8&&b.top>=44&&b.bottom<=innerHeight-8,root:{top:a.top,height:a.height},child:{top:b.top,height:b.height}}})()`);
    if (geometry.equal && geometry.inside) return geometry;
    await delay(40);
  }
  console.error('CANVAS_MENU_GEOMETRY', geometry);
  return geometry;
}

async function cross(ctx, group, item, edge = false) {
  await open(ctx, edge);
  const start = await point(ctx, `[data-assistant-item=${group}]`);
  await move(ctx, start);
  await ctx.wait(`!!document.querySelector('${CHILD}')`);
  const geometry = await measure(ctx);
  ctx.smoke.check(`${group}: parent and child share height and stay in bounds`, geometry.equal && geometry.inside);
  // 先水平跨入子列的空区，再向上找按钮，覆盖截图中卡片样式位于底部的路线。
  for (let step = 1; step <= 8; step++) await move(ctx, { x: start.x + (geometry.x-start.x)*step/8, y: start.y });
  ctx.smoke.check(`${group}: horizontal crossing lands inside child`, await ctx.run(`document.elementFromPoint(${geometry.x},${start.y})?.closest('[data-assistant-column]')?.dataset.assistantColumn==='1'`));
  const end = await point(ctx, `[data-assistant-item=${item}]`);
  for (let step = 1; step <= 8; step++) await move(ctx, { x: geometry.x, y: start.y+(end.y-start.y)*step/8 });
  await ctx.pointer(`[data-assistant-item=${item}]`);
  await ctx.wait(`!document.querySelector('${ROOT}')`);
}

async function checkActions(ctx, edge = false) {
  await cross(ctx, 'card', 'rectangle', edge);
  ctx.smoke.check('Rectangle action updates the selected node', await ctx.run(`document.querySelector('${NODE}').dataset.card==='rectangle'`));
  await cross(ctx, 'note-style', 'note-attach-pin', edge);
  ctx.smoke.check('Style action applies after pointer crossing', await ctx.run(`document.querySelector('${NODE} [data-note-attach]').dataset.noteAttach==='pin'`));
  await cross(ctx, 'note-color', 'note-color-blue', edge);
  ctx.smoke.check('Color action applies after pointer crossing', await ctx.run(`document.querySelector('${NODE} [data-note-color]').dataset.noteColor==='blue'`));
}

async function checkCompact(ctx) {
  ctx.win.setSize(680, 720);
  await ctx.wait('innerWidth<720');
  await open(ctx, true);
  await ctx.pointer('[data-assistant-item=card]');
  await ctx.wait("!!document.querySelector('[data-assistant-item=square]')");
  ctx.smoke.check('Compact window keeps single-column navigation', await ctx.run("document.querySelectorAll('[data-assistant-column]').length===1"));
  await ctx.pointer('[data-assistant-item=square]');
  await ctx.wait(`!document.querySelector('${ROOT}')`);
  await open(ctx, true);
  await ctx.key('Escape');
  ctx.smoke.check('Escape still closes the context menu', await ctx.run(`!document.querySelector('${ROOT}')`));
}

async function checkCanvasContextMenu(ctx) {
  await ctx.add('note', 360, 240);
  await checkActions(ctx);
  await open(ctx);
  await move(ctx, await point(ctx, '[data-assistant-item=card]'));
  await ctx.wait(`!!document.querySelector('${CHILD}')`);
  await ctx.shot('context-menu-equal-dark');
  await ctx.key('Escape');
  await require('./sidebar-menu-fixture').revealSidebarPreference(ctx.run, '[data-theme-trigger]');
  await require('./check-canvas-card-resize').changeTheme(ctx, 'light');
  ctx.win.setSize(960, 720);
  await ctx.wait('innerWidth<=960');
  await checkActions(ctx, true);
  await open(ctx, true);
  await move(ctx, await point(ctx, '[data-assistant-item=card]'));
  await ctx.wait(`!!document.querySelector('${CHILD}')`);
  await ctx.shot('context-menu-equal-light-edge');
  await ctx.key('Escape');
  await checkCompact(ctx);
}

module.exports = { checkCanvasContextMenu };
