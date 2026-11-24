-- SQLite v1：这里只定义业务事实和关系，不导入用户原来的 JSON。
-- 像给文件柜分别做目录卡、借阅单和加工单，三者通过编号关联，而不是抄三遍文件。
-- STRICT 拒绝把任意字符串塞进数字列；进一步的工作流能力校验仍属于业务提交层。
-- 时间统一使用 Unix 毫秒，未知时间用 NULL，不能拿文件修改时间伪装生成时间。
-- 外键只操作数据库行；ON DELETE CASCADE 从不会删除操作系统中的媒体文件。
-- 所有 ID 都是不随改名改变的字符串，不把文件路径、标题或远端请求号当作本地主键。
-- 媒体位置单独存储，因此同一产物可以同时有图库副本和画布受管副本。
-- v1 尚未接管线上业务，表为空不表示用户历史为空；迁移必须另有核对记录。

-- 目录是独立位置；多个文件共用同一行，不在每个文件中重复整段目录。
-- folder_path 是主进程确认后的绝对目录，不允许直接作为渲染进程文件访问权限。
-- 本阶段只保证目录字符串唯一；大小写、符号链接的同目录识别由未来导入适配层处理。
-- 不建立冗余父目录链，避免保存一个空目录时还得伪造它的所有祖先。
CREATE TABLE folder (
  -- folder_id 可由 UUID 等稳定规则提供，不能随着目录改名重新分配。
  -- folder_path 是位置事实，不是用户授予的“允许访问整个目录”的授权记录。
  -- 删除目录记录前要先处理引用文件和下载目标，RESTRICT 会阻止悬空位置。
  -- UNIQUE 按 SQLite 默认二进制比较，并不自动识别 Windows 的大小写别名。
  -- 导入适配层还需判断目录是否存在，本表 CHECK 只保证非空文字。
  -- 外部盘断开不应删目录行，否则历史文件的位置解释也会一起丢失。
  -- 本阶段未提供 folder.move，因为磁盘移动与数据库更新不是同一种事务。
  -- 目录浏览偏好仍在旧 JSON，登记一个目录不会改变创作页当前打开的文件夹。
  folder_id TEXT PRIMARY KEY CHECK(length(folder_id)>0), folder_path TEXT NOT NULL UNIQUE CHECK(length(folder_path)>0)
) STRICT;

-- 资产代表逻辑产物，和磁盘副本、节点实例是三个不同身份。
-- 导入图片没有生成任务是正常情况，不为它编造历史。
-- 宽高与时长是实际媒体探测结果；请求中希望得到的尺寸另外存入配置。
-- 未探测的属性允许为空，不能把生成意图写成已确认的文件事实。
-- 图片和视频可有像素尺寸，音频不因此被强制补成零像素图片。
-- deleted_at 是逻辑删除时间，引用和物理清理必须另行核查。
CREATE TABLE asset (
  -- media_kind 是逻辑媒体类别；调用方仍须用真实解码探测确认文件类型。
  -- origin_kind=derived 表示由已有内容加工，不表示已经能反查完整加工步骤。
  -- 资产入库不要求立即存在 asset_file，事务可以先登记身份再补实际副本。
  -- 未知 width 不应填零，因为零与尚未探测无法表达同一种状态。
  -- height 与 width 都是像素数，不保存 16:9 这类显示比例字符串。
  -- duration_ms 是探测时长，不是视频节点当前请求生成的秒数。
  -- created_at 是资产登记的业务时间，不随某个画布实例的拖动而变化。
  -- deleted_at 允许恢复性整理，现有命名接口尚未开放软删除动作。
  -- 不按 content_hash 合并资产，来源和历史身份不同的同内容结果仍可独立。
  -- 表内没有账户字段，本机资产不会被自动认领为当前登录账号的云端内容。
  -- 返回媒体时仍要检查真实文件可用性，存在资产行不代表磁盘字节可读取。
  asset_id TEXT PRIMARY KEY CHECK(length(asset_id)>0), media_kind TEXT NOT NULL CHECK(media_kind IN ('image','video','audio')),
  origin_kind TEXT NOT NULL CHECK(origin_kind IN ('imported','generated','derived')),
  width INTEGER CHECK(width>0), height INTEGER CHECK(height>0), duration_ms INTEGER CHECK(duration_ms>=0),
  created_at INTEGER NOT NULL CHECK(created_at>=0), deleted_at INTEGER CHECK(deleted_at>=created_at)
) STRICT;

-- 一个文件行只描述一个副本；内容哈希不是唯一约束，因为不同来源可产生相同内容。
-- UNIQUE(folder_id,file_name) 防止两个资产同时声称占用同一个已登记位置。
-- 缺文件时更新 availability，保留历史引用，不能悄悄删掉任务产物。
-- ownership 区分受管副本与外部原件，数据库删除不能代替文件清理授权。
-- 文件名不接受路径分隔符；完整路径需要通过目录行与文件名组合。
-- byte_size 未知时留空；零字节和没有探测结果是不同事实。
CREATE TABLE asset_file (
  -- file_id 标识此副本，复制到另一个工程目录应分配新的 file_id。
  -- asset_id 保留逻辑来源，同源复制不能因此冒充一次新的生成输出。
  -- folder_id 只存位置引用，联查时才能取得目录文字。
  -- file_name 保留扩展名，界面显示的文件前缀不应覆盖它。
  -- 禁止点和双点名称，避免未来路径组合意外指向目录自身或上级。
  -- byte_size 是真实文件长度，未知长度不应借请求大小或画布尺寸估算。
  -- content_hash 是去重线索，不能替代来源记录或文件访问权限。
  -- availability=missing 时仍保留文件名，方便向用户报告缺失资源。
  -- ownership=external 不表示允许移动或删除外部原件。
  -- 修改文件名时要先处理磁盘失败补偿，不能仅更新本行后提示成功。
  -- v1 无任意文件删除 SQL，也没有把数据库外键映射成操作系统删除指令。
  file_id TEXT PRIMARY KEY CHECK(length(file_id)>0), asset_id TEXT NOT NULL REFERENCES asset ON DELETE RESTRICT,
  folder_id TEXT NOT NULL REFERENCES folder ON DELETE RESTRICT,
  file_name TEXT NOT NULL CHECK(length(file_name)>0 AND file_name NOT IN ('.','..') AND instr(file_name,'/')=0 AND instr(file_name,char(92))=0),
  byte_size INTEGER CHECK(byte_size>=0), content_hash TEXT,
  availability TEXT NOT NULL CHECK(availability IN ('present','missing')),
  ownership TEXT NOT NULL CHECK(ownership IN ('managed','external')), UNIQUE(folder_id,file_name)
) STRICT;

-- 模型主表描述产品身份，不记录某次生成把它放在主模型还是 LoRA 槽位。
-- 相同显示名可以来自不同供应商，因此 name 不是唯一键。
-- 名称修改不会改写过去提交给执行器的精确模型标识。
CREATE TABLE model (
  -- model_id 属于本机模型目录，不能直接复用不同供应商的外部数字 ID。
  -- name 是当前显示名称，历史任务的 submitted_name 才是当时的提交证据。
  -- model_type 是目录分类，不决定某次生成使用了哪个模型加载槽。
  -- 表中不保存权重字节；数据库文件大小不应随着安装模型体积一起增长。
  -- 模型封面可在后续适配中引用资产，本阶段没有虚构不存在的封面行。
  -- 删除标签关系不会卸载模型文件，模型的磁盘生命周期仍独立处理。
  -- 供应商详情刷新只应影响目录事实，不可改写冻结配置里的使用名称。
  -- 同名 LoRA 和 Checkpoint 可以分别登记，不用名称做跨类型去重。
  model_id TEXT PRIMARY KEY CHECK(length(model_id)>0), name TEXT NOT NULL, model_type TEXT NOT NULL
) STRICT;

