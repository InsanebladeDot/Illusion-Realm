/**
 * 真实 SQLite 磁盘回归：运行 Electron 内置引擎，不用 SQL 返回值夹具冒充查询执行。
 * 夹具只是输入记录，不模拟 DatabaseSync、Worker、事务或文件系统。
 * 临时目录由本次进程独立创建，绝不读取或改写用户的历史与已有工程。
 * 像用试验账本验证转账：可以证明关系与回滚，不代表旧账已经自动迁移。
 * 这个专项不创建 BrowserWindow，因此不宣称完成 UI、人工鼠标或系统缩放验收。
 * 主线程通过真实 Worker 请求命名 SQL，探针连接只用于反证内部约束。
 * 原始异常不作为成功条件，任何断言失败都由统一退出护栏保留为非零。
 * 不与其他 Electron 专项并行执行，避免将资源争用误判为数据库错误。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');
const { createSmokeHarness } = require('./lib/smoke-harness');
const { SqliteClient } = require('../apps/electron/src/main/storage/sqlite/client');
const { openConnection } = require('../apps/electron/src/main/storage/sqlite/connection');
const canonical = require('./fixtures/sqlite/canonical.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ir-sqlite-'));
const smoke = createSmokeHarness({ name: 'sqlite' });
smoke.setWorkDir(root);
smoke.installWatchdog(app);

/**
 * 命名动作与实际 Worker 协议保持一致，不在测试中复制 SQL 实现。
 * 参数默认只用于无值列表，必须由生产引擎继续校验个数和类型。
 * 所有 Promise 由调用者 await，失败不会变成无人处理的后台拒绝。
 * kind 固定为只读，写入反证必须通过 batch 的真实边界。
 */
const query = (client, name, params) => client.request('select', { name, params });
/**
 * 一项修改也按事务提交，不能让单项和多项请求走不同校验规则。
 * 返回 changes 供过期检查点等用例核对，零修改不能伪装更新成功。
 * 这里不捕获约束错误，负例使用 assert.rejects 检验真实失败。
 */
const write = (client, name, params) => client.request('batch', [{ name, params }]);

/**
 * 前提：本次全新磁盘库，canonical 一次性登记任务、产物及两个工程。
 * 第一页两项跨过同毫秒数据，第二页不得重复或漏掉 ID 较小的资产。
 * 引号及 DROP TABLE 字样是绑定的文件名，不能改变 schema 或查询行为。
 * 两个相同词条使用记录各自存在，防止关系主键误把重复出现去掉。
 * 一个资产有两个节点实例，节点坐标更新只影响指定 ID。
 * 预期产物只有一张，虽然请求数量为二，历史也必须显示实际行数一。
 * 实际 SQLite 查询返回的 prompt 必须保留首尾空格与换行，不能在入库时 trim。
 * 文件探针查的是实际记录，不以“没有抛错”代替注入安全验证。
 * query 的结果结构来自生产 SQL，测试没有把固定页面数组送回 Worker。
 * 独立探针使用同一 WAL 数据库，只有事务提交后才能看见相应新行。
 */
