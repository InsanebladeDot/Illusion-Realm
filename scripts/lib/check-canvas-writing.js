/** 静态画布书写回归：鼠标、菜单、持久化均走产品；外部转译复用已有 IPC 替身。 */
const { drag } = require('./check-canvas-card-resize');
const library = require('./canvas-library-fixture');
const NOTE = '[data-kind=note]';
const TEXT = '[data-kind=text]';
const INPUT = '[data-canvas-writing-panel] textarea';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function doubleClick(ctx, selector) {
  const point = await ctx.run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  for (const clickCount of [1, 2]) for (const type of ['mouseDown', 'mouseUp']) {
    ctx.win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount });
  }
  await ctx.wait(`document.activeElement===document.querySelector('${INPUT}')`);
}

async function checkMenu(ctx) {
  await ctx.run("document.querySelector('.react-flow__pane').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:520,clientY:220}))");
  await ctx.wait("document.querySelector('[data-canvas-text-category]')");
  ctx.smoke.check('Text category contains no top-level writing leaves', await ctx.run("!document.querySelector('[data-assistant-column=\"0\"] [data-node-kind=text],[data-assistant-column=\"0\"] [data-node-kind=note]')"));
  await ctx.pointer('[data-canvas-text-category]');
  await ctx.wait("document.querySelector('[data-assistant-column=\"1\"] [data-node-kind=note]')");
  ctx.smoke.check('Text submenu offers both text and note', await ctx.run("!!document.querySelector('[data-assistant-column=\"1\"] [data-node-kind=text]')"));
  await ctx.shot('writing-menu');
  await ctx.key('Escape');
}

async function checkWriting(ctx) {
  await ctx.add('text', 200, 150);
  await doubleClick(ctx, `${TEXT} .hy-node-card`);
  await ctx.fill(`${TEXT} ${INPUT}`, '文本原稿');
  ctx.smoke.check('Text double-click edits its body without network preview', await ctx.run(`!document.querySelector('[data-canvas-network-preview]')&&document.querySelector('${TEXT} .hy-node-result').textContent==='文本原稿'`));
  await ctx.add('note', 650, 150);
  await ctx.pointer(`${TEXT} header>svg`);
  await ctx.pointer(`${NOTE} .hy-node-card`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}')`);
  ctx.smoke.check('Single click opens full text tools without generation controls', await ctx.run(`document.querySelectorAll('${NOTE} [data-canvas-writing-panel] button').length===4&&!!document.querySelector('${NOTE} [data-assistant-translate]')&&!!document.querySelector('${NOTE} [data-assistant-options]')&&!document.querySelector('${NOTE} .hy-generation-panel')`));
  await doubleClick(ctx, `${NOTE} .hy-node-card`);
  await ctx.fill(`${NOTE} ${INPUT}`, '便签原稿');
  ctx.smoke.check('Note double-click focuses writing and preserves text body', await ctx.run(`!document.querySelector('[data-canvas-network-preview]')&&document.querySelector('${NOTE} .hy-node-result').textContent==='便签原稿'&&document.querySelector('${TEXT} .hy-node-result').textContent==='文本原稿'`));
}

async function checkTranslation(ctx, state) {
  // 原文从真实输入框读取；请求虽然是替身，回写仍经过公共工具栏的冲突检查。
  await ctx.click(`${NOTE} [data-assistant-options]`);
  await ctx.wait("document.querySelector('[data-prompt-assistant-menu]')");
  ctx.smoke.check('Writing settings expose the shared provider and preset menu', await ctx.run("!!document.querySelector('[data-assistant-item=provider]')&&!!document.querySelector('[data-assistant-item=presets]')"));
  await ctx.key('Escape');
  const before = state.requests.length;
  await ctx.click(`${NOTE} [data-assistant-translate]`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}').value==='便签原稿 transformed'`);
  ctx.smoke.check('Translation request and result use note content', state.requests.length === before + 1 && state.requests[before].text === '便签原稿' && await ctx.run(`document.querySelector('${NOTE} .hy-node-result').textContent==='便签原稿 transformed'`));
  await ctx.click(`${NOTE} [data-assistant-undo]`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}').value==='便签原稿'`);
  ctx.smoke.check('Shared undo restores the body before translation', await ctx.run(`document.querySelector('${NOTE} .hy-node-result').textContent==='便签原稿'`));
  state.failure = 'writing-fixture-failure';
  await ctx.click(`${NOTE} [data-assistant-translate]`);
  await ctx.wait(`!document.querySelector('${NOTE} [data-assistant-translate]').disabled`);
  ctx.smoke.check('Failed translation restores button and preserves body', state.requests.length === before + 2 && await ctx.run(`document.querySelector('${NOTE} ${INPUT}').value==='便签原稿'`));
  state.failure = null;
}

