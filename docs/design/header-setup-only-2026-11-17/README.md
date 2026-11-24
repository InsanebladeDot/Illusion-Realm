# 标题栏侧栏开关与独立 Setup 打包

标题栏顺序现在是“后退 <、前进 >、侧栏折叠、面包屑”。原侧栏品牌行整体删除；R 标志只用作软件图标，已替换客户端 `assets/icon.png`，Windows ICO 继续由原工具生成。沿用原侧栏 Zustand 状态、中文/英文提示、HoverTip、窗口 no-drag 和主区宽度规则，没有新建另一套折叠状态。821px 以上显示开关，820px 及以下与桌面导航一起隐藏，保留原移动端导航规则。

## 独立打包命令

仓库根目录执行：

```powershell
pnpm build:setup
```

它重新封装原安装向导，包含已存在的客户端引擎，可以实际安装。不会构建 Next，不会重新打包客户端。首次缺少引擎先运行一次 `pnpm build`；本轮已经执行首次完整构建。

只需分发 `apps/electron/release/setup/Illusion-Realm-Setup-0.1.0.exe` 一个文件。版本读取 `apps/electron/package.json`。向导复用原 NSIS 安装、修复、许可、快捷方式和卸载规则，发布始终关闭。

请保留上次完整构建的 `release/illusion-realm-engine-0.1.0.exe` 与 `release/installer-stage/payload/manifest.json`。只打 Setup 会先核对版本、注册身份、容量和引擎 SHA-256；缺少或不匹配则明确报错，不悄悄变成完整构建。配对清单保存安装容量，所以再次封装不依赖 `win-unpacked`。客户端代码、页面或客户端图标变化后应完整构建；只打 Setup 装入的是旧引擎的客户端内容。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过，渲染层及主进程 |
| `pnpm lint` | 通过，0 错误、38 个既有警告 |
| `node scripts/verify-setup-only.cjs` | 通过：有效配对、文件缺失、版本变化、容量非法、安装身份缺失、引擎字节变化 |
| `pnpm check:refs`、`check:smoke`、`check:locale-keys` | 通过 |
| 静态标题栏专项 | 11/11；821、900、1240px，真实鼠标折叠、键盘展开、位置与主区留白 |
| 路由标题栏专项 | 28/28；原生前进后退、刷新、面包屑、深浅主题、320–820px 窄窗、中英文 |
| 登录专项 | 52/52；简洁 head、游客恢复工作区开关与原工具、跨尺寸及 DPR |
| 安装向导专项 | 33/33；许可、目录、容量、摘要、失败反馈、修复入口及窄窗 |
| `pnpm build` | 通过，Next 静态导出、客户端 NSIS 引擎与单文件 Setup |
| `pnpm build:setup` | 实际执行通过；引擎 SHA-256、引擎/客户端/Next 构建记录的大小和修改时间全部未变，仅生成新 Setup |

静态导出指纹为 `7b275d64856d06e3ae5b1bddac1c5c738c3016369d6c676498afd702e73b01a0`，1213 个输入。实际截图：[展开](screenshots/header-expanded.png)、[收起](screenshots/header-collapsed.png)、[深色](screenshots/header-dark.png)、[窄窗](screenshots/header-narrow.png)、[向导](screenshots/setup-welcome.png)。

独立封装前后记录见 [build-evidence.json](build-evidence.json)。最终 EXE 为 265,878,189 字节，约 253.6 MiB；没有自动发布或真实安装。

界面回归使用隔离用户目录。向导安装写入使用测试替身，未向本机真实目录执行安装或卸载，不能称为完整目标机安装验收。已有打包配置中 Python Agent 随包虚拟环境在本机缺失；本次没有补装 Python 或改变其回退策略，不能承诺没有 Python 环境的机器上 Agent 可直接运行。没有下载模型、访问用户密钥或上传 GitHub。

全量 `pnpm check` 通过类型与 Electron 模块校验后，仍在既有的三个未引用词条 `auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference` 处停止；没有把专项通过称为全量门禁通过。登录夹具缺少 Agent 目录 handler 的既有日志未影响本次 52 项登录断言，不把该套件当 Agent 功能验证。

## 注释核查

任务开始基线为 `ir-header-setup-baseline-39d5fb86ae114d5894a592d4ad2470e3`；保留此前工作区改动，只统计新增或替换后的行，删除行、纯配置、二进制与文档不计。TypeScript 语法树定位注释后逐项人工复核，混合行计代码；业务 C=7、B=62，10.14%；测试 C=3、B=32，8.57%，明细见 [comment-audit.json](comment-audit.json)。新增普通逻辑函数保持不超过 30 行有效代码。比例低于参考范围，因为大部分是原 UI 的移动接线和明确的测试断言，来源、复用门槛、失败退出和测试边界已说明，不补重复注释凑数。