-- 来源版本属于模型，外部版本号必须放在 provider 命名空间中比较。
-- 纯本地模型可以没有 external_version_id，不伪造 C 站版本号。
-- 版本文件与这里分离，允许同一版本有多个加载文件。
-- 版本仍被历史配置引用时限制删除，不能让模型使用记录失去解释。
CREATE TABLE model_version (
  -- version_id 是本地稳定主键，provider 加 external_version_id 才解释外部来源。
  -- 外部版本字段为 NULL 时 UNIQUE 不阻止多条纯本地版本。
  -- model_id 非空，版本不能成为脱离模型身份的孤立来源记录。
  -- provider 不包含认证信息，API 密钥继续属于现有凭据服务。
  -- version_name 只用于解释来源，不作为下载目标的实际文件名。
  -- 一个版本可以安装多个文件，不能把 file_name 直接塞到本表当单值事实。
  -- 当前没有版本替换命令，不能以刷新接口顺手把历史外键换成新版本。
  -- 与版本相关的任务使用次数应由 config_model 查询，不在这里重复存计数。
  version_id TEXT PRIMARY KEY CHECK(length(version_id)>0), model_id TEXT NOT NULL REFERENCES model ON DELETE RESTRICT,
  provider TEXT NOT NULL, external_version_id TEXT, version_name TEXT NOT NULL,
  UNIQUE(provider,external_version_id)
) STRICT;

-- 权重文件不是普通图片资产，不和封面或生成结果混入一张文件表。
-- 文件路径由目录与文件名组成，下载任务尚未完成时可以没有权重行。
-- 同一目录内同名权重只能归属一个文件记录。
-- SHA256 允许未知，不能用文件大小或同名猜测内容一致。
CREATE TABLE model_file (
  -- model_file_id 代表实际安装文件，和下载尝试不是一对一生命周期。
  -- folder_id 加 file_name 解释当前位置，其他表只引用此行的 ID。
  -- loader_kind 保留模型加载体系，不从文件大小猜测加载器。
  -- sha256 为空只表示未验证，不能在界面显示为已通过完整性校验。
  -- 文件路径唯一并不证明内容已保存，未来下载适配必须先确认落盘。
  -- 一次下载失败可以完全没有 model_file 行，不必补一个空权重占位。
  -- 删除来源版本受外键限制，不能让仍安装的权重失去所属版本。
  -- 路径分隔符只允许出现在目录表中，本表文件名不能绕到相邻目录。
  model_file_id TEXT PRIMARY KEY CHECK(length(model_file_id)>0), version_id TEXT NOT NULL REFERENCES model_version ON DELETE RESTRICT,
  folder_id TEXT NOT NULL REFERENCES folder ON DELETE RESTRICT, file_name TEXT NOT NULL,
  loader_kind TEXT NOT NULL, sha256 TEXT, UNIQUE(folder_id,file_name),
  CHECK(length(file_name)>0 AND file_name NOT IN ('.','..') AND instr(file_name,'/')=0 AND instr(file_name,char(92))=0)
) STRICT;

-- 下载行记录一次尝试，失败、取消、移除队列卡片不应抹掉下载事实。
-- 预期目录与完成权重分开，失败任务无需虚构成功文件。
-- source_label 只放公开来源名称，不存带凭据的下载 URL 或 HTTP 头。
-- 状态使用本域枚举，不能与生成任务的状态混为全局通用状态。
-- 结束时间可空，表示尚未终止；时间顺序由 CHECK 保底。
-- 界面速度和每个网络分包的百分比不进此表，避免高频重写历史。
CREATE TABLE download_job (
  -- download_id 是一次本地尝试，不是来源站点的 modelId。
  -- model_file_id 可空也可在文件登记后关联，不要求先有成功安装结果。
  -- SET NULL 只解除被删除权重的活动关联，下载任务本身不会一起消失。
  -- target_folder_id 是用户当时选择的位置，不与模型后来移动的位置混同。
  -- requested_file_name 保留原请求名，不从完成后改过的权重名倒推。
  -- source_label 不能承载 Cookie、Bearer 令牌或带认证查询参数的完整链接。
  -- removed 表示队列卡片被移除，不代表用户授权清空历史。
  -- error_code 保存分类标识，不保存可能泄露路径的原始异常堆栈。
  -- finished_at 为空可以表示旧数据没有可靠结束时间，迁移时不能乱补。
  -- 当前表没有下载调度器接入，不可用一条 completed 记录冒充真实下载完成。
  download_id TEXT PRIMARY KEY CHECK(length(download_id)>0), model_file_id TEXT REFERENCES model_file ON DELETE SET NULL,
  target_folder_id TEXT NOT NULL REFERENCES folder ON DELETE RESTRICT,
  requested_file_name TEXT NOT NULL, source_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('downloading','saving','completed','failed','cancelled','removed')),
  created_at INTEGER NOT NULL CHECK(created_at>=0), finished_at INTEGER CHECK(finished_at>=created_at), error_code TEXT
) STRICT;

-- 检查点可以更新或清理，下载历史则独立保留。
-- received_bytes 是已经可靠写入临时文件的字节，不是网卡收到但尚未保存的字节。
-- total_bytes 可空，兼容上游没有 Content-Length 的响应。
-- 只有已知总数才比较接收量，避免把未知总量误当成零长度。
-- etag 用于未来续传核对，不代表文件已通过完整性验证。
-- 临时位置仅在主进程使用，不因此向渲染层开放任意路径读写。
CREATE TABLE download_checkpoint (
  -- 检查点主键沿用 download_id，不能为同一下载累积多份相互矛盾的活动断点。
  -- temporary_locator 是内部临时位置描述，不直接开放为渲染侧文件读取参数。
  -- received_bytes 单位为字节，不接受界面的百分比或 KB 格式字符串。
  -- total_bytes 缺失时仍允许更新已接收量，适配未知总长的响应。
  -- 已知总长小于接收量将失败，防止断点快照出现不可能的进度。
  -- revision 是快照代次，不是数据库结构版本，也不是文件修改时间。
  -- checkpoint.put 只接受更大 revision，重复回执不会反向改写新断点。
  -- ETag 变化的续传处置属于后续网络适配，本表不会自动拼接不一致文件。
  download_id TEXT PRIMARY KEY CHECK(length(download_id)>0) REFERENCES download_job ON DELETE CASCADE,
  temporary_locator TEXT NOT NULL, received_bytes INTEGER NOT NULL CHECK(received_bytes>=0),
  total_bytes INTEGER CHECK(total_bytes>=received_bytes), etag TEXT, revision INTEGER NOT NULL CHECK(revision>=0)
) STRICT;

