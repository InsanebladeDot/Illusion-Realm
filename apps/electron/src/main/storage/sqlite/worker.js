/**
 * 独占 SQLite 连接的工作线程，让同步数据库调用离开 Electron 窗口主线程。
 * 同一线程按消息顺序处理事务，不并行使用同一个原生句柄。
 * 原始数据库错误可能含文件名、用户输入或路径，回复只带固定错误类别。
 * 关闭请求排在已有消息之后，确认之前的提交完成再释放数据库连接。
 * 此文件随 src 目录递归白名单分发，不依赖渲染页面、Next 服务端或额外 Node 进程。
 * 未作为 Worker 运行时不打开连接，模块审计 require 不会触碰用户目录。
 */
const { parentPort, workerData } = require('node:worker_threads');
const { openConnection } = require('./connection');
const { batch, select } = require('./engine');

/**
 * @param {unknown} error
 * 仅这些由本模块体系产生的固定文本可以回传；原生异常的 message 不直接跨线程。
 * 约束失败统一保留类别，调用方仍需依据自己的领域规则解释错误。
 * 不把数据库损坏当成空库，初始化失败会保持明确失败状态。
 * 代码不包含用户 SQL 文本或绝对路径，可用于脱敏日志与后续 i18n 映射。
 * @returns {string}
 */
