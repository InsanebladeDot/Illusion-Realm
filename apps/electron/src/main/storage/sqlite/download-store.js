/** 下载领域事务：恢复元数据分表，权重、封面和 .part 字节继续保存在文件系统。 */
const { transaction, put, record, digest, statement } = require('./store-helpers');
const { isSavedDownload } = require('../../modules/models/downloads/model-download-records');
const { isDeepStrictEqual } = require('node:util');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('../../modules/models/downloads/model-download-records').SavedDownload} Saved */
/** @typedef {Saved & {cover?:{file:string,prefix:string}}} Stored */

/** @param {Database} db @param {Stored} item @param {number} ordinal */
function saveTask(db, item, ordinal) {
  // 下载请求与断点各自分列；瞬时速度不入库，源名称和文件归属不从目录猜测。
  const task = item.task, request = item.request;
  const folderId = `download-folder:${digest(task.folderPath)}`;
  statement(db, 'INSERT OR IGNORE INTO folder(folder_id,folder_path) VALUES(?,?)').run(folderId, task.folderPath);
  const folder = db.prepare('SELECT folder_id FROM folder WHERE folder_path=?').get(task.folderPath);
  statement(db, `INSERT INTO download_job(download_id,target_folder_id,requested_file_name,source_label,status,created_at,error_code)
    VALUES(?,?,?,'civitai',?,0,?) ON CONFLICT(download_id) DO UPDATE SET status=excluded.status,error_code=excluded.error_code`)
    .run(task.id, String(folder?.folder_id), task.fileName, task.status, task.error);
  put(db, 'download_resume', {
    download_id: task.id, ordinal, active: Number(task.status !== 'removed'), model_name: task.modelName,
    folder_path: task.folderPath, file_path: task.filePath, real_folder: item.realFolder,
    logo_warning: Number(task.logoWarning), error_code: task.error, validator: item.validator,
    reported_received: task.received, reported_total: task.total,
    model_type: request.modelType, base_model: request.baseModel, download_url: request.downloadUrl,
    category: request.category, sha256: request.sha256, preview_url: request.previewUrl,
    cover_file: item.cover?.file ?? null, cover_prefix: item.cover?.prefix ?? null,
    source_model_id: request.source?.modelId ?? null, source_version_id: request.source?.versionId ?? null,
    source_version_name: request.source?.versionName ?? null, source_creator: request.source?.creator ?? null,
    source_description: request.source?.description ?? null, source_version_description: request.source?.versionDescription ?? null,
  }, 'download_id');
  saveCheckpoint(db, item);
}

/** @param {Database} db @param {Stored} item */
function saveCheckpoint(db, item) {
  const task = item.task;
  // 下载请求没有原始起止时间；download_job 的0明确表示未知，不能拿迁移时间冒充完成时间。
  put(db, 'download_checkpoint', { download_id: task.id, temporary_locator: item.temporary,
    received_bytes: task.received, total_bytes: task.total >= task.received && task.total > 0 ? task.total : null,
    etag: item.validator || null, revision: task.revision }, 'download_id');
  statement(db, 'DELETE FROM download_owned_file WHERE download_id=?').run(task.id);
  statement(db, 'DELETE FROM download_source_word WHERE download_id=?').run(task.id);
  item.owned.forEach(([file, identity], ordinal) => put(db, 'download_owned_file', {
    download_id: task.id, ordinal, file_path: file, file_identity: identity,
  }));
  item.request.source?.trainedWords.forEach((word, ordinal) => put(db, 'download_source_word', {
    download_id: task.id, ordinal, word,
  }));
  // 普通C站下载保持原结构，安装依赖用一对一附表记录，不复制整份请求。
  if (item.request.setupId) put(db, 'download_setup_asset', { download_id: task.id, asset_id: item.request.setupId, queued: Number(Boolean(task.queued)) }, 'download_id');
  else statement(db, 'DELETE FROM download_setup_asset WHERE download_id=?').run(task.id);
}

/** @param {Database} db @returns {Stored[]} */
function loadDownloads(db) {
  // 移出队列仅改变 active；下载事实仍在，不能拿移除按钮顺便清空历史。
  return db.prepare(`SELECT r.*,j.status,j.requested_file_name,c.temporary_locator,c.revision
    FROM download_resume r JOIN download_job j USING(download_id) JOIN download_checkpoint c USING(download_id)
    WHERE r.active=1 ORDER BY r.ordinal`).all().map(row => loadTask(db, row));
}

