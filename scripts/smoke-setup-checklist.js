/** 用正式页面截图并验证清单；网络与设置为隔离夹具，不下载权重、不读写用户配置。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, protocol } = require('electron');
const { IPC_CHANNELS: C } = require('../apps/electron/src/common/ipc-channels');
const { registerHandle } = require('../apps/electron/src/main/ipc/result');
const chrome = require('../apps/electron/src/main/core/windows/window-chrome');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'setup-checklist', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-setup-checklist-'));
const capture = process.argv.includes('--capture-guides');
const automatic = process.argv.includes('--automatic');
const present = process.argv.includes('--present');
const readiness = process.argv.includes('--readiness');
const catalog = require('../packages/shared/src/data/setup-downloads.json');
const fileCount = catalog.files.length;
const settings = { paths: { searchPath: automatic ? '' : 'D:\\ComfyUI\\models' }, theme: 'light', locale: 'zh-CN' };
if (readiness) settings.paths.searchPath = '';
let folderSelections = 0;
const receivedPrompts = [];
let savedCreateForm;
let generationError;
const setGenerationError = error => { generationError = error; };
const editTemplate = require('../apps/next/src/data/comfy/utillswWorkflower/Minimax_h3_image/image_p_h3_image_edit.json');
let uploadCount = 0;
const errors = [], requests = [];
let win;
app.disableHardwareAcceleration();
app.setPath('userData', path.join(root, 'browser'));
smoke.setWorkDir(root); smoke.installWatchdog(app);
require('../apps/electron/src/main/core/protocol').registerAppProtocol();
require('../apps/electron/src/main/core/windows/window.handlers').registerThemeHandlers();
require('../apps/electron/src/main/core/windows/window.handlers').registerWindowHandlers();
registerHandle(C.USER_DATA_READ, () => ({ data: require('./lib/guest-session-fixture').withGuestSession({ settings, ...(savedCreateForm ? { createForm: savedCreateForm } : {}) }), filePath: '', isNew: false }));
registerHandle(C.USER_DATA_WRITE, (_event, data) => {
  if ((automatic || readiness) && data?.settings) Object.assign(settings, data.settings);
  // 使用 JSON 往返模拟应用重启后的文档读取，避免从旧浏览器内存复用表单。
  if (readiness && data?.createForm) savedCreateForm = JSON.parse(JSON.stringify(data.createForm));
});
registerHandle(C.USER_DATA_GET_DEFAULT_PATH, () => '');
registerHandle(C.PATHS_GET_DEFAULT_OUTPUT, () => path.join(root, 'output'));
registerHandle(C.ACCOUNT_ME, () => ({ status: 401, body: { success: false, code: 'UNAUTHENTICATED' } }));
// 自动模式走正式IPC和队列，目录选择仅替换原生对话框返回值，不写用户设置。
if (automatic) {
  process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, 'secrets');
  require('../apps/electron/src/main/storage/user-data').readUserData = () => ({ data: { settings } });
  require('../apps/electron/src/main/modules/models/downloads/model-download.handlers').registerModelDownloadHandlers();
} else {
  registerHandle(C.MODELS_DOWNLOAD_LIST, () => []);
  registerHandle(C.MODELS_CHECK_SETUP, (_event, ids) => ({ items: ids.map(id => ({ id, status: "missing" })) }));
  registerHandle(C.MODELS_DOWNLOAD_TARGET, () => ({ rootPath: 'D:\\ComfyUI\\models\\diffusion_models\\Anima', categories: ['anima_aestheticV11'] }));
}
if (automatic || readiness) registerHandle(C.DIALOG_SELECT_FOLDER, () => { folderSelections += 1; return path.join(root, 'models'); });
registerHandle(C.MODELS_SCAN, () => []);
registerHandle(C.COMFY_LIST_MODELS, () => readiness ? {
  checkpoints: [], diffusionModels: [editTemplate['1'].inputs.unet_name],
  clips: [editTemplate['2'].inputs.clip_name], vaes: [editTemplate['3'].inputs.vae_name],
  loras: [editTemplate['19'].inputs.lora_name],
} : { checkpoints: [], loras: [] });
if (readiness) {
  const fixturePng = fs.readFileSync(path.resolve('scripts/fixtures/video-composition/image.png')).toString('base64');
  // 保存结果故意留空，验证出图认证不会被后续保存失败抹掉。
  registerHandle(C.FILES_SAVE_GENERATED_IMAGES, () => []);
  registerHandle(C.COMFY_UPLOAD_IMAGE, () => ({ name: `edit-${++uploadCount}.png`, subfolder: "fixture", type: "input" }));
  // 捕获真实工作流，使用固定 PNG 或错误码代替推理；这里验证渲染层对结果的处理。
  registerHandle(C.COMFY_GENERATE, (_event, prompt) => {
    receivedPrompts.push(prompt);
    if (generationError) throw Object.assign(new Error('fixture generation failed'), { code: generationError });
    const dataUrl = `data:image/png;base64,${fixturePng}`;
    return { promptId: 'test-model-paths', videos: [], images: [
      { nodeId: 'output', filename: 'result.png', subfolder: '', folderType: 'output', kind: 'images', dataUrl },
    ] };
  });
}
if (process.argv.includes('--navigation') || readiness) {
  registerHandle(C.FILES_LIST_GENERATED_IMAGES, () => []);
  registerHandle(C.FILES_LIST_OUTPUT_FOLDERS, () => []);
}
registerHandle(C.CHANGELOG_READ, () => '');
registerHandle(C.AGENT_CATALOG, (_event, provider) => ({ provider, models: [], source: 'snapshot', updatedAt: '', recommended: '', error: '' }));
for (const channel of [C.AGENT_SECRET_STATUS, C.PROMPT_SECRET_STATUS, C.CIVITAI_KEY_STATUS, C.EUZHI_IMAGE_SECRET_STATUS]) {
  if (channel) registerHandle(channel, () => ({ configured: false, source: 'none', protection: '', tail: '' }));
}

// 只提供下载页面所需的名称和版本；任何权重下载请求都拒绝，截图不能冒充安装成功。
function fixtureApi(request) {
  requests.push(request.url);
  if (!request.url.includes('/api/v1/models')) return new Response('', { status: 403 });
  const model = { id: 1, name: 'anima_aestheticV11', type: 'Checkpoint', baseModels: ['Anima'], creator: { username: 'Guide example' }, modelVersions: [{ id: 1, name: 'v1.1', baseModel: 'Anima', files: [{ id: 1, name: 'anima_aestheticV11.safetensors', primary: true, sizeKB: 1, metadata: { format: 'SafeTensor' }, downloadUrl: 'https://civitai.red/api/download/models/1' }], images: [] }] };
  return new Response(JSON.stringify({ items: [model] }), { headers: { 'Content-Type': 'application/json' } });
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = async source => {
  try { return await win.webContents.executeJavaScript(source, true); }
  catch (error) { console.error('CHECKLIST_FAILED_EXPRESSION', source); throw error; }
};
async function wait(source) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await run(`Boolean(${source})`)) return;
    await delay(80);
  }
  throw new Error('Checklist condition timed out: ' + source);
}
async function click(selector) {
  await wait(`document.querySelector(${JSON.stringify(selector)})`);
  await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));e.click()})()`);
  await delay(100);
}
async function load(route) {
  await win.loadURL('app://app' + route);
  await wait("document.querySelector('[data-window-titlebar]')");
  await wait("document.querySelector('[aria-labelledby=update-announcement-title]')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button').click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
  await delay(350);
}
async function shot(name) {
  await delay(180);
  fs.writeFileSync(path.join(root, name + '.png'), (await win.webContents.capturePage()).toPNG());
}

/** 权重只写几个字节；实际扫描按工作流名字核对，不能当作模型内容已验证。 */
function installModels() {
  const directory = path.resolve('apps/next/src/data/comfy');
  const files = [
    'imageWorkflower/Anima/标准anima生成流.json',
    'videoWorkflower/minnimax/minimax h3 图生视频-首尾帧.json',
    'audioWorkflower/MiniMax_Audio/Audio_Minimax.json',
    'utillswWorkflower/Minimax_h3_image/image_p_h3_image_edit.json',
  ];
  const names = files.flatMap(file => Object.values(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))))
    .flatMap(node => Object.entries(node.inputs).filter(([key]) => /^(unet_name|clip_name|vae_name|lora_name|ckpt_name)$/.test(key)).map(([, value]) => value));
  require('./lib/canvas-task-fixture').installModels(root, { settings }, { names });
}