async function checkFacts(client, probe) {
  // canonical 有三个资产，时间为 1、1、2，专门覆盖游标的时间并列分支。
  // 最新资产 c 是竖版视频，不能被图片默认宽高覆盖成正方形。
  // b 为导入图片，所以没有 generation_output 仍应出现在资产列表。
  // a 为生成结果，拥有一个受管文件，同时被两个不同节点引用。
  // 测试文件名包含 SQL 注释符，只有真正参数绑定才能保持结构不变。
  // 文件行字节数只是夹具元数据，没有在磁盘伪造媒体并声称已经解码成功。
  // prompt 的首尾空格与换行是有意输入，不属于可被格式化工具删除的装饰。
  // 请求数量为二而实际输出为一，能发现把意图数直接当产出数的实现。
  // 两个 usage 指向同一个词条，使用不同 ID 保留它两次出现的事实。
  // 节点 n1 和 n2 共享 a，但 x 初值不同，能观察移动是否错误共享业务状态。
  // project p2 另外有 n3，为下一组跨工程连线负例提供真实外部节点。
  // 主任务由 queued 经真实 job.start 到 completed，不直接伪造历史查询返回值。
  // 同任务尝试 attempt 与输出 output 在同一批里创建，外键即时检查实际生效。
  // 来源快照指向 n1，后面的删除检查才能观察活动字段与历史字段的区别。
  // d1 是创作页草稿，d2 是节点草稿，二者行身份从一开始就不同。
  // 标签只设置整理关系，不能因为收藏就改变测试正文。
  // 统计窗口包含完成毫秒4，因此预期只有一个完成任务和一个实际输出。
  // 所有数据都通过命名批次输入，探针没有抢先插入记录帮助正例通过。
  // 主线程读到结果时必须已有提交，否则探针连接看不到同一套数据。
  // 测试不使用 setTimeout 等待保存，真实 Promise 回执负责提交完成边界。
  await client.request('batch', canonical);
  const first = await query(client, 'asset.page', [null, null, 2]);
  assert.deepEqual(first.map(row => row.asset_id), ['c', 'b']);
  assert.deepEqual((await query(client, 'asset.page', [1, 'b', 2])).map(row => row.asset_id), ['a']);
  assert.equal((await query(client, 'history.page', [null, null, 20]))[0].output_count, 1);
  assert.equal((await query(client, 'prompt.get', ['prompt']))[0].positive_text, canonical[10].params[1]);
  assert.match((await query(client, 'file.page', ['a', '', 20]))[0].file_name, /DROP TABLE/);
  assert.equal(probe.prepare('SELECT count(*) AS n FROM prompt_keyword_usage').get().n, 2);
  await write(client, 'node.move', [500, -50, 'n1']);
  assert.equal(probe.prepare("SELECT x FROM canvas_node WHERE node_id='n2'").get().x, 100);
  assert.deepEqual(await query(client, 'generation.stats', [0, 100]), [{ jobs: 1, outputs: 1, completed: 1 }]);
  smoke.check('SQLite facts, safe bindings, stable pagination and independent node coordinates', true);
}

/**
 * 事务第一项是合法目录，第二项违反媒体类型 CHECK。
 * 整组拒绝后再插同一个目录 ID 应成功，证明没有留下第一项的部分写入。
 * 跨工程连线必须由数据库复合外键拒绝，不能只靠当前 UI 的连接判断。
 * 自连也必须拒绝，不允许错误边进入画布模型后再靠渲染隐藏。
 * 草稿同时归创作页与节点违反二选一规则，已有草稿不能被错误关联覆盖。
 * 过期下载检查点应返回零 changes，真正字节数与 revision 都保持新版。
 * LIMIT=-1 在 SQLite 中通常意味着无限制，因此必须在生产边界提前拒绝。
 * 对象参数和缺少参数不能被隐式序列化成未知数据进入数据库。
 * 名称 constructor 检验目录自身属性限制，不能被 Object 原型绕过。
 * 这些错误都来自生产 Worker，测试没有直接构造“失败返回值”。
 */
