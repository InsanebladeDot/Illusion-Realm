/** 真实磁盘迁移与反证：输入是隔离夹具，Worker、SQL、备份和恢复均使用生产实现。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { SqliteClient } = require('../apps/electron/src/main/storage/sqlite/client');
const { openConnection, CHECKSUM, APPLICATION_ID } = require('../apps/electron/src/main/storage/sqlite/connection');
const { databasePath } = require('../apps/electron/src/main/storage/sqlite/backup');
const { loadAt, saveAt } = require('../apps/electron/src/main/storage/sqlite/user-document');
const { loadQueueAt, saveQueueAt } = require('../apps/electron/src/main/storage/sqlite/download-queue');
const smoke = require('./lib/smoke-harness').createSmokeHarness({ name: 'sqlite-migration' });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-sqlite-migration-'));
smoke.setWorkDir(root);
smoke.installWatchdog(app);

function fixture() {
  const media = { kind: 'image', path: path.join(root, 'source.png'), name: 'source.png', size: 4 };
  fs.writeFileSync(media.path, 'keep');
  const node = id => ({ id, position: { x: -15.5, y: 23 }, data: { kind: 'image', title: id,
    prompt: "quote');--", content: '', ratio: '16/9', media, inputImages: [],
    card: { style: 'custom', width: 504, height: 270 }, workflow: 'anima', batchSize: 2,
    workflowLoras: { anima: [] }, createdAt: 12,
    upscale: { enabled: id === 'first', model: 'seedvr2_7b', scale: 2 } } });
  return { version: 1, settings: { locale: 'en', retained: true }, unknownSection: { retained: true },
    generationHistory: { version: 1, records: [{ id: 'receipt', status: 'completed', createdAt: 1,
      startedAt: 2, finishedAt: 3, images: 7, models: [{ role: 'main', loader: 'unet', name: 'actual-model' }] }] },
    quickPhrases: { phrases: [{ id: 'a', keyword: 'one', promptText: 'first', imagePath: null },
      { id: 'b', keyword: 'two', promptText: 'second' }] },
    infiniteCanvas: { version: 1, name: 'Migration', nodes: [node('first'), node('second'),
      { id: 'note', position: { x: 0, y: 0 }, data: { kind: 'note', title: 'note', prompt: '', content: 'body', ratio: '1/1' } }],
      edges: [{ id: 'edge', source: 'first', target: 'second', sourceHandle: 'out' }] } };
}

// 先建真实 v1，而不是把新库的版本号改小；升级后原表数据必须还在。
function checkUpgrade(filePath) {
  const db = new DatabaseSync(databasePath(filePath));
  db.exec(fs.readFileSync(path.join(__dirname, '../apps/electron/src/main/storage/sqlite/schema.sql'), 'utf8'));
  db.prepare('INSERT INTO schema_migration VALUES(?,?,?)').run(1, CHECKSUM, 1);
  db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=1`);
  db.prepare('INSERT INTO folder VALUES(?,?)').run('existing', 'C:/existing');
  db.close();
  const upgraded = openConnection(databasePath(filePath));
  assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version, 5);
  assert.equal(upgraded.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n, 49);
  assert.equal(upgraded.prepare('SELECT folder_path FROM folder WHERE folder_id=?').get('existing').folder_path, 'C:/existing');
  upgraded.close();
}

async function checkDocument() {
  // 测真实 v1 升级、同源两节点、note 与省略字段；备份必须逐字相同且只建一份。
  const file = path.join(root, 'user.json'), original = fixture();
  fs.writeFileSync(file, JSON.stringify(original, null, 2));
  const bytes = fs.readFileSync(file);
  checkUpgrade(file);
  assert.deepEqual((await loadAt(file)).data, original);
  assert.deepEqual((await loadAt(file)).data, original);
  const backups = fs.readdirSync(root).filter(name => name.startsWith('user.json.pre-sqlite'));
  assert.equal(backups.length, 1);
  assert.ok(fs.readFileSync(path.join(root, backups[0])).equals(bytes));
  const next = structuredClone(original);
  next.infiniteCanvas.nodes.reverse();
  next.infiniteCanvas.nodes[1].data.card.width = 600;
  // 两个实例各存配置；恢复后不能把另一个节点的开关和倍数串进来。
  next.infiniteCanvas.nodes[1].data.upscale.scale = 4;
  next.quickPhrases.phrases.reverse();
  await saveAt(file, next, async settings => fs.writeFileSync(file, JSON.stringify(settings)));
  assert.equal(JSON.parse(fs.readFileSync(file)).infiniteCanvas, undefined);
  assert.deepEqual((await loadAt(file)).data, next);
  assert.equal(fs.readFileSync(original.infiniteCanvas.nodes[0].data.media.path, 'utf8'), 'keep');
  const db = openConnection(databasePath(file));
  assert.equal(db.prepare('SELECT count(*) AS n FROM canvas_media_reference').get().n, 2);
  assert.equal(db.prepare('SELECT count(DISTINCT asset_id) AS n FROM canvas_media_reference').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  db.close();
  smoke.check('v1 upgrade, byte-exact backup, atomic rows, shared assets, ordered save and cold reopen', true);
}

// 像转账先扣后加：第二段非法时，前一段也不能悄悄提交。
async function checkRollback() {
  // 第二段失败要撤回第一段；未知字段不能被序列化器悄悄吞掉后返回成功。
  const client = new SqliteClient(path.join(root, 'rollback.sqlite'));
  try {
    const good = fixture();
    await client.request('document', { operation: 'load', document: good });
    const bad = structuredClone(good);
    bad.generationHistory.records[0].images = 999;
    bad.infiniteCanvas.nodes.push(bad.infiniteCanvas.nodes[0]);
    await assert.rejects(client.request('document', { operation: 'save', document: bad }), /INVALID_ARGUMENT/);
    assert.deepEqual((await client.request('document', { operation: 'load', document: {} })).sections.generationHistory, good.generationHistory);
    bad.infiniteCanvas = good.infiniteCanvas;
    bad.quickPhrases.extra = 'not silently lost';
    await assert.rejects(client.request('document', { operation: 'save', document: bad }), /MIGRATION_MISMATCH/);
    assert.deepEqual((await client.request('document', { operation: 'load', document: {} })).sections.quickPhrases, good.quickPhrases);
  } finally { await client.close(); }
  for (const [name, contents] of [['broken', '{'], ['future', '{"generationHistory":{"version":999,"records":[]}}']]) {
    const file = path.join(root, `${name}.json`);
    fs.writeFileSync(file, contents);
    await assert.rejects(loadAt(file));
    assert.equal(fs.readFileSync(file, 'utf8'), contents);
    const db = openConnection(databasePath(file));
    assert.equal(db.prepare('SELECT count(*) AS n FROM migration_import').get().n, 0);
    db.close();
  }
  smoke.check('partial writes roll back; corrupt, duplicate, unknown and future inputs preserve source', true);
}

function downloadFixture() {
  const id = randomUUID(), folder = path.join(root, 'model');
  const request = { modelType: 'LORA', baseModel: 'SDXL', modelName: 'model', fileName: 'model.safetensors',
    downloadUrl: 'https://civitai.red/api/download/models/1?token=secret&format=SafeTensor',
    category: '', sha256: '', previewUrl: 'https://image.civitai.com/preview.png?token=secret',
    logoDataUrl: 'data:image/png;base64,aGVsbG8=', source: { modelId: 1, versionId: 1, versionName: 'v2',
      creator: 'author', description: 'description', versionDescription: 'version', trainedWords: ['first', 'second'] } };
  const filePath = path.join(folder, request.fileName);
  return { request, task: { id, modelName: 'model', fileName: request.fileName, status: 'cancelled',
    received: 25, total: 100, revision: 9, folderPath: folder, filePath, logoWarning: false, error: null },
    temporary: path.join(folder, `.download-${id}.part`), realFolder: folder, validator: 'etag', owned: [[filePath, '1:2']] };
}

async function checkDownloads() {
  // 原链接凭据必须清掉，封面只保留文件索引；归属与续传字节仍须精确还原。
  const file = path.join(root, 'model-download-queue.json'), item = downloadFixture();
  fs.writeFileSync(file, JSON.stringify({ version: 1, jobs: [item] }));
  const actual = await loadQueueAt(file);
  assert.equal(actual.length, 1);
  const expected = structuredClone(item);
  expected.request.downloadUrl = 'https://civitai.red/api/download/models/1?format=SafeTensor';
  expected.request.previewUrl = 'https://image.civitai.com/preview.png';
  assert.deepEqual(actual, [expected]);
  assert.deepEqual(await loadQueueAt(file), [expected]);
  const db = openConnection(databasePath(file));
  assert.equal(db.prepare('SELECT download_url FROM download_resume').get().download_url.includes('secret'), false);
  assert.equal(db.prepare('SELECT cover_file FROM download_resume').get().cover_file.endsWith('.bin'), true);
  db.close();
  await saveQueueAt(file, []);
  assert.deepEqual(await loadQueueAt(file), []);
  const db2 = openConnection(databasePath(file));
  assert.equal(db2.prepare('SELECT count(*) AS n FROM download_job').get().n, 1);
  db2.close();
  const isolated = path.join(root, 'isolated.json');
  assert.deepEqual((await loadAt(isolated)).data, {});
  smoke.check('download checkpoint, sanitized URL, external cover, ownership, removal and A/B isolation', true);
}

async function checkProtocols() {
  // 外嵌导演台/合成器保留自己的协议，不重新解释人物和剪辑参数。
  const client = new SqliteClient(path.join(root, 'protocols.sqlite'));
  const document = fixture();
  const base = (id, kind, values) => ({ id, position: { x: 0, y: 0 },
    data: { kind, title: id, prompt: '', content: '', ratio: '16/9', ...values } });
  document.infiniteCanvas.workspace = { id: randomUUID(), folder: 'workspace' };
  document.infiniteCanvas.nodes.push(base('scene', 'scene', { scene: require('./fixtures/director/native-scene.json') }));
  document.infiniteCanvas.nodes.push(base('composition', 'composition', { composition: { version: 1,
    state: { videoClips: [{ src: 'composition-asset:asset-1', scale: 1.2 }], audioClips: [] },
    assets: [{ id: 'asset-1', media: { kind: 'video', name: 'video.mp4', path: 'C:/missing/video.mp4', size: 4 } }] } }));
  document.infiniteCanvas.nodes.push(base('video', 'video', { workflow: 'minimax-reference',
    videoModelOverrides: { minimax: {} }, videoSteps: 14, videoFps: 30, videoDuration: 2.5,
    videoOutput: { width: 1920, height: 1080 }, workflowLoras: { minimax: [] } }));
  try {
    const result = await client.request('document', { operation: 'load', document });
    assert.deepEqual(result.sections.infiniteCanvas, document.infiniteCanvas);
  } finally { await client.close(); }
  smoke.check('director, composition, missing media, workspace and video options round-trip without reinterpretation', true);
}

async function main() {
  await checkDocument();
  await checkRollback();
  await checkDownloads();
  await checkProtocols();
  smoke.finish({ app, ok: true });
}
app.whenReady().then(main).catch(error => { console.error(error.stack); smoke.finish({ app, ok: false }); });
