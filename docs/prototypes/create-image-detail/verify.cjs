/** Verify real gallery clicks, nested previews and independent detail scrolling on fresh static output. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const sharp = require('../../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp');
const { startBrowser, pause } = require(process.argv.includes('--electron') ? './electron-driver.cjs' : '../comic-storyboard/edge-driver.cjs');
const root = path.resolve(__dirname, '../../../apps/next/out');
const fileName = 'IR_2026-10-06_005358_5ada0134_1.png';
const detail = '[data-generated-image-detail]';
const preview = '[data-image-preview-overlay]';
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, ok) { assert.ok(ok, name); console.log('PASS: ' + name); }
async function waitFor(expression) {
  for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await pause(100); }
  throw Error('Timed out: ' + expression);
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function textChunk(keyword, text) {
  const data = Buffer.from(keyword + '\0' + text, 'latin1');
  const body = Buffer.concat([Buffer.from('tEXt'), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
async function fixture() {
  const png = await sharp({ create: { width: 768, height: 1152, channels: 3, background: '#c7b6e9' } }).png().toBuffer();
  const workflow = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'fixture.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'Gallery detail scrolling fixture. '.repeat(240) + 'x'.repeat(800) } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'negative prompt '.repeat(40) } },
    '4': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], seed: 42, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1152, batch_size: 1 } },
  };
  return 'data:image/png;base64,' + Buffer.concat([png.subarray(0, -12), textChunk('prompt', JSON.stringify(workflow)), png.subarray(-12)]).toString('base64');
}
function serve(request, response) {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  // The disposable profile has no read announcements; exclude unrelated onboarding from this test.
  if (relative === '/changelog.md') { response.writeHead(404); response.end(); return; }
  let target = path.resolve(root, '.' + relative);
  if (!target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!path.extname(target)) target += '.html';
  fs.readFile(target, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream'); response.end(data);
  });
}
async function click(selector) {
  await waitFor("!document.documentElement.classList.contains('page-transition')");
  const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  await pause(150);
}
async function escape() {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(150);
}
async function openDetails(width) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await pause(300);
  if (width < 1280) {
    await waitFor("Boolean(document.querySelector('[data-history-pin-option=grid]'))");
    await click('[data-history-pin-option=grid]');
    await waitFor("Boolean(document.querySelector('[data-create-subpage=history]'))");
  }
  const variant = width < 1280 ? 'page' : 'sidebar';
  await click(`[data-history-variant=${variant}] button[aria-label="${fileName}"]`);
  await waitFor(`Boolean(document.querySelector('${detail}'))`);
  await waitFor(`document.querySelector('${detail}').textContent.includes('Gallery detail scrolling fixture.')`);
  await pause(300);
  check(width + ': thumbnail click opens details without full-screen preview', !(await evaluate(`Boolean(document.querySelector('${preview}'))`)));
}
async function layout(width) {
  const geometry = await evaluate(`(()=>{
    const d=document.querySelector('${detail}'),p=d.querySelector('[data-image-detail-preview]'),h=d.querySelector('#generated-image-detail-title'),m=d.querySelector('[data-image-detail-metadata]');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    const before={image:rect(p),header:rect(h)};m.scrollTop=500;
    return {before,after:{image:rect(p),header:rect(h)},scroll:m.scrollTop,overflow:m.scrollWidth>m.clientWidth+1,dialog:rect(d),contained:rect(p).y+rect(p).h<=rect(d).y+rect(d).h+1,fit:getComputedStyle(p.querySelector('img')).objectFit};
  })()`);
  check(width + ': metadata scrolls independently', geometry.scroll > 0);
  check(width + ': image and filename stay fixed', JSON.stringify(geometry.before) === JSON.stringify(geometry.after));
  check(width + ': complete image fits and long prompts wrap', geometry.contained && geometry.fit === 'contain' && !geometry.overflow);
  check(width + ': dialog fits viewport', geometry.dialog.x >= -1 && geometry.dialog.x + geometry.dialog.w <= width + 1);
}
async function nestedPreview(width) {
  await click('[data-image-detail-preview] button');
  await waitFor(`Boolean(document.querySelector('${preview}'))`);
  check(width + ': detail image opens shared preview', await evaluate(`Boolean(document.querySelector('${detail}'))`));
  await click(`${preview} button[aria-label="放大"]`);
  check(width + ': shared preview zoom works', await evaluate(`document.querySelector('${preview}').textContent.includes('120%')`));
  await escape();
  check(width + ': Escape closes preview and retains details', await evaluate(`!document.querySelector('${preview}')&&!!document.querySelector('${detail}')`));
  await escape();
  check(width + ': second Escape closes details', !(await evaluate(`Boolean(document.querySelector('${detail}'))`)));
}
async function batchSelection() {
  await click('[data-history-variant=sidebar] button[aria-label="批量选择"]');
  await click(`[data-history-variant=sidebar] button[aria-label="${fileName}"]`);
  check('Batch selection only selects, without details or preview', await evaluate(`!document.querySelector('${detail}')&&!document.querySelector('${preview}')&&document.querySelector('[data-history-variant=sidebar] button[aria-label="${fileName}"]').getAttribute('aria-pressed')==='true'`));
  await click('[data-history-variant=sidebar] button[aria-label="退出选择"]');
}
async function main() {
  const server = http.createServer(serve); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await startBrowser();
    const src = await fixture();
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.initialLocale='zh-CN';window.electronAPI={selectFolder:async()=>({success:true,data:null}),scanModels:async()=>({success:true,data:[]}),readLocalImage:async()=>({success:true,data:${JSON.stringify(src)}}),getDefaultOutputPath:async()=>({success:true,data:'C:/fixture/output'}),listOutputFolders:async()=>({success:true,data:[]}),listGeneratedImages:async()=>({success:true,data:[{fileName:${JSON.stringify(fileName)},filePath:'C:/fixture/output/image.png',modifiedAt:1}]})};` });
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/create` });
    await waitFor(`Boolean(document.querySelector('[data-history-variant=sidebar] button[aria-label="${fileName}"] img'))`);
    await waitFor(`Object.keys(document.querySelector('[data-history-variant=sidebar] button[aria-label="${fileName}"]')).some(k=>k.startsWith('__reactProps'))`);
    await pause(500);
    for (const width of [1920, 1100, 950, 390]) {
      await openDetails(width); await layout(width);
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(__dirname, `detail-${width}.png`), Buffer.from(shot.data, 'base64'));
      await nestedPreview(width);
      if (width < 1280) { await click('[data-subpage-back]'); await pause(300); }
    }
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
    await pause(300); await batchSelection();
  } catch (error) {
    if (browser) {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(__dirname, 'failure.png'), Buffer.from(shot.data, 'base64'));
    }
    throw error;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().then(() => {
  if (process.argv.includes('--electron')) require('electron').app.exit(0);
}).catch(error => {
  console.error(error); process.exitCode = 1;
  if (process.argv.includes('--electron')) require('electron').app.exit(1);
});
