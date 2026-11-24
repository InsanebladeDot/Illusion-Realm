/** 迁移终态小票和模型使用行，缺失的提示词、图片路径不补造。 */
const { put, record } = require('./store-helpers');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {NonNullable<import('@illusion-realm/shared').UserDataDocument['generationHistory']>} History */
/** @typedef {History['records'][number]} Receipt */

/** @param {unknown} value @returns {value is Receipt} */
function receipt(value) {
  if (!record(value) || typeof value.id !== 'string' || !value.id || value.id.length > 100) return false;
  if (typeof value.status !== 'string' || !['completed', 'failed', 'cancelled'].includes(value.status)) return false;
  if (![value.createdAt, value.finishedAt].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false;
  if (!(value.startedAt === null || typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) && value.startedAt >= Number(value.createdAt))) return false;
  if (Number(value.finishedAt) < Number(value.startedAt ?? value.createdAt) || !Number.isSafeInteger(value.images) || Number(value.images) < 0) return false;
  return Array.isArray(value.models) && value.models.every(model);
}

/** @param {unknown} value */
function model(value) {
  return record(value) && typeof value.role === 'string' && ['main', 'lora'].includes(value.role) &&
    typeof value.loader === 'string' && ['unet', 'diffusion_models', 'checkpoints', 'loras'].includes(value.loader) &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 2048;
}

/** @param {unknown} value @returns {value is History} */
function validHistory(value) {
  return record(value) && value.version === 1 && Array.isArray(value.records) &&
    value.records.every(receipt) && new Set(value.records.map(item => item.id)).size === value.records.length;
}

/** @param {Database} db @param {History} history */
function saveHistory(db, history) {
  db.exec('DELETE FROM generation_receipt');
  history.records.forEach((item, ordinal) => {
    put(db, 'generation_receipt', {
      receipt_id: item.id, ordinal, status: item.status, created_at: item.createdAt,
      started_at: item.startedAt, finished_at: item.finishedAt, reported_images: item.images,
    });
    item.models.forEach((model, ordinal) => put(db, 'receipt_model', {
      receipt_id: item.id, ordinal, role: model.role, loader: model.loader, submitted_name: model.name,
    }));
  });
}

/** @param {Database} db @returns {History} */
function loadHistory(db) {
  // 保留原数组顺序和重复模型槽；统计页继续使用同一份小票事实。
  const models = db.prepare('SELECT * FROM receipt_model ORDER BY receipt_id,ordinal').all();
  /** @type {Map<import('node:sqlite').SQLOutputValue,Record<string,import('node:sqlite').SQLOutputValue>[]>} */
  const groups = new Map();
  for (const model of models) {
    const group = groups.get(model.receipt_id) ?? [];
    group.push(model);
    groups.set(model.receipt_id, group);
  }
  const rows = db.prepare('SELECT * FROM generation_receipt ORDER BY ordinal').all();
  const result = { version: 1, records: rows.map(row => ({
    id: row.receipt_id, status: row.status, createdAt: row.created_at,
    startedAt: row.started_at, finishedAt: row.finished_at, images: row.reported_images,
    models: (groups.get(row.receipt_id) ?? []).map(model => ({
      role: model.role, loader: model.loader, name: model.submitted_name,
    })),
  })) };
  if (!validHistory(result)) throw new Error('SQLITE_INVALID_STORED_DATA');
  return result;
}

module.exports = { validHistory, saveHistory, loadHistory };
