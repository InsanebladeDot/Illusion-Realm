> 前端迁移快照，导出日期：2026-10-14。来源：后端仓库 `architecture/http-account-verification.md`。包内链接已调整；源码、脚本、本地路径及凭据配置说明均指后端工程，不要求在前端创建或执行。更新时从后端重新导出。

# 本地 HTML 与真实账户 HTTP 验证

日期：2026-10-12。用户要求用自己的真实邮箱走注册/邮箱验证/登录/JWT 链路，并验证 SMTP、Redis、存储和部署。收件邮箱由用户在页面中填写；SMTP 是平台发件账户的配置，不是注册用户的邮箱密码。

当前结果：用户已明确回复“所有步骤完成”，确认真实注册、收件、邮箱激活、登录及页面会话检查完成。随后Agent只读核对本次设备标记/最近2小时汇总：1个已验证active账户、1个浏览器会话且已撤销、1个已消费邮箱验证令牌。完整页面检查结果来自用户操作确认；数据库汇总独立支持激活/消费/撤销状态，不等于逐条HTTP抓包。未收集用户密码、令牌或响应正文，未重复注册/发邮件。存储、远程部署、并发与跨账户验收仍未完成。

## 验证页运行

页面地址为 `http://127.0.0.1:18080/verification/`，无尾斜线地址自动307跳转。页面由同一个Spring MVC后端提供，不启用任意CORS。仅显式verification profile、直接loopback请求和loopback Host可访问，异源Origin被拒绝；默认local/cloud均不开放这个入口。验证模式只用于本机，远程部署不得启用。本地直接打开index.html可预览样式，并明确提示通过右上角进入后端地址，所有操作禁用。

页面按用户要求改用Tailwind CSS外链：jsDelivr固定版本2.2.19预编译CSS，HTML使用utility classes，无第三方脚本、无浏览器运行时样式编译。链接使用SHA384完整性校验和匿名CORS；CSP只放行这一CSS地址，脚本与API仍同源。桌面为表单/状态侧栏，窄屏单列。外链样式需要联网，本轮CDN下载及真实Edge computed style验证通过。

```powershell
# 先用 Maven Wrapper verify 构建 JAR。
.\scripts\prepare-verification-env.ps1
# 预览：没有数据库/Redis客户端，注册不可用。
.\scripts\start-verification.ps1 -Port 18080
# 补齐本地 .env 后使用真实依赖；与预览不要同时占用同一端口。
.\scripts\start-verification.ps1 -Cloud -Port 18080
```

准备脚本保留所有已有配置，仅追加缺失键；随机生成至少32字节的认证密钥，不打印、不覆盖旧 key。初次默认 JWT issuer 为 `https://local-verification.invalid`，仅是本机令牌的发行方标识，不代表已经部署或启用 HTTPS。生产时使用真实发行方标识与 HTTPS API。初始额度明确为0，不开放上传。认证 key 只保存在本地被忽略的 `.env`；真实凭据不写入文档/模板/日志。

cloud 启动脚本显式导入后端 `.env[.properties]`，仅绑定127.0.0.1，无自动迁移。需要 JDK25，核对 java/javac；没有JDK25则明确失败。用户可以 Ctrl+C 停止前台进程。

## 需要填写的本地配置

| 键 | 用途 |
| --- | --- |
| DATABASE_URL / MYSQL_SSL_* | 当前专用账户及强制TLS已配置，并完成上一轮TiDB实测 |
| AUTH_SIGNING_KEY / AUTH_ISSUER / AUTH_AUDIENCE / AUTH_INITIAL_QUOTA_BYTES | 准备脚本追加缺失的本地验证值；不替换已有值 |
| REDIS_URL | 真实 `rediss://default:百分号编码密码@主机:端口`；不打印完整URL |
| SMTP_ENABLED | 配置完整后改为true |
| SMTP_HOST / SMTP_PORT | 发件服务主机，587 STARTTLS或465 TLS；不能关闭证书/主机验证 |
| SMTP_USERNAME / SMTP_PASSWORD | 平台发件账户及该服务要求的SMTP授权码/凭据；不在页面输入 |
| SMTP_FROM | 服务允许的发件邮箱地址，可能必须与SMTP账户相同或是已验证地址 |

