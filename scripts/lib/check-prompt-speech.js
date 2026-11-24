/** 正式创建/画布输入回归；转译只替代外部模型回包，高亮与资源装饰均为生产实现。 */
const fs = require('node:fs'), path = require('node:path');
const preview = require('./check-canvas-prompt-preview');
const library = require('./canvas-library-fixture');
const { clipboard } = require('electron');
const panel = '[data-canvas-node=target] .hy-generation-panel';
const editor = `${panel} [data-video-prompt]`;
const highlighted = selector => `(()=>{const root=document.querySelector(${JSON.stringify(selector)});return [...(CSS.highlights.get('prompt-speech')??[])].filter(range=>root?.contains(range.startContainer)).map(range=>range.toString())})()`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function expectRanges(ctx, selector, expected) {
  await ctx.wait(`JSON.stringify(${highlighted(selector)})===${JSON.stringify(JSON.stringify(expected))}`);
}
async function translate(ctx, state, output) {
  state.output = output;
  await ctx.run(`document.querySelector('${panel} [data-assistant-options]').focus()`);
  await ctx.click(`${panel} [data-assistant-translate]`);
}
async function checkCanvas(ctx, state) {
  const current = library.readCanvas(ctx), source = path.resolve('scripts/fixtures/video-composition/image.png');
  const imported = await ctx.run(`window.electronAPI.canvasImportMedia(${JSON.stringify({name:current.name,workspace:current.workspace,mode:'copy',files:[{kind:'image',name:'image.png',path:source,size:fs.statSync(source).size}]})})`);
  const raw = '描述。[English] Use @picture1. Speak。场景。[Chiness] 你好。尾声。';
  await preview.seedPromptNode(ctx,{kind:'image',workflow:'minimax-image-edit',prompt:raw,inputImages:imported.data.media});
  await expectRanges(ctx,editor,['[English] Use @picture1. Speak。','[Chiness] 你好。']);
  ctx.smoke.check('Language and speech highlight through Chinese period across resource chips',await ctx.run(`document.querySelector('${editor}').textContent===${JSON.stringify(raw)}&&!!document.querySelector('${editor} [data-media-reference]')`));
  await translate(ctx,state,'[Japanese] Hello <Picture 1>。After。');
  await ctx.wait(`document.querySelector('${editor}').textContent==='[Japanese] Hello @picture1。After。'`);
  await expectRanges(ctx,editor,['[Japanese] Hello @picture1。']);
  ctx.smoke.check('Transcreation writes plain text and restores original resource reference',state.requests.at(-1).text.includes('<Picture 1>')&&await ctx.run(`!!document.querySelector('${editor} [data-media-reference]')`));
  await ctx.click(`${panel} [data-assistant-undo]`);
  await expectRanges(ctx,editor,['[English] Use @picture1. Speak。','[Chiness] 你好。']);
  ctx.smoke.check('Existing undo restores original text and matching highlights',await ctx.run(`document.querySelector('${editor}').textContent===${JSON.stringify(raw)}`));
  await checkPending(ctx,state);
  await ctx.shot('prompt-speech-canvas-dark');
}

/** 迟到结果有自己的只读高亮，不覆盖用户的新稿；关闭预览后只撤掉其范围。 */
async function checkPending(ctx,state) {
  state.hold = true;
  await translate(ctx,state,null);
  await ctx.wait(`document.querySelector('${panel} [data-assistant-translate]').disabled`);
  await ctx.fill(editor,'[English] New @picture1。Tail。');
  for (let attempt = 0; attempt < 100 && !state.complete; attempt++) await delay(20);
  if (!state.complete) throw Error('speech-translation-request-missing');
  state.complete('[English] Pending <Picture 1>。After。'); state.hold=false;
  await ctx.wait(`!!document.querySelector('${panel} [data-assistant-result]')`);
  await expectRanges(ctx,`${panel} [data-assistant-result] [data-prompt-speech-text]`,['[English] Pending @picture1。']);
  await expectRanges(ctx,editor,['[English] New @picture1。']);
  ctx.smoke.check('Pending translation preview and edited draft highlight independently',await ctx.run(`document.querySelector('${editor}').textContent==='[English] New @picture1。Tail。'`));
  await ctx.click(`${panel} [data-assistant-result] button:last-child`);
  await expectRanges(ctx,editor,['[English] New @picture1。']);
  await ctx.run(`document.querySelector('${panel} [data-assistant-options]').focus()`);
  await ctx.click(`${panel} [data-assistant-actions] button:first-child`);
  ctx.smoke.check('Copy contains original language syntax and raw resource reference only',clipboard.readText()==='[English] New @picture1。Tail。');
}

/** 普通图片输入由DOM命令式写入，光标与原生撤销不能因着色被重建。 */
async function checkCreate(ctx) {
  // 创建页旁边图库不参与本专项，空列表夹具只补外壳读取，不冒充媒体业务验证。
  const { registerHandle } = require('../../apps/electron/src/main/ipc/result');
  const { IPC_CHANNELS: C } = require('../../apps/electron/src/common/ipc-channels');
  registerHandle(C.FILES_LIST_GENERATED_IMAGES,()=>[]);
  registerHandle(C.FILES_LIST_OUTPUT_FOLDERS,()=>[]);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  await ctx.click('nav a[href="/create"]');
  await ctx.wait("!!document.querySelector('#prompt-editor')");
  await ctx.fill('#prompt-editor','[English] First. Second。Tail。');
  await expectRanges(ctx,'#prompt-editor',['[English] First. Second。']);
  const offset = await ctx.run("(()=>{const e=document.querySelector('#prompt-editor');e.focus();const s=getSelection(),r=document.createRange();r.setStart(e.firstChild,12);r.collapse(true);s.removeAllRanges();s.addRange(r);e.firstChild.appendData('!');return s.anchorOffset})()");
  await expectRanges(ctx,'#prompt-editor',['[English] First. Second。']);
  ctx.smoke.check('Shared image prompt highlights without inserting markup or moving caret',await ctx.run(`document.querySelector('#prompt-editor').children.length===0&&getSelection().anchorOffset===${offset}`));
  await checkOtherInput(ctx);
  await require('./check-minimax-image-edit').changeTheme(ctx,'light');
  ctx.win.setContentSize(960,820);
  await expectRanges(ctx,'#prompt-editor',['[English] First. Second。']);
  ctx.smoke.check('Highlight follows shared light theme',await ctx.run("getComputedStyle(document.querySelector('#prompt-editor'),'::highlight(prompt-speech)').backgroundColor!=='rgba(0, 0, 0, 0)'"));
  await ctx.run("document.querySelector('#prompt-editor').scrollIntoView({block:'center'})");
  await ctx.shot('prompt-speech-create-light');
}
async function checkOtherInput(ctx) {
  await ctx.wait("!!document.querySelector('#negative-prompt-editor')");
  await ctx.fill('#negative-prompt-editor','[Chinese] 第二处。');
  await expectRanges(ctx,'#negative-prompt-editor',['[Chinese] 第二处。']);
  await expectRanges(ctx,'#prompt-editor',['[English] First. Second。']);
  await ctx.fill('#negative-prompt-editor','plain negative');
  await expectRanges(ctx,'#negative-prompt-editor',[]);
  await expectRanges(ctx,'#prompt-editor',['[English] First. Second。']);
  ctx.smoke.check('Multiple inputs keep separate ranges when one is cleared',true);
}
async function checkPromptSpeech(ctx,state) {
  await checkCanvas(ctx,state);
  await checkCreate(ctx);
}
module.exports = {checkPromptSpeech};
