/** 下载 JSON 的一次性备份与 SQLite 适配，沿用原 Electron 用户目录。 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { SqliteClient } = require('./client');
const { backup, readDocument, databasePath } = require('./backup');
const { record } = require('./store-helpers');
const { publicRequest, isSavedDownload } = require('../../modules/models/downloads/model-download-records');
/** @typedef {import('../../modules/models/downloads/model-download-records').SavedDownload} Saved */
/** @typedef {Saved & {cover?:{file:string,prefix:string}}} Stored */

/** @param {string} filePath */
const coverDirectory = filePath => path.join(path.dirname(filePath), 'sqlite-media', 'download-covers');

/** @param {string} filePath @param {Saved} item @returns {Promise<Stored>} */
async function prepare(filePath, item) {
  // 速度是上一进程的瞬时采样，重开由原恢复器归零，不当作续传事实入库。
  const { bytesPerSecond: _speed, ...task } = item.task;
  item = { ...item, task };
  const request = publicRequest(item.request);
  if (!request.logoDataUrl) return { ...item, request };
  const comma = request.logoDataUrl.indexOf(',');
  const prefix = request.logoDataUrl.slice(0, comma + 1);
  const bytes = Buffer.from(request.logoDataUrl.slice(comma + 1), 'base64');
  const file = `${createHash('sha256').update(bytes).digest('hex')}.bin`;
  await fs.mkdir(coverDirectory(filePath), { recursive: true });
  try { await fs.writeFile(path.join(coverDirectory(filePath), file), bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
    if (!(await fs.readFile(path.join(coverDirectory(filePath), file))).equals(bytes)) throw new Error('io');
  }
  delete request.logoDataUrl;
  return { ...item, request, cover: { file, prefix } };
}

/** @param {string} filePath @param {unknown} value @returns {Promise<Saved[]>} */
async function restore(filePath, value) {
  if (!record(value) || !Array.isArray(value.records)) throw new Error('io');
  /** @type {Saved[]} */
  const result = [];
  for (const item of value.records) {
    if (!isSavedDownload(item)) throw new Error('io');
    const cover = 'cover' in item ? item.cover : undefined;
    if (record(cover)) {
      if (typeof cover.file !== 'string' || !/^[a-f0-9]{64}\.bin$/.test(cover.file) || typeof cover.prefix !== 'string') throw new Error('io');
      const bytes = await fs.readFile(path.join(coverDirectory(filePath), cover.file));
      if (`${createHash('sha256').update(bytes).digest('hex')}.bin` !== cover.file) throw new Error('io');
      item.request.logoDataUrl = cover.prefix + bytes.toString('base64');
    }
    result.push({ task: item.task, request: item.request, temporary: item.temporary,
      realFolder: item.realFolder, validator: item.validator, owned: item.owned });
  }
  return result;
}

/** @param {SqliteClient} client @param {string} filePath */
async function ensureImported(client, filePath) {
  const status = await client.request('downloads', { operation: 'inspect' });
  if (record(status) && status.imported === true) return;
  const value = await readDocument(filePath);
  const jobs = Object.keys(value).length === 0 ? [] : value.jobs;
  if (!Array.isArray(jobs) || jobs.some(item => !isSavedDownload(item)) || value.version !== undefined && value.version !== 1) throw new Error('io');
  if (new Set(jobs.map(item => item.task.id)).size !== jobs.length) throw new Error('io');
  await backup(filePath);
  const records = [];
  for (const job of jobs) records.push(await prepare(filePath, job));
  await client.request('downloads', { operation: 'load', records });
}

/** @template T @param {string} filePath @param {(client:SqliteClient)=>Promise<T>} operation */
async function withQueue(filePath, operation) {
  const client = new SqliteClient(databasePath(filePath));
  try {
    await ensureImported(client, filePath);
    return await operation(client);
  } catch { throw new Error('io'); }
  finally { await client.close(); }
}

/** @param {string} filePath */
function loadQueueAt(filePath) {
  return withQueue(filePath, async client => restore(filePath, await client.request('downloads', { operation: 'load', records: [] })));
}

/** @param {string} filePath @param {Saved[]} records */
function saveQueueAt(filePath, records) {
  return withQueue(filePath, async client => {
    const prepared = [];
    for (const item of records) {
      if (!isSavedDownload(item)) throw new Error('io');
      prepared.push(await prepare(filePath, item));
    }
    await client.request('downloads', { operation: 'save', records: prepared });
  });
}

module.exports = { loadQueueAt, saveQueueAt };
