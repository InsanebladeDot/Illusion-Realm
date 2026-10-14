# Illusion Realm 前端账户接口迁移包

将整个 `frontend-handoff` 文件夹复制到前端项目的文档目录，例如 `docs/backend-account/`，保持包内相对结构，然后从 [前端账户接口文档](frontend-account-api.md) 开始阅读。

| 文件 | 用途 |
| --- | --- |
| [frontend-account-api.md](frontend-account-api.md) | 主入口：登录方式、请求与响应、注册激活、令牌刷新/退出、错误码、TypeScript示例 |
| [references/account-stage-two.md](references/account-stage-two.md) | 账户、会话、角色与私有资源权限契约；含当前图片/收藏读取接口概况 |
| [references/http-account-verification.md](references/http-account-verification.md) | 本地HTTP、邮件与人工验收的历史记录 |
| [references/redis-registration-verification.md](references/redis-registration-verification.md) | Redis限流、邮箱冷却、并发准入与验证边界 |

这里是后端文档的迁移快照，后端原文件仍保留在 `architecture/`。本包包含主文档直接引用的三份关联资料；这些资料继续引用的数据库迁移、SQL、环境配置、后端压测等文件没有复制，已改为明确的“后端仓库参考”文字，不形成失效的包外链接。

快照中的 `src/`、`scripts/`、`.build-tools/`、后端本机地址和启动命令均指后端工程，前端不必复制这些目录或运行压测/数据库操作。历史验证记录不代表服务当前在线，API部署地址由后端提供。浏览器跨域尚未配置，联调需按主文档使用同源代理或后续明确的CORS配置。

本包仅含Markdown文档，不含凭据、`.env`、数据库备份、日志、测试数据或运行代码。它不替代前端项目已有的AGENTS规则，也不授权操作云服务。

接口变化后，应在后端更新原文档并运行 `scripts/export-frontend-docs.ps1` 重新生成四份快照，再整体同步本文件夹到前端项目；避免在两边分别维护不同的接口定义。
