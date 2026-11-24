/** 自动安装回归：隔离配置、真实传输和SQLite，不下载真实权重。
 * 本地字节故意不匹配官方摘要，用来证明错误文件不会被安装；完整提交由原下载专项覆盖。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http'), { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { app } = require('electron');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'setup-downloads', timeoutMs: 90000 });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-setup-download-'));
app.setPath('userData', path.join(root, 'browser'));
process.env.ILLUSION_CIVITAI_SECRET_DIR = path.join(root, 'secret');
smoke.setWorkDir(root); smoke.installWatchdog(app);
let models = '';
require('../apps/electron/src/main/storage/user-data').readUserData = () => ({ data: { settings: { paths: { searchPath: models } } } });
const base = '../apps/electron/src/main/modules/models/downloads/';
const { setupRequest } = require(base + 'setup-download-catalog');
const { validateSetupCheckArgs } = require(base + 'setup-check-service');
const { setupFolder } = require(base + 'setup-download-paths');
const { alreadyPresent } = require(base + 'setup-download-files');
const { downloadSetup, validateSetupArgs } = require(base + 'setup-download-service');
const { validateDownload } = require(base + 'model-download-validation');
const { recoverRecord } = require(base + 'model-download-recovery');
const manager = require(base + 'model-download-manager');
const { loadQueue } = require(base + 'model-download-persistence');
const manifest = require('../packages/shared/src/data/setup-downloads.json');
const owner = Object.assign(new EventEmitter(), { id: 300, isDestroyed: () => false, send: () => {} });
const body = Buffer.alloc(256 * 1024, 42), digest = createHash('sha256').update(body).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const tasks = () => manager.listDownloads(owner.id);
let requests = 0;

/** 只转译生产schema，不复制校验规则；之后仍须独立运行类型检查。 */
function sharedSchema(name) {
  const file = path.join(__dirname, '../packages/shared/src/schemas', name + '.ts');
  const ts = require('../apps/next/node_modules/typescript'), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', 'module', code)(name => name.endsWith('.schema') ? sharedSchema(name.replace('./', '')) : createRequire(file)(name), module.exports, module);
  return module.exports;
}

function checkContracts() {
  const imageWorkflows = {
    anima: require('../apps/next/src/data/comfy/imageWorkflower/Anima/标准anima生成流.json'),
    moss: require('../apps/next/src/data/comfy/imageWorkflower/Moss_Image/文生图.json'),
  };
  const { ModelDownloadRequestSchema } = sharedSchema('model-download.schema');
  const { SetupDownloadIdsSchema, SetupCheckModeSchema } = sharedSchema('setup-download.schema');
  for (const asset of manifest.files) {
    const local = asset.relativePath.split('/').slice(1).join('/');
    const workflow = imageWorkflows[asset.id.split('-')[0]];
    if (workflow) assert.equal(local, workflow[asset.nodeId].inputs[asset.input].replaceAll('\\', '/'));
    assert.equal(asset.relativePath.split('/').pop(), asset.fileName);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/); assert.ok(asset.expectedBytes > 200000000);
    const request = setupRequest(asset.id);
    assert.equal(validateDownload([request]), null); assert.ok(ModelDownloadRequestSchema.safeParse(request).success);
    // 两边必须同时拒绝换地址、换文件名、换摘要或夹带来源的伪造安装请求。
    for (const patch of [{ downloadUrl: 'https://civitai.red/api/download/models/1' }, { sha256: digest }, { fileName: 'other.pt' }, { category: 'elsewhere' }, { setupId: 'unknown' }]) {
      assert.equal(validateDownload([{ ...request, ...patch }]), 'invalid');
      assert.equal(ModelDownloadRequestSchema.safeParse({ ...request, ...patch }).success, false);
    }
  }
  for (const ids of [[], ['unknown'], ['anima-model', 'anima-model'], null, [1]]) {
    assert.equal(validateSetupArgs([ids]), 'invalid'); assert.equal(SetupDownloadIdsSchema.safeParse(ids).success, false);
  }
  assert.equal(validateSetupArgs([manifest.files.map(file => file.id)]), null);
  // 两端都拒绝将路径当作编号，以及用其他参数把只读检查变成下载操作。
  for (const mode of ['inspect', 'verify', 'download', null, { root }]) {
    assert.equal(validateSetupCheckArgs([['anima-vae'], mode]) === null, SetupCheckModeSchema.safeParse(mode).success);
  }
  assert.equal(validateSetupCheckArgs([[path.join(root, 'anima-vae')], 'verify']), 'invalid');
  assert.equal(validateSetupCheckArgs([['anima-vae'], 'verify', root]), 'invalid');
  const { allowedUrl } = require(base + 'model-download-network');
  assert.equal(allowedUrl('https://cdn-lfs.huggingface.co/a'), true);
  assert.equal(allowedUrl('https://cas-bridge.xethub.hf.co/a'), true);
  assert.equal(allowedUrl('https://huggingface.co.evil.test/a'), false);
  assert.equal(allowedUrl('http://huggingface.co/a'), false);
  smoke.check('Pinned paths match shipped workflow; shared/native validators reject tampering', true);
}

