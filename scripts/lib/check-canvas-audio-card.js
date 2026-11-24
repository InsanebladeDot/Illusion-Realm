/** 生成结果使用音频 HTTP 夹具；移动、播放、缩放与 SQLite 保存走正式画布，不代表真实模型推理。 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const library = require('./canvas-library-fixture');
const resize = require('./check-canvas-card-resize');
const NODE = '[data-canvas-node=audio-card]';
const VIDEO = '[data-canvas-node=video-card]';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function save(ctx) {
  await ctx.click('.hy-project-header [aria-label="保存画布"]');
  await ctx.wait("document.querySelector('[data-canvas-save-status]').textContent.includes('已保存')");
  return library.readCanvas(ctx).nodes.find(node => node.id === 'audio-card');
}

async function reload(ctx) {
  await new Promise(resolve => { ctx.win.webContents.once('did-finish-load', resolve); ctx.win.webContents.reload(); });
  await library.openProject(ctx);
  await ctx.wait(`!!document.querySelector('${NODE}')`);
  await ctx.run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");
}

async function generate(ctx, state) {
  const document = await library.readCanvas(ctx);
  await library.writeCanvas(ctx, { ...document, edges: [], nodes: [{ id: 'audio-card', position: { x: 300, y: 200 }, data: { kind: 'audio', title: 'Audio', prompt: 'gentle waves', content: '', ratio: '1/1' } }] });
  await reload(ctx);
  await ctx.pointer(`${NODE} header>svg`);
  await ctx.wait(`document.querySelector('${NODE} .hy-submit')?.disabled===false`);
  const before = state.requests.length;
  await ctx.click(`${NODE} .hy-submit`);
  await ctx.wait(`document.querySelector('${NODE} [data-canvas-media=audio]')?.dataset.mediaStatus==='ready'`);
  const node = await save(ctx);
  ctx.smoke.check('Audio generation returns one playable file on the same node', state.requests.length === before + 1 && fs.existsSync(node.data.media.path));
  return node;
}

async function checkDrag(ctx) {
  const before = await resize.geometry(ctx, NODE);
  // 从播放器上方留白抓取，不能用标题代替用户实际拖不动的音频正文。
  const start = await ctx.run(`(()=>{const r=document.querySelector('${NODE} .hy-audio-player').getBoundingClientRect();return {x:Math.round(r.left+24),y:Math.round(r.top+34)}})()`);
  ctx.win.webContents.sendInputEvent({ type: 'mouseMove', ...start });
  ctx.win.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 8; step++) {
    ctx.win.webContents.sendInputEvent({ type: 'mouseMove', x: start.x+step*10, y: start.y+step*5, button: 'left' });
    await delay(25);
  }
  ctx.win.webContents.sendInputEvent({ type: 'mouseUp', x: start.x+80, y: start.y+40, button: 'left', clickCount: 1 });
  await delay(150);
  const after = await resize.geometry(ctx, NODE);
  ctx.smoke.check('Generated audio drags from its player body', Math.abs(after.x-before.x-80)<2 && Math.abs(after.y-before.y-40)<2);
  ctx.smoke.check('Dragging preserves audio size', Math.abs(after.w-before.w)<1 && Math.abs(after.h-before.h)<1);
}

async function checkControls(ctx) {
  const before = await resize.geometry(ctx, NODE);
  await ctx.run(`document.querySelector('${NODE} audio').muted=true;true`);
  await ctx.pointer(`${NODE} [data-canvas-audio-play]`);
  await ctx.wait(`document.querySelector('${NODE} audio').currentTime>0.1`);
  await ctx.pointer(`${NODE} [data-canvas-audio-play]`);
  await ctx.pointer(`${NODE} .hy-audio-transport [aria-pressed]`);
  ctx.smoke.check('Audio play, pause and mute remain usable', await ctx.run(`(()=>{const a=document.querySelector('${NODE} audio');return a.paused&&!a.muted})()`));
  // 鼠标在波形上拖动应调整进度，不能把整个卡片带走。
  await resize.drag(ctx, `${NODE} .hy-audio-wave input`, 25, 0, false, NODE);
  const after = await resize.geometry(ctx, NODE);
  ctx.smoke.check('Seeking audio leaves node position unchanged', Math.abs(after.x-before.x)<1 && Math.abs(after.y-before.y)<1 && await ctx.run(`document.querySelector('${NODE} audio').currentTime>0.1`));
}

async function checkFit(ctx) {
  await resize.drag(ctx, `${NODE} .react-flow__resize-control.handle.bottom.right`, 80, 60, false, NODE);
  const custom = await save(ctx);
  ctx.smoke.check('Audio reuses the normal card resize gesture', custom.data.card.style === 'custom' && custom.data.card.height>200);
  await ctx.pointer(`${NODE} .hy-node-actions .hy-chip`);
  const fitted = await save(ctx);
  ctx.smoke.check('Fit restores audio height and keeps the resized width', fitted.data.card.style === 'fit' && fitted.data.card.height===184 && fitted.data.card.width===custom.data.card.width);
  await reload(ctx);
  const restored = await resize.geometry(ctx, NODE);
  ctx.smoke.check('Saved fit and moved position survive reopening', Math.abs(restored.h-184)<1 && Math.abs(restored.w-fitted.data.card.width)<1 && (await save(ctx)).position.x===fitted.position.x);
}

// 两张卡同时加载，比较有声与静音的实际图标，并验证其中一张切换时另一张的声音状态不变。
async function checkSharedMute(ctx) {
  const mute = node => `${node} button[aria-pressed][aria-label="切换静音"]`;
  const audioButton = mute(NODE), videoButton = mute(VIDEO);
  const readGlyph = selector => ctx.run(`document.querySelector('${selector} svg').innerHTML`);
  const waitMuted = (selector, media, muted) => ctx.wait(`document.querySelector('${media}')?.muted === ${muted} && document.querySelector('${selector}')?.getAttribute('aria-pressed') === '${muted}'`);
  await ctx.wait(`document.querySelector('${audioButton}:enabled') && document.querySelector('${videoButton}:enabled')`);
  const audible = await readGlyph(videoButton);
  ctx.smoke.check('Audio and video show the same speaker when unmuted', await readGlyph(audioButton) === audible);
  await ctx.pointer(audioButton);
  await waitMuted(audioButton, `${NODE} audio`, true);
  await waitMuted(videoButton, `${VIDEO} video`, false);
  const audioMuted = await readGlyph(audioButton);
  await ctx.pointer(videoButton);
  await waitMuted(videoButton, `${VIDEO} video`, true);
  ctx.smoke.check('Both mute buttons display the same slashed speaker', audioMuted !== audible && await readGlyph(videoButton) === audioMuted);
  await ctx.pointer(audioButton);
  await waitMuted(audioButton, `${NODE} audio`, false);
  await waitMuted(videoButton, `${VIDEO} video`, true);
}

// 用真实的五秒 FLAC 和原生鼠标事件来回拖动，观察播放器自身的解码状态。
async function checkFlacSeeking(ctx) {
  const source = path.join(ctx.root, 'scrub.flac');
  const ffmpeg = path.resolve('apps/electron/bin/ffmpeg', 'ffmpeg.exe');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=r=48000:d=5', '-c:a', 'flac', source], { timeout: 10000, windowsHide: true });
  const document = library.readCanvas(ctx);
  const node = { id: 'audio-card', position: { x: 300, y: 200 }, data: { kind: 'audio', title: 'FLAC', prompt: '', content: '', ratio: '1/1', media: { kind: 'audio', name: 'scrub.flac', path: source, size: fs.statSync(source).size } } };
  const videoPath = path.resolve('scripts/fixtures/video-composition/video.mp4');
  const video = { id: 'video-card', position: { x: 630, y: 200 }, data: { kind: 'video', title: 'Video', prompt: '', content: '', ratio: '4/3', media: { kind: 'video', name: 'video.mp4', path: videoPath, size: fs.statSync(videoPath).size } } };
  await library.writeCanvas(ctx, { ...document, nodes: [node, video], edges: [] });
  await reload(ctx);
  await checkSharedMute(ctx);
  const audio = `document.querySelector('${NODE} audio')`;
  await ctx.wait(`${audio}?.readyState >= 2`);
  // Canvas 在 WaveSurfer 的 shadow DOM 内；等它画出真实峰值再模拟拖动。
  const wave = `document.querySelector('${NODE} [data-canvas-wavesurfer=ready] > div')?.shadowRoot`;
  await ctx.wait(`${wave}?.querySelector('[part="canvases"] canvas')`);
  const point = await ctx.run(`(() => { const r = document.querySelector('${NODE} .hy-audio-wave input').getBoundingClientRect(); return { left: Math.round(r.left + 18), right: Math.round(r.right - 18), y: Math.round(r.top + r.height / 2) }; })()`);
  await ctx.run(`(() => { const player = ${audio}; player.dataset.seekCount = '0'; player.addEventListener('seeking', () => player.dataset.seekCount = String(Number(player.dataset.seekCount) + 1)); })()`);
  for (const end of ['right', 'left', 'right']) await sweepWaveform(ctx, point, end);
  const result = await ctx.run(`(() => { const player = ${audio}; return { time: player.currentTime, seekCount: Number(player.dataset.seekCount), ready: player.readyState, error: player.error?.message }; })()`);
  ctx.smoke.check('Each FLAC drag seeks once and the decoder stays ready', !result.error && result.ready >= 2 && result.time > 3 && result.seekCount === 3, JSON.stringify(result));
}

async function sweepWaveform(ctx, { left, right, y }, finish) {
  const send = (type, x) => ctx.win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  send('mouseMove', right);
  send('mouseDown', right);
  for (const end of [left, right, left, right, ...(finish === 'left' ? [left] : [])]) {
    const start = end === left ? right : left;
    for (let step = 1; step <= 12; step++) {
      send('mouseMove', Math.round(start + (end - start) * step / 12));
      await delay(17);
    }
  }
  send('mouseUp', finish === 'left' ? left : right);
  await delay(180);
}

async function checkAudioCard(ctx, state) {
  await checkFlacSeeking(ctx);
  await generate(ctx, state);
  const initial = await resize.geometry(ctx, NODE);
  ctx.smoke.check('Generated audio defaults to a compact fit card', initial.w===284 && initial.h===184 && await ctx.run(`document.querySelector('${NODE}').dataset.card==='fit'`));
  await ctx.pointer(`${NODE} header>svg`);
  ctx.smoke.check('Audio exposes the shared enabled Fit action', await ctx.run(`document.querySelector('${NODE} .hy-node-actions .hy-chip')?.disabled===false`));
  await checkDrag(ctx);
  await checkControls(ctx);
  await checkFit(ctx);
  await resize.changeTheme(ctx, 'light');
  await ctx.pointer(`${NODE} header>svg`);
  await ctx.shot('audio-card-fit-light');
  await require('./check-attention-audio').checkAttentionAndPlayback(ctx, state);
}

module.exports = { checkAudioCard };
