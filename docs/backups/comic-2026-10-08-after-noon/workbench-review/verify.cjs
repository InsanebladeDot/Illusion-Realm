/** Five regression rounds: native themes, float/dock gestures, editing, narrow layouts and export/persistence. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { checkBuildFreshness } = require('../../../scripts/lib/build-freshness');
const { app } = require('electron');
const { startBrowser, pause } = require('./electron-driver.cjs');
const root = path.resolve(__dirname, '../../../apps/next/out'), checks = [];
let browser;
const evaluate = expression => browser.evaluate(expression);
function check(name, ok) { assert.ok(ok, name); checks.push(name); console.log('PASS: ' + name); }
async function waitFor(expression) {
  for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(75); }
  throw Error('Timed out: ' + expression);
}
function serve(request, response) {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (relative === '/changelog.md') { response.writeHead(404); response.end(); return; }
  let file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  if (!path.extname(file)) file += '.html';
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); response.end(data);
  });
}
async function point(selector) {
  return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
}
async function click(selector, button = 'left', clickCount = 1) {
  await waitFor("!document.documentElement.classList.contains('theme-ripple')");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const p = await point(selector);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button, clickCount });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button, clickCount }); await pause(120);
}
async function drag(selector, target, cancel = false, hold = 420) {
  const from = await point(selector);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', clickCount: 1 });
  if (hold) await pause(hold);
  for (let step = 1; step <= 4; step++) {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (target.x - from.x) * step / 4, y: from.y + (target.y - from.y) * step / 4, button: 'left', buttons: 1 }); await pause(40);
  }
  if (cancel) await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', clickCount: 1 }); await pause(200);
}
async function viewport(width, height = 900) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(300);
}
async function screenshot(name) {
  const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(__dirname, name + '.png'), Buffer.from(result.data, 'base64'));
}
const fits = `(()=>{const c=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return c.width>0&&c.left>=v.left-1&&c.right<=v.right+1&&c.top>=v.top-1&&c.bottom<=v.bottom+1})()`;
async function theme(value) {
  await click('[data-theme-trigger]'); await click('[data-theme-option=' + value + ']');
  await waitFor(`matchMedia('(prefers-color-scheme: dark)').matches===${value === 'dark'}`);
  await pause(400);
}
async function themeRound() {
  console.log('ROUND 1: real global theme and visual surfaces');
  for (const value of ['dark', 'light', 'dark']) {
    await theme(value);
    check(value + ': editor follows native global theme', await evaluate(`(()=>{const bg=getComputedStyle(document.querySelector('[data-comic-window=side]')).backgroundColor;return bg==='${value === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(255, 255, 255)'}'})()`));
    check(value + ': controls and tools use same theme', await evaluate(`(()=>{const a=['[data-comic-window=outline]','[data-image-tools]','#comic-title','[data-comic-toolbar]'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor);return a.every(c=>c==='${value === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(255, 255, 255)'}')})()`));
    check(value + ': dotted workspace and white export paper', await evaluate(`getComputedStyle(document.querySelector('[data-canvas-viewport]')).backgroundImage.includes('radial-gradient')&&getComputedStyle(document.querySelector('[data-comic-canvas]')).backgroundColor==='rgb(255, 255, 255)'`));
    check(value + ': canvas fits available space', await evaluate(fits));
    await screenshot('theme-' + value);
  }
  await click('[data-open-templates]');
  check('Dark template modal uses global surface', await evaluate(`getComputedStyle(document.querySelector('dialog[open]')).backgroundColor==='rgb(10, 10, 10)'`));
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(100);
}
const heading = id => '[data-comic-window=' + id + '] [data-comic-drag-surface]';
async function centralTarget() {
  return evaluate(`(()=>{const r=document.querySelector('[data-comic-workspace]').getBoundingClientRect();return {x:r.left+r.width*.48,y:r.top+r.height*.3}})()`);
}
async function floatPanel(id) { await drag(heading(id), await centralTarget()); }
async function dockTo(id, zone, beside, after = false) {
  const target = await evaluate(`(()=>{const h=document.querySelector('[data-comic-workspace]').getBoundingClientRect(),p=document.querySelector('[data-comic-window=${beside || id}]').getBoundingClientRect();return ${beside ? `{x:p.left+p.width/2,y:p.top+p.height*${after ? '.85' : '.15'}}` : zone === 'bottom' ? '{x:h.left+h.width/2,y:h.bottom-12}' : `{x:h.${zone}${zone === 'left' ? '+12' : '-12'},y:h.top+180}`}})()`);
  await drag(heading(id), target);
}
async function floatRound() {
  console.log('ROUND 2: fixed top areas, long press, arbitrary docking and ordering');
  const fixed = await evaluate(`['[data-comic-header]','[data-comic-toolbar]'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})`);
  check('Only three lower panels can float', await evaluate(`document.querySelectorAll('[data-comic-window]').length===3&&!document.querySelector('[data-comic-window=actions],[data-comic-window=controls],[data-comic-window=zoom]')`));
  check('Docked panels have original headings without grips or window chrome', await evaluate(`!document.querySelector('.comic-window-heading')&&document.querySelector('[data-dock-heading=outline]').textContent.includes('分镜目录')&&document.querySelector('[data-dock-heading=side]').textContent==='排版'`));
  check('Docked image tools do not repeat scene title', await evaluate(`!document.querySelector('[data-image-tools]').textContent.includes('场景建立')`));
  for (const id of ['outline', 'tools', 'side']) {
    await drag(heading(id), await centralTarget(), false, 0);
    check(id + ': short press and movement never detaches', await evaluate(`document.querySelector('[data-comic-window=${id}]').dataset.windowFloating==='false'`));
    await floatPanel(id);
    check(id + ': long press separates panel with floating-only chrome', await evaluate(`document.querySelector('[data-comic-window=${id}]').dataset.windowFloating==='true'&&Boolean(document.querySelector('[data-drag-comic-window=${id}] svg'))`));
    check(id + ': real drag keeps window inside lower workspace', await evaluate(`(()=>{const p=document.querySelector('[data-comic-window=${id}]').getBoundingClientRect(),h=document.querySelector('[data-comic-workspace]').getBoundingClientRect();return p.left>=h.left-1&&p.right<=h.right+1&&p.top>=h.top-1&&p.bottom<=h.bottom+1})()`));
    await click('[data-toggle-comic-window=' + id + ']');
    check(id + ': pin docks without extra window title', await evaluate(`document.querySelector('[data-comic-window=${id}]').dataset.windowFloating==='false'&&!document.querySelector('[data-comic-window=${id}] .comic-window-heading')`));
    check(id + ': canvas still fits', await evaluate(fits));
  }
  await dockTo('outline', 'right', 'side');
  check('Directory can dock on right before layout', await evaluate(`(()=>{const a=document.querySelector('[data-comic-window=outline]'),b=document.querySelector('[data-comic-window=side]');return a.dataset.windowZone==='right'&&a.dataset.windowFloating==='false'&&a.getBoundingClientRect().bottom<=b.getBoundingClientRect().top+1})()`));
  await dockTo('tools', 'right', 'outline');
  check('Image tools can insert before directory in same dock', await evaluate(`(()=>{const a=document.querySelector('[data-comic-window=tools]'),b=document.querySelector('[data-comic-window=outline]');return a.dataset.windowZone==='right'&&a.getBoundingClientRect().bottom<=b.getBoundingClientRect().top+1})()`));
  await dockTo('tools', 'right', 'side', true);
  check('Same-side tool order can change again', await evaluate(`document.querySelector('[data-comic-window=tools]').getBoundingClientRect().top>=document.querySelector('[data-comic-window=side]').getBoundingClientRect().bottom-1`));
  await dockTo('side', 'left');
  check('Layout can move to opposite side', await evaluate(`document.querySelector('[data-comic-window=side]').dataset.windowZone==='left'`));
  await dockTo('outline', 'bottom');
  check('Directory can dock below canvas', await evaluate(`document.querySelector('[data-comic-window=outline]').dataset.windowZone==='bottom'&&document.querySelector('[data-comic-window=outline]').getBoundingClientRect().top>=document.querySelector('[data-comic-pane=stage]').getBoundingClientRect().bottom-1`));
  check('Rearranged canvas stays fitted', await evaluate(fits));
  await screenshot('rearranged-docks');
  check('Top header and size toolbar remain fixed after all moves', JSON.stringify(fixed) === JSON.stringify(await evaluate(`['[data-comic-header]','[data-comic-toolbar]'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})`)));
  await dockTo('side', 'right', 'tools');
  await dockTo('outline', 'left');
  await dockTo('tools', 'left', 'outline', true);
  const before = await evaluate(`document.querySelector('[data-comic-pane=stage]').getBoundingClientRect().width`);
  await floatPanel('outline'); await floatPanel('side'); await floatPanel('tools');
  check('Floating side panels releases reserved canvas space', await evaluate(`document.querySelector('[data-comic-pane=stage]').getBoundingClientRect().width>${before}+400`));
  await screenshot('all-floating');
  for (const id of ['outline','side','tools']) await click('[data-toggle-comic-window=' + id + ']');
}
async function editingRound() {
  console.log('ROUND 3: tools, context menu, custom shape and dimensions');
  await click('[data-tool-dock-menu] summary'); await click('[data-tool-dock=left]');
  check('Image tools dock without overlapping canvas viewport', await evaluate(`document.querySelector('[data-canvas-viewport]').getBoundingClientRect().left>=document.querySelector('[data-image-tools]').getBoundingClientRect().right-1`));
  await click('[data-image-action=blur]');
  check('Blur settings open inside themed tool panel', await evaluate(`Boolean(document.querySelector('[data-image-blur-panel]'))`));
  await click('[data-image-action=blur]');
  await click('[data-image-action=remove]');
  check('Remove image still works', await evaluate(`!document.querySelector('[data-comic-panel=p1] img')`));
  await click('[data-image-action=restore]');
  check('Restore image still works', await evaluate(`Boolean(document.querySelector('[data-comic-panel=p1] img'))`));
  const fileChoosers = browser.fileChooserRequests();
  await click('[data-image-action=replace]');
  check('Replace still opens browser file chooser', browser.fileChooserRequests() === fileChoosers + 1);
  const { root: dom } = await browser.send('DOM.getDocument');
  const { nodeId } = await browser.send('DOM.querySelector', { nodeId: dom.nodeId, selector: '[data-replace-panel-image]' });
  await browser.send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(__dirname, '../../../apps/next/src/assets/cartoon/6.png')] });
  await waitFor(`document.querySelector('[data-comic-panel=p1] img')?.src.startsWith('data:image/png')`);
  check('Replacing an image updates correct panel', await evaluate(`document.querySelector('[data-comic-panel=p1] img').src.startsWith('data:image/png')`));
  await click('[data-comic-panel=p1]', 'right');
  check('Right-click menu follows dark theme', await evaluate(`getComputedStyle(document.querySelector('[data-image-context-menu]')).backgroundColor==='rgb(10, 10, 10)'`));
  await click('[data-image-tools-menu]'); await click('[data-image-tools-submenu] button:first-child');
  check('Context-menu blur opens actual tool controls', await evaluate(`Boolean(document.querySelector('[data-image-blur-panel]'))`));
  await click('[data-image-action=blur]');
  await click('[data-comic-pane=side] button:nth-child(2)');
  check('Custom layout keeps controls enabled', await evaluate(`Boolean(document.querySelector('[aria-label=resize-panel]'))`));
  if (await evaluate(`document.querySelector('[data-lock-canvas]').getAttribute('aria-pressed')==='true'`)) await click('[data-lock-canvas]');
  check('Unlock allows width and height editing', await evaluate(`![...document.querySelectorAll('[data-canvas-dimension]')].some(e=>e.disabled)`));
  await click('[data-lock-canvas]');
  check('Lock disables editing', await evaluate(`[...document.querySelectorAll('[data-canvas-dimension]')].every(e=>e.disabled)`));
  await click('[data-comic-pane=side] [class="grid grid-cols-2 gap-2"] button:first-child');
  check('Polygon edit handles remain visible', await evaluate(`document.querySelectorAll('[aria-label^=vertex-]').length>=4`));
  await click('[data-comic-pane=side] [class="grid grid-cols-2 gap-2"] button:first-child');
}
async function narrowRound() {
  console.log('ROUND 4: narrow widths and live resizing');
  for (const width of [1100, 950, 390, 320]) {
    await viewport(width, width === 320 ? 720 : 900);
    check(width + ': no page horizontal overflow', await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
    check(width + ': central canvas always remains visible and fitted', await evaluate(fits));
    check(width + ': pin rail stays outside central canvas', await evaluate(`document.querySelector('[data-comic-canvas]').getBoundingClientRect().right<=document.querySelector('[data-comic-view-pin]').getBoundingClientRect().left+1`));
    for (const id of ['side', 'outline']) {
      await click('[data-comic-view=' + id + ']');
      check(width + ': ' + id + ' opens beside central canvas', await evaluate(`(()=>{const r=document.querySelector('[data-comic-window=${id}]').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&document.querySelector('[data-comic-canvas]').getBoundingClientRect().width>0})()`));
      check(width + ': ' + id + ' drawer starts at canvas row', await evaluate(`Math.abs(document.querySelector('[data-comic-window=${id}]').getBoundingClientRect().top-document.querySelector('[data-comic-pane=stage]').getBoundingClientRect().top)<1`));
      await floatPanel(id);
      check(width + ': ' + id + ' long press actually floats drawer', await evaluate(`document.querySelector('[data-comic-window=${id}]').dataset.windowFloating==='true'`));
      check(width + ': floating ' + id + ' stays within viewport', await evaluate(`(()=>{const r=document.querySelector('[data-comic-window=${id}]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`));
      await click('[data-toggle-comic-window=' + id + ']');
      check(width + ': ' + id + ' pin remains clickable next to view rail', await evaluate(`document.querySelector('[data-comic-window=${id}]').dataset.windowFloating==='false'`));
    }
    await click('[data-comic-view=stage]');
    check(width + ': canvas view clears side drawers', await evaluate(`document.querySelector('[data-comic-window=side]').getBoundingClientRect().width===0&&document.querySelector('[data-comic-window=outline]').getBoundingClientRect().width===0`));
    await screenshot('narrow-' + width);
  }
  await viewport(1600, 1000);
}
async function gestureRound() {
  console.log('ROUND 6: touch cancellation and shrinking floating windows');
  const before = await evaluate(`localStorage.getItem('ir-comic-workbench-v2')`);
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const from = await point(heading('outline'));
  await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  await pause(420);
  await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + 240, y: from.y + 100, id: 1 }] }); await pause(150);
  check('Touch dragging separates docked window', await evaluate(`document.querySelector('[data-comic-window=outline]').dataset.windowFloating==='true'`));
  await browser.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await pause(150);
  check('Cancelled touch restores previous layout', before === await evaluate(`localStorage.getItem('ir-comic-workbench-v2')`));
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await floatPanel('side');
  for (const width of [390, 320]) {
    await viewport(width, 720);
    check(width + ': existing floating window is clamped after resize', await evaluate(`(()=>{const r=document.querySelector('[data-comic-window=side]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));
  }
  await viewport(1600, 1000); await click('[data-toggle-comic-window=side]');
}
async function persistenceRound() {
  console.log('ROUND 5: persistence and clean full-resolution export');
  await click('[data-save-comic]');
  const draft = await evaluate(`JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))`);
  await floatPanel('side');
  await browser.send('Page.reload');
  await waitFor(`document.querySelector('[data-comic-window=side]')?.dataset.windowFloating==='true'`);
  check('Floating window preference survives reload', await evaluate(`document.querySelector('[data-comic-window=side]').dataset.windowFloating==='true'`));
  await click('[data-toggle-comic-window=side]'); await click('[data-save-comic]');
  check('Window operations preserve panel content and dimensions', JSON.stringify(draft.panels) === JSON.stringify(await evaluate(`JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1')).panels`)));
  await evaluate(`(()=>{window.comicExport=null;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='image/png')window.comicExport=blob;return original(blob)};HTMLAnchorElement.prototype.click=function(){}})()`);
  await click('[data-export-comic-png]'); await waitFor('Boolean(window.comicExport)');
  const exported = await evaluate(`(async()=>{const bitmap=await createImageBitmap(window.comicExport),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,corner:[...ctx.getImageData(0,0,1,1).data]}})()`);
  check('Export retains document dimensions', exported.width === draft.pageSize.width && exported.height === draft.pageSize.height);
  check('Export paper stays white without dot grid or UI overlays', exported.corner.join(',') === '255,255,255,255');
}
async function main() {
  const freshness = checkBuildFreshness();
  if (!freshness.ok) { console.error('Build is stale: ' + freshness.detail); app.exit(2); return; }
  const server = http.createServer(serve); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await startBrowser();
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.initialLocale='zh-CN';window.electronAPI={selectFolder:async()=>({success:true,data:null}),scanModels:async()=>({success:true,data:[]}),readLocalImage:async()=>({success:true,data:null}),readChangelog:async()=>({success:true,data:null}),setThemeSource:async value=>{window.irSetTheme(value);return {success:true,data:null}}};window.testErrors=[];addEventListener('error',e=>window.testErrors.push(e.message));addEventListener('unhandledrejection',e=>window.testErrors.push(String(e.reason)));` });
    await viewport(1600, 1000);
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/comic` });
    await waitFor(`Object.keys(document.querySelector('[data-comic-window=side]')||{}).some(k=>k.startsWith('__reactProps'))`);
    await pause(300);
    await themeRound(); await floatRound(); await editingRound(); await narrowRound(); await gestureRound(); await persistenceRound();
    check('No browser errors or rejected promises', (await evaluate('window.testErrors')).length === 0);
    fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify({ status: 'passed', rounds: 6, checks }, null, 2));
  } catch (error) { if (browser) await screenshot('failure').catch(() => {}); throw error; }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