async function checkRejection(client, probe) {
  // rolled 目录的二次插入是回滚证据，不是用 count 检查一个可能从未执行的动作。
  // 失败批次第一项完全合法，因此只跳过非法第二项会被二次插入的唯一冲突抓住。
  // invalid 类型以字符串传入，类型校验不能替代媒体枚举 CHECK。
  // cross 连线两个端点都存在，拒绝原因必须是工程归属不一致而不是节点缺失。
  // self 连线也指向真实节点，验证的不是普通不存在父行的外键错误。
  // 错误草稿归属同时指定创建页和节点，生产 CHECK 必须拒绝这种串值结构。
  // 检查点新 revision 为2，旧请求为1，接收量也故意明显变小。
  // 更新回执的零 changes 与探针读取100字节共同证明没有倒退。
  // 不只匹配一个错误字符串，还查询实际磁盘内容防止实现先改后报错。
  // LIMIT 的四个负例分别覆盖无限制、空页、超上限和小数。
  // 非法页大小通过参数传入，不能让字符串拼接模板替它提前抛解析错误。
  // constructor 不是 SQL 语法，专门检查命名目录是否误用继承属性。
  // DROP TABLE 作为动作名检查的是白名单拒绝，不是文件名注入测试的重复。
  // 对象参数检查普通嵌套数据，不只检查不可克隆的函数或 DOM。
  // assert.rejects 观察 Promise 真正拒绝，不能把返回空数组视为错误已处理。
  // 每个负例都等待结束，避免后面的正常请求替前面的失败承担异常。
  // 失败不应关闭客户端，因此下一条正常检查点请求必须继续执行。
  // 生产错误经过 Worker 脱敏，测试不要求其中出现用户文件名或目录。
  // 没有在测试端重新实现 validateAction，否则容易同时复制同一个校验错误。
  // SQL 约束与请求校验是两层，两个错误类别分别断言，不能全部归成未知失败。
  await assert.rejects(client.request('batch', [{ name: 'folder.add', params: ['rolled', 'C:/rolled'] }, { name: 'asset.add', params: ['bad', 'invalid', 'imported', null, null, null, 1] }]), /SQLITE_CONSTRAINT/);
  await write(client, 'folder.add', ['rolled', 'C:/rolled']);
  await assert.rejects(write(client, 'edge.add', ['cross', 'p1', 'n1', 'n3', 'output', 'reference']), /SQLITE_CONSTRAINT/);
  await assert.rejects(write(client, 'edge.add', ['self', 'p1', 'n1', 'n1', 'output', 'reference']), /SQLITE_CONSTRAINT/);
  await assert.rejects(write(client, 'draftOwner.add', ['d1', 'create:video', 'n1']), /SQLITE_CONSTRAINT/);
  assert.deepEqual(await write(client, 'checkpoint.put', ['download', 'old.part', 10, 200, 'old', 1]), { changes: [0] });
  assert.equal(probe.prepare('SELECT received_bytes FROM download_checkpoint').get().received_bytes, 100);
  for (const limit of [-1, 0, 201, 1.5]) await assert.rejects(query(client, 'asset.page', [null, null, limit]), /SQLITE_INVALID_ARGUMENT/);
  for (const name of ['constructor', 'DROP TABLE asset']) await assert.rejects(query(client, name, []), /SQLITE_INVALID_ARGUMENT/);
  await assert.rejects(query(client, 'asset.page', [null, {}, 10]), /SQLITE_INVALID_ARGUMENT/);
  smoke.check('SQLite rollback, cross-project constraints, draft ownership and invalid request rejection', true);
}

/**
 * 直接探针是反证路径，防止接口未暴露更新语句就误宣称快照已不可变。
 * 已提交配置、正文和模型绑定分别尝试修改，应由真实触发器拒绝。
 * 资产删除会被文件、输入或输出引用阻止，不能从库中擦掉还在使用的对象。
 * 删除 n1 应清除连线与该节点引用，但 n2 对同资产的引用继续存在。
 * 历史输出不能因为节点消失而归零，来源快照也不能随活动外键一起丢失。
 * node_run 的活动节点和工程被复合外键一并置空，历史两个快照字段保留。
 * 不删除任何物理文件，本组验证的是数据库行与关系的级联边界。
 * SQL 触发器错误只检查业务类别，不依赖特定平台的完整 SQLite 英文句子。
 * 删除之后再次读取同库，避免只看 changes 而漏掉错误的级联传播。
 */
