/** 工程库目录表：仅固定 SQL，分类删除受外键保护，批量移动与删除在一笔事务内。 */
const { record, transaction } = require('./store-helpers');
/** @typedef {import('node:sqlite').DatabaseSync} Database */

/** @param {Database} db */
function list(db) {
  return {
    entries: db.prepare(`SELECT entry_id AS id,name,folder_id AS folderId,updated_at AS updatedAt,node_count AS nodeCount
      FROM canvas_library_entry WHERE deleted=0 ORDER BY updated_at DESC,entry_id`).all(),
    folders: db.prepare('SELECT folder_id AS id,name FROM canvas_library_folder ORDER BY name,folder_id').all(),
  };
}

/** @param {Database} db @param {unknown} input */
function handleLibrary(db, input) {
  if (!record(input)) throw new Error('SQLITE_INVALID_ARGUMENT');
  if (input.operation === 'list') return list(db);
  if (input.operation === 'all') return db.prepare('SELECT entry_id,directory,deleted FROM canvas_library_entry').all();
  if (input.operation === 'get') return db.prepare('SELECT * FROM canvas_library_entry WHERE entry_id=? AND (deleted=0 OR ?=1)').get(String(input.id), Number(input.includeDeleted === true)) ?? null;
  return transaction(db, () => mutate(db, input));
}

/** @param {Database} db @param {Record<string,unknown>} input */
function mutate(db, input) {
  const id = String(input.id ?? '');
  if (input.operation === 'put') {
    // 目录名像可重新出租的门牌：旧工程已删后，允许新 owner 登记同名目录，不能被旧墓碑永久占用。
    db.prepare('DELETE FROM canvas_library_entry WHERE directory=? AND deleted=1 AND entry_id<>?')
      .run(String(input.directory), id);
    db.prepare(`INSERT INTO canvas_library_entry(entry_id,directory,name,folder_id,updated_at,node_count) VALUES(?,?,?,?,?,?)
      ON CONFLICT(entry_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,node_count=excluded.node_count`)
      .run(id, String(input.directory), String(input.name), input.folderId == null ? null : String(input.folderId), Number(input.updatedAt), Number(input.nodeCount));
  } else if (input.operation === 'folder') {
    db.prepare('INSERT INTO canvas_library_folder(folder_id,name) VALUES(?,?)').run(id, String(input.name));
  } else if (input.operation === 'removeFolder') {
    // 软删除工程不再占分类；活动工程非空时明确拒绝，不偷偷连带删除工程。
    db.prepare('UPDATE canvas_library_entry SET folder_id=NULL WHERE folder_id=? AND deleted=1').run(id);
    db.prepare('DELETE FROM canvas_library_folder WHERE folder_id=?').run(id);
  } else if (input.operation === 'move' || input.operation === 'remove') {
    if (!Array.isArray(input.ids) || !input.ids.every(value => typeof value === 'string')) throw new Error('SQLITE_INVALID_ARGUMENT');
    for (const entryId of input.ids) {
      if (input.operation === 'move') db.prepare('UPDATE canvas_library_entry SET folder_id=? WHERE entry_id=? AND deleted=0').run(input.folderId == null ? null : String(input.folderId), entryId);
      else db.prepare('UPDATE canvas_library_entry SET deleted=1 WHERE entry_id=?').run(entryId);
    }
  } else throw new Error('SQLITE_INVALID_ARGUMENT');
  return list(db);
}

module.exports = { handleLibrary };