function errorCode(error) {
  // 自定义结构错误的文本本身就是固定类别，可以原样用于主线程决策。
  // 原生 errcode 的低八位是主要 SQLite 错误号，扩展外键号也能归入约束失败。
  // UNIQUE、CHECK、外键失败都属于约束类别，不把具体用户值拼进错误说明。
  // 磁盘错误、权限错误和其他原生失败统一使用操作失败，不泄露文件位置。
  // 这里没有把任意以 SQLITE 开头的用户文字当成可信类别。
  // code 白名单必须与客户端可接受的固定错误标识共同维护。
  // 输入错误由引擎抛出固定文本，不需要再提取不可靠的英文异常片段。
  // 不记录 error.stack，Node 文件操作堆栈可能含真实用户路径。
  // 分类错误不表示可以自动重试；尤其事务提交失败需要先核对最终状态。
  // 本层尚未接 UI，今后给用户的说明应由领域服务映射到已有国际化词条。
  const allowed = ['SQLITE_INVALID_ARGUMENT', 'SQLITE_FUTURE_VERSION', 'SQLITE_SCHEMA_MISMATCH', 'SQLITE_FOREIGN_DATABASE', 'SQLITE_MIGRATION_MISMATCH', 'SQLITE_INVALID_STORED_DATA'];
  if (error instanceof Error && allowed.includes(error.message)) return error.message;
  if (error && typeof error === 'object' && 'errcode' in error && typeof error.errcode === 'number' && (error.errcode & 255) === 19) return 'SQLITE_CONSTRAINT';
  return 'SQLITE_OPERATION_FAILED';
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * 健康信息只返回版本和约束设置，不扫描用户资产或泄露数据库位置。
 * 核对的是当前连接的真实 PRAGMA，不是配置文件里希望生效的字符串。
 * table_count 是结构表数，不是已经迁移的历史数。
 * journal_mode 在内存测试中可能为 memory，磁盘回归另行断言 wal。
 */
function status(db) {
  // sqlite_version 查询的是当前内置引擎，不是系统上外装程序的版本。
  // user_version 来自文件头，和内存里硬编码的期望版本分别核对。
  // foreign_keys 是每条连接的设置，不能因 schema 写了 REFERENCES 就假定已生效。
  // journal_mode 是数据库当前实际模式，磁盘测试明确要求返回 wal。
  // tableCount 排除内部表，结构升级时回归应独立检查预期业务表目录。
  // 不返回业务行数，避免安装动作误被解释为历史同步或迁移完成。
  // 不返回 SQLite 的原始连接对象，因为原生句柄不能跨线程克隆。
  // 信息量固定，不随资产总数增长，适合初始化等待与后续健康检查。
  // 这些读取在工作线程完成，不占用窗口主线程的同步文件 API。
  // 状态请求不会创建假任务或补默认工程，以免新库影响用户已有工作区。
  return {
    sqlite: db.prepare('SELECT sqlite_version() AS value').get()?.value,
    schemaVersion: db.prepare('PRAGMA user_version').get()?.user_version,
    foreignKeys: db.prepare('PRAGMA foreign_keys').get()?.foreign_keys,
    journalMode: db.prepare('PRAGMA journal_mode').get()?.journal_mode,
    tableCount: db.prepare("SELECT count(*) AS value FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.value,
  };
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {import('node:worker_threads').MessagePort} port
 * @param {Map<string, import('node:sqlite').StatementSync>} statements
 * @param {unknown} message
 * 只有固定动作种类可执行；未知消息不会被当成 SQL 字符串处理。
 * batch 的参数在引擎内完整验证，不依赖发送方已经校验过一次。
 * close 先关闭连接再回复，调用方收到成功后可以重新打开相同文件。
 * 失败回执保留请求编号，别的并发查询不会收到本次写入的错误。
 * 执行器为同步 SQLite，每个事件处理完成才开始下一个消息。
 * 不在此处无限重试锁冲突，五秒 busy_timeout 后错误交回具体请求。
 */
function receive(db, port, statements, message) {
  // 消息 id 只用于本实例回执，不能据此推断用户、任务或节点的业务身份。
  // 非法信封直接忽略，主线程的等待上限仍能结束错误调用而非无限挂起。
  // kind 来自主进程固定联合类型，运行时仍按分支拒绝未知值。
  // batch 与 select 各自做完整参数验证，不因它们来自同一应用就信任形状。
  // explain 只能执行只读目录模板，不能作为绕开写入事务的诊断后门。
  // status 不接受任意 PRAGMA 名称，连接设置只能由 openConnection 控制。
  // close 先完成 db.close，成功回执不是“已经开始关闭”的乐观提示。
  // 关闭成功后清空 Statement Map，避免 JS 引用继续持有原生包装对象。
  // port.close 发生在发送回执之后，确保正常调用者有机会收到确认。
  // 原生调用为同步，Worker 在处理单条消息时不会被下一条业务消息重入。
  // 一个 batch 的回滚也在当前消息内完成，后续请求不会插入其事务中间。
  // catch 只对应本请求，不因普通约束错误关闭整个可继续使用的数据库。
  // 结构错误发生在初始化阶段，尚未注册此消息监听，不会继续接收业务操作。
  // 成功结果通过 postMessage 复制，不把 Statement 或数据库句柄传给主线程。
  // 回执包含编号，读取完成速度不同也不能把 A 请求数据交给 B 请求。
  // 错误回执没有原始 SQL、参数或路径，日志不需要再从异常文本脱敏。
  // 线程关闭是本连接的生命周期，不向主进程发 app.quit 或关闭用户窗口。
  // 操作失败不生成假成功 data 字段，调用方必须处理拒绝的 Promise。
  if (!message || typeof message !== 'object' || !('id' in message) || !Number.isSafeInteger(message.id) || !('kind' in message)) return;
  const id = message.id;
  try {
    const input = 'input' in message ? message.input : undefined;
    let result;
    if (message.kind === 'batch') result = batch(db, statements, input);
    else if (message.kind === 'select' || message.kind === 'explain') result = select(db, statements, input, message.kind === 'explain');
    else if (message.kind === 'status') result = status(db);
    else if (message.kind === 'document') result = require('./document-store').handleDocument(db, input);
    else if (message.kind === 'library') result = require('./library-store').handleLibrary(db, input);
    else if (message.kind === 'downloads') result = require('./download-store').handleDownloads(db, input);
    else if (message.kind === 'close') { db.close(); statements.clear(); result = null; }
    else throw new Error('SQLITE_INVALID_ARGUMENT');
    port.postMessage({ id, success: true, data: result });
    if (message.kind === 'close') port.close();
  } catch (error) {
    port.postMessage({ id, success: false, code: errorCode(error) });
  }
}

// workerData 由主进程构造，仍按 unknown 缩窄，避免测试或未来调用误传对象。
// 开库失败使用 id=0 的启动错误，不让调用者一直等待第一条查询的回执。
// 主线程收到启动错误后会结束本实例，不能继续向失败的 Worker 排队。
// 线程退出由 MessagePort 关闭驱动，不残留测试窗口或后台数据库进程。
if (parentPort) {
  // require 本模块用于静态审计时 parentPort 为空，不会在主线程开第二个 SQLite。
  // Worker 文件路径是应用代码位置，workerData.filePath 才是独立的用户数据位置。
  // 两者不混用，安装包源码归档保持只读，业务库写到用户目录。
  // filePath 缩窄失败用固定输入错误，不能把传入对象打印到控制台。
  // 初始化成功后才安装监听器，队列里的第一条命令会等待连接准备完成。
  // 初始化期间发送的消息由 Node 排队，不需要人为假延时轮询“数据库可用”。
  // statements 在该线程内创建，不能与另一个数据库文件共用。
  // 原生初始化异常被捕获后只发送错误类别，主线程不会收到机器路径堆栈。
  // port 关闭让失败线程自然结束，没有后台无限重试计时器。
  // 系统强杀时无法执行这段收尾，SQLite 的 WAL 恢复由下次合法开库处理。
  const port = parentPort;
  try {
    const input = /** @type {unknown} */ (workerData);
    if (!input || typeof input !== 'object' || !('filePath' in input) || typeof input.filePath !== 'string') throw new Error('SQLITE_INVALID_ARGUMENT');
    const db = openConnection(input.filePath);
    const statements = new Map();
    port.on('message', message => receive(db, port, statements, message));
  } catch (error) {
    port.postMessage({ id: 0, success: false, code: errorCode(error) });
    port.close();
  }
}
