/** 真实视频画面发起手势，反证只有标题或右键选择才能移动、缩放的回归。 */
const resize = require('./check-canvas-card-resize');
const NODE = '[data-canvas-node=video]';

async function moveVideo(ctx, selector, dx, dy) {
  const point = await ctx.run(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/3)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  ctx.win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + dx * i / 8, y: point.y + dy * i / 8, button: 'left' });
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  ctx.win.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + dx, y: point.y + dy, button: 'left', clickCount: 1 });
}

async function checkVideoNodeGestures(ctx) {
  await ctx.click('[data-canvas-viewport] button[aria-label="适配全部"]');
  await ctx.wait(`document.querySelector('${NODE} [data-media-status=ready]')`);
  await ctx.run("window.videoGeometry={value:'',time:Date.now()}");
  await ctx.wait("(()=>{const value=document.querySelector('.react-flow__viewport').style.transform;if(value!==window.videoGeometry.value){window.videoGeometry={value,time:Date.now()};return false}return Date.now()-window.videoGeometry.time>250})()");
  const before = await resize.geometry(ctx, NODE);
  await moveVideo(ctx, `${NODE} video`, 40, 24);
  await ctx.wait(`document.querySelector('${NODE}[data-selected=true] [data-card-resizers]')`);
  const moved = await resize.geometry(ctx, NODE);
  ctx.smoke.check('拖视频画面即选中并移动，松手不展开参数', Math.abs(moved.x - before.x - 40) < 2 && Math.abs(moved.y - before.y - 24) < 2 && !await ctx.run(`!!document.querySelector('${NODE} [data-generation-panel-frame]')`));
  await resize.drag(ctx, `${NODE} .react-flow__resize-control.handle.bottom.right`, 30, 20, false, NODE);
  const after = await resize.geometry(ctx, NODE);
  ctx.smoke.check('视频画面选中后直接复用四边与右下角缩放', after.w > moved.w + 25 && after.h > moved.h + 15);
  const position = await resize.geometry(ctx, NODE);
  await ctx.pointer(`${NODE} [aria-label="播放视频"]`);
  await ctx.wait(`!document.querySelector('${NODE} video').paused`);
  const playing = await resize.geometry(ctx, NODE);
  ctx.smoke.check('播放按钮保留独立操作，不搬动卡片', Math.abs(playing.x - position.x) < 1 && Math.abs(playing.y - position.y) < 1);
  await ctx.pointer(`${NODE} [aria-label="暂停视频"]`);
  await restoreGeometry(ctx, before.x);
}

// 还原这次搬动与缩放，避免后续预览按钮被相邻节点盖住。
async function restoreGeometry(ctx, x) {
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key('z', ['control']);
  await ctx.key('z', ['control']);
  await ctx.wait(`Math.abs(document.querySelector('${NODE}').getBoundingClientRect().left-${x})<2`);
}

module.exports = { checkVideoNodeGestures };
