/**
 * SQL 在 Worker 执行，不阻塞窗口；回执像取号单，按编号交给各自调用方。
 * 写入超时表示结果未知，先核对稳定 ID，不能当作已取消或自动重试。
 */
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { validateAction, validateBatch } = require('./engine');

/**
 * @typedef {{resolve:(value:unknown)=>void,reject:(error:Error)=>void,timer:NodeJS.Timeout}} Pending
 * 每个请求独立持有计时器，收到回执或实例失败时清除。
 */

class SqliteClient {
  /**
   * @param {string} filePath
   * 仅供主进程传入绝对数据库路径；创建者负责结束时 await close。
   * 初始化失败由第一条请求报告，线程错误和退出都要结束等待。
   */
  constructor(filePath) {
    // Worker 相对本文件定位，不依赖当前目录；pending 仅保留在途请求。
    if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.sqlite') throw new Error('SQLITE_INVALID_ARGUMENT');
    this.worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: { filePath } });
    /** @type {Map<number,Pending>} */
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    this.closing = false;
    /** @type {Promise<void>|undefined} */
    this.closePromise = undefined;
    this.worker.on('message', message => this.settle(message));
    this.worker.on('error', () => this.fail('SQLITE_WORKER_FAILURE'));
    this.worker.on('exit', () => { if (!this.closed) this.fail('SQLITE_WORKER_EXIT'); });
  }

  /**
   * @param {string} code
   * 线程失败结束所有等待，不重放可能已经提交的写入。
   */
  fail(code) {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(code));
    }
    this.pending.clear();
  }

  /**
   * @param {unknown} message
   * 按编号结算，忽略迟到或重复回执；编号 0 表示整个实例初始化失败。
   */
  settle(message) {
    if (!message || typeof message !== 'object' || !('id' in message) || typeof message.id !== 'number' || !('success' in message)) return;
    const code = 'code' in message && typeof message.code === 'string' && /^SQLITE_[A-Z_]+$/.test(message.code) ? message.code : 'SQLITE_OPERATION_FAILED';
    if (message.id === 0) { this.fail(code); return; }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.success === true && 'data' in message) pending.resolve(message.data);
    else pending.reject(new Error(code));
  }

  /**
   * @param {'status'|'select'|'explain'|'batch'|'document'|'downloads'|'library'|'close'} kind
   * @param {unknown} [input]
   * @returns {Promise<unknown>}
   * 30 秒包含排队时间；超时终止实例并报告结果未知，不能自动重试写入。
   * 最多保留 50 个在途请求，close 留有名额；发送失败只清理本次等待。
   */
  request(kind, input) {
    if (this.closed || this.closing && kind !== 'close') return Promise.reject(new Error('SQLITE_CLOSED'));
    if (this.pending.size >= 50 && kind !== 'close') return Promise.reject(new Error('SQLITE_BUSY'));
    try {
      if (kind === 'batch') input = validateBatch(input);
      if (kind === 'select' || kind === 'explain') input = validateAction(input);
    } catch { return Promise.reject(new Error('SQLITE_INVALID_ARGUMENT')); }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail('SQLITE_OUTCOME_UNKNOWN');
        void this.worker.terminate().catch(() => {});
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, kind, input }); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('SQLITE_INVALID_ARGUMENT')); }
    });
  }

  /**
   * @returns {Promise<void>}
   * 重复关闭共用一个 Promise，先处理已排队请求再停线程；不手动删除 WAL/SHM。
   */
  close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (this.closed ? Promise.resolve() : this.request('close')).then(() => {}).finally(async () => {
      this.closed = true;
      await this.worker.terminate();
    });
    return this.closePromise;
  }
}

/**
 * 数据库与实际用户 JSON 同目录、同名前缀，沿用原路径解析规则；这里只定位，不迁移数据。
 * @returns {{client:SqliteClient,filePath:string}}
 */
function openBusinessDatabase() {
  const { readUserData } = require('../user-data');
  const { filePath: userFile } = readUserData();
  const filePath = path.join(path.dirname(userFile), `${path.basename(userFile, path.extname(userFile))}.sqlite`);
  return { client: new SqliteClient(filePath), filePath };
}

// 暂不在现有 JSON 写入链里双写，避免旧界面以为两份数据已经保持事务一致。
// 后续迁移按业务域接入本服务，并在应用退出时持有并关闭相应实例。
// 本助手供初始化和 SQL 专项使用；业务适配器另以请求作用域管理连接。
module.exports = { SqliteClient, openBusinessDatabase };
