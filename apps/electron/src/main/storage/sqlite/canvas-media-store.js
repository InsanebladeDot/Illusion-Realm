/** 索引画布的真实文件引用；只读文件存在性，不搬动、删除或解码媒体。 */
const fs = require('node:fs');
const path = require('node:path');
const { put, digest, statement } = require('./store-helpers');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {NonNullable<import('@illusion-realm/shared').UserDataInfiniteCanvas['nodes'][number]['data']['media']>} Media */

/** @param {Database} db @param {Media} media */
function registerMedia(db, media) {
  const directory = path.dirname(media.path);
  const folderId = `canvas-folder:${digest(directory)}`;
  const assetId = `canvas-media:${digest([media.kind, media.path])}`;
  statement(db, 'INSERT OR IGNORE INTO folder(folder_id,folder_path) VALUES(?,?)').run(folderId, directory);
  const folder = db.prepare('SELECT folder_id FROM folder WHERE folder_path=?').get(directory);
  if (!folder) throw new Error('SQLITE_INVALID_STORED_DATA');
  statement(db, 'INSERT OR IGNORE INTO asset(asset_id,media_kind,origin_kind,created_at) VALUES(?,?,?,?)')
    .run(assetId, media.kind, 'imported', Date.now());
  // “imported”表示登记旧引用，不推断它原来由哪个生成任务产出。
  put(db, 'asset_file', {
    file_id: assetId, asset_id: assetId, folder_id: String(folder.folder_id), file_name: path.basename(media.path),
    byte_size: media.size, availability: fs.existsSync(media.path) ? 'present' : 'missing', ownership: 'external',
  }, 'file_id');
  return assetId;
}

/** @param {Database} db @param {string} nodeId @param {'display'|'input'} role @param {number} ordinal @param {Media} media */
function saveMedia(db, nodeId, role, ordinal, media) {
  put(db, 'canvas_media_reference', {
    node_id: nodeId, role, ordinal, asset_id: registerMedia(db, media),
    original_path: media.path, original_name: media.name, original_size: media.size,
  });
}

/** @param {Database} db @param {string} nodeId @param {'display'|'input'} role @returns {Media[]} */
function loadMedia(db, nodeId, role) {
  const rows = db.prepare(`SELECT r.*,a.media_kind FROM canvas_media_reference r
    JOIN asset a ON a.asset_id=r.asset_id WHERE node_id=? AND role=? ORDER BY ordinal`).all(nodeId, role);
  return rows.map(row => ({
    kind: /** @type {Media['kind']} */ (row.media_kind), path: String(row.original_path),
    name: String(row.original_name), size: Number(row.original_size),
  }));
}

module.exports = { saveMedia, loadMedia };