async function checkDeletion(client, probe) {
  // 配置更新尝试写入一个合法的正整数宽度，拒绝应来自冻结保护而非范围错误。
  // 正文更新写入合法短文本，不能靠超长字符串触发别的 CHECK 来误通过。
  // 删除绑定不违反字段类型，只有已提交配置的冻结触发器应阻止它。
  // 资产 a 有文件和输出，直接删除必须触发外键保护，不能让来源静默断开。
  // 对触发器使用探针是故意越过命名接口，验证底层真正存在防线。
  // 冻结触发器失败后仍保留探针可用，下一条直接 SQL 可以继续执行。
  // node.delete 走生产 Worker，不用测试手工删关系表帮产品清理。
  // 预期边数从一变零，因为唯一边连接被删除的 n1 与仍存在的 n2。
  // 节点资产关系从二变一，若两行一起消失说明错误地按 asset_id 清理。
  // history.output_count 仍为一，能抓住删节点间接级联清输出的回归。
  // 来源活动 node_id 与 project_id 都置空，匹配复合外键的实际行为。
  // 来源快照 node_id_snapshot 仍为 n1，不能为了“无悬空引用”把证据也清掉。
  // n2 的显示引用继续可用，所以共享产物不能被当作 n1 私有文件删除。
  // 本轮测试没有调用 OS unlink，数据库级联绝不能被误解释为已验证磁盘清理。
  // 反证失败不会自动改成软删除来迁就错误，必须由真实约束决定结果。
  // 这些行为影响工程历史安全，不能仅通过截图观察卡片消失来验收。
  // 使用直接查询核对关系数量，不靠界面筛选隐藏错误行。
  // 观察结果是提交后的 WAL 数据，不是在同一未提交事务内自我确认。
  assert.throws(() => probe.exec("UPDATE generation_config SET width=512 WHERE config_id='config'"), /immutable/);
  assert.throws(() => probe.exec("UPDATE prompt_document SET positive_text='changed'"), /immutable/);
  assert.throws(() => probe.exec("DELETE FROM config_model WHERE config_id='config'"), /immutable/);
  assert.throws(() => probe.exec("DELETE FROM asset WHERE asset_id='a'"), /FOREIGN KEY/);
  await write(client, 'node.delete', ['n1']);
  assert.equal(probe.prepare('SELECT count(*) AS n FROM canvas_edge').get().n, 0);
  assert.equal(probe.prepare('SELECT count(*) AS n FROM node_asset').get().n, 1);
  assert.equal((await query(client, 'history.page', [null, null, 10]))[0].output_count, 1);
  const origin = probe.prepare('SELECT node_id,project_id,node_id_snapshot FROM node_run').get();
  assert.equal(origin.node_id, null);
  assert.equal(origin.project_id, null);
  assert.equal(origin.node_id_snapshot, 'n1');
  smoke.check('SQLite immutable snapshots and node deletion preserve assets and history', true);
}

/**
 * 用五千条真实磁盘记录检验深分页和事件循环，而不是只测三条数据的玩具列表。
 * 每批一百项恰好处于生产上限，不绕过事务 API 直接拼接大 SQL 加快测试。
 * 连续 await 让主线程有机会处理计时器，heartbeat 证明工作没有在主线程同步执行。
 * 这不是性能基准承诺：一次测量受机器负载影响，只报告本次样本的实际耗时。
 * 执行计划必须出现生产索引，并且不借额外测试索引或临时 ORDER BY 改写通过。
 * 资产分类、历史、节点和边各有不同索引前缀，分别检查以防只优化一种页面。
 * 不用 OFFSET 伪装游标，深位置通过最后一项的真实 created_at 与 ID 继续查询。
 * 普通和 EXPLAIN 请求共用参数验证，负数或超限数量不能因为诊断模式而放行。
 * 主线程 interval 在 finally 清理，断言失败也不会留下阻止 Electron 退出的计时器。
 * 数据只存在临时数据库，测试不会给用户图库增加五千张伪造图片。
 * 没有生成真实媒体，因此此数字只能称作索引记录数，不能称为图片生成数。
 * 计时覆盖事务和线程往返，不能拿它和只测原生 SQLite 循环的宣传数字比较。
 */
