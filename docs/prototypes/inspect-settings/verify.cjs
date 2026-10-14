/** Exercise actual PNG uploads, metadata views/dialogs, setup help and existing language switching. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const zlib = require('node:zlib'), vm = require('node:vm');
const { app } = require('electron');
const { startBrowser, pause } = require('../../backups/comic-2026-10-08-after-noon/workbench-review/electron-driver.cjs');
const { checkBuildFreshness } = require('../../../scripts/lib/build-freshness');
const root = path.resolve(__dirname, '../../../apps/next/out'), checks = [];
let browser;
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
    response.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' }[path.extname(file)] || 'application/octet-stream'); response.end(data);
  });
}
async function click(selector) {
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))&&!document.documentElement.classList.contains('theme-ripple')`);
  const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await pause(120);
}
async function escape() {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(100);
}
async function screenshot(name) {
  const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(__dirname, name + '.png'), Buffer.from(result.data, 'base64'));
}
function chunk(name, data) {
  const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length);
  let value = ~0;
  for (const byte of Buffer.concat([type, data])) { value ^= byte; for (let k = 0; k < 8; k++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); }
  crc.writeUInt32BE(~value >>> 0); return Buffer.concat([size, type, data, crc]);
}
function png(fields) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8;
  const texts = fields.map(([key, text]) => chunk('tEXt', Buffer.from(key + '\0' + text, 'utf8')));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), ...texts, chunk('IDAT', zlib.deflateSync(Buffer.from([0,128]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
async function upload(fields) {
  const base64 = png(fields);
  await evaluate(`(()=>{const data=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([data],'metadata.png',{type:'image/png'}));const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await waitFor(`Boolean(document.querySelector('[data-meta-field="app:fileName"]'))`); await pause(100);
}
const selector = key => '[data-meta-field="' + key + '"]';
const readContent = key => evaluate(`document.querySelector(${JSON.stringify(selector(key))}+' [data-meta-content]').textContent`);
const data = { '1': { inputs: { text: 'scene\nsecond line', seed: 123, enabled: true }, class_type: 'CLIPTextEncode' }, '2': { inputs: { width: 832 }, class_type: 'EmptyLatentImage' } };
const raw = JSON.stringify(data), pretty = JSON.stringify(data, null, 2);
async function metadataRound() {
  await upload([['parameters', raw]]);
  for (const key of ['app:prompt', 'app:rawParameters']) {
    check(key + ': original text is exact', await readContent(key) === raw);
    await click(selector(key) + ' [data-meta-view=json]');
    check(key + ': formatted JSON has two-space nesting', await readContent(key) === pretty);
    await click(selector(key) + ' [data-meta-copy]');
    check(key + ': copies current formatted view', await evaluate('window.lastCopied') === pretty);
    await click(selector(key) + ' [data-meta-expand]');
    check(key + ': dialog uses current mode and full content', await evaluate(`document.querySelector('[data-meta-dialog] [data-meta-content]').textContent`) === pretty);
    await click('[data-meta-dialog] [data-meta-view=raw]'); await click('[data-meta-dialog] [data-meta-copy]');
    check(key + ': dialog switches and copies original', await evaluate('window.lastCopied') === raw);
    await escape(); check(key + ': Escape restores focus and syncs card', await evaluate(`!document.querySelector('[data-meta-dialog]')&&document.activeElement.matches('[data-meta-expand]')`) && await readContent(key) === raw);
  }
  await upload([['prompt', raw], ['workflow', JSON.stringify({ nodes: [] })]]);
  await click(selector('prompt') + ' [data-meta-view=json]');
  check('ComfyUI prompt supports formatting', await readContent('prompt') === pretty);
  await click(selector('prompt') + ' [data-meta-expand]'); await screenshot('metadata-json'); await escape();
  await upload([['parameters', 'a scene, rich details\nNegative prompt: low quality\nSteps: 20, Seed: 123']]);
  check('Plain prompt preserves text and disables JSON with explanation', await evaluate(`document.querySelector('[data-meta-field="app:prompt"] [data-meta-view=json]').disabled&&document.querySelector('[data-meta-field="app:prompt"] [data-meta-view=json]').title.length>0`));
  await click(selector('app:prompt') + ' [data-meta-expand]');
  check('Plain prompt can still expand with its original newline', await evaluate(`document.querySelector('[data-meta-dialog] [data-meta-content]').textContent`) === 'a scene, rich details\n'); await escape();
  await upload([['parameters', raw]]);
  await click('[data-language-trigger]'); await click('[data-language-option=en]');
  check('Existing locale switch translates metadata controls', await evaluate(`document.querySelector('[data-meta-view=json]').textContent.trim()==='Formatted JSON'`));
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await pause(150);
  await click(selector('app:rawParameters') + ' [data-meta-expand]'); await click('[data-meta-dialog] [data-meta-view=json]');
  check('Narrow JSON dialog contains horizontal scrolling and remains in viewport', await evaluate(`(()=>{const d=document.querySelector('[data-meta-dialog]'),r=d.getBoundingClientRect(),c=d.querySelector('[data-meta-content]');return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&c.scrollWidth>=c.clientWidth&&document.documentElement.scrollWidth<=innerWidth})()`));
  await screenshot('metadata-390'); await escape();
}
async function settingsRound(url) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: url + '/settings' }); await waitFor(`Boolean(document.querySelector('[data-agent-setup-guide]'))`); await pause(250);
  for (const locale of ['zh-CN', 'en']) {
    await click('[data-language-trigger]'); await click('[data-language-option=' + locale + ']');
    check(locale + ': official website link uses safe new-window anchor', await evaluate(`(()=>{const a=document.querySelector('[data-agent-provider-link]');return a.href==='https://siliconflow.cn/'&&a.target==='_blank'&&a.rel.includes('noopener')})()`));
    check(locale + ': hover guide contains all four translated steps', await evaluate(`document.querySelector('[data-agent-setup-guide]').title.split('\\n').length===4`));
    await click('[data-agent-setup-guide]');
    check(locale + ': reuses document dialog with four setup steps', await evaluate(`document.querySelector('[aria-labelledby=agent-setup-guide-title] ol').children.length===4&&document.querySelector('[aria-labelledby=agent-setup-guide-title] a').href==='https://siliconflow.cn/'`));
    if (locale === 'en') check('English registration guide contains translated content', await evaluate(`document.querySelector('[aria-labelledby=agent-setup-guide-title]').textContent.includes('Open API Keys in the console')`));
    await screenshot('setup-' + locale); await escape();
    check(locale + ': guide closes with Escape and restores trigger focus', await evaluate(`!document.querySelector('[aria-labelledby=agent-setup-guide-title]')&&document.activeElement.matches('[data-agent-setup-guide]')`));
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true }); await pause(200);
  await click('[data-agent-setup-guide]');
  check('320px setup guide has no horizontal overflow', await evaluate(`(()=>{const r=document.querySelector('[aria-labelledby=agent-setup-guide-title]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()`));
  await screenshot('setup-320'); await escape();
}
function externalLinksRound() {
  let handler; const opened = [];
  const electron = { app: { isPackaged: true, whenReady: () => ({ then: () => {} }), on: () => {} }, BrowserWindow: class {}, shell: { openExternal: async url => opened.push(url) } };
  const context = { require: name => name === 'electron' ? electron : name === 'path' ? path : { loadWorkspaceEnv: () => {}, registerAppProtocol: () => {} }, process: { env: {}, platform: 'win32' }, __dirname: path.resolve(__dirname, '../../../apps/electron'), console };
  vm.runInNewContext(fs.readFileSync(path.join(context.__dirname, 'main.js'), 'utf8'), context);
  context.registerExternalLinks({ webContents: { setWindowOpenHandler: callback => { handler = callback; } } });
  assert.equal(handler({ url: 'https://siliconflow.cn/' }).action, 'deny');
  for (const url of ['javascript:alert(1)', 'file:///private', 'app://app/settings']) assert.equal(handler({ url }).action, 'deny');
  check('Main process opens only HTTP(S) in system browser and denies child windows', opened.length === 1 && opened[0] === 'https://siliconflow.cn/');
}
async function main() {
  const fresh = checkBuildFreshness(); if (!fresh.ok) { console.error(fresh.detail); app.exit(2); return; }
  externalLinksRound();
  const server = http.createServer(serve); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await startBrowser();
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.initialLocale='zh-CN';window.testErrors=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.lastCopied=text}}});addEventListener('error',e=>window.testErrors.push(e.message));addEventListener('unhandledrejection',e=>window.testErrors.push(String(e.reason)));` });
    const url = 'http://127.0.0.1:' + server.address().port;
    await browser.send('Page.navigate', { url: url + '/inspect' }); await waitFor(`Boolean(document.querySelector('input[type=file]'))`); await pause(300);
    await metadataRound(); check('Metadata interactions have no browser errors', (await evaluate('window.testErrors')).length === 0);
    await settingsRound(url); check('Settings interactions have no browser errors', (await evaluate('window.testErrors')).length === 0);
    fs.writeFileSync(path.join(__dirname, 'verification.json'), JSON.stringify({ status: 'passed', checks }, null, 2));
  } catch (error) { if (browser) await screenshot('failure').catch(() => {}); throw error; }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