/** 用真实鼠标和键盘切换侧栏；开关位于前进按钮和面包屑之间，不再保留侧栏品牌行。 */
async function checkSidebarHeader() {
  for (const width of [821, 900, 1240]) {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: false });
    smoke.check('Header places the only sidebar toggle after forward and before breadcrumbs', await run("(()=>{const h=document.querySelector('[data-window-titlebar]'),b=h.querySelector('[data-sidebar-toggle]'),f=h.querySelector('[data-window-history=forward]').getBoundingClientRect(),r=b.getBoundingClientRect(),c=h.querySelector('[data-window-titlebar-content]').getBoundingClientRect();return document.querySelectorAll('[data-sidebar-toggle]').length===1&&!document.querySelector('[data-sidebar-header],[data-sidebar-brand]')&&f.right<=r.left&&r.right<=c.left&&r.height===28&&getComputedStyle(h).getPropertyValue('-webkit-app-region')==='drag'})()"));
    if (width === 1240) await shot('sidebar-expanded-light');
    const point = await run("(()=>{const r=document.querySelector('[data-sidebar-toggle]').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await delay(400);
    smoke.check('Header toggle collapses navigation with matching main inset', await run("(()=>{const b=document.querySelector('[data-window-titlebar] [data-sidebar-toggle]');return !document.querySelector('[data-sidebar-brand]')&&b.getAttribute('aria-expanded')==='false'&&document.querySelector('[data-app-nav]').getBoundingClientRect().width===68&&getComputedStyle(document.querySelector('[data-app-content-layout]')).paddingLeft==='68px'&&getComputedStyle(b).getPropertyValue('-webkit-app-region')==='no-drag'})()"));
    if (width === 1240) await shot('sidebar-collapsed-light');
    await run("document.querySelector('[data-sidebar-toggle]').focus()");
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await delay(400);
    smoke.check('Keyboard restores original shared expanded width without a sidebar brand', await run("!document.querySelector('[data-sidebar-brand]')&&document.querySelector('[data-sidebar-toggle]').getAttribute('aria-expanded')==='true'&&document.querySelector('[data-app-nav]').getBoundingClientRect().width===158.75"));
  }
}

