> 前端迁移快照，导出日期：2026-10-14。来源：后端仓库 `architecture/account-stage-two.md`。包内链接已调整；源码、脚本、本地路径及凭据配置说明均指后端工程，不要求在前端创建或执行。更新时从后端重新导出。

# 第二阶段：账户、会话、角色与私有权限

日期：2026-10-12。沿用 Java 25 / Boot 3.5.16 / MyBatis / MVC 单体。用户已确认注册必须邮箱验证后激活。运行模式仍是 local 默认不创建云客户端；cloud 才启用真实账户 Mapper 和服务。本文取代第一阶段“全部业务尚未实现”的当前状态描述；第一阶段验证记录作为历史保留。

## API

前端请求/响应示例、字段类型与登录会话接入步骤见 [前端账户接口文档](../frontend-account-api.md)。

请求和响应沿用 `/api/v1`、success/code/message/data/requestId；ID 和 revision 全部为十进制字符串，时间 UTC Z。鉴权使用 **Authorization: Bearer 访问令牌**，不设置 Cookie，刷新令牌只能放 JSON 请求体，不能作访问令牌。所有账户响应默认 no-store（Security 默认缓存头），登录/刷新明确 no-store。

| 方法与路径 | 请求/用途 | 权限 |
| --- | --- | --- |
| POST /auth/register | email、password（12–128 字符）、displayName | 访客；只创建 user/pending_verification，不接受客户端角色或 ownerId |
| POST /auth/verification/resend | email | 访客；无论不存在/已激活/发送次数已达限额均为相同空成功响应 |
| POST /auth/verify-email | token | 一次性验证凭据，非刷新/访问令牌；成功激活 |
| POST /auth/login | email、password、deviceName | 只接受 active 账户；不存在、错误密码、未验证和封禁统一 401 |
| POST /auth/refresh | refreshToken | 轮换 rt_ 令牌；旧摘要不能重复消费 |
| POST /auth/logout | 无正文 | 当前会话；撤销后旧访问/刷新均失效 |
| POST /auth/logout-all | 无正文 | 当前账户；递增 auth_version 并撤销全部会话 |
| GET /account/me | 私人资料 | 当前账户 |
| PATCH /account/me | displayName、bio（可空）、expectedRevision | 当前账户；冲突 409 REVISION_CONFLICT |
| POST /account/me/password | currentPassword、newPassword | 验证当前密码，撤销所有会话，修改后重新登录 |
| GET /account/me/sessions | 最多 100 条最近会话，含到期/撤销时间；不返回摘要或原令牌 | 当前账户 |
| DELETE /account/me/sessions/{id} | 撤销一条自己的会话 | 其他人的会话统一 404 |
| PATCH /admin/accounts/{id}/access | role、maintainedLibraries（最多3个）、status（active/disabled）、expectedRevision | admin；只管理已验证的账户；禁止自改权限，保持初始管理员可恢复 |
| GET /images/{id} | 图片卡片字段，原始 sizeBytes/revision 字符串 | public 或所有者；私有/删除/未就绪统一404 |
| GET /collections/{id} | 收藏夹小字段 | public 或所有者；私有/删除统一404 |
| GET /collections/{id}/items | size（1–100，默认24）、可选cursor | 先核验夹，再通过一次 SQL JOIN 按每张图当前权限过滤 |

上表路径统一加 `/api/v1`。没有实现文件下载、上传、生成摘要、创建收藏夹、可见性写操作或官方标签发布；不返回假数据/永久地址。管理员/维护者都不能因角色读取他人的私有图或私有夹。公开夹不公开私有图，已撤回图立即不再出现在新查询。所有资源读取都查权威 MySQL，不通过 Redis 决定权限；所属账户 active、图片 ready/deleted_at 和收藏夹删除状态一并核验。

items 游标是 `collectionId:revision:sortOrder:imageId`，sortOrder 为 signed BIGINT 十进制字符串，防跨夹与旧修订拼接。SQL 使用排序号＋图片ID键集分页，先过滤权限再 LIMIT size+1；返回 items、nextCursor、revision，不泄露过滤前总数或私人标题。READ COMMITTED 下返回前重检夹的当前可见性与修订；图片筛选在 SQL 最新已提交状态中完成，不把公开夹当成图片授权。

维护库能力通过 RolePolicy 的明确应用接口判断：maintainer 仅限维护分配的 pose/background/expression，空数组无权；admin 可管理三个官方库。该规则已实现及测试，但官方库写接口留到发布阶段，每次写入必须在事务内重检账户授权。

## 账户和邮件