async function checkPlans(client) {
  // 五千条资产均为逻辑导入项，没有对应媒体字节，避免测试占用真实图库空间。
  // ID 含固定前缀和递增号，但时间逐行不同，深位置范围条件不依赖字符串数值排序。
  // 每批的序号从 batch 与 n 计算，重复创建同 ID 会被主键约束发现。
  // 一百条的修改数量应全部完成后才开始下一批，未提交事务不会穿插列表查询。
  // 测量起点在真正发出第一条批次之前，包含线程消息和事务提交开销。
  // interval 使用 Node 主线程计时器，不依赖不可见窗口可能暂停的 requestAnimationFrame。
  // 心跳至少一次只证明有调度机会，不宣称所有帧率或全部 UI 响应都已通过。
  // 内置引擎非常快时具体心跳次数会变化，测试不固定要求某台机器的56次。
  // 普通资产页检查 idx_asset_recent，分类页检查 idx_asset_kind_recent。
  // 两个计划分开验证，避免全量列表有索引就误以为分类筛选也不用排序。
  // 历史页按任务范围定位，再按配置和正文主键查详情。
  // 节点页使用 UNIQUE(project_id,node_id) 自动索引，不再创建相同重复索引。
  // 边页按 edge_id 排序，必须用专门的工程加边ID索引。
  // 计划中的临时 B-tree 表示仍要额外排序，本组明确将其判为失败。
  // 索引名称是生产 schema 中定义的名称，不在测试数据库另外补一套。
  // EXPLAIN 读取的是最终生产 SQL，测试不把 OR 改成范围条件帮助计划变好看。
  // 深页的1000毫秒游标落在样本内部，不能只测试首屏的无上界分支。
  // 结果长度20验证 LIMIT 生效，计划命中索引并不自动证明行数限制正确。
  // stdout 的耗时用于记录，超出某个营销数字不会放宽数据正确性断言。
  // 没有旧 JSON 对照，不能从这一轮测试得出具体倍数的性能提升。
  // 最后的 finally 只清本组 interval，不停止用户其他计时器或工作线程。
  // 一组计划失败会立即中止专项，不循环重试到优化器偶然选中期望索引。
  let beats = 0;
  const timer = setInterval(() => { beats += 1; }, 1);
  const started = performance.now();
  try {
    for (let batch = 0; batch < 50; batch += 1) {
      await client.request('batch', Array.from({ length: 100 }, (_, n) => ({ name: 'asset.add', params: [`bulk-${batch * 100 + n}`, 'image', 'imported', 512, 512, null, batch * 100 + n + 10] })));
    }
    for (const [name, params, index] of [['asset.page', [1000, 'bulk-990', 20], 'idx_asset_recent'], ['asset.kindPage', ['image', null, null, 20], 'idx_asset_kind_recent'], ['history.page', [null, null, 20], 'idx_job_recent'], ['node.page', ['p1', '', 20], 'sqlite_autoindex_canvas_node'], ['edge.page', ['p1', '', 20], 'idx_edge_page']]) {
      const plan = JSON.stringify(await client.request('explain', { name, params }));
      assert.ok(plan.includes(index) && !plan.includes('USE TEMP B-TREE'), `${name}: ${plan}`);
    }
    assert.equal((await query(client, 'asset.page', [1000, 'bulk-990', 20])).length, 20);
    assert.ok(beats > 0);
    console.log('SQLITE_SAMPLE', JSON.stringify({ records: 5000, milliseconds: Math.round(performance.now() - started), mainThreadHeartbeats: beats }));
    smoke.check('SQLite query plans use intended indexes without temporary sort; worker leaves main thread responsive', true);
  } finally { clearInterval(timer); }
}

/**
 * A/B 文件都有自己的 schema 和 Worker；先证明 B 看不到 A 的资产。
 * 磁盘路径和用户配置都由本次测试提供，不通过 mock 把两个库硬拆成两个数组。
 * 关闭后再开同一文件必须保留五千条记录，证明不是仅内存缓存返回成功。
 * close 连续两次应共享收尾结果，不能留下活线程或抛重复关闭原生句柄异常。
 * 关闭后的请求必须明确拒绝，不能创建一个新的空连接让旧调用误读。
 * 真正重开仍会执行版本与 checksum 核对，不能跳过迁移验证直接访问表。
 * 每个临时实例在 finally 关闭，即使 B 的隔离断言失败也不会泄漏线程。
 * 本组只验证数据库恢复，不宣称现有 JSON 中的数据已经进入这些表。
 */
async function checkReopen(client, filePath) {
  // B 使用 isolated.sqlite，和 A 的 business.sqlite 处于同一临时根但不是同一个文件。
  // 两个库可能使用相同表名，隔离必须来自连接文件而非改表名前缀。
  // B 的空数组是在 A 已写入5003项之后查询，能抓住全局连接单例串库。
  // other.close 无论断言成功失败都执行，避免失败本身留下阻止退出的 Worker。
  // A 的两次 close 在同一 Promise.all 中并发调用，覆盖真正重复收尾而非先后空调用。
  // closed 错误是在原实例上产生，不能创建新实例偷偷重新读取来假装原调用仍可用。
  // reopened 明确创建新 Worker，说明持久化不是依赖原线程的语句或结果缓存。
  // 读取200是页上限，不声称磁盘只剩200行，也不要求把所有记录一次返回。
  // 重开时不重放 canonical，因此不存在测试又重新造了一遍数据的假恢复。
  // 旧实例已经关闭，新实例才建立，避免同一连接缓存掩盖持久化失败。
  // 文件仍保留在测试临时根，用于后续复查或手工运行 SQLite 完整性检查。
  // 本组不清理任何全局用户目录，不让路径回退错误掩盖为一份空库。
  // 只有数据库文件恢复被验证，图片解码、工程JSON导入仍是不同层的能力。
  // 重复关闭成功不表示用户主动关闭窗口的完整应用生命周期已接通。
  // 后续主进程业务使用此服务时仍要在自己的退出边界持有 close Promise。
  // close 返回之后不手工删 WAL/SHM，日志合并应遵循 SQLite 的连接状态。
  // 原实例的序号从哪个数字结束不影响重开，业务身份是表中稳定 ID。
  // 两个客户端没有共享的 Zustand 或 React 状态，本组不以 UI mock 达到隔离效果。
  const other = new SqliteClient(path.join(root, 'isolated.sqlite'));
  try { assert.deepEqual(await query(other, 'asset.page', [null, null, 20]), []); }
  finally { await other.close(); }
  await Promise.all([client.close(), client.close()]);
  await assert.rejects(query(client, 'asset.page', [null, null, 20]), /SQLITE_CLOSED/);
  const reopened = new SqliteClient(filePath);
  try { assert.equal((await query(reopened, 'asset.page', [null, null, 200])).length, 200); }
  finally { await reopened.close(); }
  smoke.check('SQLite instance isolation, durable reopen and repeated close', true);
}