async function checkConflict(ctx, state) {
  // 像寄出的信不能覆盖收件人刚改的稿，迟到译文必须先供用户确认。
  state.hold = true;
  state.complete = null;
  await ctx.click(`${NOTE} [data-assistant-translate]`);
  for (let i = 0; i < 100 && !state.complete; i++) await delay(20);
  if (!state.complete) throw Error('Translation request was not received');
  await ctx.fill(`${NOTE} ${INPUT}`, '用户正在修改的新稿');
  state.complete('迟到译文');
  state.hold = false;
  await ctx.wait(`document.querySelector('${NOTE} [data-assistant-result]')`);
  ctx.smoke.check('Late translation cannot overwrite newer writing', await ctx.run(`document.querySelector('${NOTE} ${INPUT}').value==='用户正在修改的新稿'&&document.querySelector('${NOTE} .hy-node-result').textContent==='用户正在修改的新稿'`));
  await ctx.click(`${NOTE} [data-assistant-result] button:last-child`);
}

async function checkGestures(ctx) {
  await ctx.pointer(`${NOTE} header>svg`);
  await drag(ctx, `${NOTE} .hy-node-card`, 25, 20, false, NOTE);
  ctx.smoke.check('Dragging closes the writing panel without losing content', await ctx.run(`!document.querySelector('${NOTE} [data-canvas-writing-panel]')&&document.querySelector('${NOTE} .hy-node-result').textContent==='用户正在修改的新稿'`));
  await ctx.pointer(`${NOTE} .hy-node-card`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}')`);
  const width = await ctx.run(`document.querySelector('${NOTE} .hy-node-card').getBoundingClientRect().width`);
  await drag(ctx, `${NOTE} .react-flow__resize-control.handle.bottom.right`, 50, 30, false, NOTE);
  ctx.smoke.check('Note resizing retains its original card mechanism', await ctx.run(`document.querySelector('${NOTE} .hy-node-card').getBoundingClientRect().width>${width + 30}`));
  await ctx.pointer(`${NOTE} .hy-node-card`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}')`);
  await ctx.run(`(()=>{const e=document.querySelector('${NOTE} ${INPUT}');e.focus();e.setSelectionRange(e.value.length,e.value.length)})()`);
  await ctx.key('Delete');
  ctx.smoke.check('Delete inside writing does not remove the node', await ctx.run(`document.querySelectorAll('${NOTE}').length===1`));
}

async function checkOtherCaller(ctx) {
  // 公共工具栏新增简洁模式后，媒体输入仍须保留完整配置与原节点网预览。
  await ctx.add('image', 1080, 150);
  await ctx.wait("document.querySelector('[data-kind=image] [data-assistant-options]')");
  ctx.smoke.check('Image toolbar keeps options, undo and translation', await ctx.run("!!document.querySelector('[data-kind=image] [data-assistant-undo]')&&!!document.querySelector('[data-kind=image] [data-assistant-translate]')"));
  await ctx.run("document.querySelector('[data-kind=image] .hy-node-card').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.wait("document.querySelector('[data-canvas-network-preview]')");
  ctx.smoke.check('Media double-click still opens node network', true);
  await ctx.key('Escape');
}

async function checkSaveAndTheme(ctx) {
  await ctx.key('s', ['control']);
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  await ctx.win.reload();
  await library.openProject(ctx);
  await ctx.wait(`document.querySelector('${NOTE} .hy-node-result')`);
  ctx.smoke.check('Reload preserves separate note and text contents', await ctx.run(`document.querySelector('${NOTE} .hy-node-result').textContent==='用户正在修改的新稿'&&document.querySelector('${TEXT} .hy-node-result').textContent==='文本原稿'`));
  await ctx.pointer(`${NOTE} header>svg`);
  await require('./sidebar-menu-fixture').revealSidebarPreference(ctx.run, '[data-theme-trigger]');
  await require('./check-canvas-card-resize').changeTheme(ctx, 'light');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await ctx.shot('writing-light');
  await require('./check-canvas-note-appearance').checkRestored(ctx);
}

async function checkCanvasWriting(ctx, state) {
  await checkMenu(ctx);
  await checkWriting(ctx);
  await checkTranslation(ctx, state);
  await checkConflict(ctx, state);
  await checkGestures(ctx);
  await require('./check-canvas-note-appearance').checkAppearance(ctx);
  await ctx.shot('writing-dark');
  await checkOtherCaller(ctx);
  await checkSaveAndTheme(ctx);
}

module.exports = { checkCanvasWriting };