async function captureGuides() {
  await load('/settings');
  await click('[data-settings-category=models]');
  await run("(()=>{const h=[...document.querySelectorAll('h2')].find(e=>e.textContent==='路径配置');h.scrollIntoView({block:'start'});let e=h.parentElement;while(e&&!(e.scrollHeight>e.clientHeight&&/auto|scroll/.test(getComputedStyle(e).overflowY)))e=e.parentElement;if(e)e.scrollTop-=120})()");
  await shot('settings');
  await load('/tools/models/civitai');
  await wait("document.querySelector('[data-civitai-card]')");
  await click('[data-civitai-type=Checkpoint]');
  await click('[data-civitai-base=Anima]');
  await wait("document.querySelector('[data-civitai-base=Anima]').getAttribute('aria-pressed')==='true'");
  await shot('library');
  await click('[data-civitai-card]');
  await click('[data-civitai-download]');
  await wait("document.querySelector('[data-model-download-start]')?.disabled===false");
  await shot('download');
  smoke.check('Guide screenshots use the actual settings and download form', true);
}

/** 页面提交正式安装请求；三个本地等待连接占槽，保证不会访问或下载真实模型。 */
async function checkAutomatic() {
  const http = require('node:http');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': 1024 * 1024 });
    response.write(Buffer.alloc(1024, 42));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(path.join(root, 'models'));
  const base = '../apps/electron/src/main/modules/models/downloads/';
  const manager = require(base + 'model-download-manager');
  const session = require(base + 'model-download-network').getDownloadSession();
  session.protocol.handle('https', request => globalThis.fetch(`http://127.0.0.1:${server.address().port}/hold`, { signal: request.signal }));
  try {
    await load('/tools'); await checkSidebarHeader(); await click('[data-window-checklist]'); await click('[data-setup-mode=automatic]');
    smoke.check('Automatic downloads require models selection', await run("document.querySelector('[data-setup-download-all]').disabled&&document.querySelectorAll('[data-setup-download-group]:disabled').length===1"));
    await click('[data-setup-select-models]');
    await click('[data-setup-detail] details > summary');
    await wait("!document.querySelector('[data-setup-download-all]').disabled");
    smoke.check('Native folder selection is saved before downloads', folderSelections === 1 && settings.paths.searchPath === path.join(root, 'models'));
    const request = { modelType: 'LORA', baseModel: 'SDXL', modelName: 'UI fixture', fileName: 'a.pt', category: '', sha256: '', previewUrl: '', downloadUrl: 'https://civitai.red/api/download/models/1' };
    for (let i = 0; i < 3; i++) manager.startDownload(win.webContents, { ...request, fileName: i + '.pt' });
    if (present) await checkPresentFile(manager);
    else await checkAutomaticQueue(manager);
  } finally {
    await manager.suspendDownloads(); session.protocol.unhandle('https');
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}

/** 同名文件先放错目录，再放进指定位置并替换内容，校验过程应始终不创建任务。 */
async function checkVerification(manager, file, bytes) {
  const before = manager.listDownloads(win.webContents.id).length;
  const misplaced = path.join(root, 'models', path.basename(file));
  fs.writeFileSync(misplaced, bytes);
  await click('[data-setup-verify-all]');
  await wait("document.querySelector('[data-setup-download-file=anima-vae]:enabled')");
  smoke.check('A good hash in the wrong folder stays missing', await run("document.querySelector('[data-setup-file=anima-vae] [data-setup-file-status=missing]')!==null"));
  fs.renameSync(misplaced, file);
  await run("window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('[data-setup-verify-file=anima-vae]:enabled')");
  await click('[data-setup-verify-file=anima-vae]');
  await wait("document.querySelector('[data-setup-file=anima-vae] [data-setup-ready]')");
  smoke.check('Single verification marks the expected-path model ready', await run("document.querySelector('[data-setup-group-summary]').textContent.includes('1/3')"));
  // 先看到旧结果退回待校验，再证明全量校验会识别同名且内容错误的文件。
  fs.writeFileSync(file, Buffer.from('wrong model file'));
  await run("window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('[data-setup-verify-file=anima-vae]:enabled')");
  await click('[data-setup-verify-all]');
  await wait("document.querySelector('[data-setup-file=anima-vae] [data-setup-file-status=mismatch]')");
  smoke.check('Bulk verification reports a hash mismatch without downloading or overwriting', manager.listDownloads(win.webContents.id).length === before && fs.readFileSync(file, 'utf8') === 'wrong model file' && await run("document.querySelector('[data-setup-download-file=anima-vae]:enabled')!==null"));
  await shot('verify-mismatch');
  fs.writeFileSync(file, bytes);
}

/** 用小文件走真实哈希核对；只替换本测试进程的摘要，不下载权重或修改正式清单。 */
async function checkPresentFile(manager) {
  const asset = require('../apps/electron/src/main/modules/models/downloads/setup-download-catalog').setupAsset('anima-vae');
  const original = asset.sha256, bytes = Buffer.from('isolated existing VAE fixture');
  const file = path.join(root, 'models', asset.relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  asset.sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  try {
    await checkVerification(manager, file, bytes);
    await click('[data-setup-download-group=anima]');
    await wait("document.querySelector('[data-setup-file=anima-vae] [data-setup-download-result=present]')&&!document.querySelector('[data-setup-download-all]').disabled");
    await wait("document.querySelector('[data-setup-file=anima-vae] [data-setup-ready]')");
    smoke.check('Existing VAE skips only after real SHA256; group adds model and text tasks', manager.listDownloads(win.webContents.id).length === 5 && await run("document.querySelector('[data-setup-file=anima-vae]').textContent.includes('SHA256 校验通过')&&document.querySelector('[data-setup-download-summary]').textContent.includes('本次核对 3 项：新入队 2，沿用任务 0，已存在 1，失败 0')"));
    await click('[data-setup-download-all]');
    await wait(`document.querySelector('[data-setup-download-summary]')?.textContent.includes('本次核对 ${fileCount} 项')&&!document.querySelector('[data-setup-download-all]').disabled`);
    smoke.check('All checks distinct files and retains verified VAE', manager.listDownloads(win.webContents.id).length === fileCount + 2 && await run(`document.querySelector('[data-setup-download-summary]').textContent.includes('本次核对 ${fileCount} 项：新入队 ${fileCount - 3}，沿用任务 2，已存在 1，失败 0')`));
    smoke.check('Both queued files reuse the download center status', await run("['anima-model','anima-text'].every(id=>document.querySelector('[data-setup-file='+id+']').textContent.includes('等待下载'))"));
    await shot('automatic-existing-summary');
    await run("document.querySelector('[data-setup-file=anima-vae]').scrollIntoView({block:'center'})");
    await shot('automatic-existing-vae');
    await click('[data-setup-download-group=anima]');
    await wait("document.querySelector('[data-setup-file=anima-model] [data-setup-download-result=existing]')&&!document.querySelector('[data-setup-download-all]').disabled");
    smoke.check('Checking another group retains verified VAE status', await run("!!document.querySelector('[data-setup-file=anima-vae] [data-setup-download-result=present]')"));
    smoke.check('Verified existing bytes remain unchanged', fs.readFileSync(file).equals(bytes));
  } finally { asset.sha256 = original; }
}

/** 分组和全部下载必须共用任务ID；关闭清单后，下载中心继续展示并允许暂停。 */
async function checkAutomaticQueue(manager) {
  await click('[data-setup-download-group=anima]');
  await wait("document.querySelectorAll('[data-setup-download-result]').length===3&&!document.querySelector('[data-setup-download-all]').disabled");
  await click('[data-setup-download-all]');
  await wait(`document.querySelector('[data-setup-download-summary]')?.textContent.includes('本次核对 ${fileCount} 项')&&!document.querySelector('[data-setup-download-all]').disabled`);
  smoke.check('Group then all adds all distinct workflow tasks', manager.listDownloads(win.webContents.id).length === fileCount + 3);
  await click('[data-setup-download-all]');
  await wait(`document.querySelector('[data-setup-download-summary]')?.textContent.includes('沿用任务 ${fileCount}')`);
  await click('[data-setup-group=minimax]');
  await wait("document.querySelector('[data-setup-queue-summary]')?.textContent.includes('排队中 5 项')");
  await click('[data-setup-group=minimax-image]');
  await wait("document.querySelector('[data-setup-file=minimax-model] [data-setup-file-status=queued]')");
  smoke.check('Shared MiniMax file stays queued in both groups without duplicate tasks', manager.listDownloads(win.webContents.id).length === fileCount + 3);
  await captureAutomatic();
  await click('[data-setup-open-queue]');
  await wait(`!document.querySelector('#window-setup-checklist')&&document.querySelectorAll('[data-model-download-task]').length===${fileCount + 3}`);
  smoke.check('Existing download center displays waiting setup tasks', await run("document.querySelector('#window-download-center').textContent.includes('等待下载')"));
  const queued = manager.listDownloads(win.webContents.id).find(task => task.queued);
  await click(`[data-model-download-task="${queued.id}"] [data-download-cancel]`);
  await wait(`document.querySelector('[data-model-download-task="${queued.id}"]').dataset.downloadStatus==='cancelled'`);
  smoke.check('Existing download center pauses a waiting setup task', manager.listDownloads(win.webContents.id).find(task => task.id === queued.id).status === 'cancelled');
  await shot('automatic-download-center');
}

/** 通过真实外观控件切主题，不能只改nativeTheme后把仍是浅色的画面标成深色。 */
async function captureAutomatic() {
  await shot('automatic-light');
  await run("(()=>{const e=document.querySelector('[data-setup-detail]');e.scrollTop=e.scrollHeight})()");
  await shot('automatic-results-light');
  await click('[data-theme-trigger]'); await click('[data-theme-option=dark]');
  await require('./lib/sidebar-menu-fixture').closeAppearance(run);
  await wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')&&matchMedia('(prefers-color-scheme:dark)').matches");
  await click('[data-window-checklist]'); await click('[data-setup-mode=automatic]');
  await shot('automatic-dark');
  smoke.check('Automatic panel uses the actual dark theme', await run("matchMedia('(prefers-color-scheme:dark)').matches"));
  await click('[data-sidebar-toggle]'); await delay(350);
  await shot('sidebar-collapsed-dark');
  smoke.check('Dark collapsed navigation retains only the header toggle', await run("!document.querySelector('[data-sidebar-header],[data-sidebar-brand]')&&!!document.querySelector('[data-window-titlebar] [data-sidebar-toggle]')"));
  await click('[data-sidebar-toggle]'); await delay(350);
  await click('[data-window-checklist]');
  await click('[data-setup-mode=automatic]');
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 650, height: 600, deviceScaleFactor: 1, mobile: false });
  await shot('automatic-narrow');
  smoke.check('Automatic panel fits a narrow window', await run("(()=>{const r=document.querySelector('#window-setup-checklist').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"));
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 470, height: 600, deviceScaleFactor: 1, mobile: false });
  smoke.check('Workflow strip moves above the file list on narrow screens', await run("(()=>{const a=document.querySelector('.setup-checklist-nav').getBoundingClientRect(); const b=document.querySelector('[data-setup-detail]').getBoundingClientRect(); return a.bottom<=b.top&&a.left===b.left})()"));
  smoke.check('Narrow window hides the header toggle with desktop navigation', await run("!document.querySelector('[data-sidebar-toggle]').getClientRects().length&&getComputedStyle(document.querySelector('[data-app-nav]')).display==='none'"));
}