-- 提示词正文按提交字面值保存，不 trim、不拆逗号、不重新拼写权重。
-- 文档采用追加方式；编辑草稿产生新正文引用，旧历史不随词库改变。
-- 正负文本是两种语义，即使字符串相同也不强制合并为一个字段。
-- 关键词关系只记录明确插入动作，不能从正文自动分词后伪造使用证据。
CREATE TABLE prompt_document (
  -- prompt_id 是正文快照身份，不把正文内容哈希强制当作身份。
  -- positive_text 和 negative_text 分别保留原始正文，不互相覆盖或交换顺序。
  -- 空正文可以保存草稿；是否允许提交由所选工作流的能力规则判断。
  -- 单字段长度上限防止错误调用把完整媒体编码作为提示词入库。
  -- SQLite length 按字符计数，JavaScript 请求侧还按 UTF-16 长度提前限制。
  -- 原有图片 Meta 的 prompt 块仍保留，不因新建数据库就被重写或清空。
  -- 正文修改被触发器拒绝，调用方编辑时要插入新正文再改草稿引用。
  -- 完整正文详情按主键读取，历史列表只展示最多 512 个字符的摘要。
  -- 这里不执行提示词翻译或格式规范化，避免数据库改变真实请求语义。
  prompt_id TEXT PRIMARY KEY CHECK(length(prompt_id)>0), positive_text TEXT NOT NULL CHECK(length(positive_text)<=131072),
  negative_text TEXT NOT NULL CHECK(length(negative_text)<=131072),
  created_at INTEGER NOT NULL CHECK(created_at>=0)
) STRICT;

-- 词条与用户整理标签分开：词条可进入模型输入，标签只是整理资产。
-- 搜索归一化结果不会覆盖原文，英文大小写和空格仍可精确保留。
-- 不给 text 加全局唯一限制，同字不同语言的条目可独立维护。
CREATE TABLE keyword (
  -- keyword_id 指向可复用词条，和某次正文中的出现位置不是同一个 ID。
  -- text 是可见原文，不能被 normalized_search_text 的归一化结果反向覆盖。
  -- language 描述词条语言，不强制等于当前界面语言。
  -- 相同文字允许多个来源词条，未来合并必须明确处理使用关系。
  -- 当前没有从旧正文自动抽取词条的迁移，不把猜测当成真实插入记录。
  -- 普通 @ 图片引用属于资产关系，不应作为这里的普通词条登记。
  -- 模型触发词的多对多附表尚未接入，旧词库继续由原实现保存。
  -- 关键词搜索索引需有实际查询后再添加，不为每个文字列盲目建索引。
  keyword_id TEXT PRIMARY KEY CHECK(length(keyword_id)>0), text TEXT NOT NULL, language TEXT NOT NULL, normalized_search_text TEXT NOT NULL
) STRICT;

-- 同一个词在正文中出现两次时保留两条 usage，不以二者 ID 组合误去重。
-- position 表示当次插入顺序，不跟随词库后来重新排序。
-- inserted_text_snapshot 说明实际放进正文的字面值，可含当时的权重包装。
-- 删除词库不强行删除已经冻结的使用证据；历史词条需要显式清理流程。
CREATE TABLE prompt_keyword_usage (
  -- usage_id 区分同词的多次出现，不能改成 prompt_id 加 keyword_id 的去重主键。
  -- prompt_id 指向确定的正文版本，不随当前草稿切换新正文而自动转移。
  -- keyword_id 表示插入来源，不代表之后编辑过的片段仍等于词库最新文本。
  -- position 是记录顺序，不承诺等于正文字符串的字节偏移。
  -- inserted_text_snapshot 保留当时实际插入形式，可以含权重包装。
  -- 词条删除受 RESTRICT 保护，要先设计历史保留策略，不能直接清空使用证据。
  -- 正文删除会清使用关系，不会反过来删除全局词条实体。
  -- 相同 position 暂不设唯一约束，旧组装器可能在不同段落分别从零编号。
  usage_id TEXT PRIMARY KEY CHECK(length(usage_id)>0), prompt_id TEXT NOT NULL REFERENCES prompt_document ON DELETE CASCADE,
  keyword_id TEXT NOT NULL REFERENCES keyword ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(position>=0), inserted_text_snapshot TEXT NOT NULL
) STRICT;

-- 配置是提交瞬间的快照，不是当前可变的表单草稿。
-- width/height 是请求像素，与资产实际像素和节点卡片尺寸分别保存。
-- 图片没有 FPS，视频可以有有理数帧率；未知或不适用时不补造默认值。
-- requested_count 是意图；真正产出数量由 generation_output 的行数决定。
-- workflow_id 保留执行器标识，不能只存界面里可能改名的工作流标题。
-- CHECK 约束字段范围，但文生图/参考图输入数量仍须业务提交层另行校验。
CREATE TABLE generation_config (
  -- config_id 不等于 draft_id，复制提交时不能把可变草稿行直接当冻结历史。
  -- prompt_id 是正文快照引用，避免所有任务共用一份会被编辑的全局文本。
  -- media_kind 表示请求类型，不证明最终返回文件已通过同类解码探测。
  -- workflow_id 保留执行器选择，本表不替代工作流 JSON 的完整外部协议。
  -- mode=text/image/reference 分别表达文本、单图和多参考模式意图。
  -- requested_count 只保证正整数；供应商允许张数和输入数量由适配层核对。
  -- width 和 height 可空以兼容无需像素尺寸的音频执行器。
  -- fps_num 与 fps_den 必须同时提供或同时缺失，不允许半个有理数。
  -- duration_ms 保存请求时长，不能拿真实输出的探测时长回填覆盖。
  -- schema_version 表示本配置契约版本，不是某个模型的来源版本。
  -- 后续采样器、种子、CFG 等领域字段需要新增迁移，不应藏入任意备注列。
  -- 本轮未接真实生成提交，新增配置行本身不产生图片或计入旧统计。
  config_id TEXT PRIMARY KEY CHECK(length(config_id)>0), prompt_id TEXT NOT NULL REFERENCES prompt_document ON DELETE RESTRICT,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('image','video','audio')), workflow_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('text','image','reference')), requested_count INTEGER NOT NULL CHECK(requested_count>0),
  width INTEGER CHECK(width>0), height INTEGER CHECK(height>0), fps_num INTEGER CHECK(fps_num>0), fps_den INTEGER CHECK(fps_den>0),
  duration_ms INTEGER CHECK(duration_ms>0), schema_version INTEGER NOT NULL CHECK(schema_version>0),
  CHECK((fps_num IS NULL)=(fps_den IS NULL))
) STRICT;

-- 一行对应一个模型槽，主模型、LoRA 等职责通过 role 注明。
-- submitted_name 是当时发给执行器的精确值，不随模型主表改名。
-- 无法可靠识别旧版本时 version_id 可空，不能按同名强制认领。
-- strength 是本次使用权重，不属于模型文件本身的恒定属性。
-- position 保存同一职责下的顺序，多个 LoRA 不塞进逗号字符串。
-- 任务创建后，这些绑定由触发器冻结；配置组装须在提交事务内先完成。
CREATE TABLE config_model (
  -- binding_id 是一次模型槽绑定，不等同于目录中的 model_id。
  -- config_id 非空，绑定不能离开所属配置独立冒充使用历史。
  -- version_id 为 NULL 时依然保留 submitted_name，兼容没有可靠来源 ID 的情况。
  -- role 是本次用途，不能把用途写回模型主表当作永远不变的分类。
  -- strength 使用数值；单个供应商允许的区间由该供应商能力规则验证。
  -- position 在同一 role 中唯一，多个 LoRA 的顺序可被稳定还原。
  -- 新绑定不能在已被任务引用的配置上追加，以免历史统计后来多出使用模型。
  -- 更改绑定所属 config_id 时同时检查旧配置和新配置，不能借挪行绕过冻结。
  -- 本表不保存权重文件字节，也不保存模型库可变封面。
  binding_id TEXT PRIMARY KEY CHECK(length(binding_id)>0), config_id TEXT NOT NULL REFERENCES generation_config ON DELETE CASCADE,
  version_id TEXT REFERENCES model_version ON DELETE RESTRICT, role TEXT NOT NULL, submitted_name TEXT NOT NULL,
  strength REAL, position INTEGER NOT NULL CHECK(position>=0), UNIQUE(config_id,role,position)
) STRICT;