邮箱规范化为 strip + Locale.ROOT 小写；注册不覆盖已有密码。顺序注册重复邮箱返回相同空成功响应，并发唯一竞争也由 Controller 转为同样响应；不会直接返回邮箱存在信息。登录使用真实 PBKDF2-HMAC-SHA256（Spring 5.8 预设，随机盐、310000迭代、算法前缀），未知邮箱执行 dummy hash 校验；不使用 SHA256 密码。第三方或历史密码编码迁移需要单独支持，未知算法不可假装登录成功。

注册在同一数据库事务写 user、显式 quota、outbox 和 verify_email 摘要。只在 transaction 提交后发邮件；SMTP 失败返回503，但已创建的 pending 账户保留，用 resend 恢复。SMTP 缺配置时在创建用户之前503。发送后网络故障可能需要用户重试 resend，不承诺数据库与邮件原子性，也不假称邮件已经送达收件箱。

验证码使用 32 个安全随机字节，ve_ 与 rt_ 前缀隔离用途，MySQL只存SHA256摘要；verify_email 在用户→令牌行锁事务内检查用途/到期/消费状态，消费一次并激活账户。公共响应、toString 和日志不包含验证原值。每账号一小时至多生成3个验证令牌（含注册），超额统一空响应；旧未消费令牌按到期时间有效，首次成功激活后其余不可重复激活。

SMTP_ENABLED 默认false；SMTP_HOST/PORT/USERNAME/PASSWORD/FROM仅由本地/部署配置提供。587 强制STARTTLS，465强制TLS，验证服务端主机身份，连接/读/写超时5秒，无 mail debug。未真正连接或发送邮件；单元/Web测试替换邮件交付边界，不称为真实 SMTP 验证。找回密码、邮箱修改、头像和社交资料编辑未进入本次范围；当前密码修改已实现。

## 令牌、撤销与配置

使用 Spring Security OAuth2 JOSE/Nimbus，签名固定 HS256，校验签名、JWT type、issuer、audience、purpose=access、iat/nbf/exp及最长生存时间，无 preview。JWT仅含用户ID、sessionId、authVersion及标准声明，不放角色/邮箱/密码。每个 Bearer 请求通过 MySQL单条JOIN核验账户active、session未撤销/未过期、双方auth_version与令牌一致，再从当前DB角色/库分配生成身份。数据库不可用时503并失败关闭；签名或授权失效401，不能退回访客身份访问公开路由。

AUTH_SIGNING_KEY 为至少32个随机字节的base64秘密；AUTH_ISSUER为真实HTTPS地址；AUTH_AUDIENCE默认illusion-realm-api；访问TTL默认10分钟（允许1–15分钟），session TTL默认30天（允许1–30天），验证TTL默认30分钟（允许5分钟–1天）。AUTH_INITIAL_QUOTA_BYTES必须显式设置无符号整数，可为0表示尚不开放上传；不假设免费云容量。HMAC密钥变更会使旧访问令牌失效，刷新会话仍通过DB权威检查后重新签发；多副本需共享相同密钥和时间基准，HTTPS由部署层提供。

刷新保持原session到期时间、不无限延期，用户→session锁且旧摘要条件更新才签发新令牌。并发只有一个刷新成功；如果成功响应丢失，旧token无法再用，用户重新登录。未实现会话家族复用检测，不将一次性轮换称为完整复用告警机制。

资料、密码、角色/库分配、状态变更按边界事务执行；角色/库权限/封禁/改密码/退出全部设备递增auth_version并撤销会话。角色管理先锁用户（多用户按数值ID排序），再锁session，重检管理员当前角色及版本；与outbox和成功审计同事务。禁止self管理及未验证账户绕过验证。无默认密码/管理员；初始admin只能由运维在授权隔离/正式数据库中核实一个**已注册、已邮箱验证**账户，停写、备份后手工受控赋予、递增版本、撤销旧会话并记录审计。本次不执行bootstrap，也不提供公共提权路由。

auth公共POST在cloud默认使用Redis原子共享限流：每来源IP 30次/60秒，部署环境总计600次/60秒；注册/重发同时受同邮箱60秒冷却和4个任务名额保护。冷却期间统一200但不访问账户服务/SMTP，任务名额或限额耗尽429＋Retry-After=60。Redis故障503＋Retry-After=5、短暂暂停后恢复尝试，不无界回落到数据库。local及隔离数据库测试保留有界本进程限流（最多1000计数键）；不信任X-Forwarded-For，代理后remoteAddr可能合并，部署前需要明确可信代理配置。授权、唯一账户及配额永远不以限流缓存替代。实现与真实Upstash/HTTP证据见 [Redis注册验证](redis-registration-verification.md)。

数据SQL不打印参数，MyBatis NoLoggingImpl；DTO/配置内部toString脱敏；健康继续隐藏详情。新编号迁移与兼容评审见 迁移说明（后端仓库参考：`database/mysql/migrations/README.md`，未包含在本迁移包），不在应用启动时运行。
