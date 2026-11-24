/** 在正式画布编辑器发送 Electron 键盘事件；不调用生产光标算法或删除函数。 */
const editor = '[data-canvas-node=target] [data-video-prompt]';

async function caret(ctx, side) {
  await ctx.run(`(()=>{const e=document.querySelector('${editor}'),b=e.querySelector('[data-reference-label]'),r=document.createRange();e.focus();r.${side === 'before' ? 'setStartBefore' : 'setStartAfter'}(b);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
}

async function checkPromptReferenceDelete(ctx, seed, image, audio) {
  for (const kind of ['image', 'video', 'audio']) {
    const token = kind === 'audio' ? '@audio1' : '@picture1';
    const data = kind === 'audio' ? { kind, audioParameters: { reference: audio } } : { kind, workflow: kind === 'image' ? 'minimax-image-edit' : 'minimax-reference', inputImages: [image] };
    await seed(ctx, { ...data, prompt: token });
    await ctx.wait(`document.querySelector('${editor} [data-reference-label]')`);
    await caret(ctx, 'after');
    await ctx.key('Backspace');
    const result = await ctx.run(`document.querySelector('${editor}').textContent`);
    console.log('REFERENCE_DELETE_RESULT', { kind, key: 'Backspace', result });
    ctx.smoke.check(`${kind}: Backspace removes the complete reference without selecting all`, result === '');
    if (result !== '') throw Error('reference-backspace-regression');
    await ctx.key('z', ['control']);
    await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(token)}`);
    await caret(ctx, 'before');
    await ctx.key('Delete');
    ctx.smoke.check(`${kind}: Delete removes the reference ahead of the caret`, await ctx.run(`document.querySelector('${editor}').textContent===''`));
    ctx.smoke.check(`${kind}: Editing the prompt preserves the canvas node and input media`, await ctx.run("document.querySelectorAll('[data-canvas-node]').length===1&&document.querySelectorAll('[data-canvas-node=target] .hy-reference-thumbnail').length===1"));
    await ctx.win.webContents.insertText('ok');
    await ctx.wait(`document.querySelector('${editor}').textContent==='ok'`);
    await ctx.key('Backspace');
    ctx.smoke.check(`${kind}: Typing after the last reference is deleted keeps ordinary text editing`, await ctx.run(`document.querySelector('${editor}').textContent==='o'`));
  }
  await checkMixedSelection(ctx, seed, image);
}

// 选区故意从不可编辑标签内部开始，检查半选标签也只会整块移除，不丢周边文字。
async function checkMixedSelection(ctx, seed, image) {
  const raw = 'A @picture1 B @picture1 C';
  await seed(ctx, { kind: 'image', workflow: 'minimax-image-edit', inputImages: [image], prompt: raw });
  await ctx.run(`(()=>{const e=document.querySelector('${editor}'),b=e.querySelectorAll('[data-reference-label]'),r=document.createRange();e.focus();r.setStart(b[0].lastChild,3);r.setEnd(b[1].lastChild,3);getSelection().removeAllRanges();getSelection().addRange(r)})()`);
  await ctx.key('Delete');
  ctx.smoke.check('Partial selection across two references deletes complete tokens and keeps surrounding text', await ctx.run(`document.querySelector('${editor}').textContent==='A  C'`));
  await ctx.key('z', ['control']);
  await ctx.wait(`document.querySelector('${editor}').textContent===${JSON.stringify(raw)}`);
  await ctx.key('y', ['control']);
  ctx.smoke.check('Reference deletion and redo use the existing prompt history', await ctx.run(`document.querySelector('${editor}').textContent==='A  C'`));
  await ctx.key('a', ['control']); await ctx.key('Delete');
  ctx.smoke.check('Select-all deletion continues to clear the prompt', await ctx.run(`document.querySelector('${editor}').textContent===''`));
}

module.exports = { checkPromptReferenceDelete };
