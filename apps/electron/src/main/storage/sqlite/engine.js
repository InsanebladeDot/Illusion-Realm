/**
 * 固定 SQL 的参数校验、预编译缓存与事务执行，真正的数据库调用只在工作线程运行。
 * 这是主进程内部接口，不能被当成可接收任意 SQL 的 IPC 通道。
 * 像把一组转账凭条一起盖章：任何一张失败，整组撤回，而不是留下半套关系。
 * 只有命名目录中的查询可以预编译；输入文本始终作为绑定值处理。
 * 缓存规模不会超过固定目录条数，不随每个文件名产生新 SQL 和无限缓存。
 * 每次 batch 最多一百项；导入大历史时应分批并设计迁移检查点。
 */
const { QUERIES } = require('./queries');

/**
 * @typedef {{name: string, params: (string|number|null)[]}} Action
 * 这些值只包含标量，不接受函数、媒体字节、嵌套对象或 SQL 片段。
 * 引号、注释符和问号在字符串里只是数据，不会再次作为 SQL 解析。
 */

/**
 * @param {unknown} value
 * 先检查形状再读字段，未知消息不能因直接解引用而让工作线程崩溃。
 * 单个文本参数上限 128Ki 字符，避免误把整段 Base64 送入写入队列。
 * 数值必须有限，NaN/Infinity 不能借结构化克隆混进坐标或时间字段。
 * 具体整数、枚举、外键和关系边界继续由 STRICT 与 CHECK 处理。
 * SQL 名称必须为目录自身属性，constructor/toString 不会被当成可执行动作。
 * 分页明确验证整数范围，负数 LIMIT 不能绕过返回数量限制。
 * @returns {Action}
 */
function validateAction(value) {
  // name 和 params 两个字段构成最小调用信封，额外字段不会进入规范结果。
  // 不接受数组本身充当 params 之外的整个请求，也不读取其 prototype 属性执行动作。
  // Object.hasOwn 防止把对象原型上的 constructor 当成目录动作。
  // params 必须是数组，位置对应由固定 SQL 定义，而非对象键的遍历顺序。
  // 缺少一项和多出一项都拒绝，避免 SQL 调整后旧调用悄悄绑定错位置。
  // NULL 是明确的未知或不适用值，不能与 undefined 混为同一输入。
  // 布尔值不能隐式写成整数，状态与开关应由对应领域契约显式表示。
  // 媒体 Buffer 和 Uint8Array 都不是允许参数，本库不接原件字节上传。
  // 文本限制按 JavaScript 字符串长度执行，不需要先编码一份大 Buffer 才能估算。
  // 有限数字还需在安全整数范围内，避免写进 SQLite 后无法精确读回 JavaScript。
  // REAL 坐标可以有小数，不能为统一校验把所有数字都强制取整。
  // 原生 STRICT 继续检查目标列类型，有限小数不因此能写进 INTEGER 时间列。
  // page 索引来自可信目录，不从调用方请求里读取分页字段位置。
  // 页大小为负会使 SQLite 取消限制，所以必须在准备语句之前拒绝。
  // 页大小非整数同样拒绝，不能靠 SQLite 的隐式转换猜测用户想要几行。
  // 参数内的单引号不做手工替换，重复转义反而会改变真实文件名或提示词。
  if (!value || typeof value !== 'object' || !('name' in value) || !('params' in value)) throw new Error('SQLITE_INVALID_ARGUMENT');
  const { name, params } = value;
  if (typeof name !== 'string' || !Object.hasOwn(QUERIES, name) || !Array.isArray(params)) throw new Error('SQLITE_INVALID_ARGUMENT');
  const query = QUERIES[name];
  if (params.length !== query.arity || !params.every(item => item === null || typeof item === 'string' && item.length <= 131072 || typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= Number.MAX_SAFE_INTEGER)) throw new Error('SQLITE_INVALID_ARGUMENT');
  if (query.page !== undefined && (!Number.isInteger(params[query.page]) || params[query.page] < 1 || params[query.page] > 200)) throw new Error('SQLITE_INVALID_ARGUMENT');
  return { name, params };
}

