/** 创作页正式放大入口回归；图库与账号用宿主夹具，图片真实解码，无模型生成或人工操作。 */
const pan = require('./preview-pan-input');
const selectors = { image: '[data-image-preview-pan] img', pane: '[data-image-preview-pan]', surface: '[data-image-preview-pan] img' };

async function open(ctx) {
  await ctx.click('[data-preview-expand]');
  await ctx.wait("document.querySelector('[data-image-preview-pan] img')?.naturalWidth>0");
}

async function checkPreviewPan(ctx) {
  await ctx.wait("document.querySelector('[data-preview-thumbnail]')");
  for (const theme of ['light', 'dark']) {
    await ctx.run("document.querySelector('[data-theme-trigger]').click()");
    await ctx.run(`document.querySelector('[data-theme-option=${theme}]').click()`);
    await require('./sidebar-menu-fixture').closeAppearance(ctx.run);
    await ctx.wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')`);
    await ctx.metrics(theme === 'light' ? 1566 : 960, 900);
    await open(ctx);
    await pan.dragImage(ctx, selectors, { x: 60, y: 35 }, `创作${theme}100%`);
    await pan.cancelPan(ctx, selectors);
    await ctx.click('[data-image-preview-overlay] [aria-label="缩小"]');
    await pan.dragImage(ctx, selectors, { x: -30, y: -20 }, `创作${theme}缩小80%`);
    await ctx.shot(`preview-pan-create-${theme}`);
    await checkSwitchAndReset(ctx);
  }
  await open(ctx);
  const point = await pan.startPan(ctx, selectors.image);
  // ESC在仍按住时关闭；重开必须恢复新会话，不能延续上一次抓取。
  await ctx.wait("document.querySelector('[data-image-preview-pan]').dataset.previewDragging==='true'");
  await ctx.run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  ctx.input({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  await open(ctx);
  ctx.smoke.check('按住时关闭再打开不残留抓手与位移', await ctx.run("document.querySelector('[data-image-preview-pan]').dataset.previewDragging==='false'&&new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-image-preview-pan] img')).transform).m41===0"));
  await ctx.click('[data-image-preview-overlay] [aria-label="关闭预览"]');
}

async function checkSwitchAndReset(ctx) {
  await ctx.click('[data-image-preview-overlay] [aria-label="重置缩放"]');
  const reset = await pan.readOffset(ctx, selectors.surface);
  ctx.smoke.check('创作重置还原平移和缩放', reset.x === 0 && reset.y === 0 && await ctx.run("new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-image-preview-pan] img')).transform).a===1"));
  await pan.dragImage(ctx, selectors, { x: 35, y: 15 }, '创作切图前');
  await checkImageClicks(ctx);
  await ctx.click('[data-image-preview-overlay] [aria-label="下一张"]');
  await ctx.wait("document.querySelector('[data-image-preview-pan] img')?.naturalWidth>0");
  const next = await pan.readOffset(ctx, selectors.surface);
  ctx.smoke.check('切图复位且仍显示可拖动图片', next.x === 0 && next.y === 0);
  await ctx.click('[data-image-preview-overlay] [aria-label="关闭预览"]');
  await ctx.wait("!document.querySelector('[data-image-preview-overlay]')");
}

// 真鼠标的单击保持预览，双击仍复位；捕获不能把图片点击重定向成背景关闭。
async function checkImageClicks(ctx) {
  const point = await pan.startPan(ctx, selectors.image);
  ctx.input({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  await ctx.wait("!!document.querySelector('[data-image-preview-pan]')&&document.querySelector('[data-image-preview-pan]').dataset.previewDragging==='false'");
  ctx.smoke.check('图片单击不误关预览', true);
  for (const clickCount of [1, 2]) for (const type of ['mouseDown', 'mouseUp']) ctx.input({ type, ...point, button: 'left', clickCount });
  await ctx.wait("new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-image-preview-pan] img')).transform).m41===0");
  ctx.smoke.check('图片双击仍能重置查看位置', true);
}

module.exports = checkPreviewPan;