-- 本地主键与供应商请求号不同：一个任务可以拆成多个远端请求。
-- failed 可有部分产物；cancelled 是否计入统计是既有业务口径，不靠删记录实现。
-- started_at 可空，避免把从未执行的排队任务算成零秒执行。
-- 不缓存第二份 duration，耗时从确认的起止时间推导。
-- 当前旧账本仅有数量，没有路径；本阶段不把这些未知产物伪造成新资产。
-- 所有状态变更都走命名 SQL，渲染层没有任意 SQL 执行入口。
CREATE TABLE generation_job (
  -- job_id 是本机任务编号，重试不会把它换成远端新请求号。
  -- config_id 可以被多次任务复用，因为冻结配置不随执行结果改变。
  -- queued 和 running 是运行期状态的持久化事实，不是生成进度百分比。
  -- started_at 不早于 created_at，避免以负等待时长进入统计。
  -- finished_at 不早于已知开始时间；没开始的失败可与创建时间直接比较。
  -- 错误码单独保存，不将含服务地址的堆栈复制到本地历史列表。
  -- job.start 只更新排队状态，重复开始通知不会重置实际起点。
  -- job.finish 只接受未终止任务，迟到终态通知不能改写已经确认的结果。
  -- 文件数量由输出表查询，不能把 requested_count 复制成“已成功图片数”。
  -- 旧账本缺少产物路径的记录不在这里自动补造；迁移要保留缺失证据。
  job_id TEXT PRIMARY KEY CHECK(length(job_id)>0), config_id TEXT NOT NULL REFERENCES generation_config ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled')),
  created_at INTEGER NOT NULL CHECK(created_at>=0), started_at INTEGER CHECK(started_at>=created_at),
  finished_at INTEGER CHECK(finished_at>=coalesce(started_at,created_at)), error_code TEXT
) STRICT;

-- 远端重试和子批次有各自身份，不覆盖上一次远端返回的请求号。
-- sequence 在任务内唯一；跨任务的远端同号不会冲突。
-- 复合唯一键供输出外键引用，防止把 A 任务产物错挂到 B 任务的尝试。
-- provider 是来源名，不保存服务密钥、认证头或临时签名链接。
CREATE TABLE generation_attempt (
  -- attempt_id 标识一次远端执行，和工作流模型版本没有直接等价关系。
  -- job_id 必须真实存在，不能先发远端请求再留下无任务归属的尝试行。
  -- sequence 由同任务协调器分配，两个相同序号会被 UNIQUE 拒绝。
  -- external_request_id 可以未知，不拿随机值填成看似真实的供应商请求号。
  -- provider 用来解释远端 ID 的命名空间，不决定用户当前使用哪个账号。
  -- UNIQUE(job_id,attempt_id) 是输出复合外键的父键，不能因主键已唯一就删掉。
  -- 重试历史目前没有自动创建入口，命名 SQL 仅提供受控登记动作。
  -- 删除尝试受输出引用限制，不能让已保存产物失去子执行来源。
  attempt_id TEXT PRIMARY KEY CHECK(length(attempt_id)>0), job_id TEXT NOT NULL REFERENCES generation_job ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(sequence>=0), provider TEXT NOT NULL, external_request_id TEXT,
  UNIQUE(job_id,sequence), UNIQUE(job_id,attempt_id)
) STRICT;

-- 每个参考资产是一行，position 在提交时冻结。
-- reference_alias 是当时的 @ 引用名，不拿今天改过的文件名重算旧请求。
-- role 区分首帧、尾帧与普通参考，实际数量规则仍由工作流能力决定。
-- 删除资产受限制，先解除节点并不等于可以删除历史任务的输入。
CREATE TABLE generation_input (
  -- input_id 是当次提交中的一个输入，不等同于可被多次引用的 asset_id。
  -- 相同资产可用于不同角色，但同一角色和位置只允许一条确定输入。
  -- input_role 的具体集合由工作流定义，数据库不假装知道所有未来供应商角色。
  -- position 从零开始，排序数字不能替换成可能按字典序出错的 x1/x2 文字。
  -- reference_alias 冻结当次标记，改节点标题不能改变旧请求的引用语义。
  -- 文生图不得有图输入的规则未由外键表达，需要提交事务之前验证。
  -- 一张图输入与多参考图的数量限制不等于不同的资产主表结构。
  -- 资产缺失时保留输入行，让用户能够解释为什么旧任务无法再次运行。
  input_id TEXT PRIMARY KEY CHECK(length(input_id)>0), job_id TEXT NOT NULL REFERENCES generation_job ON DELETE RESTRICT,
  asset_id TEXT NOT NULL REFERENCES asset ON DELETE RESTRICT, input_role TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0), reference_alias TEXT NOT NULL, UNIQUE(job_id,input_role,position)
) STRICT;

-- 产物行只能在文件真正保存后登记；请求成功不等于本地落盘成功。
-- 一个逻辑资产只有一个生成来源；额外磁盘副本仍属于 asset_file。
-- attempt_id 可空，兼容能够确认任务但没有子请求编号的输出。
-- 复合外键同时核对任务和尝试，不允许产物跨任务错配。
-- 删除任务受引用限制，避免清理队列时误清理创作历史。
-- output_index 表示任务中的输出顺序，不能由文件名排序代替。
CREATE TABLE generation_output (
  -- output_id 标识实际产物登记，不是一次请求的计划序号。
  -- asset_id 的 UNIQUE 保证同一逻辑产物不会被两个任务同时声称生成。
  -- 物理副本不重新分配生成来源，只增补 asset_file 行。
  -- attempt_id 为空时复合外键按 SQL 空值规则跳过，但 job_id 仍必须存在。
  -- attempt_id 非空时 job_id 必须与该尝试所属任务一致。
  -- output_index 在任务内唯一，重放同一输出通知应明确处理冲突而不是多计数。
  -- saved_at 是确认保存的时间，不应填成任务开始或服务器响应时间。
  -- 部分失败任务可以有输出，统计 SQL 不应仅凭 status=completed 才计产物。
  -- 取消任务的资产仍保留，只是在既有统计口径中整体排除。
  output_id TEXT PRIMARY KEY CHECK(length(output_id)>0), job_id TEXT NOT NULL REFERENCES generation_job ON DELETE RESTRICT,
  attempt_id TEXT, asset_id TEXT NOT NULL UNIQUE REFERENCES asset ON DELETE RESTRICT,
  output_index INTEGER NOT NULL CHECK(output_index>=0), saved_at INTEGER NOT NULL CHECK(saved_at>=0),
  UNIQUE(job_id,output_index), FOREIGN KEY(job_id,attempt_id) REFERENCES generation_attempt(job_id,attempt_id)
) STRICT;

