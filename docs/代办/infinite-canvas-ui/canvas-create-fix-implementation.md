# 新建画布应用失败修复（2026-11-12）

现象：列表和新建表单提示读取或保存失败，点击应用无法进入画布。

原因：只读核对本机旧草稿及磁盘，旧 workspace 的素材目录已不存在。首次工程库请求先迁移旧草稿，在目录校验抛出 ENOENT，导致 list/create 都无法执行。前轮遗漏了整个旧目录缺失的场景。

修复沿用原工程库、表单和保存接口。仅旧目录本身不存在时继续保存节点和原素材引用，分配新的受管工程身份；存在目录但 owner 缺失、归属错误、链接或权限失败仍拒绝。缺失媒体继续报缺图，不伪装成已恢复。旧 SQL 和原草稿保持不变。

修改 `canvas-library.js`、`verify-canvas-library.js`、`check-canvas-library-ui.js`。未改渲染源码，复用现有静态构建并通过指纹检查；当前运行的主进程需正常退出重开才能载入修复。

| 检查 | 结果 |
| --- | --- |
| 修复前缺目录回归 | 退出1，ENOENT，成功复现 |
| 工程库存储 Electron 回归 | 退出0，8/8；缺目录保留引用、新建重开、owner缺失拒绝、原迁移和链接保护 |
| 正式工程库 UI Electron 回归 | 最终退出0，8/8；输入应用后关闭表单进入画布，实际SQLite重读；分类、挂起、尺寸、深浅主题回归 |
| `pnpm typecheck` | 退出0 |
| `pnpm lint` | 退出0，0错误、37项既有警告 |
| `pnpm check` | 退出1，既有未引用词条 auth.verifySuccess、canvas.reference、canvas.styleTransfer |
| 普通函数长度 | 三个涉及文件均无超过30行项 |

实际命令：`pnpm exec electron scripts/verify-canvas-library.js`；设置 `CANVAS_LIBRARY_SMOKE=1` 后执行 `pnpm exec electron scripts/smoke-infinite-canvas.js`。两者串行，不终止用户应用。旧草稿输入是隔离夹具，界面、IPC、文件和数据库使用正式实现；人工鼠标、系统框、系统缩放保持未验证。本机真实工程只读定位，未执行其迁移。

中间 UI 尝试遇到公告遮挡、对已读公告强制等待、前置重载干扰后续实例时序，均保留失败日志。新场景移到原场景之后隔离运行；重载只关闭实际出现的公告。最终完整运行8/8，前面尝试不计入成功总数。

增量审计以本轮开始三文件副本为基线，仅最终新增/替换行：业务 C=2/B=6，25%；测试 C=4/B=69，5.48%。测试主要是输入和断言，必要的缺失目录、安全及证据边界说明已复核，不凑比例。[逐行审计](canvas-create-fix-comment-audit.json)。未新增保存框架、未测试安装包与大工程性能。

[自动运行证据](runtime/canvas-create-fix-2026-11-12/)

![应用后进入新画布](runtime/canvas-create-fix-2026-11-12/98-create-after-missing-legacy.png)
