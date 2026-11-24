/** 迁移前建立只增不改的原文件备份；失败时不继续切换权威数据源。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

/** @param {string} filePath @returns {Promise<Record<string,unknown>>} */
async function readDocument(filePath) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    throw new Error('SQLITE_INVALID_SOURCE_DOCUMENT');
  }
}

/** @param {string} filePath */
async function backup(filePath) {
  let content;
  try { content = await fs.readFile(filePath); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw new Error('SQLITE_BACKUP_FAILED');
  }
  const hash = createHash('sha256').update(content).digest('hex');
  const target = `${filePath}.pre-sqlite-v2.${hash.slice(0, 16)}.bak`;
  try {
    const handle = await fs.open(target, 'wx', 0o600);
    try { await handle.writeFile(content); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw new Error('SQLITE_BACKUP_FAILED');
    if (!content.equals(await fs.readFile(target))) throw new Error('SQLITE_BACKUP_FAILED');
  }
}

/** @param {string} userFile */
function databasePath(userFile) {
  return path.join(path.dirname(userFile), `${path.basename(userFile, path.extname(userFile))}.sqlite`);
}

module.exports = { readDocument, backup, databasePath };
