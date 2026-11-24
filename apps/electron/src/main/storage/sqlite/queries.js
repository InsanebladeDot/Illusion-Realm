/**
 * 主进程命名 SQL 目录：请求只能选择这里登记的动作，不能传入整段 SQL。
 * 像餐厅只接受菜单编号，用户文字是食材参数，不能变成厨房操作指令。
 * SQL 中的问号都交给 SQLite 绑定，文件名含引号也不会改变语句结构。
 * w 表示只能进入事务的修改，r 表示只读查询；二者不能混用调用入口。
 * 参数个数必须完全吻合，不靠 SQLite 对遗漏值的默认处理掩盖调用错误。
 * page 指向分页数量参数，执行层会限制在 1 到 200 的安全整数范围。
 * 查询显式列出返回字段，避免以后加字段时顺手把内部载荷传给调用方。
 * 本目录不保存密钥、请求头或完整远端签名 URL，后续接入也须维持此边界。
 */

/**
 * @typedef {{ sql: string, write: boolean, arity: number, page?: number }} Query
 * arity 是位置参数的个数，不是 SQL 中字符问号的出现次数。
 * 命名参数复用时，SQLite 的 ?1 仍然只占第一个绑定位置。
 * page 仅用于列表的最终数量参数，游标时间和 ID 不被误当成页数。
 */

/** 只读查询由执行器使用 all 获取结果；不开放 DDL 或 PRAGMA 自由执行。 */
/** 表结构与连接设置只能由版本迁移和连接模块处理，业务请求不能改。 */
/** 返回原生记录数组，调用方若要跨 IPC 使用，还须另建领域契约与权限校验。 */
/** @param {string} sql @param {number} arity @param {number} [page] */
const r = (sql, arity, page) => Object.freeze({ sql, arity, page, write: false });
/** 修改动作的成功回执只含 changes，不把 SQLite 内部 rowid 当业务 ID。 */
/** UUID 等稳定身份由调用方提供，避免复制节点时错误复用上一次的插入行号。 */
/** 写入只在 batch 中执行，因此多个关系要么一起提交，要么一起回滚。 */
/** @param {string} sql @param {number} arity */
const w = (sql, arity) => Object.freeze({ sql, arity, write: true });

