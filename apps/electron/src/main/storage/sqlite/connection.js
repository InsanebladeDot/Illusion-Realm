/** SQLite 连接与逐版迁移；同步磁盘操作只在专属 Worker 或隔离回归中执行。 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// 像按页码装订账本：已发布页不重写，新结构只追加下一页并分别核对指纹。
const MIGRATIONS = ['schema.sql', 'migration-002.sql', 'migration-003.sql', 'migration-004.sql', 'migration-005.sql', 'migration-006.sql'].map(file => {
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
  return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
});
const CHECKSUM = MIGRATIONS[0].checksum;
const APPLICATION_ID = 0x4952524d;
const SCHEMA_VERSION = MIGRATIONS.length;

/** @param {import('node:sqlite').DatabaseSync} db */
function inspectVersion(db) {
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  const owner = Number(db.prepare('PRAGMA application_id').get()?.application_id);
  if (version > SCHEMA_VERSION) throw new Error('SQLITE_FUTURE_VERSION');
  if (version > 0 && owner === APPLICATION_ID) {
    for (let index = 0; index < version; index += 1) {
      const row = db.prepare('SELECT checksum FROM schema_migration WHERE version=?').get(index + 1);
      if (row?.checksum !== MIGRATIONS[index].checksum) throw new Error('SQLITE_SCHEMA_MISMATCH');
    }
    return version;
  }
  // 空文件可以初始化；陌生库即使版本是零也不能接管，拒绝时保留原文件。
  const existing = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get();
  if (version !== 0 || owner !== 0 || existing) throw new Error('SQLITE_FOREIGN_DATABASE');
  return version;
}

/** @param {import('node:sqlite').DatabaseSync} db */
function migrate(db) {
  // 先拿写锁再读版本，两个初始化者不会各自根据过期状态重复建表。
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = inspectVersion(db);
    for (let index = version; index < SCHEMA_VERSION; index += 1) {
      const migration = MIGRATIONS[index];
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migration(version,checksum,applied_at) VALUES(?,?,?)')
        .run(index + 1, migration.checksum, Date.now());
    }
    db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* 保留最初失败，外层关闭未知状态连接。 */ }
    throw error;
  }
}

/**
 * @param {string} filePath
 * 外键在构造时开启；FULL 不牺牲提交可靠性，8MiB 是页缓存目标而非总内存保证。
 * WAL 允许并发读快照，但仍只有一个写者；不开放扩展加载或任意 PRAGMA 请求。
 */
function openConnection(filePath) {
  if (filePath !== ':memory:') fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false });
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF');
    migrate(db);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-8192; PRAGMA wal_autocheckpoint=1000');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

module.exports = { openConnection, CHECKSUM, APPLICATION_ID, SCHEMA_VERSION };