`.env`采用无引号Java properties语法，特殊反斜线等按properties语法处理；不是所有dotenv格式都可直接加载。不要将真实文件加入共享资料或发行包。真实收件邮箱、账户密码在HTML中填写，无需提交给Agent。

用户已选择QQ邮箱作为平台发件服务，本地已配置 `smtp.qq.com:465`、发件账户和from。用户填入授权码后真实认证返回 `AuthenticationFailedException` / SMTP 535，尚未认证成功；SMTP仍关闭，等待有效授权码。QQ邮箱需开启SMTP并生成授权码，填入SMTP_PASSWORD；它不是QQ登录密码。发件账号仅保存在本地`.env`，本文不重复邮箱地址。

随后用户重新生成并更新授权码，真实Jakarta Mail SMTP AUTH认证通过，TLS证书/主机校验保持开启，没有在这次认证探测中发送邮件。已将本地SMTP_ENABLED设为true并重启真实cloud验证服务；邮件发送/收件仍需用户在页面注册后实际验收，不能将AUTH成功算作邮件投递成功。

## 手动完整链路

1. 检查页面处于真实数据库模式，点击健康检查。liveness仅证明存活；cloud readiness检查真实数据库和Redis。配置状态布尔值只表示已准备，不等于依赖可用。
2. 点击Redis检查：只创建一个随机 `ir:dev:v1:verification:*` 键，30秒TTL，读取比较后删除并确认；清理仅针对本次键，不扫描或清库。失败返回安全错误；不假设缓存业务/outbox已经验收。
3. 使用自己的收件邮箱、至少12字符密码注册。真实注册会提交账户、额度、验证摘要和outbox，并实际请求SMTP发送。统一200不披露是否已注册，也不证明邮件到达；若SMTP失败返回503，账户可能已提交为pending，可重发恢复。
4. 在激活前点击“检查未验证时无法登录”，使用本次新建账户，预期401。未知账户/错误密码也会401，因此必须结合实际注册及后续收件证据判断。
5. 查收邮件，将正文 `ve_` 凭据粘贴到第二步。激活成功200，再次消费401；令牌不放URL，不回显在记录中。
6. 登录后读取资料，使用真实JWT和真实DB session/auth_version进行服务端鉴权。页面只记录状态，不输出邮箱/角色资料正文或令牌。
7. 执行会话检查：有效JWT200、无JWT401、篡改签名401、普通用户调用管理修改403、刷新200、旧刷新再次使用401、刷新后JWT200、退出200、旧JWT401、被撤销刷新401。最后退出本次会话，不对真实账户提权或修改密码。
8. 下载脱敏JSON记录，仅含步骤、时间、HTTP状态、code、requestId及配置布尔值。密码/令牌只留内存，不存localStorage/sessionStorage/cookie，刷新后重新登录。页面关闭不会替代服务端退出；需要撤销时先点退出，或登录后使用会话管理API。

## 已验证与未验证

JDK25 Maven Wrapper `verify` **BUILD SUCCESS：36 tests，0 failures/errors/skips**；包含新增验证入口默认关闭、loopback与Host/Origin限制、local缺依赖503、仅JSON探测以及原账户/安全测试。`node --check`验证页面JavaScript语法；不是SMTP实测。

打包JAR已在本地 `local,verification` 启动，真实HTTP页面/assets/脱敏状态200、Cache-Control no-store、account/me无登录401、缺SMTP注册503、异源Origin401。未发送邮件、未因此注册真实账户；没有将local健康UP视为云依赖通过。

