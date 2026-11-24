/** 用户文档的业务分段接入；设置仍留 JSON，页面继续使用原来的文档形状。 */
const { isDeepStrictEqual } = require('node:util');
const { transaction, put, digest, record } = require('./store-helpers');
const { validHistory, saveHistory, loadHistory } = require('./receipt-store');
const { saveCanvas } = require('./canvas-store');
const { loadCanvas } = require('./canvas-load');
const canvasValidation = require('../../modules/canvas/project-validation');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
const SECTIONS = ['generationHistory', 'infiniteCanvas', 'quickPhrases'];

/** @param {unknown} value */
function validPhrases(value) {
  if (!record(value) || !Array.isArray(value.phrases)) return false;
  return value.phrases.every(item => record(item) && typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.keyword === 'string' && typeof item.promptText === 'string' &&
    (item.imagePath === undefined || item.imagePath === null || typeof item.imagePath === 'string')) &&
    new Set(value.phrases.map(item => item.id)).size === value.phrases.length;
}

/** @param {Database} db @param {unknown} value */
function savePhrases(db, value) {
  if (!validPhrases(value) || !record(value) || !Array.isArray(value.phrases)) throw new Error('SQLITE_INVALID_ARGUMENT');
  db.exec('DELETE FROM quick_phrase');
  value.phrases.forEach((item, ordinal) => put(db, 'quick_phrase', {
    phrase_id: item.id, ordinal, keyword: item.keyword, prompt_text: item.promptText,
    has_image_path: Number(Object.hasOwn(item, 'imagePath')), image_path: item.imagePath ?? null,
  }));
}

/** @param {Database} db */
function loadPhrases(db) {
  return { phrases: db.prepare('SELECT * FROM quick_phrase ORDER BY ordinal').all().map(row => ({
    id: row.phrase_id, keyword: row.keyword, promptText: row.prompt_text,
    ...(row.has_image_path ? { imagePath: row.image_path } : {}),
  })) };
}

/** @param {Database} db @returns {Record<string,unknown>} */
function loadSections(db) {
  /** @type {Record<string,unknown>} */
  const result = {};
  for (const row of db.prepare('SELECT section FROM document_section').all()) {
    if (row.section === 'generationHistory') result.generationHistory = loadHistory(db);
    else if (row.section === 'infiniteCanvas') result.infiniteCanvas = loadCanvas(db);
    else if (row.section === 'quickPhrases') result.quickPhrases = loadPhrases(db);
  }
  return result;
}

/** @param {Database} db @param {Record<string,unknown>} document */
function saveSections(db, document) {
  for (const section of SECTIONS) {
    const value = document[section];
    // 缺段表示调用方没提交；主动清空必须提交空列表，避免设置保存误删历史。
    if (value === undefined) continue;
    const checksum = digest(value);
    // 内容指纹像账页印章：同一段未变时跳过整段重写，其他段仍可独立提交。
    if (db.prepare('SELECT content_sha256 FROM document_section WHERE section=?').get(section)?.content_sha256 === checksum) continue;
    const count = saveSection(db, section, value);
    put(db, 'document_section', { section, version: 1, content_sha256: checksum, record_count: count }, 'section');
    // 反读真实表，而不是只核对 INSERT 的 changes，发现丢字段就整批回滚。
    if (!isDeepStrictEqual(loadSections(db)[section], value)) throw new Error('SQLITE_MIGRATION_MISMATCH');
  }
}

/** @param {Database} db @param {string} section @param {unknown} value */
function saveSection(db, section, value) {
  if (section === 'generationHistory' && validHistory(value)) {
    saveHistory(db, value);
    return value.records.length;
  }
  if (section === 'infiniteCanvas' && canvasValidation.document(value)) {
    const canvas = /** @type {import('@illusion-realm/shared').UserDataInfiniteCanvas} */ (value);
    saveCanvas(db, canvas);
    return canvas.nodes.length;
  }
  if (section === 'quickPhrases' && validPhrases(value)) {
    savePhrases(db, value);
    return /** @type {{phrases:unknown[]}} */ (value).phrases.length;
  }
  throw new Error('SQLITE_INVALID_ARGUMENT');
}

/** @param {Database} db @param {unknown} input */
function handleDocument(db, input) {
  if (!record(input) || !['inspect', 'load', 'save'].includes(String(input.operation))) throw new Error('SQLITE_INVALID_ARGUMENT');
  if (input.operation === 'inspect') return { imported: Boolean(db.prepare("SELECT 1 FROM migration_import WHERE source_key='user-document-v1'").get()) };
  if (!record(input.document)) throw new Error('SQLITE_INVALID_ARGUMENT');
  const document = input.document;
  return transaction(db, () => {
    // 写锁内重新判断接管状态，两个初始化请求不能拿同一个过期判断覆盖新数据。
    const imported = Boolean(db.prepare("SELECT 1 FROM migration_import WHERE source_key='user-document-v1'").get());
    if (!imported || input.operation === 'save') saveSections(db, document);
    if (!imported) put(db, 'migration_import', {
      source_key: 'user-document-v1', source_sha256: digest(document), imported_at: Date.now(),
      record_count: Number(db.prepare('SELECT coalesce(sum(record_count),0) AS n FROM document_section').get()?.n),
    });
    return { sections: loadSections(db), migrated: !imported };
  });
}

module.exports = { handleDocument, SECTIONS };
