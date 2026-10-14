/** Regression: theme surfaces, merged sidebar, Enter, persisted geometry-only templates, narrow screens and PNG. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { app } = require('electron');
const { startBrowser, pause } = require('../../backups/comic-2026-10-08-after-noon/workbench-review/electron-driver.cjs');
const { checkBuildFreshness } = require('../../../scripts/lib/build-freshness');
const root = path.resolve(__dirname, '../../../apps/next/out'), checks = [];
let browser, savedTemplate;
const evaluate = expression => browser.evaluate(expression);
function check(name, ok) { assert.ok(ok, name); checks.push(name); console.log('PASS: ' + name); }
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(80); }
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
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
}
async function click(selector) {
  await waitFor("!document.documentElement.classList.contains('theme-ripple')");
  const p = await point(selector);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await pause(130);
}
async function key(key, code, value) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: value });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: value }); await pause(100);
}
async function fill(selector, text) {
  await click(selector);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
  await browser.send('Input.insertText', { text });
}
async function select(selector, value) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await pause(100);
}
async function viewport(width, height = 900) { await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(250); }
async function screenshot(name) {
  const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(__dirname, name + '.png'), Buffer.from(result.data, 'base64'));
}
const fits = `(()=>{const c=document.querySelector('[data-comic-canvas]').getBoundingClientRect(),v=document.querySelector('[data-canvas-viewport]').getBoundingClientRect();return c.width>0&&c.left>=v.left-1&&c.right<=v.right+1&&c.top>=v.top-1&&c.bottom<=v.bottom+1})()`;
const library = `JSON.parse(localStorage.getItem('illusion-realm-user-data')).comicTemplates`;
async function themeRound() {
  console.log('ROUND 1: real theme switch, page and library');
  for (const theme of ['dark', 'light', 'dark']) {
    await click('[data-theme-trigger]'); await click('[data-theme-option=' + theme + ']');
    await waitFor(`matchMedia('(prefers-color-scheme: dark)').matches===${theme === 'dark'}`); await pause(400);
    const bg = theme === 'dark' ? 'rgb(10, 10, 10)' : 'rgb(255, 255, 255)';
    check(theme + ': panels, toolbar, image tools and text inputs follow theme', await evaluate(`['[data-comic-pane=side]','[data-comic-toolbar]','[data-image-tools]','#comic-title'].every(s=>getComputedStyle(document.querySelector(s)).backgroundColor==='${bg}')`));
    check(theme + ': action uses current primary color', await evaluate(`(()=>{const probe=document.createElement('span');probe.style.color='var(--primary)';document.body.append(probe);const c=getComputedStyle(probe).color;probe.remove();return getComputedStyle(document.querySelector('[data-export-comic-png]')).backgroundColor===c})()`));
    check(theme + ': paper remains white and fitted', await evaluate(`getComputedStyle(document.querySelector('[data-comic-canvas]')).backgroundColor==='rgb(255, 255, 255)'&&${fits}`));
    check(theme + ': workspace has reference dot grid and themed base', await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[data-canvas-viewport]'));return s.backgroundImage.includes('radial-gradient')&&s.backgroundColor==='${theme==='dark'?'rgb(28, 28, 28)':'rgb(238, 240, 242)'}'})()`));
    await screenshot('editor-' + theme); await click('[data-open-templates]');
    check(theme + ': library and card surfaces follow theme', await evaluate(`getComputedStyle(document.querySelector('dialog[open]')).backgroundColor==='${bg}'&&getComputedStyle(document.querySelector('[data-template-id=regular-6]')).backgroundColor==='${bg}'`));
    await screenshot('library-' + theme); await key('Escape', 'Escape', 27);
  }
}
async function sidebarRound() {
  console.log('ROUND 2: merged sidebar and polygon Enter');
  check('Left directory removed and central canvas expanded', await evaluate(`!document.querySelector('[data-comic-workspace] > [data-comic-pane=outline]')&&getComputedStyle(document.querySelector('[data-comic-workspace]')).gridTemplateColumns.split(' ').length===2`));
  await click('[data-comic-side-tab=outline]');
  check('Directory is inside right sidebar', await evaluate(`document.querySelector('[data-comic-pane=side] [data-comic-pane=outline]')&&document.querySelectorAll('[data-outline-panel]').length===5`));
  await click('[data-outline-panel=p3]');
  check('Selecting directory panel opens its layout properties', await evaluate(`document.querySelector('[data-comic-side-tab=layout]').getAttribute('aria-selected')==='true'&&document.querySelector('#comic-title').value==='对话特写'`));
  await click('[data-edit-polygon]');
  check('Polygon editing shows vertex handles', await evaluate(`document.querySelectorAll('[aria-label^=vertex-]').length===5`));
  await click('#comic-description'); await key('Enter', 'Enter', 13);
  check('Enter in textarea preserves polygon editing', await evaluate(`document.querySelectorAll('[aria-label^=vertex-]').length===5`));
  await evaluate('document.activeElement.blur()'); await key('Enter', 'Enter', 13);
  check('Enter on canvas completes polygon editing', await evaluate(`document.querySelectorAll('[aria-label^=vertex-]').length===0&&document.querySelector('[data-edit-polygon]').textContent.includes('编辑多边形')`));
  await click('[data-edit-polygon]');
  const p = await point('[aria-label=vertex-1]');
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + 12, y: p.y + 12, button: 'left', buttons: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 12, y: p.y + 12, button: 'left', clickCount: 1 });
  await evaluate('document.activeElement.blur()'); await key('Enter', 'Enter', 13);
  await click('[data-save-comic]');
  check('Enter retains edited polygon coordinates', await evaluate(`JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1')).panels.find(p=>p.id==='p3').vertices[0].x>0`));
  await evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-comic-pane=side] button')];buttons.find(b=>b.textContent==='自定义排版').click()})()`); await pause(100);
}
async function saveRound() {
  console.log('ROUND 3: categorized geometry-only template saving');
  if (await evaluate(`document.querySelector('[data-lock-canvas]').getAttribute('aria-pressed')==='true'`)) await click('[data-lock-canvas]');
  await fill('[data-canvas-dimension=width]', '1129'); await key('Enter', 'Enter', 13);
  await evaluate(`(()=>{const e=document.querySelector('[data-template-background]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'#f8e4c8');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await pause(100);
  check('Color picker changes template paper live', await evaluate(`getComputedStyle(document.querySelector('[data-comic-canvas]')).backgroundColor==='rgb(248, 228, 200)'`));
  await click('[data-save-comic]');
  const draft = await evaluate(`JSON.parse(localStorage.getItem('illusion-realm-comic-template-v1'))`);
  await click('[data-finish-layout]');
  check('Footer opens save dialog and rejects empty name', await evaluate(`document.querySelector('[data-save-template-dialog]').open&&document.querySelector('[data-confirm-save-template]').disabled`));
  await fill('[data-template-name]', '斜切自定义'); await select('[data-save-template-category]', 'new');
  check('New category requires a name', await evaluate(`document.querySelector('[data-confirm-save-template]').disabled`));
  await fill('[data-custom-category]', '我的分镜');
  await evaluate(`(()=>{const original=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(key,value){if(key==='illusion-realm-user-data'&&fail){fail=false;throw Error('Test save failure')}return original.call(this,key,value)}})()`);
  await click('[data-confirm-save-template]');
  check('Failed persistence keeps save dialog open and shows error', await evaluate(`document.querySelector('[data-save-template-dialog]')?.open&&Boolean(document.querySelector('[data-save-template-dialog] [role=alert]'))`));
  check('Failed save preserves original pictures', await evaluate(`!document.querySelector('[data-comic-panel=p1] img').src.startsWith('data:image/svg+xml')`));
  await screenshot('save-custom-template'); await click('[data-confirm-save-template]');
  await waitFor(`!document.querySelector('[data-save-template-dialog]')`);
  const data = await evaluate(library); savedTemplate = data.templates[0];
  check('New library has explicit version and category', data.version === 1 && savedTemplate.category === 'custom:我的分镜' && savedTemplate.name === '斜切自定义');
  check('Template persists custom paper background', savedTemplate.backgroundColor === '#f8e4c8');
  check('Only geometry and canvas dimensions enter template data', savedTemplate.pageSize.width === 1129 && savedTemplate.frames.every(f => Object.keys(f).sort().join(',') === 'height,vertices,width,x,y'));
  const expectedFrames = draft.panels.map(({x,y,width,height,vertices})=>({x,y,width,height,vertices}));
  try { assert.deepEqual(savedTemplate.frames, expectedFrames); } catch (error) { console.error(JSON.stringify({actual:savedTemplate.frames,expected:expectedFrames})); throw error; }
  check('All N-vertex shapes and overlap order preserved', true);
  check('Saved layout replaces default images with pure-color numbered placeholders', await evaluate(`[...document.querySelectorAll('[data-comic-panel] img')].every(e=>e.src.startsWith('data:image/svg+xml')&&decodeURIComponent(e.src).includes('<text'))`));
  check('Finishing layout exits edit mode', await evaluate(`document.querySelector('[data-finish-layout]').disabled&&!document.querySelector('[aria-label=resize-panel]')`));
  await click('[data-open-templates]'); await click('[data-template-category="custom:我的分镜"]');
  check('Custom category filters to saved template with image preview', await evaluate(`document.querySelectorAll('[data-template-id]').length===1&&document.querySelector('[data-template-id] img').src.startsWith('data:image/png')`));
  await screenshot('custom-library-dark'); await click('[data-apply-template]');
  check('Applying template restores its paper color', await evaluate(`document.querySelector('[data-template-background]').value==='#f8e4c8'&&getComputedStyle(document.querySelector('[data-comic-canvas]')).backgroundColor==='rgb(248, 228, 200)'`));
  check('Applying saved template does not reuse default pictures', await evaluate(`[...document.querySelectorAll('[data-comic-panel] img')].every(e=>e.src.startsWith('data:image/svg+xml'))&&document.querySelector('[data-canvas-dimension=width]').value==='1129'`));
  await click('[data-finish-layout]'); await fill('[data-template-name]', '同类第二版');
  await select('[data-save-template-category]', 'custom:我的分镜'); await click('[data-confirm-save-template]');
  await waitFor(`!document.querySelector('[data-save-template-dialog]')`);
  check('Existing custom category can be reused', await evaluate(`${library}.templates.length===2&&${library}.templates.every(t=>t.category==='custom:我的分镜')`));
}
async function reloadRound() {
  console.log('ROUND 4: persistence, placeholder PNG, image tool regression');
  check('No browser errors before reload',(await evaluate('window.testErrors')).length===0);
  await click('[data-save-comic]'); await browser.send('Page.reload');
  await waitFor(`Boolean(document.querySelector('[data-comic-canvas]'))`); await pause(450);
  await click('[data-open-templates]'); await click('[data-template-category="custom:我的分镜"]');
  check('Templates and custom category survive reload', await evaluate(`document.querySelectorAll('[data-template-id]').length===2`));
  check('Custom background survives draft reload', await evaluate(`document.querySelector('[data-template-background]').value==='#f8e4c8'`));
  check('Library thumbnail uses selected template paper color', await evaluate(`(async()=>{const image=document.querySelector('[data-template-id] img'),b=await createImageBitmap(image),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);return [...ctx.getImageData(0,0,1,1).data].join(',')==='248,228,200,255'})()`));
  await key('Escape', 'Escape', 27);
  await evaluate(`(()=>{window.comicExport=null;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='image/png')window.comicExport=blob;return original(blob)};HTMLAnchorElement.prototype.click=function(){}})()`);
  await click('[data-export-comic-png]'); await waitFor('Boolean(window.comicExport)');
  const png = await evaluate(`(async()=>{const b=await createImageBitmap(window.comicExport),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);return {w:b.width,h:b.height,corner:[...ctx.getImageData(0,0,1,1).data],panel:[...ctx.getImageData(100,100,1,1).data]}})()`);
  check('PNG retains saved canvas size, background and pure-color panels', png.w===1129&&png.h===1600&&png.corner.join(',')==='248,228,200,255'&&png.panel.slice(0,3).join(',')==='232,237,239');
  await click('[data-image-action=blur]');
  check('Blur tool opens after sidebar change', await evaluate(`Boolean(document.querySelector('[data-image-blur-panel]'))`));
  await click('[data-image-action=blur]'); await click('[data-image-action=remove]');
  check('Image deletion still works', await evaluate(`!document.querySelector('[data-comic-panel=p1] img')`));
  await click('[data-image-action=restore]');
  const choosers = browser.fileChooserRequests(); await click('[data-image-action=replace]');
  check('Replace still invokes file chooser', browser.fileChooserRequests()===choosers+1);
}
async function narrowRound() {
  console.log('ROUND 5: narrow layout tabs and fixed save footer');
  for (const width of [1100, 390, 320]) {
    await viewport(width, width===320?720:900);
    await click('[data-comic-view=stage]');
    check(width+': canvas fits without page overflow', await evaluate(`document.documentElement.scrollWidth<=innerWidth&&${fits}`));
    await click('[data-comic-view=outline]');
    check(width+': directory opens in same right panel', await evaluate(`document.querySelector('[data-comic-side-tab=outline]').getAttribute('aria-selected')==='true'&&document.querySelector('[data-comic-pane=side] [data-comic-pane=outline]').getBoundingClientRect().width>0`));
    await click('[data-comic-side-tab=layout]');
    check(width+': layout tab and footer stay within screen', await evaluate(`(()=>{const a=document.querySelector('[data-comic-side-tab=layout]'),r=document.querySelector('[data-finish-layout]').getBoundingClientRect();return a.getAttribute('aria-selected')==='true'&&r.width>0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`));
    await screenshot('sidebar-'+width); await click('[data-comic-view=stage]');
  }
}
async function main() {
  const fresh = checkBuildFreshness(); if (!fresh.ok) { console.error(fresh.detail); app.exit(2); return; }
  const server = http.createServer(serve); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    browser=await startBrowser();
    await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.initialLocale='zh-CN';window.electronAPI={setThemeSource:async value=>{window.irSetTheme(value);return {success:true,data:null}}};window.testErrors=[];addEventListener('error',e=>window.testErrors.push(e.message));addEventListener('unhandledrejection',e=>window.testErrors.push(String(e.reason)));`});
    await viewport(1600,1000); await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/comic`});
    await waitFor(`Object.keys(document.querySelector('[data-comic-side-tab=layout]')||{}).some(k=>k.startsWith('__reactProps'))`); await pause(450);
    await themeRound(); await sidebarRound(); await saveRound(); await reloadRound(); await narrowRound();
    check('No browser errors or unhandled rejections',(await evaluate('window.testErrors')).length===0);
    fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({status:'passed',rounds:5,checks},null,2));
  } catch(error) { if(browser)await screenshot('failure').catch(()=>{}); throw error; }
  finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)});
