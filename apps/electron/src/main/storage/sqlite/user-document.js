/** 原 USER_DATA IPC 的存储适配：业务段读 SQLite，启动设置继续同步读 JSON。 */
const { SqliteClient } = require('./client');
const { readDocument, backup, databasePath } = require('./backup');
const { record } = require('./store-helpers');
const { SECTIONS } = require('./document-store');
/** @type {Promise<unknown>} */
let pending = Promise.resolve();

/** @param {SqliteClient} client @param {'inspect'|'load'|'save'} operation @param {Record<string,unknown>} [document] */
async function invoke(client, operation, document = {}) {
  const value = await client.request('document', { operation, document });
  if (!record(value)) throw new Error('SQLITE_INVALID_STORED_DATA');
  return value;
}

/** @template T @param {string} filePath @param {(client:SqliteClient,document:Record<string,unknown>)=>Promise<T>} operation */
async function withDocument(filePath, operation) {
  // 先备份旧原文再建立迁移标记；备份失败就拒绝接管，不把坏输入当空账本。
  // 每次调用拥有自己的 Worker，finally 等待关闭，不留下阻止退出的线程。
  const client = new SqliteClient(databasePath(filePath));
  try {
    const original = await readDocument(filePath);
    if (!(await invoke(client, 'inspect')).imported) await backup(filePath);
    await invoke(client, 'load', original);
    return await operation(client, original);
  } finally { await client.close(); }
}

/** @param {string} filePath */
async function loadAt(filePath) {
  // 页面仍读原文档形状；SQL 业务段覆盖旧快照，其他未知设置原样保留。
  return withDocument(filePath, async (client, document) => {
    const result = await invoke(client, 'load');
    if (!record(result.sections)) throw new Error('SQLITE_INVALID_STORED_DATA');
    return { filePath, data: { ...document, ...result.sections }, isNew: Object.keys(document).length === 0 };
  });
}

/** @param {string} filePath @param {Record<string,unknown>} document @param {(data:Record<string,unknown>)=>Promise<unknown>} writeSettings */
function saveAt(filePath, document, writeSettings) {
  const snapshot = /** @type {Record<string,unknown>} */ (JSON.parse(JSON.stringify(document)));
  // 像依次交接整份账本：JSON 与 SQLite 的两段操作也遵守原接收顺序，不乱序成功。
  const operation = pending.catch(() => {}).then(() => withDocument(filePath, async client => {
    await invoke(client, 'save', snapshot);
    // SQL 与设置 JSON 不是跨文件原子事务；后一步失败必须报告，不能伪装全体回滚。
    const settings = Object.fromEntries(Object.entries(snapshot).filter(([key]) => !SECTIONS.includes(key)));
    await writeSettings(settings);
    return { filePath, data: snapshot };
  }));
  pending = operation;
  return operation;
}

/** @returns {Promise<import('../user-data').UserDataReadResult>} */
async function readPersistedUserData() {
  // 等排在前面的写入结束；一次失败不永久阻塞之后的读取或重试。
  await pending.catch(() => {});
  const { readUserData } = require('../user-data');
  const seed = readUserData();
  const loaded = await loadAt(seed.filePath);
  return loaded.isNew ? { ...loaded, data: { ...seed.data, ...loaded.data } } : loaded;
}

/** @param {Record<string,unknown>} document */
function writePersistedUserData(document) {
  const { resolveUserDataPath } = require('../user-data-paths');
  const { writeUserData } = require('../user-data');
  const settings = record(document.settings) ? document.settings : {};
  const seed = typeof settings.userDataPath === 'string' && settings.userDataPath ||
    (typeof document.userDataPath === 'string' ? document.userDataPath : '');
  return saveAt(resolveUserDataPath(seed), document, value => writeUserData(value));
}

module.exports = { readPersistedUserData, writePersistedUserData, loadAt, saveAt };
