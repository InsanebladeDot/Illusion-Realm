/** 下载快照保留原串行接口，底层改为 SQLite；进度事件仍只在内存更新。 */
const path = require('node:path');
const { app } = require('electron');
const { loadQueueAt, saveQueueAt } = require('../../../storage/sqlite/download-queue');
/** @typedef {import('./model-download-records').SavedDownload} SavedDownload */
/** @type {Promise<void>} */
let pending = Promise.resolve();
const queueFile = () => path.join(app.getPath('userData'), 'model-download-queue.json');

/**
 * @param {SavedDownload[]} records
 * 接收时固定快照；像按交付顺序装订账页，旧进度不能晚于完成状态覆盖。
 * 失败只解除后续请求阻塞，当前写入仍拒绝；正常退出继续 await 原保存链。
 */
function saveQueue(records) {
  const snapshot = structuredClone(records);
  const filePath = queueFile();
  const operation = pending.catch(() => {}).then(() => saveQueueAt(filePath, snapshot));
  pending = operation;
  return operation;
}

/** @returns {Promise<SavedDownload[]>} */
async function loadQueue() {
  await pending;
  return loadQueueAt(queueFile());
}

module.exports = { saveQueue, loadQueue };