-- 完整 API Prompt 是有版本的外部协议文档，允许作为一个有边界的 JSON 载荷保存。
-- 它不是普通查询索引的替代品；任务、输出、模型绑定仍使用原子表。
-- 载荷不可包含 API 密钥、认证头、Blob URL 或媒体 Base64。
-- v1 接口没有载荷写入命令，后续接入必须先做对应供应商的字段白名单。
CREATE TABLE job_payload (
  -- job_id 与任务一对一，一个任务不会由多个不明版本载荷争夺解释权。
  -- schema_version 表示载荷格式，和结构迁移编号相互独立。
  -- json_valid 仅验证 JSON 语法，不代表供应商字段或工作流能力已经合法。
  -- 此列不能作为任意对象扩展口袋，常查字段仍应有独立列和约束。
  -- 后续接入要逐个供应商审计序列化内容，不能直接 JSON.stringify 整个请求对象。
  -- 本轮没有读取载荷的列表 SQL，防止历史翻页带出巨量外部协议正文。
  -- 原图片 Meta 继续提供便携证据，数据库载荷不会替换 PNG 的 prompt 块。
  -- 载荷不应包含临时媒体链接，重开软件后这些链接通常不再有效。
  job_id TEXT PRIMARY KEY CHECK(length(job_id)>0) REFERENCES generation_job ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL CHECK(schema_version>0), payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;

-- 工程身份与名字独立；改标题不改变其他表的外键。
-- 这里保存工程索引，不把导演台和外嵌视频工具协议拆散重写。
-- schema_version 用于工程数据适配，不与 SQLite 自身 user_version 混用。
-- updated_at 仅记录已确认修改，不记录鼠标每一次移动事件。
CREATE TABLE canvas_project (
  -- project_id 不因标题重复或改名改变，两个同名工程可以独立存在。
  -- name 是可变显示标题，不作为媒体目录权限或归属的唯一依据。
  -- schema_version 用于未来画布导入恢复适配，不能拿数据库版本代替。
  -- created_at 在工程创建时确认，不跟随最后一个节点的创建时间。
  -- updated_at 应由工程保存边界更新，不把单次悬停算作修改。
  -- 这张表本轮只有基础创建接口，既有画布保存仍走原版本化工程文档。
  -- 删除工程会删除节点结构，但历史任务仍由 RESTRICT 与来源快照独立保护。
  -- 不能把“数据库里建了工程索引”描述成原项目已经完成 SQLite 保存恢复。
  project_id TEXT PRIMARY KEY CHECK(length(project_id)>0), name TEXT NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version>0),
  created_at INTEGER NOT NULL CHECK(created_at>=0), updated_at INTEGER NOT NULL CHECK(updated_at>=created_at)
) STRICT;

-- 节点是一次使用实例，同一张图片可以被多个节点引用。
-- x/y 与 card_width/card_height 是画布 UI 坐标和尺寸，不是请求分辨率。
-- 复合唯一键专门支持同工程的连线校验，不能只验证节点 ID 存在。
-- 删除节点级联删边和节点引用，资产及生成任务则独立保留。
-- 不在节点表复制资产路径，改文件位置无需更新所有节点实例。
-- kind 使用原有节点族，具体端口兼容与循环检查仍归画布业务层。
CREATE TABLE canvas_node (
  -- node_id 是实例身份，复制节点必须生成新 ID，而不是借用媒体资产编号。
  -- project_id 归属不能从当前打开的标签页猜测，必须在写入时明确提供。
  -- title 保存节点显示文字，和 asset_file.file_name 有独立生命周期。
  -- x/y 允许负数以支持无限画布，不在数据库强行限制为可见视口范围。
  -- card_width/card_height 是正数，不代表显示内容的真实像素尺寸。
  -- kind 区分已有节点族，本表不保存 React 组件名称或 DOM 句柄。
  -- 节点选择、焦点、hover 和拖动中的未提交值不入库。
  -- UNIQUE(project_id,node_id) 为边的双端点校验提供可引用父键。
  -- 同源节点各有位置，因此一个节点移动不会改写另一个实例的 x/y。
  node_id TEXT PRIMARY KEY CHECK(length(node_id)>0), project_id TEXT NOT NULL REFERENCES canvas_project ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('image','video','audio','text','scene','composition')),
  title TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL,
  card_width REAL NOT NULL CHECK(card_width>0), card_height REAL NOT NULL CHECK(card_height>0), UNIQUE(project_id,node_id)
) STRICT;

-- 两端分别带工程 ID 约束，A 工程节点不能连到 B 工程。
-- 删除任一端点会清理连线，不留下无法解析的悬空端口。
-- 自连先由数据库拒绝，多节点有向循环需要画布引擎另外判断。
-- 同一对端口只允许一条连接，重复通知不能制造重复输入。
-- 端口名保存业务标识，不保存被本地化后的界面标题。
-- 选中和最近操作顺序不会重写连线或资产的身份。
CREATE TABLE canvas_edge (
  -- edge_id 属于当前图关系，删除后重新连线可使用新的身份。
  -- project_id 在两组外键中重复使用，用来证明端点确实属于同一工程。
  -- source_node_id 和 target_node_id 都必须存在，仅校验起点是不够的。
  -- source_port 与 target_port 描述业务端口，国际化显示名称不进入关系键。
  -- CHECK 拒绝直接自环，但不负责检测经多个节点回到起点的有向环。
  -- UNIQUE 禁止完全相同的重复连接，重放事件不能增加第二条等价输入。
  -- 只删连线不会删除端点，也不删除端点正在使用的资产。
  -- 端口媒体类型匹配仍由现有画布引擎负责，不能因外键通过就宣称连接合法。
  -- 连线预览和未释放鼠标的临时线不应登记到这张权威关系表。
  edge_id TEXT PRIMARY KEY CHECK(length(edge_id)>0), project_id TEXT NOT NULL REFERENCES canvas_project ON DELETE CASCADE,
  source_node_id TEXT NOT NULL, target_node_id TEXT NOT NULL, source_port TEXT NOT NULL, target_port TEXT NOT NULL,
  CHECK(source_node_id<>target_node_id), UNIQUE(project_id,source_node_id,target_node_id,source_port,target_port),
  FOREIGN KEY(project_id,source_node_id) REFERENCES canvas_node(project_id,node_id) ON DELETE CASCADE,
  FOREIGN KEY(project_id,target_node_id) REFERENCES canvas_node(project_id,node_id) ON DELETE CASCADE
) STRICT;

-- 节点引用资产，一行一个角色与槽位；复制节点可以继续引用同一资产。
-- 删除节点只移除这些引用，不能级联进入资产表。
-- 手动输入与显示产物通过 role 区分，不把连线临时结果重复存一遍。
-- 复合主键让重复保存同一槽位可被明确识别。
CREATE TABLE node_asset (
  -- node_id 与 asset_id 是多对多关系，同一资产可以在不同节点使用。
  -- role=display 等值由调用方约定，不能用翻译后的 UI 标题作为稳定角色。
  -- position 区分同一角色的多个槽位，不将资产 ID 拼成字符串列表。
  -- 删除节点会清本关系，但不会触发 asset 的删除动作。
  -- 删除资产前则必须先检查本关系，因为活工程可能仍在引用它。
  -- 关系中不缓存文件名，资产位置变化后不需要遍历所有节点改名。
  -- WITHOUT ROWID 使用已有复合主键定位，减少纯关系表的额外行号存储。
  -- 未来引用回收应同时查历史输入输出，不能仅凭本表为空就删磁盘文件。
  node_id TEXT NOT NULL REFERENCES canvas_node ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES asset ON DELETE RESTRICT,
  role TEXT NOT NULL, position INTEGER NOT NULL CHECK(position>=0), PRIMARY KEY(node_id,role,position)
) STRICT, WITHOUT ROWID;