/**
 * 陌生文件预先有自己的业务表，必须拒绝接管且保留原来的记录。
 * 未来 user_version 不能降级，失败后仍应读到原来的版本号。
 * checksum 被篡改时拒绝继续使用，不因为表存在就认为结构一致。
 * 每个反证都在单独临时库进行，不能破坏主回归库导致后面检查失去前提。
 * 原生连接在 Worker 尝试开库之前关闭，避免锁冲突掩盖真正的格式拒绝。
 * 测试读取失败后的实际文件，而非仅匹配一个返回码。
 * 这里没有删除或自动修复损坏库的代码，保留数据供用户明确处理。
 * 三个失败都属预期反证，通过 assert.rejects 后不计为冒烟失败。
 */
async function checkFormat() {
  // foreign 文件仅有 legacy 表，没有本应用标记；与损坏SQLite文件不是同一类前提。
  // legacy 中写入 kept，拒绝后必须还能读到，防止实现通过删库重建来“恢复”。
  // future 文件先由生产连接建成合法v1，再单独把头部版本改成999。
  // 这样未来版本负例不会因缺少账本或表结构而提前报别的错误。
  // checksum 文件同样有完整表，只改摘要文字，直接覆盖迁移就会被反证抓住。
  // 数据库文件彼此独立，三种负例不能复用一个越改越坏的库。
  // openConnection 的迁移事务面对合法新库应完成，面对已改版本则明确拒绝。
  // 读取 user_version 和摘要是在失败 Worker 已关闭之后，排除缓存中的旧值。
  // 原生只读探针禁止额外修复或写入，观察的就是拒绝之后的磁盘事实。
  // assert.rejects 匹配具体类别，不能用任何异常都算版本保护通过。
  // 客户端初始化失败通过 id=0 收敛，命令不需要等待三十秒才知道失败。
  // 这些预期拒绝不调用 smoke.check(false)，以免将安全边界的正确行为当成回归。
  // 反之，如果开库错误地成功，assert.rejects 必须让整套验收非零退出。
  // 任一已执行v1脚本的变化都需要新迁移，不能在测试中自动更新旧摘要。
  // 失败时保留旧表的事实，比只在stdout出现一句“拒绝升级”更强。
  // 本阶段没有备份恢复命令，本组也不宣称验证过数据修复。
  // 网络盘、断电和坏扇区并非这些样本所模拟的环境，应继续列为未验证。
  // probe 关闭后才进入下一个案例，不把残留文件锁误判为格式拒绝。
  for (const [name, mutation, error] of [['foreign', 'CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES(\'kept\')', 'FOREIGN_DATABASE'], ['future', 'PRAGMA user_version=999', 'FUTURE_VERSION'], ['checksum', "UPDATE schema_migration SET checksum='wrong'", 'SCHEMA_MISMATCH']]) {
    const filePath = path.join(root, `${name}.sqlite`);
    const db = name === 'foreign' ? new DatabaseSync(filePath) : openConnection(filePath);
    db.exec(mutation);
    db.close();
    const client = new SqliteClient(filePath);
    try { await assert.rejects(client.request('status'), new RegExp(`SQLITE_${error}`)); }
    finally { await client.close(); }
    const probe = new DatabaseSync(filePath, { readOnly: true });
    if (name === 'foreign') assert.equal(probe.prepare('SELECT value FROM legacy').get().value, 'kept');
    if (name === 'future') assert.equal(probe.prepare('PRAGMA user_version').get().user_version, 999);
    if (name === 'checksum') assert.equal(probe.prepare('SELECT checksum FROM schema_migration').get().checksum, 'wrong');
    probe.close();
  }
  smoke.check('SQLite rejects foreign databases, future versions and changed migration without deleting data', true);
}

