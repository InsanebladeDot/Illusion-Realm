# 画布任务队列交付记录

本轮从 2026-11-16 开始，2026-11-17 收尾。执行顺序见 [任务队列](../canvas-task-queue-2026-11-16.md)。任务按交互隔离、快捷键、节点尺寸、组件复用、任务并发、视频请求、模型安装逐项收口；下面区分实现、自动验证与尚未实际运行的部分。

## 改动与复用

| 项目 | 实现与边界 |
| --- | --- |
| 弹窗右键 | 事件必须来自真实画布区域；外部弹窗、遮罩和 Portal 不再触发画布菜单。关闭后原节点菜单仍可用。 |
| 输入与删除 | Shift+Enter 换行，Ctrl/Command+Enter 提交；生成中仍允许选择、删除其他节点。输入区的删除键继续编辑文字。 |
| 图片/视频适应 | 沿用同一张卡片和 CanvasChip，按实际解码尺寸调整宽高并完整显示；全局与单卡尺寸锁继续生效，走原撤销和 SQLite 保存。修正固定尺寸字段与 schema 顺序不同导致的假“未保存”。 |
| LoRA 触发词 | 直接使用创作页 `LoraTriggerWordsButton`；当前节点的显式或模板默认 LoRA 读取真实旁车数据，写入当前节点正文。 |
| 各节点任务 | 按节点登记任务，同卡防重复，其他卡可编辑和排队；实际推理仍复用原 FIFO。删除或卸载作废收件人，迟到结果不能复活旧节点。 |
| 视频请求 | 创作页与画布共用 `video-generation-queue.ts`，复用原模板构图、上传、ComfyUI 请求和保存；节点的宽高、FPS、时长、模型、LoRA 和提示词转换实际进入请求。画布当前支持图片参考，不宣称已补齐视频和音频参考输入。 |
| 安装与解锁 | 5 组：Anima、SDXL、MiniMax 视频/音频、MiniMax 图片编辑、SeedVR2；15 个独立文件，因共享依赖界面共16行。手动指南为中英 Markdown，自动下载直接挂原队列。缺少当前工作流实际依赖时，公告和提交入口共同阻止生成。 |
| 下载持久化 | SQLite v6 扩展安装资源编号附表，迁移保留旧下载身份及等待状态；不另建下载队列。 |
| 导航标志 | 第一行仅保留用户提供的标志与折叠按钮；折叠后只显示折叠按钮。 |

手动勾选不能解锁。扫描检查文件存在、非空和路径匹配，不代表已验证文件内容；下载器安装及跳过已有文件时核对 SHA256，不能用同名文件当作身份一致。所需模型目录未指定时不能开始自动下载。

原首尾帧视频模板还有非官方 LoRA，未猜测其地址。指南说明手动安装、移除或替换；它仍在工作流里且缺失时继续禁用。没有擅自删掉用户模板的依赖以假装可运行。

## 模型来源

固定版本与 SHA 记录在 `packages/shared/src/data/setup-downloads.json`，下载请求经原清单白名单校验。

