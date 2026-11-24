/** 领域存储的内部 SQL 助手；表名与列名只由本目录代码提供，不接收页面 SQL。 */
const { createHash } = require('node:crypto');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {Record<string,string|number|null>} Values */
/** @type {WeakMap<Database, Map<string,import('node:sqlite').StatementSync>>} */
const caches = new WeakMap();

/** @param {Database} db @param {string} sql */
function statement(db, sql) {
  let cache = caches.get(db);
  if (!cache) { cache = new Map(); caches.set(db, cache); }
  if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
  return /** @type {import('node:sqlite').StatementSync} */ (cache.get(sql));
}

/**
 * @param {Database} db @param {string} table @param {Values} values @param {string} [key]
 * 只绑定值；调用点必须提供固定列对象，不能把未知对象的键当成列名传入。
 */
function put(db, table, values, key) {
  const columns = Object.keys(values);
  const conflict = key ? ` ON CONFLICT(${key}) DO UPDATE SET ${columns.filter(column => column !== key).map(column => `${column}=excluded.${column}`).join(',')}` : '';
  const sql = `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})${conflict}`;
  statement(db, sql).run(...Object.values(values));
}

/** @template T @param {Database} db @param {()=>T} operation @returns {T} */
function transaction(db, operation) {
  // 像整箱验货后再签收：任何一张关系表失败，整组恢复到提交之前。
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* 不覆盖原始失败。 */ }
    throw error;
  }
}

/** @param {unknown} value */
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

module.exports = { statement, put, transaction, digest, record };
