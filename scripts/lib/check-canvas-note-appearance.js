/** 复用书写专项的真实菜单与保存流程；不模拟外观保存，也不读取用户工程。 */
const NOTE = '[data-kind=note]';
const INPUT = '[data-canvas-writing-panel] textarea';

async function choose(ctx, group, item) {
  await ctx.run(`document.querySelector('${NOTE}').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))`);
  await ctx.wait(`document.querySelector('[data-assistant-item=${group}]')`);
  await ctx.pointer(`[data-assistant-item=${group}]`);
  await ctx.wait(`document.querySelector('[data-assistant-item=${item}]')`);
  await ctx.click(`[data-assistant-item=${item}]`);
  await ctx.wait("!document.querySelector('[data-assistant-column]')");
}

async function checkBorderless(ctx) {
  await ctx.pointer(`${NOTE} .hy-node-card`);
  await ctx.wait(`document.querySelector('${NOTE} ${INPUT}')`);
  await ctx.click(`${NOTE} ${INPUT}`);
  // Chromium 可在 outline-style:none 时仍报告默认宽度；检查是否真的绘线，避免误报。
  ctx.smoke.check('Selected note paper has no border or outline', await ctx.run(`(()=>{
    const card=document.querySelector('${NOTE} .hy-node-card'), paper=card.children[1];
    return [card,paper].every(e=>{const s=getComputedStyle(e);return s.borderTopWidth==='0px'&&s.outlineStyle==='none'});
  })()`));
  ctx.smoke.check('Focused writing remains transparent and borderless', await ctx.run(`(()=>{
    const area=document.querySelector('${NOTE} [data-canvas-writing-panel]'), input=area.querySelector('textarea');
    return [area,input].every(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.borderTopWidth==='0px'&&s.outlineStyle==='none'&&s.boxShadow==='none'});
  })()`));
  ctx.smoke.check('Borderless writing preserves all four toolbar buttons', await ctx.run(`document.querySelectorAll('${NOTE} [data-canvas-writing-panel] button').length===4`));
}

async function checkCopy(ctx) {
  // 复制后改副本的纸色，原件必须保持蓝色；撤销恢复副本原色，不能污染共享快照。
  await ctx.run("document.querySelector('[data-infinite-canvas]').focus()");
  await ctx.key('c', ['control']);
  await ctx.key('v', ['control']);
  await ctx.wait(`document.querySelectorAll('${NOTE}').length===2`);
  const original = await ctx.run(`document.querySelector('${NOTE}:not([data-selected=true])').getAttribute('data-canvas-node')`);
  await ctx.run(`document.querySelector('${NOTE}[data-selected=true]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))`);
  await ctx.pointer('[data-assistant-item=note-color]');
  await ctx.wait("document.querySelector('[data-assistant-item=note-color-green]')");
  await ctx.click('[data-assistant-item=note-color-green]');
  ctx.smoke.check('Copied note color changes independently', await ctx.run(`document.querySelector('[data-canvas-node="${original}"] [data-note-color]').dataset.noteColor==='blue'&&document.querySelectorAll('${NOTE} [data-note-color=green]').length===1`));
  await ctx.key('z', ['control']);
  await ctx.wait(`document.querySelectorAll('${NOTE} [data-note-color=blue]').length===2`);
  ctx.smoke.check('Undo restores note appearance', true);
  // 恢复会清除选择；重新指定副本再删，后续旧书写用例仍只保留一张便签。
  await ctx.run(`document.querySelector('${NOTE}:not([data-canvas-node="${original}"])').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))`);
  await ctx.click('[data-assistant-item=remove]');
  await ctx.wait(`document.querySelectorAll('${NOTE}').length===1`);
}

async function checkAppearance(ctx) {
  await ctx.run("document.querySelector('[data-kind=text]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:600,clientY:300}))");
  await ctx.wait("document.querySelector('[data-assistant-item=card]')");
  ctx.smoke.check('Text context menu keeps geometry without note appearance', await ctx.run("!document.querySelector('[data-assistant-item=note-style],[data-assistant-item=note-color]')"));
  await ctx.key('Escape');
  await checkBorderless(ctx);
  for (const attach of ['pin', 'none', 'tape']) {
    await choose(ctx, 'note-style', `note-attach-${attach}`);
    ctx.smoke.check(`Note style ${attach} applies through shared menu`, await ctx.run(`document.querySelector('${NOTE} .hy-node-card').dataset.noteAttach==='${attach}'`));
  }
  await choose(ctx, 'note-color', 'note-color-blue');
  await checkCopy(ctx);
  await checkBorderless(ctx);
  await ctx.shot('writing-note-blue-tape');
}

async function checkRestored(ctx) {
  ctx.smoke.check('Saved note appearance survives SQLite reload', await ctx.run(`document.querySelector('${NOTE} .hy-node-card').dataset.noteAttach==='tape'&&document.querySelector('${NOTE} .hy-node-card').dataset.noteColor==='blue'`));
  await checkBorderless(ctx);
  await ctx.shot('writing-note-light');
}

module.exports = { checkAppearance, checkRestored };
