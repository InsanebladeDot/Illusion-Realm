/** 正式节点网鼠标滚轮回归；图片真实解码，输入走Chromium，未注入缩放业务状态。 */
const preview = '[data-canvas-network-preview]';

async function wheel(ctx, selector, deltaY) {
  const point = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.left+3),y:Math.round(r.top+r.height/2)}})()`);
  await ctx.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await ctx.win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY });
}

// 只用已有滑块设置边界前提，再让真实滚轮尝试越界，避免几十次滚动拖长用例。
async function setZoom(ctx, value) {
  await ctx.run(`(()=>{const e=document.querySelector('${preview} input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await ctx.wait(`document.querySelector('[data-preview-zoom]').textContent==='${Math.round(value * 100)}%'`);
}

async function checkPreviewWheel(ctx) {
  const transform = await ctx.run("document.querySelector('.react-flow__viewport').style.transform");
  await wheel(ctx, `${preview} section`, -120);
  await ctx.wait("document.querySelector('[data-preview-zoom]').textContent==='110%'");
  await wheel(ctx, '[data-network-content=image] img', 120);
  await ctx.wait("document.querySelector('[data-preview-zoom]').textContent==='100%'");
  ctx.smoke.check('main留白滚轮向上放大、图片向下缩小，后台画布不缩放', await ctx.run(`document.querySelector('.react-flow__viewport').style.transform===${JSON.stringify(transform)}`));
  await setZoom(ctx, .1);
  await wheel(ctx, `${preview} section`, 120);
  await assertZoom(ctx, '10%', '缩小保留10%下限');
  await setZoom(ctx, 4);
  await wheel(ctx, `${preview} section`, -120);
  await assertZoom(ctx, '400%', '放大保留400%上限');
  await ctx.click(`${preview} [aria-label="重置视图"]`);
  await wheel(ctx, `${preview} footer`, -120);
  await assertZoom(ctx, '100%', '底部资源条滚轮不改变图片缩放');
  await wheel(ctx, `${preview} [data-preview-chrome]`, -120);
  await assertZoom(ctx, '100%', '工具栏滚轮不抢控件操作');
  await ctx.click(`${preview} [data-network-node=text]`);
  await wheel(ctx, `${preview} section`, -120);
  await assertZoom(ctx, '100%', '文字内容滚轮保留阅读行为');
  await ctx.click(`${preview} [data-network-node=image]`);
  await ctx.wait("document.querySelector('[data-network-content=image] img').naturalWidth>0");
}

async function assertZoom(ctx, value, label) {
  // 输入分发后用主进程短计时等滚轮落地；不依赖页面rAF或隐式截图等待。
  await new Promise(resolve => setTimeout(resolve, 100));
  ctx.smoke.check(label, await ctx.run(`document.querySelector('[data-preview-zoom]').textContent==='${value}'`));
}

module.exports = { checkPreviewWheel };