/**
 * @param {unknown} actions
 * 批次在主进程发送前和工作线程执行前都验证，不能先克隆巨量参数再拒绝。
 * 文本按 UTF-16 内容体积估算，一批最多约 1MiB，不含 JavaScript 对象自身开销。
 * 一百条上限只能限制行数，额外的内容上限防止一百条超长提示词堆积。
 * 不接受读动作混入批次，调用方不能误把某个 SELECT 的结果当成写入计数。
 * 返回已缩窄动作供执行使用，避免验证后又回头读取未经检查的原始对象形状。
 * @returns {Action[]}
 */
function validateBatch(actions) {
  // 空批次不生成看似保存成功的空事务，调用方应知道自己没有提交任何事实。
  // 超过一百项直接拒绝，避免一个业务请求长期占据唯一写者。
  // 校验后形成新的动作数组，附带的 UI 状态和回调字段不会进入 Worker 消息。
  // 原始数组只读检查，不在调用者持有的对象上就地修改参数。
  // 内容预算包含每个参数，不能只检查第一条或只检查最长字符串。
  // NULL 与数值按固定小额估算，主要拦截多条长正文累积造成的内存膨胀。
  // 这是内容预算而非精确堆占用，字符串对象和消息信封仍有少量额外开销。
  // 五十个请求的背压与一批一 MiB 的预算共同限定在途数据规模。
  // 不把数组 JSON.stringify 再计算长度，避免为了校验又复制一份巨量字符串。
  // SELECT 不能混在写批次里，结果类型不会在 records 和 changes 之间随动作变动。
  // 失败时还未开启事务，因此不需要对参数错误做磁盘回滚。
  // 业务层可以在上游将大迁移分成有检查点的小批，不用放宽这里的上限。
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 100) throw new Error('SQLITE_INVALID_ARGUMENT');
  const validated = actions.map(validateAction);
  let bytes = 0;
  for (const action of validated) {
    for (const value of action.params) bytes += typeof value === 'string' ? value.length * 2 : 8;
  }
  if (bytes > 1048576 || validated.some(action => !QUERIES[action.name].write)) throw new Error('SQLITE_INVALID_ARGUMENT');
  return validated;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Map<string, import('node:sqlite').StatementSync>} statements
 * @param {string} name
 * 一个目录动作只编译一次，翻页只更换绑定值，不重新生成不同的 SQL 字符串。
 * 名称已经由 validateAction 校验，缓存键不来自用户文件内容。
 * 原生 Statement 只在所属线程使用，不放入工作线程消息或用户文档。
 * 关闭连接会释放语句持有的资源，调用方不把缓存保存到应用全局。
 */
function statement(db, statements, name) {
  // 缓存值是本连接的原生语句，不能被另一个数据库文件复用。
  // 只编译可信目录模板，用户文件名不会形成新的缓存键。
  // 参数值不进入 SQL 模板，因此每页不同游标仍命中同一个缓存项。
  // SQLite 准备失败不会写入 Map，下一次不会取到半初始化语句。
  // 表结构在开库时已核对版本，正常请求中不运行 DDL 使缓存突然失效。
  // statements 数量受目录动作数限制，不需要按访问热度额外维护复杂 LRU。
  // 诊断 EXPLAIN 不用这个缓存，避免给每种模板再长期保存一份计划语句。
  // 本层不创建共享连接池，减少多个窗口各自维护一份原生缓存的开销。
  if (!statements.has(name)) statements.set(name, db.prepare(QUERIES[name].sql));
  return /** @type {import('node:sqlite').StatementSync} */ (statements.get(name));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Map<string, import('node:sqlite').StatementSync>} statements
 * @param {unknown} actions
 * 先验证整组动作，再开启事务，输入错误不需要拿磁盘写锁。
 * 只接受修改动作，读取走 select，避免调用方误把查询结果当作已提交修改。
 * BEGIN IMMEDIATE 提前确定唯一写者，后续关系插入不会执行到一半才发现锁冲突。
 * COMMIT 完成后才返回 changes，不能把语句开始执行当成保存成功。
 * 中间外键、唯一键或范围检查失败，前面已经执行的插入也必须撤回。
 * 操作系统文件复制不属于这个事务，需要业务适配层另做落盘补偿。
 * 不使用 INSERT OR REPLACE，避免它隐式删除父行而触发关系级联。
 * 不自动重试超时写入，调用方须先核对结果未知的请求是否已经提交。
 */