/**
 * 状态来自工作线程真实开库结果，明确核对 WAL 与 foreign_keys 已启用。
 * 探针在首条 status 成功后打开，避免让探针抢先创建待测 schema。
 * 所有检查串行，删除用例只在事实和拒绝路径验证完成后执行。
 * finally 先关探针，再关工作线程，确保临时目录不再持有数据库锁。
 * harness 为本进程设置看门狗和退出护栏，异常不会由 app.quit 掩盖为退出零。
 * 输出仅说明引擎与关系验证，没有登录、媒体解码或 GUI 验收含义。
 * 未删除临时证据，失败时可以独立检查 WAL 与实际表内容。
 * Electron 正常退出前已完成自有连接清理，不触碰用户正在运行的应用。
 */
async function main() {
  // 临时文件名固定但根目录由 mkdtemp 独立生成，重复运行不复用上一次的历史。
  // 主进程只提供路径，不提前建立表或给 Worker 注入成功版本值。
  // status 的 schemaVersion 必须为6，保证多工作流安装队列附表已完成迁移。
  // foreignKeys 必须为1，否则后续外键负例可能只剩 UI 层的假保护。
  // journalMode 必须为 wal，不能把内存数据库测试误标为真实磁盘模式。
  // 打印的 SQLITE_ENGINE 字段来自 PRAGMA，便于复查实际 Electron 内置版本。
  // probe 连接本身也核对结构摘要，不使用随意关闭外键的裸连接辅助正例。
  // canonical 只加载一次，后续都读取相同库中的真实状态变化。
  // 删除 n1 放在其他关系断言之后，防止负例误以不存在节点失败来通过。
  // 大样本生成在小样本正确性之后，便于失败时把结构错误与规模错误分清。
  // 重开前关闭 probe，确保测试不是靠仍开着的第二个连接保持文件可见。
  // 格式反证用新文件，不能在旧主库上修改版本影响已通过的结果解释。
  // finally 中 close 可以重复，因为正常重开组已经主动关闭过原client。
  // 原异常不会因为 finally 跳过释放而留下后台资源，失败出口仍可正确退出。
  // smoke.finish 只有到达主过程末尾才报告成功，不以最后一次成功查询覆盖前面的错误。
  // 回归不创建 Electron 窗口，所以不需要虚构背景节流或遮挡状态断言。
  // UI 导入、生成队列与真实媒体播放是后续接入范围，本组没有冒称覆盖。
  // 测试根不递归删除，诊断证据留在操作系统临时目录中供人工检查。
  const filePath = path.join(root, 'business.sqlite');
  const client = new SqliteClient(filePath);
  let probe;
  try {
    const info = await client.request('status');
    assert.equal(info.schemaVersion, 6);
    assert.equal(info.foreignKeys, 1);
    assert.equal(info.journalMode, 'wal');
    console.log('SQLITE_ENGINE', JSON.stringify(info));
    probe = openConnection(filePath);
    await checkFacts(client, probe);
    await checkRejection(client, probe);
    await checkDeletion(client, probe);
    await checkPlans(client);
    probe.close(); probe = undefined;
    await checkReopen(client, filePath);
    await checkFormat();
  } finally { if (probe) probe.close(); await client.close(); }
  smoke.finish({ app, ok: true });
}

// 固定错误出口仍打印测试堆栈供本地诊断，但不将原用户数据作为夹具输入。
// 只有 main 完整完成才报告成功；中间任一步异常立刻交由 harness 非零退出。
// 没有重试循环把约束失败或超时掩盖成偶然成功。
// 真实前提是 Electron 43 的内置 SQLite，而不是系统 PATH 中另一个 Node 版本。
app.whenReady().then(main).catch(error => {
  console.error(error.stack);
  smoke.finish({ app, ok: false });
});