| 来源 | 固定版本 |
| --- | --- |
| [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3) | `4b53a35191437de05370da548e59aeabe2a5a09a` |
| [Comfy-Org/SeedVR2](https://huggingface.co/Comfy-Org/SeedVR2) | `df48879708206a403d2a61acd55578c2e80fd233` |
| [PrunaAI/P-H3-Image-Comfy](https://huggingface.co/PrunaAI/P-H3-Image-Comfy) | `44a0fb73f299da1bb715bdb5ff59ce3fd3c6f543` |
| [SDXL Civitai 文件](https://civitai.com/api/download/models/128078?fileId=92696) | version 128078、file 92696；恢复记录保留安全的 fileId 参数 |

## 验证范围

自动界面验证加载真实静态导出、原组件、IPC、SQLite 与本地媒体解码。测试服务仅替代推理服务；占位权重仅验证真实目录扫描。测试彩条视频不是 AI 生成效果证据。

已经完成的专项包括视频实际构图、引用上传顺序、自定义提示词标记与关闭转换、默认 LoRA、空文件/扫描中拦截、清除 LoRA 和超分开关依赖隔离；下载去重、恢复、SHA 不匹配拒绝；旧 SQLite v5→v6 行保留和非法编号拒绝。运行号与结果同步保留在 `logs/smoke-runs.log`。

| 检查 | 实际结果 |
| --- | --- |
| 类型与构建 | `pnpm typecheck` 前轮通过；最终 Next 静态构建同时完成渲染 TypeScript；主进程 `tsc` 再次通过。 |
| ESLint | 全量0错误、38项已有警告；最后改动的清单组件定向检查也通过。 |
| Electron模块与通道 | `pnpm verify` 通过。 |
| 画布 UI 专项 | 10/10；`2026-11-16T16-16-36-666Z-44412`，实际验证单卡/全局锁、SQLite重开、输入中Backspace与选中卡Backspace，以及生成中Delete取消。 |
| 清单最终 UI 专项 | 7/7；`ir-setup-checklist-ZYxAdg`；五组截图全部真实解码、预览返回保留阅读位置、软件内全屏、主题/英文与读取失败重试。截图路径允许数字，修复SeedVR2图片被误拦；外部图片仍不自动请求。 |
| 构图与可用性 | `node scripts/verify-canvas-task-contracts.js` 通过；实际执行TS模块，不只搜索源码字符串。 |
| 下载服务 | `verify-setup-downloads.js` 4/4；独立目录、本机HTTP服务、真实SHA核对和持久化恢复。 |
| 自动下载界面 | `--automatic` 21/21；`--automatic --present` 18/18；真实生产队列，阻止真实权重网络下载。 |
| 缺模型解锁界面 | `--readiness` 3/3；图片/视频/音频按钮禁用，写隔离占位文件后用原扫描入口解锁。 |
| SQLite | `pnpm check:sqlite` 6/6；v5→v6迁移专项1/1，最新再跑仍通过。 |

未实际测试真实 GPU 推理、大权重完整下载、付费供应商请求、安装包和用户原工程人工验收。编辑模式的缺模型保护已接通，当前 UI 专项覆盖普通图片、视频与音频，不扩大声称编辑全链已测。

`pnpm check` 尚未整体通过：`check:gates` 存在 3 个既有未用词条（`auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference`）；`check:meta` 将 `MetaFieldRow.tsx` 的中文 JSX 注释误认为界面文字。本轮没有为门禁全绿删除无关词条或改动旧检查器。

此前完成的 [资源删除修复](../canvas-resource-delete-fix-2026-11-16/README.md) 和 [供应商/转译/提示卡片统一](../shared-text-providers-2026-11-16/README.md) 保留独立证据。其他历史需求不因这份队列自动标为完成。

## 截图

截图来自实际静态页面，无临摹替代。画布使用蓝色图片和彩条视频夹具，验证完整显示、控件与数据流；不能据此评估真实模型画质。

- [视频参数与结果回填](video-request-fit.png)
- [适应尺寸保存后重开](fit-reopened.png)
- [两个节点独立编辑与排队](independent-nodes.png)
- [五组自动下载，深色主题](download-groups-dark.png)
- [缺模型公告和禁用](models-missing.png)
- [补齐目录并扫描后的解锁](models-unlocked.png)
- [指南全屏，仅填满软件内部](checklist-fullscreen.png)
- [直接复用图片预览](checklist-image-preview.png)

最后静态构建指纹为 `2661b066e8bc8dacbfce5c8101e63a5ab0801be8d638bd627345f535adda577a`，1211个输入，29个静态页面。最后一处产品修改只允许本地教程截图名包含数字；画布10/10运行于此前同一画布源码，清单7/7运行于最终指纹，没有把未运行的完整门禁写为通过。

## 注释与范围核查

基线为本轮开始的 `ir-model-unlock-baseline-7stp1iru`，只统计新增、替换行。基线没覆盖的 `project-validation.js` 和 SQLite `connection.js` 只记录本轮已知改动行，不将原文件整篇当新增；构建前已存在而基线漏收的两个 `.mjs` 排除。68个源码文件逐文件记录在 [comment-audit.json](comment-audit.json)。JSON、Markdown、图片不算源码注释统计。

使用 TypeScript AST识别注释，SQL独立识别；排除空行、定界符、仅类型说明、删除行与未改上下文，混合行只计代码。人工复核新增说明与取消、归属、路径和测试边界一致。业务 C=36、B=617，5.51%；测试 C=17、B=1040，1.61%。低于20%–30%参考范围，主要改动是已有组件接线、字段映射、夹具与直接断言；没有为了比例补重复注释。

本轮新普通函数未超过30行有效代码。已有长函数 `enqueueAnimaEdit`、`enqueueAudioGeneration`、`VideoCreatePanel.handleSubmit` 和两个旧测试入口只加前置校验/夹具接入，仍超过30行；保留为范围内的既有结构欠账，不将其写成全仓已达标。工作区原有717项修改保留，本轮未提交或上传GitHub。