-- 任务来源保留稳定快照，节点删除后仍能解释历史来自哪个工程。
-- 活动外键可以置空，快照字段不能因为删除节点一起擦掉。
-- 任务只由一个节点来源登记；创作页发起的任务可以没有此关系。
-- 不强制 node_id_snapshot 指向仍存在的对象，否则就失去历史证据的意义。
CREATE TABLE node_run (
  -- job_id 唯一约束表示任务来源只登记一次，不表示一个节点只能执行一次。
  -- 活动 node_id 可空，兼容来源节点已经被用户删除的历史。
  -- project_id 与 node_id 的复合外键拒绝把来源节点挂到另一个工程。
  -- 节点级联删除将两个活动字段一并置空，快照仍保存原工程和节点身份。
  -- node_id_snapshot 只用于追溯，不保证界面还能跳转到已删除节点。
  -- project_id_snapshot 同理，不应为恢复导航而重新创建被删除工程。
  -- 创作页直接提交的任务不需要伪造画布节点，可以完全没有本关系。
  -- 历史来源是只读证据，不跟随最近点击的节点发生变化。
  job_id TEXT PRIMARY KEY CHECK(length(job_id)>0) REFERENCES generation_job ON DELETE RESTRICT,
  node_id TEXT, project_id TEXT REFERENCES canvas_project ON DELETE SET NULL,
  node_id_snapshot TEXT NOT NULL, project_id_snapshot TEXT NOT NULL,
  CHECK(node_id IS NULL OR project_id IS NOT NULL),
  FOREIGN KEY(project_id,node_id) REFERENCES canvas_node(project_id,node_id) ON DELETE SET NULL
) STRICT;

-- 草稿与提交配置分表，当前改宽高不会重写历史任务。
-- 正文使用不可变 prompt_document，新编辑通过更新引用切换到新正文。
-- 这里只是草稿的公共标量；模型多选和参考图必须放各自附表。
-- width/height 同样是请求像素，不借用卡片显示尺寸。
CREATE TABLE generation_draft (
  -- draft_id 是可编辑草稿的身份，不复用 config_id 免得两种生命周期混淆。
  -- prompt_id 可以切换到新正文，但不能原地改写旧 prompt_document。
  -- workflow_id 属于当前草稿选择，提交后应复制到新的冻结配置。
  -- width/height 保留尚未提交的参数，不证明已有媒体被重新采样。
  -- updated_at 用于拒绝明显过期的写入，不等同于完整多窗口冲突合并系统。
  -- 同毫秒的竞争写入仍需业务版本号协调，本轮不承诺解决此类冲突。
  -- 删除节点后可能留下无归属草稿；清理策略必须检查是否仍有其他引用。
  -- v1 只建公共字段，更多表单参数应按真实适配需求新增结构迁移。
  draft_id TEXT PRIMARY KEY CHECK(length(draft_id)>0), prompt_id TEXT NOT NULL REFERENCES prompt_document ON DELETE RESTRICT,
  workflow_id TEXT NOT NULL, width INTEGER CHECK(width>0), height INTEGER CHECK(height>0), updated_at INTEGER NOT NULL CHECK(updated_at>=0)
) STRICT;

-- 草稿归属二选一：创作页作用域，或具体画布节点。
-- CHECK 避免同时绑定两边而发生串值，也拒绝无主草稿。
-- 节点删除只清归属，不倒过来清任务或资产；孤立草稿由后续专用清理处理。
-- create_scope 可以描述不同创作模式，不等同于登录账户身份。
CREATE TABLE draft_owner (
  -- draft_id 一对一归属，不能让同一份可变草稿同时供多个节点编辑。
  -- create_scope 非空表示创作模式的独立草稿，不是云端账号所有权。
  -- node_id 非空表示当前节点草稿，复制节点应创建另一份草稿和归属。
  -- 两列均为空会被拒绝，避免出现看似已保存却找不到调用者的归属行。
  -- 两列均非空也会被拒绝，防止创作页与节点共享可变参数。
  -- 节点 ID 的 UNIQUE 防止同一节点持有两份互相矛盾的活动草稿。
  -- create_scope 的 UNIQUE 允许不同创作模式分开保存，不要求全站只有一份草稿。
  -- 删除本归属并不会回头删除已经提交的生成配置和任务。
  draft_id TEXT PRIMARY KEY CHECK(length(draft_id)>0) REFERENCES generation_draft ON DELETE CASCADE, create_scope TEXT UNIQUE,
  node_id TEXT UNIQUE REFERENCES canvas_node ON DELETE CASCADE,
  CHECK((create_scope IS NOT NULL AND node_id IS NULL) OR (create_scope IS NULL AND node_id IS NOT NULL))
) STRICT;

-- 草稿模型行可变，提交时复制到独立 config_model，不能共用这些行。
-- 关系以角色和位置标识槽位，多选 LoRA 不存成一个 JSON 数组。
-- 删除草稿才删除该组绑定，不影响其他节点引用同一模型版本。
CREATE TABLE draft_model (
  -- draft_id 决定绑定归属，不可因为模型相同而与其他草稿共享本行。
  -- role 与 position 共同描述当前模型槽位，避免多个 LoRA 覆盖主模型。
  -- version_id 可空以兼容尚未解析目录来源的模型选择。
  -- submitted_name 保留执行器将使用的标识，不应存截断后的卡片标题。
  -- strength 是本草稿当前权重，复制草稿时应按值复制而不是共享可变对象。
  -- 本表允许后续独立更新，但 config_model 在任务创建后保持冻结。
  -- 删除草稿级联移除本行，模型目录和本地权重文件不会受影响。
  -- 具体角色允许的模型类型仍由现有表单能力规则校验。
  draft_id TEXT NOT NULL REFERENCES generation_draft ON DELETE CASCADE, role TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0), version_id TEXT REFERENCES model_version ON DELETE RESTRICT,
  submitted_name TEXT NOT NULL, strength REAL, PRIMARY KEY(draft_id,role,position)
) STRICT, WITHOUT ROWID;

-- 每个草稿参考图是一个稳定槽位，@ 标签可以换显示名但资产身份不变。
-- 提交时冻结成 generation_input，之后改连线不会改变旧任务输入顺序。
-- 这里只记录手动参考，不把所有可推导的连线输入重复物化。
CREATE TABLE draft_input (
  -- asset_id 引用当前手动输入，文件路径变化不应改变输入身份。
  -- input_role 区分不同输入用途，不把首尾帧混成无序图片集合。
  -- position 在角色内唯一，拖动参考顺序时需要明确的关系更新事务。
  -- 同一资产可在不同角色出现，不以 asset_id 单独做去重主键。
  -- 提交时复制生成输入快照，草稿后续更改不会改变已经运行的任务。
  -- 删除草稿仅清本关系，不删除用户导入的外部原件。
  -- 从画布连线可推导的引用先由引擎解析，不重复保存多份活动输入列表。
  -- 实际上传/本地读取仍要确认媒体可用性，本外键不能证明文件未丢失。
  draft_id TEXT NOT NULL REFERENCES generation_draft ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset ON DELETE RESTRICT, input_role TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0), PRIMARY KEY(draft_id,input_role,position)
) STRICT, WITHOUT ROWID;

