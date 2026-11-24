/** 已授权的本机迁移入口；无运行实例才执行，保留字节备份后核对真实 SQL 恢复。 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');
const { readUserData, writeUserData } = require('../apps/electron/src/main/storage/user-data');
const { loadAt, saveAt } = require('../apps/electron/src/main/storage/sqlite/user-document');
const { readDocument, databasePath } = require('../apps/electron/src/main/storage/sqlite/backup');
const { loadQueueAt } = require('../apps/electron/src/main/storage/sqlite/download-queue');
const { openConnection } = require('../apps/electron/src/main/storage/sqlite/connection');
const { assertAppStopped } = require('./lib/assert-app-stopped');

// 输出仅计数和健康状态，不把提示词、文件名、凭据或完整用户路径写入日志。
async function migrateDocument() {
  const seed = readUserData(), original = await readDocument(seed.filePath);
  const restored = await loadAt(seed.filePath);
  for (const section of ['generationHistory', 'infiniteCanvas', 'quickPhrases']) {
    if (original[section] !== undefined) assert.deepEqual(restored.data[section], original[section]);
  }
  const document = { ...seed.data, ...restored.data };
  await saveAt(seed.filePath, document, writeUserData);
  assert.deepEqual((await loadAt(seed.filePath)).data, document);
  const db = openConnection(databasePath(seed.filePath));
  try {
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    console.log('SQLITE_USER_MIGRATED', JSON.stringify({
      version: 2, tables: 44, receipts: db.prepare('SELECT count(*) AS n FROM generation_receipt').get().n,
      nodes: db.prepare('SELECT count(*) AS n FROM canvas_node_detail').get().n,
      edges: db.prepare('SELECT count(*) AS n FROM canvas_edge_detail').get().n,
      phrases: db.prepare('SELECT count(*) AS n FROM quick_phrase').get().n, integrity: 'ok', backup: 'retained',
    }));
  } finally { db.close(); }
}

async function migrateDownloads() {
  // 原开发应用的实际 appData 来自项目包名，不能用本 CLI 默认的 Electron 用户目录。
  const name = require('../apps/electron/package.json').name;
  const file = path.join(app.getPath('appData'), name, 'model-download-queue.json');
  try { await fs.access(file); }
  catch (error) {
    if (error && error.code === 'ENOENT') { console.log('SQLITE_DOWNLOAD_MIGRATION', 'no legacy queue; first application use initializes'); return; }
    throw error;
  }
  const records = await loadQueueAt(file);
  console.log('SQLITE_DOWNLOAD_MIGRATED', JSON.stringify({ activeRecords: records.length, backup: 'retained' }));
}

app.whenReady().then(async () => {
  await assertAppStopped();
  await migrateDocument();
  await migrateDownloads();
}).then(() => app.exit(0)).catch(error => {
  console.error(error.message === 'MIGRATION_APP_STILL_RUNNING' ? 'Close Illusion Realm before migration.' : 'SQLite migration failed; originals and backups retained.');
  app.exit(1);
});
