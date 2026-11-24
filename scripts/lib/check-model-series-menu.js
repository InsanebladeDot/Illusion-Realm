/** 正式创建页的系列选单回归；只操作菜单和主题，不调用模型推理或写用户配置。 */
const menu = '[data-model-series] [role=listbox]';
const option = id => `[data-model-series-option=${id}]`;

async function pointer(ctx, selector) {
  const point = await ctx.run(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  await ctx.wait(`document.querySelector('${selector}').matches(':hover')`);
}

// 先把鼠标移走再检查默认底色，避免拿正在悬停的颜色冒充选中样式。
async function checkNeutral(ctx) {
  await pointer(ctx, '[data-create-mode-tabs]');
  await ctx.wait(`!document.querySelector('[data-model-series-tip]')`);
  await ctx.wait(`Array.from(document.querySelectorAll('${menu} [role=option]')).every(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)')`);
  ctx.smoke.check('Selected series keeps its check without a resting background', await ctx.run(`document.querySelectorAll('${menu} [aria-selected=true]').length===1&&!!document.querySelector('${menu} [aria-selected=true] .lucide-check')`));
}

async function checkTip(ctx, id, theme) {
  await pointer(ctx, option(id));
  await ctx.wait(`getComputedStyle(document.querySelector('${option(id)}')).backgroundColor!=='rgba(0, 0, 0, 0)'`);
  await ctx.wait(`!!document.querySelector('[data-model-series-tip=${id}]')`);
  const geometry = await ctx.run(`(()=>{const e=document.querySelector('[data-model-series-tip=${id}]'),r=e.getBoundingClientRect(),s=getComputedStyle(e),p=document.querySelector('[data-create-rail]').getBoundingClientRect();return {black:s.backgroundColor==='rgb(5, 5, 5)',portal:e.parentElement===document.body,visible:s.display!=='none'&&r.width>200,inside:r.left>=8&&r.right<=innerWidth-8&&r.top>=0&&r.bottom<=innerHeight-8,escapes:r.right>p.right||r.left<p.left}})()`);
  ctx.smoke.check(`${theme}/${id}: side explanation escapes the rail and fits the window`, geometry.black && geometry.portal && geometry.visible && geometry.inside && geometry.escapes);
  await ctx.shot(`model-series-${theme}-${id}`);
  await checkNeutral(ctx);
}

async function checkTheme(ctx, theme) {
  await ctx.run("document.querySelector('[data-theme-trigger]').click()");
  await ctx.run(`document.querySelector('[data-theme-option=${theme}]').click()`);
  await require('./sidebar-menu-fixture').closeAppearance(ctx.run);
  await ctx.wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')`);
  await ctx.click('[data-model-series] button');
  await ctx.wait(`!!document.querySelector('${menu}')`);
  await checkNeutral(ctx);
  for (const id of ['sdxl', 'anima']) await checkTip(ctx, id, theme);
  await ctx.click(option('sdxl'));
  ctx.smoke.check('Choosing SDXL closes the menu and updates the trigger', await ctx.run(`!document.querySelector('${menu}')&&document.querySelector('[data-model-series] button').textContent.includes('SDXL')`));
  await ctx.click('[data-model-series] button');
  await checkNeutral(ctx);
  await ctx.click(option('anima'));
  ctx.smoke.check('Choosing Anima closes the menu and removes its explanation', await ctx.run(`!document.querySelector('${menu}')&&!document.querySelector('[data-model-series-tip]')&&document.querySelector('[data-model-series] button').textContent.includes('Anima')`));
}

module.exports = async ctx => {
  for (const theme of ['light', 'dark']) await checkTheme(ctx, theme);
  await ctx.metrics(900, 720);
  await ctx.click('[data-model-series] button');
  await checkTip(ctx, 'anima', 'narrow-dark');
  // 键盘聚焦也能阅读说明；失焦后结束，不靠鼠标移走才能收起。
  // 冒烟窗口离屏运行，先启用浏览器焦点仿真，让 focus 真正触发组件事件。
  await ctx.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await ctx.run(`document.querySelector('${option('sdxl')}').focus()`);
  await ctx.wait("!!document.querySelector('[data-model-series-tip=sdxl]')");
  await ctx.run(`document.querySelector('${option('sdxl')}').blur()`);
  await ctx.wait("!document.querySelector('[data-model-series-tip]')");
  ctx.smoke.check('Keyboard focus shows tips and blur clears them', true);
  await ctx.win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: false });
};