/** @type {Readonly<Record<string, Query>>} */
const QUERIES = Object.freeze({
  ...require('./resource-queries'),
  // 目录只登记确认过的位置，不扫描磁盘，也不创建这个目录。
  // folder_id 独立于路径，未来重命名只需更新位置映射。
  'folder.add': w('INSERT INTO folder(folder_id,folder_path) VALUES(?,?)', 2),
  // asset.add 参数依次为资产 ID、类型、来源、实际宽高、实际毫秒时长和登记时间。
  // 资产行不要求已经生成，外部导入也能拥有独立身份。
  // metadata 未探测时传 NULL，不能用请求分辨率代替实际值。
  'asset.add': w('INSERT INTO asset(asset_id,media_kind,origin_kind,width,height,duration_ms,created_at) VALUES(?,?,?,?,?,?,?)', 7),
  // 文件登记与资产分开，一份资产允许多个受管副本。
  // 此动作不复制文件；必须由未来媒体适配层在实际保存后调用。
  'file.add': w('INSERT INTO asset_file(file_id,asset_id,folder_id,file_name,byte_size,content_hash,availability,ownership) VALUES(?,?,?,?,?,?,?,?)', 8),
  // file.add 的哈希与长度可以未知，但归属资产、目录和可用性必须明确给出。
  // 模型、版本和本地文件三层身份分开，下载失败不需要先建假文件。
  // 同名模型来自不同来源时保留不同 ID，不按名称误去重。
  'model.add': w('INSERT INTO model(model_id,name,model_type) VALUES(?,?,?)', 3),
  // version.add 的外部版本字段允许 NULL；供应商名称仍必须存在以解释来源。
  'version.add': w('INSERT INTO model_version(version_id,model_id,provider,external_version_id,version_name) VALUES(?,?,?,?,?)', 5),
  // modelFile.add 保留 loader_kind，不能从目录标题倒推出执行器加载类别。
  'modelFile.add': w('INSERT INTO model_file(model_file_id,version_id,folder_id,file_name,loader_kind,sha256) VALUES(?,?,?,?,?,?)', 6),
  // 来源只登记公开标签，不能从下载 URL 顺手拷贝密钥。
  // 首次登记可以尚未结束，finished_at 由下载生命周期另行确定。
  'download.add': w('INSERT INTO download_job(download_id,model_file_id,target_folder_id,requested_file_name,source_label,status,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?)', 8),
  // download.add 的八个参数中没有令牌或下载头，未来凭据仍从专用服务取用。
  // 过期检查点不能覆盖新版：像只收最新页码的记账簿。
  // changes 为零表示未接受旧 revision，不是又保存了一次成功数据。
  'checkpoint.put': w('INSERT INTO download_checkpoint(download_id,temporary_locator,received_bytes,total_bytes,etag,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(download_id) DO UPDATE SET temporary_locator=excluded.temporary_locator,received_bytes=excluded.received_bytes,total_bytes=excluded.total_bytes,etag=excluded.etag,revision=excluded.revision WHERE excluded.revision>download_checkpoint.revision', 6),
  // 检查点可以接收 NULL 的 total_bytes 与 etag，不把未知响应头伪装为固定空值。
  // 正文只追加；修改草稿时切换引用，过去任务不随词库编辑发生变化。
  // 精确保留正文空格与顺序，因此这里没有 trim 或分词处理。
  'prompt.add': w('INSERT INTO prompt_document(prompt_id,positive_text,negative_text,created_at) VALUES(?,?,?,?)', 4),
  // prompt.add 不读取当前全局表单，因此 A 节点提交不会误用 B 节点的正文。
  // 列表只带正文摘要，真正打开详情时才按主键读取完整正文。
  // 单条查询最多一份文档，不让二百条历史把二百份长提示词一起传回主进程。
  'prompt.get': r('SELECT positive_text,negative_text,created_at FROM prompt_document WHERE prompt_id=? LIMIT 1', 1),
  // 缺失正文返回空数组，调用方不能擅自把它当成确认存在的空白提示词。
  'keyword.add': w('INSERT INTO keyword(keyword_id,text,language,normalized_search_text) VALUES(?,?,?,?)', 4),
  // promptKeyword.add 的 usage ID 由本次插入生成，重复词条可以拥有多个 usage ID。
  'promptKeyword.add': w('INSERT INTO prompt_keyword_usage(usage_id,prompt_id,keyword_id,position,inserted_text_snapshot) VALUES(?,?,?,?,?)', 5),
  // 配置先于任务创建，二者应和模型槽在同一个 batch 提交。
  // 这些标量是意图值，不修改媒体文件，也不声称已运行真实生成。
  'config.add': w('INSERT INTO generation_config(config_id,prompt_id,media_kind,workflow_id,mode,requested_count,width,height,fps_num,fps_den,duration_ms,schema_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', 12),
  // 配置最后一项是契约版本，不把它与 requested_count 或模型版本混淆。
  'configModel.add': w('INSERT INTO config_model(binding_id,config_id,version_id,role,submitted_name,strength,position) VALUES(?,?,?,?,?,?,?)', 7),
  // role 与 position 是槽位键，version_id 相同不表示可以覆盖另一个用途的绑定。
  'job.add': w('INSERT INTO generation_job(job_id,config_id,status,created_at,started_at,finished_at) VALUES(?,?,?,?,?,?)', 6),
  // job.add 必须引用已登记配置；事务内的父行先于子行插入，外键不延期校验。
  // 执行开始只接受排队任务，重复通知不会覆盖第一次确认的开始时间。
  // finished_at 仍留空，不能刚开始运行就显示为已经完成。
  'job.start': w("UPDATE generation_job SET status='running',started_at=? WHERE job_id=? AND status='queued'", 2),
  // 开始参数顺序是确认时间再任务 ID，与新建任务的 ID 优先顺序不同。
  // 终态重复通知不再改写历史；不合法的目标状态返回 changes=0。
  // 调用方必须核对 changes，不能将零修改量显示为又完成一次生成。
  'job.finish': w("UPDATE generation_job SET status=?1,finished_at=?2,error_code=?3 WHERE job_id=?4 AND status IN ('queued','running') AND ?1 IN ('completed','failed','cancelled')", 4),
  // 终态参数依次是状态、结束毫秒、错误码、任务 ID，不提供任意状态字段拼接。
  // 一个任务可以有多个尝试；输出通过复合外键核对真正归属。
  // 输出登记不触碰同资产的其他文件副本。
  'attempt.add': w('INSERT INTO generation_attempt(attempt_id,job_id,sequence,provider,external_request_id) VALUES(?,?,?,?,?)', 5),
  // 尝试按任务内 sequence 定位，远端编号缺失时仍可保留本地尝试事实。
  'input.add': w('INSERT INTO generation_input(input_id,job_id,asset_id,input_role,position,reference_alias) VALUES(?,?,?,?,?,?)', 6),
  // 输入最后一项冻结 @ 标签，当前文件改名不会在后台改写这里的旧文本。
  'output.add': w('INSERT INTO generation_output(output_id,job_id,attempt_id,asset_id,output_index,saved_at) VALUES(?,?,?,?,?,?)', 6),
  // 输出保存时间来自文件确认落盘之后，不能把收到网络响应当作这一时刻。
  // 工程与节点 ID 由业务提供，改名不能悄悄创建第二份工程。
  // 节点坐标只属于画布显示，不能用于决定图片生成分辨率。
  'project.add': w('INSERT INTO canvas_project(project_id,name,schema_version,created_at,updated_at) VALUES(?,?,?,?,?)', 5),
  // 工程创建的两个时间明确分开，将来更新只应改变 updated_at。
  'node.add': w('INSERT INTO canvas_node(node_id,project_id,kind,title,x,y,card_width,card_height) VALUES(?,?,?,?,?,?,?,?)', 8),
  // 节点最后四项是画布坐标和卡片尺寸，不能传图片分辨率替代 UI 大小。
  'edge.add': w('INSERT INTO canvas_edge(edge_id,project_id,source_node_id,target_node_id,source_port,target_port) VALUES(?,?,?,?,?,?)', 6),
  // 连线两端共用第二项 project_id，由复合外键保证不是跨工程引用。
  'nodeAsset.add': w('INSERT INTO node_asset(node_id,asset_id,role,position) VALUES(?,?,?,?)', 4),
  // 节点绑定不要求生成来源存在，导入图片也可以直接成为显示内容。
  // 删除节点只清节点关系，历史输出与资产由各自的外键限制保护。
  // changes 为零说明节点已不存在，调用方不应显示删除了一个新对象。
  'node.delete': w('DELETE FROM canvas_node WHERE node_id=?', 1),
  // 本动作只有节点 ID，没有路径参数，因此不会偷偷执行磁盘文件删除。
  // 位置只更新指定节点，复制实例不会因为引用同一资产而一起移动。
  // 锁定与业务坐标范围须由画布适配层校验，本接口未接通真实画布编辑。
  'node.move': w('UPDATE canvas_node SET x=?,y=? WHERE node_id=?', 3),
  // 位置更新只写确认后的坐标；指针每次移动的临时预览不应调用此接口。
  'nodeRun.add': w('INSERT INTO node_run(job_id,node_id,project_id,node_id_snapshot,project_id_snapshot) VALUES(?,?,?,?,?)', 5),
  // 两个快照参数在后面明确提供，不能等节点已删后才尝试读取其标题推断来源。
  // 可变草稿有自己的模型与输入行，不能与提交配置共享行后直接改值。
  // 所属节点和创建页作用域二选一，由数据库 CHECK 阻止串值归属。
  'draft.add': w('INSERT INTO generation_draft(draft_id,prompt_id,workflow_id,width,height,updated_at) VALUES(?,?,?,?,?,?)', 6),
  // 草稿创建不改原创建页全局状态，所属调用者由下一条归属动作说明。
  // 新正文先插入，再更新草稿引用；不能原地修改不可变提示词文档。
  // 修改时间只接受不早于已确认版本的值，过期表单不能覆盖较新的草稿。
  'draft.update': w('UPDATE generation_draft SET prompt_id=?1,width=?2,height=?3,updated_at=?4 WHERE draft_id=?5 AND updated_at<=?4', 5),
  // 时间相同仍允许更新，因此它是过期保护而非完整的并发版本锁。
  'draftOwner.add': w('INSERT INTO draft_owner(draft_id,create_scope,node_id) VALUES(?,?,?)', 3),
  // create_scope 和 node_id 必须恰好一个为 NULL，不能用两个空字符串绕过归属约定。
  'draftModel.add': w('INSERT INTO draft_model(draft_id,role,position,version_id,submitted_name,strength) VALUES(?,?,?,?,?,?)', 6),
  // 草稿模型先按值登记，提交时再复制到冻结槽，不复用可变关系行。
  'draftInput.add': w('INSERT INTO draft_input(draft_id,asset_id,input_role,position) VALUES(?,?,?,?)', 4),
  // 参考资产角色与位置是主键的一部分，不能把首帧、尾帧写成无序 ID 数组。
  // 两张有类型的标签关系防止把模型 ID 误写进资产集合。
  // 这里只登记整理用途，标签不会自动进入 prompt_document。
  'tag.add': w('INSERT INTO tag(tag_id,name) VALUES(?,?)', 2),
  // 标签显示名唯一，但它与普通关键词的同字内容没有自动合并关系。
  'assetTag.add': w('INSERT INTO asset_tag(asset_id,tag_id) VALUES(?,?)', 2),
  // 资产关系只接收两端稳定 ID，不依赖当前筛选或最近选中的卡片。
  'modelTag.add': w('INSERT INTO model_tag(model_id,tag_id) VALUES(?,?)', 2),
  // 模型标签和资产标签分别受外键保护，未来可共享展示组件但不混用业务表。
  // 首屏给游标传 null/null，后续把末行的 created_at 与 asset_id 传回来。
  // 首屏和后续分开由同一语句处理，列表数量仍受 page 参数硬限制。
  // OR 形式会妨碍范围检索，因此采用 COALESCE 给首屏提供上界。
  // 首屏的两个 NULL 是协议值，不是省略两个绑定参数。
  // 后续游标取上一页末行，不能取当前机器时间，否则可能跳过并发写入的记录。
  // 筛选只包含 deleted_at IS NULL，因此逻辑删除记录不会挤占可见页大小。
  // 排序不使用文件修改时间，重命名或复制文件不会让历史顺序跳动。
  // asset_id 作为同毫秒第二排序键，避免只按时间翻页时漏掉同刻产物。
  // 返回列表不带 folder_path，逻辑产物与具体磁盘副本仍需分别查询。
  // 一份资产没有文件副本也会返回，调用方应展示缺失/未关联状态而不是凭空补路径。
  // width/height 为 NULL 时保留未知，不在数据库返回层注入图片尺寸默认值。
  // 读出的 origin_kind 只解释资产来源类型，不等价于能反查某个历史任务。
  // 返回数量可能小于 limit，表示当前范围已取完，不自动发网络请求补齐卡片。
  'asset.page': r('SELECT asset_id,media_kind,origin_kind,width,height,duration_ms,created_at FROM asset WHERE deleted_at IS NULL AND (created_at,asset_id)<(coalesce(?,9223372036854775807),coalesce(?,char(1114111))) ORDER BY created_at DESC,asset_id DESC LIMIT ?', 3, 2),
  // 分类等值条件放在联合索引第一列，时间与 ID 继续在其后做范围定位。
  // 改筛选后调用方应清空旧游标，不能沿用另一种媒体类型的末行位置。
  // 过滤参数必须是资产类别值，不能传节点种类 scene 或 composition 来推断媒体。
  // 无匹配类别得到空结果，不会回退到全部类别让界面看似筛选成功。
  // 该读取没有执行文件探测，所以不能据此报告视频解码或音频试听已验证。
  // 同一资产多个文件副本不会重复占据本页，因为查询主表没有 JOIN 文件行。
  // 这个索引方向服务类别入口，全部资产入口仍走独立时间索引。
  // 本阶段不提供按任意字段排序的开关，新增排序应有新的明确目录动作与计划测试。
  'asset.kindPage': r('SELECT asset_id,media_kind,width,height,duration_ms,created_at FROM asset WHERE deleted_at IS NULL AND media_kind=? AND (created_at,asset_id)<(coalesce(?,9223372036854775807),coalesce(?,char(1114111))) ORDER BY created_at DESC,asset_id DESC LIMIT ?', 4, 3),
  // 每张文件只按资产索引查找，不扫描所有目录，也不加载媒体字节。
  // 结果仍分页，单个资产拥有大量副本时不会无界返回。
  // file_id 按稳定字符串继续读取，界面需要按文件名排序时应另建受控查询。
  // 当前返回 folder_id，解析目录必须再由主进程文件服务按权限处理。
  // availability 只代表上次确认状态，不保证移动硬盘此刻仍在线。
  // ownership 让后续清理逻辑区分受管与外部副本，但不是删除授权本身。
  // 一个不存在的 asset_id 返回空数组，调用方不应自动创建未知资产行。
  // byte_size 为零与 NULL 要区分显示，不用逻辑或表达式统一替换成“未知”。
  'file.page': r('SELECT file_id,folder_id,file_name,byte_size,availability,ownership FROM asset_file WHERE asset_id=? AND file_id>? ORDER BY file_id LIMIT ?', 3, 2),
  // 生成历史是任务、冻结配置和真实输出的查询视图，不再复制一份历史主表。
  // 输出数量通过现有任务前缀唯一索引计数，避免 JOIN 输入后发生笛卡尔倍增。
  // 未接入迁移时这些计数只代表新库，不会替代旧 JSON 的数量账本。
  // 本查询包含排队和运行任务，统计窗口则另用只看终态的 generation.stats。
  // job_id 与 config_id 都返回，后续详情可以按确定身份继续取值，不依赖当前选择。
  // prompt_id 单独返回，完整正文详情无需扫描历史列表找到同样文字。
  // prompt_excerpt 明确是摘要字段，调用方不能把它直接重发给生成服务。
  // 正文截取由 SQLite 在读取层完成，跨线程消息不先携带全部长提示词再截断。
  // output_count 按资产来源事实计数，不因图片副本数增加而翻倍。
  // 关联配置与正文是必需关系，外键阻止正常请求产生缺父行的历史。
  // 若用户外部手改破坏数据库，不能靠 LEFT JOIN 补假数据掩盖损坏。
  // 失败任务的部分产出可以显示正数，状态和数量是两个独立字段。
  // 返回列表不包含媒体 Base64、HTTP 请求头或临时生成服务器连接信息。
  // 本查询只显示确认时间，尚未开始的任务 started_at 保留 NULL。
  // 不是每次刷新都扫描文件系统，所以不会把用户手动删图错误解释为任务未产出。
  'history.page': r('SELECT j.job_id,j.config_id,c.prompt_id,j.status,j.created_at,j.started_at,j.finished_at,c.media_kind,c.width,c.height,substr(p.positive_text,1,512) AS prompt_excerpt,(SELECT count(*) FROM generation_output o WHERE o.job_id=j.job_id) AS output_count FROM generation_job j JOIN generation_config c ON c.config_id=j.config_id JOIN prompt_document p ON p.prompt_id=c.prompt_id WHERE (j.created_at,j.job_id)<(coalesce(?,9223372036854775807),coalesce(?,char(1114111))) ORDER BY j.created_at DESC,j.job_id DESC LIMIT ?', 3, 2),
  // 时间窗由业务传入本地日历换算后的毫秒上下界，不对索引列套 date 函数。
  // 统计先按任务汇总，输入图和模型槽有多行也不会把产物数重复乘大。
  // cancelled 整体排除、failed 可有部分产物，兼容既有统计的含义。
  // fromMs 是包含边界，toMs 是排除边界，相邻统计窗口不会重复计算同一终态。
  // 没有满足窗口的记录时 jobs 与 completed 都为零，产物和也显式归零。
  // completed 是完成任务数，不是完成图片数，不能拿它代替 outputs。
  // 子查询只计算当前任务产物，多个输入和模型槽不会相乘放大输出。
  // 空 finished_at 不属于已确认终态窗口，查询不将当前时间临时塞进去。
  // 时间窗口先由业务层按用户日历计算，不在数据库内假设固定时区。
  // 本阶段没有旧账本总量导入，因此该结果不能覆盖主页现有统计来源。
  // 后续迁移缺少产物列表的旧记录时，必须另存可靠汇总证据而不能补造资产。
  // 同一任务多次读取不会增加次数，因为没有在查询中触发任何写入动作。
  // 只读统计不更新“最后查看时间”，避免普通打开主页也产生数据库写负担。
  'generation.stats': r("SELECT count(*) AS jobs,coalesce(sum((SELECT count(*) FROM generation_output o WHERE o.job_id=j.job_id)),0) AS outputs,coalesce(sum(j.status='completed'),0) AS completed FROM generation_job j WHERE j.status IN ('completed','failed') AND j.finished_at>=? AND j.finished_at<?", 2),
  'download.page': r('SELECT download_id,status,requested_file_name,source_label,created_at,finished_at FROM download_job WHERE (created_at,download_id)<(coalesce(?,9223372036854775807),coalesce(?,char(1114111))) ORDER BY created_at DESC,download_id DESC LIMIT ?', 3, 2),
  // 下载页只解释尝试，不聚合成“当前已安装模型列表”。
  // 相同权重重试多次可以返回多行，各自保留独立本地下载 ID。
  // 结果不带临时位置，普通历史卡不因此取得续传临时文件访问能力。
  // source_label 只用于说明来源，不提供可直接绕过凭据服务的下载链接。
  // removed 状态仍可被历史读取，未来队列视图是否隐藏需要单独筛选。
  // 查询不触发模型扫描，因此打开历史不会重新遍历整个模型目录。
  // 图结构同样分页，避免大工程一次把全部节点和媒体关系塞进主进程消息。
  // edge 的工程加 ID 索引同时服务工程隔离和按 ID 继续翻页。
  // 节点列表的首屏 afterNodeId 为空字符串，与时间列表的 NULL 首屏约定不同。
  // 查询的 projectId 是必需参数，不把最近打开工程作为隐式全局状态。
  // 节点标题可能重名，翻页键使用 node_id 而不是 title。
  // 返回 x/y 是数据库确认坐标，不把正在拖动的临时草稿混入持久化结果。
  // 节点卡片尺寸与画布视口缩放相互独立，本查询不会自动乘当前缩放倍率。
  // 不联查所有节点媒体，避免一对多引用导致节点列表重复行。
  // 端口名称从边列表读取，不从展示组件的 DOM id 或中文标签重建。
  // 边列表只取指定工程，空工程返回空数组而不是所有工程的连接集合。
  // edge_id 排序只为可恢复分页，不表示节点执行优先级或媒体叠放层级。
  // 端点删除后边由外键清理，查询不需要在每次读取时手工过滤孤儿边。
  // 调用方加载多页期间的并发图编辑需要业务版本协调，本层不宣称整图快照一致。
  // 未来完整工程恢复应在合适的只读快照中组织，不直接拼接不同版本分页结果。
  'node.page': r('SELECT node_id,kind,title,x,y,card_width,card_height FROM canvas_node WHERE project_id=? AND node_id>? ORDER BY node_id LIMIT ?', 3, 2),
  'edge.page': r('SELECT edge_id,source_node_id,target_node_id,source_port,target_port FROM canvas_edge WHERE project_id=? AND edge_id>? ORDER BY edge_id LIMIT ?', 3, 2),
});

// 导出的是固定目录，不向调用方提供拼接表名、排序字段或任意 SQL 的方法。
// 动作新增时须同时更新文档参数顺序和行为回归，不能只加一个可点击入口。
// 两个工作线程各持有自己的预编译缓存，不共享原生 Statement 对象。
module.exports = { QUERIES };