/** 缺根目录无副作用；哈希正反例读取真实文件，改名和同名都不能替代内容匹配。 */
async function checkFiles() {
  const missing = await downloadSetup(owner, ['anima-model']);
  assert.equal(missing.items[0].error, 'configuration'); assert.equal(tasks().length, 0); assert.equal(requests, 0);
  models = path.join(root, 'models'); fs.mkdirSync(models);
  const file = path.join(root, 'hash.safetensors'); fs.writeFileSync(file, body);
  assert.equal(await alreadyPresent(file, digest), true);
  await assert.rejects(alreadyPresent(file, 'f'.repeat(64)), /exists/);
  assert.equal(await alreadyPresent(file + '.missing', digest), false);
  assert.deepEqual(fs.readFileSync(file), body);
  const folder = setupFolder('anima-model', true), target = path.join(folder, setupRequest('anima-model').fileName);
  fs.writeFileSync(target, body);
  assert.equal((await downloadSetup(owner, ['anima-model'])).items[0].error, 'exists');
  assert.deepEqual(fs.readFileSync(target), body); fs.renameSync(target, target + '.kept');
  fs.writeFileSync(target + '.civitai.json', 'keep');
  assert.equal((await downloadSetup(owner, ['anima-model'])).items[0].error, 'exists');
  assert.equal(requests, 0); fs.renameSync(target + '.civitai.json', target + '.civitai.json.kept');
  smoke.check('Root required; real SHA256 check skips matching bytes and preserves conflicts', true);
}

/** 普通下载占满三槽；安装请求只登记等待，不能越过并发上限发网络请求。 */
async function checkQueue() {
  const normal = { modelType: 'LORA', baseModel: 'SDXL', modelName: 'fixture', fileName: 'a.pt', downloadUrl: 'https://civitai.red/api/download/models/1', category: '', sha256: digest, previewUrl: '' };
  const running = [0, 1, 2].map(i => manager.startDownload(owner, { ...normal, fileName: i + '.pt' }));
  const ids = manifest.files.map(file => file.id);
  const added = await downloadSetup(owner, ids);
  assert.ok(added.items.every(item => item.status === 'added' && item.task.queued));
  const repeated = await downloadSetup(owner, ids);
  assert.deepEqual(repeated.items.map(item => item.task.id), added.items.map(item => item.task.id));
  const paused = added.items[0].task;
  await manager.cancelDownload(owner.id, paused.id);
  let records = await loadQueue();
  assert.equal(records.find(item => item.task.id === paused.id).task.status, 'cancelled');
  const resumed = await downloadSetup(owner, ['anima-model']);
  assert.equal(resumed.items[0].task.id, paused.id); assert.equal(resumed.items[0].task.queued, true);
  records = await loadQueue();
  assert.equal(records.filter(item => item.task.queued).length, manifest.files.length);
  for (const record of records.filter(item => item.task.queued)) {
    const restored = await recoverRecord(record);
    assert.equal(restored.task.status, 'cancelled'); assert.equal(restored.task.queued, false);
    assert.equal(restored.request.setupId, record.request.setupId); assert.equal(restored.task.filePath, record.task.filePath);
  }
  await checkRemovalBoundary(added.items[2].task.id);
  await drainAndCheck(running, added.items);
}

/** 改目录后移除旧等待项应拒绝文件操作，但不能留下无法写回数据库的等待标记。 */
async function checkRemovalBoundary(id) {
  const previous = models;
  models = path.join(root, 'other-models'); fs.mkdirSync(models);
  try {
    await assert.rejects(manager.removeDownload(owner.id, id), /io/);
    const task = tasks().find(item => item.id === id);
    assert.equal(task.status, 'failed'); assert.equal(task.queued, false);
    assert.equal((await loadQueue()).find(item => item.task.id === id).task.queued, false);
  } finally { models = previous; }
  assert.equal((await downloadSetup(owner, ['anima-vae'])).items[0].task.id, id);
}

/** 释放槽位后等待项自动开始；故意发错内容，确认固定官方SHA阻止成品提交。 */
async function drainAndCheck(running, items) {
  await manager.cancelDownload(owner.id, running[0].id);
  const end = Date.now() + 12000;
  while (Date.now() < end && items.some(item => !['failed', 'completed'].includes(tasks().find(task => task.id === item.task.id).status))) await delay(50);
  for (const item of items) {
    const task = tasks().find(task => task.id === item.task.id), asset = manifest.files.find(file => file.id === item.id);
    assert.equal(task.status, 'failed'); assert.equal(task.error, 'integrity'); assert.equal(task.queued, false);
    assert.equal(task.filePath, path.join(models, ...asset.relativePath.split('/'))); assert.equal(fs.existsSync(task.filePath), false);
  }
  assert.equal(requests, manifest.files.length + 3);
  await manager.suspendDownloads();
  const stored = await loadQueue();
  assert.equal(stored.filter(item => item.request.setupId).length, manifest.files.length);
  smoke.check('Queue deduplication, pause/resume, SQLite roundtrip, recovery and automatic drain', true);
  smoke.check('All pinned workflow targets reject fixture bytes against official SHA256', true);
}

/** 流速只用于让三条普通任务保持活动；请求结束时清理定时器，失败也不留后台服务。 */
function serve(req, res) {
  requests += 1;
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
  let offset = 0;
  const timer = setInterval(() => {
    res.write(body.subarray(offset, offset + 16384)); offset += 16384;
    if (offset >= body.length) { clearInterval(timer); res.end(); }
  }, req.url === '/ordinary' ? 300 : 1);
  res.on('close', () => clearInterval(timer));
}

async function main() {
  await app.whenReady(); checkContracts(); await manager.restoreDownloads(owner); await checkFiles();
  const server = http.createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const session = require(base + 'model-download-network').getDownloadSession();
  session.protocol.handle('https', request => globalThis.fetch(`http://127.0.0.1:${server.address().port}/${request.url.endsWith('/1') ? 'ordinary' : 'setup'}`, { signal: request.signal, headers: request.headers }));
  try { await checkQueue(); }
  finally { await manager.suspendDownloads(); session.protocol.unhandle('https'); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log('SETUP_DOWNLOAD_FIXTURE', root);
  smoke.finish({ app, ok: smoke.allPassed() });
}
main().catch(error => { console.error(error); smoke.finish({ app, ok: false, error }); });