async function main() {
  await app.whenReady(); smoke.assertBuildFresh({ app });
  protocol.handle('https', fixtureApi);
  win = new BrowserWindow({ ...chrome.windowChromeOptions(), width: 1240, height: 820, show: false, webPreferences: { additionalArguments: chrome.windowChromeArguments(), offscreen: true, preload: path.join(__dirname, '../apps/electron/src/preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  smoke.attachWebContents(win.webContents); chrome.registerWindowChrome(win);
  win.webContents.debugger.attach('1.3');
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  try {
    if (process.argv.includes('--header')) { await load('/tools'); await checkSidebarHeader(); }
    else if (readiness) await require('./lib/check-create-model-readiness')({ run, wait, click, load, shot, smoke, installModels, receivedPrompts, setGenerationError, readCreateForm: () => savedCreateForm, modelRoot: path.join(root, 'models') });
    else if (process.argv.includes('--navigation')) await require('./lib/check-window-route-navigation')({ run, wait, click, win, smoke, shot, load });
    else if (automatic) await checkAutomatic(); else if (capture) await captureGuides(); else await require('./lib/check-setup-model-groups')({ run, wait, click, load, shot, win, smoke });
    smoke.check('No request downloads model weights', !requests.some(url => url.includes('/api/download/')));
    smoke.check('No hydration or renderer state errors', !errors.some(message => /hydration|while rendering|Minified React error/.test(message)));
  } catch (error) { await shot('99-failure'); throw error; }
  finally { win.destroy(); }
  console.log('SETUP_CHECKLIST_SCREENSHOTS', root);
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error); smoke.finish({ app, ok: false, error }); });