真实Edge浏览器检查通过：页面脚本与状态加载、缺cloud配置的操作保持禁用、实际点击健康按钮并获得200、没有页面运行异常或localStorage/sessionStorage持久化、1200宽桌面与390宽窄屏没有横向溢出，截图已目视检查。浏览器验证脚本 `scripts/browser-verification-smoke.mjs` 只允许loopback，在local预览调用健康检查，不自动输入邮箱或凭据、不调用注册。使用独立本地浏览器目录，截图不包含真实凭据。

QQ SMTP已用本机JDK25真实连接核验：465端口TLSv1.3，验证证书和smtp.qq.com主机身份，服务返回220欢迎响应及250 EHLO响应，广告支持AUTH。该检查没有提交用户名/授权码、没有AUTH认证、没有发送邮件，不等同于发件成功或收件成功。

最后仅更新了收件邮箱及健康检查说明资源，初次重新打包因正在运行的Windows JAR被锁定失败；停止本次预览进程后 `package -DskipTests` 成功，再次启动最终JAR。Java行为代码与36项通过测试时一致；这次资源打包没有重复计算测试通过数量。

本轮真实注册/收件/激活/登录/JWT页面流程已由用户确认全部完成，并获得前述数据库汇总状态支持。此前 TiDB回滚验证（后端仓库参考：`architecture/tidb-cloud-verification.md`，未包含在本迁移包） 证明Mapper和结构可用，与本次完整HTTP人工验收分开记录。

用户随后提供Upstash rediss地址并授权检查，本地REDIS_URL已按Java properties语法校正，未加双引号。真实cloud JAR在 `127.0.0.1:18080` 启动，Redis SET（30秒TTL）/GET/DEL/EXISTS实测全部通过，读取一致且删除已确认。驱动仍为Lettuce FULL证书/主机验证，未关闭TLS检查；不打印完整地址或密码。cloud readiness首次检查503，后续复核HTTP200/UP、liveness200/UP，健康不暴露details/components。首次503发生在延迟连接初始化阶段，未捕获具体组件失败证据，不能将其忽略或假定永不再出现。

初次真实cloud注册在SMTP关闭时实测503，发生在账户创建前；没有用测试地址注册云账户。该阶段注册/重发关闭；随后SMTP535问题通过更新授权码解决。

更新授权码后SMTP认证成功，页面允许注册/重发；先前535失败保留作为排查记录，已经解决。用户随后在页面完成注册、收件激活和会话流程，脚本未代填用户的邮箱和密码。

最终cloud+SMTP配置下再次进行了真实Edge浏览器检查：注册/重发按钮可用，登录/Redis按钮可用，健康按钮实际请求成功，桌面/窄屏与不持久化检查通过；没有代用户提交注册。运行中的cloud HTTP接口对非法JWT实际返回401。当时本机验证进程绑定127.0.0.1:18080；不是部署或公开服务。随后按用户要求停止服务并删除全部应用用户及关联数据，完成 注册压测（后端仓库参考：`architecture/registration-load-verification.md`，未包含在本迁移包），旧账户不可继续登录；服务当前保持停止。

Tailwind换肤后JDK25 Maven Wrapper定向 `VerificationPageTest,FoundationIntegrationTest verify` BUILD SUCCESS：13项相关测试，0 failures/errors/skips；路由307跳转、CSP允许CSS、默认关闭和Origin/Host限制通过。真实Edge再次检查外链CSS加载及完整性/CSP、页面JS/健康按钮、桌面1200和窄屏390布局无横向溢出、本地文件入口提示和按钮禁用。换肤没有重新运行用户的账户链路，截图只使用空表单。

图片文件的上传/签发地址/对象存储接口尚未实现，不能通过HTML伪造上传成功。部署目标及配置尚未提供，未远程部署；后续应先选定对象存储和部署目标，完成实际接口与可审查部署配置后开展对应验证。并发、跨账户私有资源及管理变更另行验收，不根据本次单账户会话检查推断通过。
