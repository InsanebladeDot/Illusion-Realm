/** 正式音频卡验证平滑进度与共享设置；生成返回固定音频，不验证 Kitchen 的设备速度。 */
const fs = require('node:fs');
const NODE = '[data-canvas-node=audio-card]';
const CONTROL = '.hy-image-sidebar [data-model-attention]';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 暂时吞掉 timeupdate，证明播放线由真实时钟逐帧更新，而不是仍依赖原来的低频事件。 */
async function checkSmooth(ctx) {
  await ctx.run(`(()=>{const a=document.querySelector('${NODE} audio');a.muted=true;a.currentTime=0;return true})()`);
  await ctx.pointer(`${NODE} [data-canvas-audio-play]`);
  const samples = await ctx.run(`new Promise(resolve=>{const a=document.querySelector('${NODE} audio'),values=[];const swallow=e=>e.stopImmediatePropagation();a.addEventListener('timeupdate',swallow,true);const timer=setInterval(()=>values.push({shown:Number(document.querySelector('${NODE} .hy-audio-wave input').value),actual:a.currentTime}),20);setTimeout(()=>{clearInterval(timer);a.removeEventListener('timeupdate',swallow,true);a.pause();resolve(values)},650)})`);
  ctx.smoke.check('Audio progress has over ten distinct positions between low-frequency events', new Set(samples.map(row => row.shown)).size > 10 && samples.every(row => Math.abs(row.shown-row.actual)<.12));
  const paused = await ctx.run(`Number(document.querySelector('${NODE} .hy-audio-wave input').value)`);
  await delay(150);
  ctx.smoke.check('Paused progress stays still', Math.abs(await ctx.run(`Number(document.querySelector('${NODE} .hy-audio-wave input').value)`)-paused)<.02);
  await ctx.run(`document.querySelector('${NODE} audio').currentTime=.2;true`);
  await ctx.wait(`Math.abs(Number(document.querySelector('${NODE} .hy-audio-wave input').value)-.2)<.03`);
  ctx.smoke.check('Seeking while paused immediately updates the visible position', true);
}
async function open(ctx) {
  await ctx.pointer(`${NODE} header>svg`);
  await ctx.wait("!!document.querySelector('.hy-generation-panel [data-canvas-workflow] button')");
  await ctx.click('.hy-generation-panel [data-canvas-workflow] button');
  await ctx.wait(`!!document.querySelector('${CONTROL}')`);
  await ctx.click('.hy-image-sidebar [data-advanced-settings-toggle]');
}
function backends(graph) { return Object.values(graph).filter(node => node.class_type === 'ModelAttentionBackend').map(node => node.inputs.attention); }
async function generate(ctx, state) {
  const before = state.requests.length;
  await ctx.click('.hy-image-sidebar header button');
  await ctx.click('.hy-generation-panel .hy-submit');
  await ctx.wait(`document.querySelector('${NODE} [data-canvas-media=audio]')?.dataset.mediaStatus==='ready'&&!document.querySelector('.hy-generation-panel .hy-submit')?.disabled`);
  if (state.requests.length !== before+1) throw Error('attention-audio-request-missing');
  return state.requests.at(-1).prompt;
}
async function checkBackend(ctx, state) {
  ctx.smoke.check('Default real audio submission uses Kitchen', backends(state.requests.at(-1).prompt).every(value => value === 'comfy kitchen attention') && backends(state.requests.at(-1).prompt).length>0);
  await open(ctx);
  ctx.smoke.check('Shared audio advanced settings default to enabled Kitchen', await ctx.run(`document.querySelector('${CONTROL} [role=switch]').getAttribute('aria-checked')==='true'&&document.querySelector('${CONTROL} [data-simple-select-value]').dataset.simpleSelectValue==='comfy kitchen attention'`));
  await ctx.run(`document.querySelector('${CONTROL}').scrollIntoView({block:'center'});true`);
  await ctx.shot('attention-audio-default-dark');
  await ctx.click(`${CONTROL} [data-simple-select-value]`);
  await ctx.click('[data-simple-select-option="pytorch attention"]');
  ctx.smoke.check('Backend selection reaches the actual queued audio request', backends(await generate(ctx,state)).every(value => value === 'pytorch attention'));
  await open(ctx);
  await ctx.click(`${CONTROL} [role=switch]`);
  const disabled = await generate(ctx,state);
  ctx.smoke.check('Turning off removes the backend and restores model connections', backends(disabled).length === 0);
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  await ctx.wait(`document.querySelector('${NODE} audio').paused`);
  return disabled;
}
/** 切入创作页验证同一偏好已共享并落盘，图库空列表只是补齐本专项无关的读取。 */
async function checkCreate(ctx) {
  const { registerHandle } = require('../../apps/electron/src/main/ipc/result');
  const { IPC_CHANNELS: C } = require('../../apps/electron/src/common/ipc-channels');
  registerHandle(C.FILES_LIST_GENERATED_IMAGES,()=>[]); registerHandle(C.FILES_LIST_OUTPUT_FOLDERS,()=>[]);
  await require('./check-canvas-card-resize').changeTheme(ctx,'light');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  ctx.win.setContentSize(960,820);
  await ctx.click('nav a[href="/create"]');
  await ctx.wait("!!document.querySelector('[data-model-attention]')");
  await ctx.click('[data-advanced-settings-toggle]');
  ctx.smoke.check('Image advanced settings reuse the same disabled PyTorch preference', await ctx.run("document.querySelector('[data-model-attention] [role=switch]').getAttribute('aria-checked')==='false'&&document.querySelector('[data-model-attention] [data-simple-select-value]').dataset.simpleSelectValue==='pytorch attention'"));
  await ctx.wait(`!!document.querySelector('[data-model-attention] [data-simple-select-value]:disabled')`);
  const document = JSON.parse(fs.readFileSync(ctx.documentPath,'utf8'));
  ctx.smoke.check('Attention preference persists in the existing user settings document', document.settings.modelAttention.enabled===false && document.settings.modelAttention.backend==='pytorch attention');
  await delay(300);
  await ctx.run("document.querySelector('[data-model-attention]').scrollIntoView({block:'center',behavior:'instant'});true");
  await ctx.wait("(()=>{const r=document.querySelector('[data-model-attention]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()");
  ctx.smoke.check('Narrow image attention controls remain visible inside the application', await ctx.run("(()=>{const r=document.querySelector('[data-model-attention]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"));
  await ctx.shot('attention-create-light');
}
async function checkAttentionAndPlayback(ctx,state) {
  await checkSmooth(ctx);
  await require('./check-canvas-card-resize').changeTheme(ctx,'dark');
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
  await checkBackend(ctx,state);
  await checkCreate(ctx);
}
module.exports = { checkAttentionAndPlayback };