-- 标签只用于整理，不自动加入发送给模型的提示词。
-- 名称唯一防止同一个本机标签重复创建；它与关键词的同字内容不自动合并。
-- 资产和模型各用有类型的关联表，避免无法设置外键的 target_type/target_id 万能关系。
CREATE TABLE tag (
  -- tag_id 是整理标签身份，改名不需要重写每一条资产关系。
  -- name 保留用户输入，不自动翻译成当前 UI 语言。
  -- 本机名称按默认二进制规则比较，大小写与同义词合并尚未接入。
  -- 禁止空名称，但不在数据库 trim 用户选择，避免无授权改变字面值。
  -- 标签删除只清关系，不删除它曾标注的资产或模型。
  -- 标签使用次数由关系表汇总，不缓存一份容易失步的 count。
  -- 标签与 keyword 的同字内容可以同时存在，二者用途不同。
  -- 不存 UI 选中或展开状态，避免每次点击标签都写一遍数据库。
  tag_id TEXT PRIMARY KEY CHECK(length(tag_id)>0), name TEXT NOT NULL UNIQUE CHECK(length(name)>0)
) STRICT;

-- 一个资产可以有多个标签，一个标签也可以用于多个资产。
-- 复合主键去掉重复绑定，级联只删除关系，不删除另一端实体。
-- 不存标签名称副本，重命名时只修改标签主表。
CREATE TABLE asset_tag (
  -- 资产端外键防止给不存在的逻辑产物设置标签。
  -- 标签端外键防止保存已经被删除的分类身份。
  -- 组合主键让同一个标签对同资产最多生效一次。
  -- 删除资产时只清这些整理关系，不因此删除其他资产仍使用的标签。
  -- 删除标签时也不改变生成来源或画布引用。
  -- 按标签查看资产依靠反向索引，不逐个资产加载标签列表再过滤。
  -- WITHOUT ROWID 不改变主键语义，也不允许重复关系。
  -- 本表没有提示词字段，选择“收藏”等标签不会影响模型输入。
  asset_id TEXT NOT NULL REFERENCES asset ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tag ON DELETE CASCADE,
  PRIMARY KEY(asset_id,tag_id)
) STRICT, WITHOUT ROWID;

-- 模型标签与资产标签分开，错误的模型 ID 不能混进资产外键。
-- 同一模型多次应用标签不会累积重复行。
-- 反向按标签检索由专用索引支撑，不依赖先扫描整个模型库。
CREATE TABLE model_tag (
  -- model_id 必须属于模型主表，资产 ID 即使文字相同也不能被随意代用。
  -- tag_id 可与资产分类共用，实体归属仍由这张有类型的关系表确定。
  -- 组合主键阻止同一模型被重复标注，计数不会因重放事件膨胀。
  -- 删除模型只清本关系，标签本身和其他模型的标注继续保留。
  -- 删除标签不触发模型文件卸载，不把整理操作扩大为磁盘修改。
  -- 反向索引按标签再按模型排列，适合后续从标签列出模型。
  -- 当前模型库尚未改用这些关系，不能把空结果当作用户没有标签。
  -- 生成时用过哪些模型仍查冻结绑定，不从用户标签反推使用事实。
  model_id TEXT NOT NULL REFERENCES model ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tag ON DELETE CASCADE,
  PRIMARY KEY(model_id,tag_id)
) STRICT, WITHOUT ROWID;

-- 外嵌导演台和视频合成器的版本化协议作为完整文档保存。
-- JSON 是此类外部协议的保留边界，并非将历史、模型或连线重新塞进一个大对象。
-- 一个节点每类文档只有一份；覆盖前应由对应工具自行做版本适配。
-- 这里没有真实保存入口，仍由既有工程文档机制持有权威内容，迁移另做。
CREATE TABLE project_document (
  -- node_id 是外部工具文档的归属，不使用网页 iframe 实例编号作为主键。
  -- document_kind 区分导演台与视频合成，两种协议不相互覆盖。
  -- schema_version 由对应工具的适配器解释，不与 SQLite 结构版本强绑定。
  -- body 必须是合法 JSON，但协议语义还需要对应工具的现有校验器。
  -- JSON 中引用媒体时仍需工程归档规则，不把 Base64 作为新的默认保存方案。
  -- 这里保留完整协议，是避免重写外部工具内在结构的明确例外。
  -- 节点删除可清此文档，但导演台导出文件或用户原媒体不被数据库删除。
  -- 本轮没有迁移已有独立场景文档，不宣称这些外部工具已经切换数据库。
  node_id TEXT NOT NULL REFERENCES canvas_node ON DELETE CASCADE,
  document_kind TEXT NOT NULL CHECK(document_kind IN ('director','composition')),
  schema_version INTEGER NOT NULL CHECK(schema_version>0), body TEXT NOT NULL CHECK(json_valid(body)),
  PRIMARY KEY(node_id,document_kind)
) STRICT, WITHOUT ROWID;

-- 迁移账本记录数据库结构版本，不冒充已迁移的用户业务数量。
-- checksum 核对已经执行的脚本，防止直接修改旧迁移造成不同机器结构漂移。
-- 应用另用 PRAGMA user_version 快速识别未来格式；两者必须一致。
CREATE TABLE schema_migration (
  -- version 使用整数顺序登记，当前只定义 v1，并没有自动猜测未来结构。
  -- checksum 只统一脚本换行符，不删除注释或改写 SQL 后再计算。
  -- 换行规范化避免同一 Git 源码在 Windows 和其他系统产生无意义摘要差异。
  -- applied_at 表示本机完成结构提交的时间，不能混入用户生成历史。
  -- 迁移登记与建表在同一个事务中提交，不会先升级版本再漏建某张表。
  -- 启动检查摘要失败时保留文件，不清空数据库重建以掩盖结构不一致。
  -- 数据迁移完成量需要后续独立账本，本表的一行不等于用户历史已搬完。
  -- 后续升级应追加 v2 及迁移测试，不能直接编辑已经发出的 v1 脚本。
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL CHECK(applied_at>=0)
) STRICT;

