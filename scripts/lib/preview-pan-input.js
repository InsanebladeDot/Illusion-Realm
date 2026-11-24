/** 两个正式预览入口共用鼠标回归；真实按下、移动、松开，位移从最终DOM矩阵反读。 */
async function readOffset(ctx, surface) {
  // 重置和缩放保留150ms过渡；先等它结束，不能拿动画中间坐标当下一次拖动起点。
  await ctx.wait(`document.querySelector(${JSON.stringify(surface)}).getAnimations().every(animation=>animation.playState!=='running')`);
  return ctx.run(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector(${JSON.stringify(surface)})).transform);return {x:m.m41,y:m.m42}})()`);
}

async function startPan(ctx, image) {
  const point = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(image)}).getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  ctx.input({ type: 'mouseMove', ...point });
  ctx.input({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  return point;
}

async function dragImage(ctx, { image, pane, surface }, delta, label) {
  const before = await readOffset(ctx, surface);
  const point = await startPan(ctx, image);
  await ctx.wait(`document.querySelector(${JSON.stringify(pane)}).dataset.previewDragging==='true'`);
  for (let step = 1; step <= 4; step++) ctx.input({ type: 'mouseMove', x: point.x + Math.round(delta.x * step / 4), y: point.y + Math.round(delta.y * step / 4), modifiers: ['leftButtonDown'] });
  await ctx.wait(`(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector(${JSON.stringify(surface)})).transform);return Math.abs(m.m41-(${before.x + delta.x}))<1&&Math.abs(m.m42-(${before.y + delta.y}))<1})()`);
  // 拖动时关闭变换过渡，避免动画追着鼠标跑；松开之后才恢复工具动画。
  await ctx.wait(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(surface)}));return s.transitionProperty==='none'||s.transitionDuration==='0s'})()`);
  const after = await readOffset(ctx, surface);
  ctx.smoke.check(`${label}: 按屏幕像素拖动且无动画拖尾`, Math.abs(after.x - before.x - delta.x) < 1 && Math.abs(after.y - before.y - delta.y) < 1);
  ctx.input({ type: 'mouseUp', x: point.x + delta.x, y: point.y + delta.y, button: 'left', clickCount: 1 });
  await ctx.wait(`document.querySelector(${JSON.stringify(pane)}).dataset.previewDragging==='false'`);
  ctx.input({ type: 'mouseMove', ...point });
  const released = await readOffset(ctx, surface);
  ctx.smoke.check(`${label}: 松开停止移动并恢复抓手`, Math.abs(released.x - after.x) < 1 && Math.abs(released.y - after.y) < 1 && await ctx.run(`getComputedStyle(document.querySelector(${JSON.stringify(image)})).cursor==='grab'`));
}

// 失焦通过合成窗口事件注入；鼠标仍是Electron真实输入，不冒充人工切换应用。
async function cancelPan(ctx, selectors) {
  const point = await startPan(ctx, selectors.image);
  await ctx.wait(`document.querySelector(${JSON.stringify(selectors.pane)}).dataset.previewDragging==='true'`);
  await ctx.run("window.dispatchEvent(new Event('blur'))");
  await ctx.wait(`document.querySelector(${JSON.stringify(selectors.pane)}).dataset.previewDragging==='false'`);
  const before = await readOffset(ctx, selectors.surface);
  ctx.input({ type: 'mouseMove', x: point.x + 30, y: point.y + 30, modifiers: ['leftButtonDown'] });
  ctx.input({ type: 'mouseUp', x: point.x + 30, y: point.y + 30, button: 'left', clickCount: 1 });
  const after = await readOffset(ctx, selectors.surface);
  ctx.smoke.check('失焦结束捕获，后续移动不再拖图', Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1);
}

module.exports = { dragImage, cancelPan, startPan, readOffset };