function batch(db, statements, actions) {
  // 返回 changes 数组与动作顺序一致，便于识别哪个过期更新没有被接受。
  // changes=0 可以是合法的旧 revision 拒绝，不能统一改成一条成功写入。
  // 语句执行结果不包含敏感异常文本，异常在 Worker 外边界转换成稳定类别。
  // INSERT 保留唯一冲突，使重复实体身份暴露出来，不静默覆盖原记录。
  // 多个实体按父表到子表顺序插入，SQLite 默认即时校验外键而非延后到提交。
  // 一条关系失败后不会继续处理后续动作，整批事务立即进入回滚路径。
  // 只有所有语句和 COMMIT 都成功后才返回修改数量。
  // COMMIT 失败也进入回滚尝试，不能因为插入语句都执行过就当作已保存。
  // 失败后连接仍可处理下一次明确请求，不把一次约束错误变成永久不可用实例。
  // 这不是磁盘文件事务，复制媒体失败应在上游避免登记或执行补偿。
  // 不在事务里等待 UI、网络或另一个 Worker 的响应，减少写锁持有时间。
  // 锁冲突没有隐式重放，非幂等插入不能在结果未知时偷偷再执行一次。
  const validated = validateBatch(actions);
  db.exec('BEGIN IMMEDIATE');
  try {
    const changes = validated.map(action => Number(statement(db, statements, action.name).run(...action.params).changes));
    db.exec('COMMIT');
    return { changes };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* 由工作线程错误边界返回最初的失败类别。 */ }
    throw error;
  }
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Map<string, import('node:sqlite').StatementSync>} statements
 * @param {unknown} action
 * @param {boolean} [explain]
 * 只读和执行计划共享同一参数规则，测计划时不改成另一个更容易走索引的查询。
 * EXPLAIN QUERY PLAN 不执行写入；写动作在进入这里时就被拒绝。
 * all 只读取有分页硬上限的命名查询，避免返回整张历史表。
 * 返回值留在主进程，未来 IPC 必须选择业务字段并通过现有 IpcResult 包装。
 * 计划不做字符串伪装；测试直接核对 SQLite 给出的索引名称与临时排序情况。
 */
function select(db, statements, action, explain = false) {
  // 所有已登记读取都有页上限或主键单行条件，没有开放全库任意导出命令。
  // 参数在这里再次绑定，EXPLAIN 与真实查询使用完全相同的游标条件。
  // 查询目录的 write 标记拒绝通过 select 偷跑 INSERT 或 DELETE。
  // 不允许调用者指定 ORDER BY 列名，避免把字段拼接变成另一种 SQL 注入。
  // asset.page 的同毫秒排序用稳定 ID 补齐，结果不依赖物理行顺序。
  // history.page 的正文摘要限制在 SQL 层执行，不能先读全量再由页面截断。
  // 详细提示词只按主键读取，界面不打开详情时无需跨线程搬运完整正文。
  // EXPLAIN 结果仅用于诊断和回归，不缓存成永远不会变化的“性能已通过”标记。
  // SQLite 统计信息和数据分布可能改变计划，未来新查询需要重新验证索引效果。
  // 读操作没有显式长事务，避免一个历史列表把 WAL 的旧快照长期钉住。
  const item = validateAction(action);
  if (QUERIES[item.name].write) throw new Error('SQLITE_INVALID_ARGUMENT');
  if (explain) return db.prepare(`EXPLAIN QUERY PLAN ${QUERIES[item.name].sql}`).all(...item.params);
  return statement(db, statements, item.name).all(...item.params);
}

// 直接连接的测试可以验证触发器反证；生产调用仍由 worker 持有句柄。
// 这里不导出执行任意文本 SQL 的包装，避免后续误把它接到渲染层。
// 数据库异常的原始文本可能含数据内容，必须在 worker 边界脱敏。
module.exports = { batch, select, validateAction, validateBatch };