-- 游标按毫秒加稳定 ID 排序，时间相同也能翻页，不用越翻越慢的大 OFFSET。
-- 软删除条件与查询完全一致，部分索引不会为已删资产保存无用目录项。
-- 下列反向索引补齐外键检索，避免删除父对象时为了核对引用扫描整张子表。
-- UNIQUE 已覆盖的前导列不重复建索引，减少每次写入维护的 B-tree 数量。
CREATE INDEX idx_asset_recent ON asset(created_at DESC,asset_id DESC) WHERE deleted_at IS NULL;
-- 分类索引先定位 media_kind，再以相同的时间和 ID 顺序继续翻页。
-- 单独给 kind 建一个低选择性索引不能同时解决分类与排序。
CREATE INDEX idx_asset_kind_recent ON asset(media_kind,created_at DESC,asset_id DESC) WHERE deleted_at IS NULL;
-- 资产的多个副本按 file_id 继续读取，资产外键检查也能利用相同前缀。
-- file.page 不需要先枚举所有目录再从文件名中找出对应副本。
CREATE INDEX idx_asset_file_asset ON asset_file(asset_id,file_id);
-- model_id 是版本表的子端外键，删除模型时据此快速确认是否还有版本。
-- 不把 version_name 加进索引，因为当前没有按版本显示名排序的查询。
CREATE INDEX idx_model_version_model ON model_version(model_id);
-- 版本存在多个权重文件时，这个索引避免逐文件扫描确认父版本引用。
-- 文件名唯一索引的第一列是 folder_id，不能代替 version_id 检索。
CREATE INDEX idx_model_file_version ON model_file(version_id);
-- 权重目录的反向引用决定目录能否删除，不能只检查普通媒体文件。
-- 目录加文件名唯一键已经覆盖此方向，无需再维护相同前缀的额外索引。
-- 已有 UNIQUE(folder_id,file_name) 提供目录前缀，此处不重复创建同方向索引。
-- 下载时间与本地 ID 组合保证同毫秒任务也有稳定翻页位置。
-- 不索引每次网络速度更新，避免瞬时进度变化产生额外磁盘工作。
CREATE INDEX idx_download_recent ON download_job(created_at DESC,download_id DESC);
-- 权重文件删除前可以按此确认哪些下载保留了活动关联。
-- 找到关联后只置空外键，不删完成时间等历史事实。
CREATE INDEX idx_download_file ON download_job(model_file_id);
-- 目标目录即使尚无成功文件也可能被在途下载引用。
-- 此索引防止目录删除检查遗漏失败或未完成的下载行。
CREATE INDEX idx_download_folder ON download_job(target_folder_id);
-- 词条是否还被已保存正文引用，依靠 keyword_id 反向核对。
-- prompt_id 的索引无法代替这个方向，不能只给关系表建一个索引。
CREATE INDEX idx_prompt_usage_keyword ON prompt_keyword_usage(keyword_id);
-- 查看同正文的明确插入记录时按 position 排列，保留多次出现的顺序。
-- usage_id 仍负责区分重复词，而不是让排序列承担唯一身份。
CREATE INDEX idx_prompt_usage_prompt ON prompt_keyword_usage(prompt_id,position);
-- 正文被冻结配置引用时必须拒绝删除，核对不需扫描所有历史配置。
-- 索引不复制正文文字，长提示词不会在多个 B-tree 中重复存一遍。
CREATE INDEX idx_config_prompt ON generation_config(prompt_id);
-- 模型版本清理时查的是冻结绑定，不依赖当前模型库卡片是否可见。
-- NULL 来源版本仍允许保留名字快照，不会自动填成某个同名版本。
CREATE INDEX idx_config_model_version ON config_model(version_id);
-- 历史页先按任务时间取少量行，再联查冻结参数和正文摘要。
-- 不能先把所有模型和输入 JOIN 到历史页，再对膨胀结果取 LIMIT。
CREATE INDEX idx_job_recent ON generation_job(created_at DESC,job_id DESC);
-- 配置可能被多次任务复用，删除或检查配置需要这个反向引用方向。
-- 同时服务冻结模型槽触发器中的 EXISTS，不为每次保护检查扫描全任务。
CREATE INDEX idx_job_config ON generation_job(config_id);
-- 统计只读取 completed/failed，部分索引与查询条件完全对应。
-- finished_at 使用毫秒范围比较，不包一层 date 函数破坏索引定位。
CREATE INDEX idx_job_finished ON generation_job(finished_at) WHERE status IN ('completed','failed');
-- 输入的资产引用不能被节点引用计数代替，两者拥有不同生命周期。
-- 此索引让资产清理检查能找到仍需重跑旧任务的输入事实。
CREATE INDEX idx_input_asset ON generation_input(asset_id);
-- 尝试记录的复合外键包含 job_id 与 attempt_id，两列一起用于归属核对。
-- 单任务 output_index 唯一索引不能准确替代按尝试聚合的方向。
CREATE INDEX idx_output_attempt ON generation_output(job_id,attempt_id);
-- 起点已由端口唯一索引的前导列覆盖，终点需要另外提供方向。
-- 删除目标节点时无需扫描工程内所有连线才找出入边。
CREATE INDEX idx_edge_target ON canvas_edge(project_id,target_node_id);
-- 工程的边列表以 edge_id 继续翻页，端点索引无法同时满足这种排序。
-- edge.page 的计划测试会检查这里被使用且未产生临时排序树。
CREATE INDEX idx_edge_page ON canvas_edge(project_id,edge_id);
-- 同一资产用于哪些节点，是物理清理之前必须反查的关系。
-- 关系主键从 node_id 开始，不能依靠它快速按 asset_id 定位。
CREATE INDEX idx_node_asset_reverse ON node_asset(asset_id);
-- 任务来源的活动节点通过工程与节点一起受外键保护。
-- 删除节点触发置空时，这个复合索引避免遍历所有历史来源。
CREATE INDEX idx_node_run_project ON node_run(project_id,node_id);
-- 草稿同样会引用旧正文，正文删除不能只检查冻结配置就放行。
-- 当前草稿与历史配置各自独立，不合并为一张含可变标记的大表。
CREATE INDEX idx_draft_prompt ON generation_draft(prompt_id);
-- 模型版本还可能被尚未提交的草稿选择，不能只看历史任务使用关系。
-- 将来清理模型时要检查两个方向，而不是按“没有生成过”直接卸载。
CREATE INDEX idx_draft_model_version ON draft_model(version_id);
-- 草稿参考图也是有效资产引用，未提交不等于用户不再需要该文件。
-- 目录清理时应与历史输入、画布显示关系共同检查。
CREATE INDEX idx_draft_input_asset ON draft_input(asset_id);
-- 标签浏览从 tag_id 开始，组合键中的 asset_id 提供稳定结果身份。
-- 正向主键用于去重，反向索引用于筛选，二者不是重复索引。
CREATE INDEX idx_asset_tag_reverse ON asset_tag(tag_id,asset_id);
-- 模型整理与资产整理使用相同标签身份，但各自检索本域的实体。
-- 不通过模型文件名模糊匹配，避免同名模型跨来源时错挂标签。
CREATE INDEX idx_model_tag_reverse ON model_tag(tag_id,model_id);

-- 提交配置和正文只追加，防止一次表单编辑改写过去的生成依据。
-- SQLite 触发器保护直接 SQL 写入路径，不能只靠界面按钮禁用。
-- 删除仍受任务引用的外键限制；这里不提供清历史的万能级联入口。
CREATE TRIGGER frozen_config BEFORE UPDATE ON generation_config BEGIN SELECT RAISE(ABORT,'immutable configuration'); END;
CREATE TRIGGER frozen_prompt BEFORE UPDATE ON prompt_document BEGIN SELECT RAISE(ABORT,'immutable prompt'); END;
-- 模型槽在任务创建前可以组装，创建任务后不再允许插入、修改或删除。
-- 先组装配置、模型槽，再创建任务，三者应放在同一个写事务中。
-- 删除配置触发级联时也经过该保护，任务历史不能间接失去模型快照。
CREATE TRIGGER frozen_model_insert BEFORE INSERT ON config_model WHEN EXISTS(SELECT 1 FROM generation_job WHERE config_id=NEW.config_id) BEGIN SELECT RAISE(ABORT,'immutable bindings'); END;
CREATE TRIGGER frozen_model_update BEFORE UPDATE ON config_model WHEN EXISTS(SELECT 1 FROM generation_job WHERE config_id IN (OLD.config_id,NEW.config_id)) BEGIN SELECT RAISE(ABORT,'immutable bindings'); END;
CREATE TRIGGER frozen_model_delete BEFORE DELETE ON config_model WHEN EXISTS(SELECT 1 FROM generation_job WHERE config_id=OLD.config_id) BEGIN SELECT RAISE(ABORT,'immutable bindings'); END;
