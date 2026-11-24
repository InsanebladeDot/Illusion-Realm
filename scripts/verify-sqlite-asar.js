/** 验证 asar 内的 SQL 资源、领域依赖与真实 Worker；不等同于安装器验收。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'sqlite-asar' });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-sqlite-asar-v2-'));
smoke.setWorkDir(root);
smoke.installWatchdog(app);

async function main() {
  // 从本项目打包链解析已有工具，不增加生产运行依赖或下载另一版本。
  const builder = require.resolve('electron-builder/package.json', { paths: [path.join(__dirname, '../apps/electron')] });
  const asar = require(require.resolve('@electron/asar', { paths: [path.dirname(builder)] }));
  const archive = path.join(root, 'app.asar');
  // 夹具只装src，补齐实际应用随包提供的shared数据，避免借用仓库路径碰巧通过。
  const sharedData = path.join(root, 'node_modules/@illusion-realm/shared/src/data');
  fs.mkdirSync(sharedData, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../packages/shared/src/data/setup-downloads.json'), path.join(sharedData, 'setup-downloads.json'));
  await asar.createPackage(path.join(__dirname, '../apps/electron/src'), archive);
  const { SqliteClient } = require(path.join(archive, 'main/storage/sqlite/client.js'));
  const client = new SqliteClient(path.join(root, 'business.sqlite'));
  try {
    const info = await client.request('status');
    assert.equal(info.schemaVersion, 5);
    assert.equal(info.tableCount, 49);
    const document = { infiniteCanvas: { version: 1, name: 'asar', nodes: [], edges: [] },
      quickPhrases: { phrases: [{ id: 'p', keyword: 'k', promptText: 'actual sql' }] } };
    assert.deepEqual((await client.request('document', { operation: 'load', document })).sections, document);
    assert.deepEqual((await client.request('downloads', { operation: 'load', records: [] })).records, []);
    smoke.check('asar includes v1–v5 SQL, shared setup assets, canvas validators and domain workers', true);
  } finally { await client.close(); }
  // 真正关闭并重开打包内 Worker，排除只靠上一连接缓存得到恢复结果。
  const reopened = new SqliteClient(path.join(root, 'business.sqlite'));
  try {
    assert.equal((await reopened.request('document', { operation: 'load', document: {} })).sections.quickPhrases.phrases[0].promptText, 'actual sql');
  } finally { await reopened.close(); }
  smoke.check('asar worker closes and reopens durable domain rows', true);
  await checkLibraryArchive(archive);
  smoke.finish({ app, ok: true });
}

async function checkLibraryArchive(archive) {
  const library = require(path.join(archive, 'main/modules/canvas/canvas-library.js')).createCanvasLibrary(path.join(root, 'user'));
  const entry = await library.request({ operation: 'create', name: 'asar-library', folderId: null });
  const saved = await library.request({ operation: 'load', id: entry.id });
  assert.equal(saved.name, 'asar-library');
  assert.equal((await library.request({ operation: 'list' })).entries[0].id, entry.id);
  smoke.check('asar project library creates and reloads real per-project databases', true);
}
app.whenReady().then(main).catch(error => { console.error(error.stack); smoke.finish({ app, ok: false }); });