/** @param {Database} db @param {Record<string,import('node:sqlite').SQLOutputValue>} row @returns {Stored} */
function loadTask(db, row) {
  const id = String(row.download_id);
  const setup = db.prepare('SELECT asset_id,queued FROM download_setup_asset WHERE download_id=?').get(id);
  const request = { modelType: row.model_type, baseModel: row.base_model, modelName: row.model_name,
    fileName: row.requested_file_name, downloadUrl: row.download_url, category: row.category,
    sha256: row.sha256, previewUrl: row.preview_url, ...loadSource(db, row), ...(setup ? { setupId: setup.asset_id } : {}) };
  const value = { task: { id, modelName: row.model_name, fileName: row.requested_file_name,
    status: row.status, received: row.reported_received, total: row.reported_total, folderPath: row.folder_path,
    filePath: row.file_path, logoWarning: Boolean(row.logo_warning), error: row.error_code, revision: row.revision, ...(setup ? { queued: Boolean(setup.queued) } : {}) },
    request, temporary: row.temporary_locator, realFolder: row.real_folder, validator: row.validator,
    owned: db.prepare('SELECT file_path,file_identity FROM download_owned_file WHERE download_id=? ORDER BY ordinal').all(id)
      .map(item => [String(item.file_path), String(item.file_identity)]),
    ...(row.cover_file ? { cover: { file: String(row.cover_file), prefix: String(row.cover_prefix) } } : {}) };
  if (!isSavedDownload(value)) throw new Error('SQLITE_INVALID_STORED_DATA');
  return value;
}

/** @param {Database} db @param {Record<string,import('node:sqlite').SQLOutputValue>} row */
function loadSource(db, row) {
  if (row.source_model_id === null) return {};
  return { source: { modelId: row.source_model_id, versionId: row.source_version_id,
    versionName: row.source_version_name, creator: row.source_creator,
    description: row.source_description, versionDescription: row.source_version_description,
    trainedWords: db.prepare('SELECT word FROM download_source_word WHERE download_id=? ORDER BY ordinal').all(String(row.download_id)).map(item => item.word),
  } };
}

/** @param {unknown} value @returns {value is Stored} */
function validStored(value) {
  if (!isSavedDownload(value) || value.request.logoDataUrl !== undefined) return false;
  const cover = 'cover' in value ? value.cover : undefined;
  return cover === undefined || record(cover) && typeof cover.file === 'string' && /^[a-f0-9]{64}\.bin$/.test(cover.file) &&
    typeof cover.prefix === 'string' && /^data:image\/(png|jpeg|webp);base64,$/i.test(cover.prefix);
}

/** @param {Database} db @param {unknown} input */
function handleDownloads(db, input) {
  if (!record(input) || !['inspect', 'load', 'save'].includes(String(input.operation))) throw new Error('SQLITE_INVALID_ARGUMENT');
  if (input.operation === 'inspect') return { imported: Boolean(db.prepare("SELECT 1 FROM migration_import WHERE source_key='downloads-v1'").get()) };
  if (!Array.isArray(input.records) || !input.records.every(validStored)) throw new Error('SQLITE_INVALID_ARGUMENT');
  const records = input.records;
  if (new Set(records.map(item => item.task.id)).size !== records.length) throw new Error('SQLITE_INVALID_ARGUMENT');
  return transaction(db, () => {
    // 同一批队列先完整校验再整体替换，任何异常保留上一个可恢复的检查点。
    const imported = Boolean(db.prepare("SELECT 1 FROM migration_import WHERE source_key='downloads-v1'").get());
    if (!imported || input.operation === 'save') {
      db.exec('UPDATE download_resume SET active=0');
      records.forEach((item, ordinal) => saveTask(db, item, ordinal));
      // 只忽略已明确不恢复的 removed 项；请求、断点、归属和词汇必须逐项相同。
      if (!isDeepStrictEqual(loadDownloads(db), records.filter(item => item.task.status !== 'removed'))) throw new Error('SQLITE_MIGRATION_MISMATCH');
    }
    if (!imported) put(db, 'migration_import', { source_key: 'downloads-v1', source_sha256: digest(records), imported_at: Date.now(), record_count: records.length });
    return { records: loadDownloads(db), migrated: !imported };
  });
}

module.exports = { handleDownloads };
