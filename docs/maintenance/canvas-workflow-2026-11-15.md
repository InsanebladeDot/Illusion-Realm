# 画布工作流、提示词转换与资源状态（2026-11-15）

本轮基于开始工作前的工作区快照修改，保留已有功能和未提交文件；没有提交或上传 GitHub。

## 实际行为

| 入口 | 本轮结果 |
| --- | --- |
| 素材状态 | 节点引用显示“画布使用中”；未登记归属的文件显示“未登记”，提示不会自动回收。使用状态不改变文件归属或删除权限。 |
| 悬停说明 | 复用导入工程按钮已有的 HoverTip；资源标题、节点标题、项目名和相关画布控件使用同一个提示组件。 |
| 工作流菜单 | 叶子项只选择工作流；参数设置由设置图标打开。参数继续绑定当前节点。 |
| 默认 LoRA | 视频、H3 图片编辑与 Anima 编辑保留模板默认扩展；显式空数组表示清空。服务清单无法读取、文件缺失或同名多份分别说明原因，不自动删除配置。 |
| 提示词转换 | 默认开启。关闭后预览、提示词助手输入、H3 图片编辑和音频实际请求均保留原始 `@` 文本。每个节点独立保存，重开恢复。 |
| 引用编号 | 图片为 `<Picture 1>`，视频为 `<Video 1>`，音频必须为 `<Audio 1>`。兼容旧 `<Slot 1>` 输入，开启转换时输出 Audio。按连线输入顺序排列，手动附件按导入顺序接在后面。 |
| 素材窗口键盘 | 加载期间跳过隐藏文件输入，无可用控件时聚焦浮层外壳，Escape 可关闭并返回画布。 |

转换开关同时进入 shared schema、主进程校验、画布序列化和 SQLite 参数白名单。旧工程省略字段时按开启处理，不要求迁移。

## 复用与改动入口

- `apps/next/src/components/hover-tip.tsx`：添加原控件事件接入，保留已有包装模式。
- `apps/next/src/view/infinite-canvas/canvas-prompt-preview.tsx`：复用 ParameterPopover、CanvasSwitch 和创作页 PromptConversionPreview。
- `canvas-resource-references.ts`：枚举媒体、图片附件、音频参考、视频合成与场景图片引用，仅供展示使用状态。
- `canvas-lora-status.tsx`、`canvas-lora-validation.ts`：核对默认扩展清单，不下载或加载权重。
- 图片、视频、音频设置继续复用创作页原组件；未新增独立表单。
- 完整增量文件与行号见 [changes.json](runtime/canvas-workflow-2026-11-15/changes.json)。这是本轮快照差异，不是包含历史修改的 HEAD 差异。

## 实际验证

| 命令或场景 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 0 错误，37 个既有警告 |
| `pnpm --filter @illusion-realm/next build` | 静态构建通过 |
| `pnpm check:locale-keys` | 中英词条键一致 |
| `node scripts/verify-canvas-generation.js` | 285 项通过，含真实 SQLite 反读及输入顺序构图检查 |
| `node scripts/verify-canvas-image-parameters.js` | 338 项通过 |
| `node scripts/verify-canvas-audio-lora.js` | 6/6 通过 |
| `node scripts/verify-minimax-audio.js` | 6/6 组通过，包含关闭转换后的实际测试 HTTP 请求 |
| 提示词专项 `CANVAS_PROMPT_SMOKE=1` | 66/66 通过 |
| 视频设置专项 `CANVAS_VIDEO_SETTINGS_SMOKE=1` | 33/33 通过 |
| 素材专项 `CANVAS_RESOURCES_SMOKE=1` | 6/6 通过 |
| H3 编辑专项 `CANVAS_GENERATION_SMOKE=1 MINIMAX_IMAGE_EDIT_SMOKE=1` | 21/21 通过 |
| 缺省完整画布 | 157/157 通过 |

专项环境变量设定后运行 `pnpm exec electron scripts/smoke-infinite-canvas.js`，一次只运行一个 Electron 测试。测试只使用隔离工程目录；HTTP 服务返回固定图片，不证明真实模型推理。正式视频节点生成仍未接通，本轮没有新增视频执行器。

最终完整画布与素材回归使用构建指纹 `f018aaa802d2207ad95a81fb1fb16f8c8734aa4f9c76669eda10445b6691ac79`。运行摘要保留在 `logs/smoke-runs.log`。

检查中修正了两项旧测试前提：长项目名改验公共提示而非原生 title；缺图场景先清浏览器缓存、等待刷新完成，避免旧缓存掩盖文件缺失。失败日志保留，未将失败计入通过项。

`pnpm check` 未通过：既有门禁报告 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 三个未引用键。没有为通过本轮检查删除无关词条；后续串联检查未因前序失败而运行，不能视为全部通过。

## 界面证据

截图来自真实静态页面的自动操作；蓝色图片是测试夹具。提示词与视频设置截图早于最终焦点修复，相关界面其后没有改动；素材截图来自最终构建。

- [深色图片提示词转换](runtime/canvas-workflow-2026-11-15/120-image-prompt-preview-dark.png)
- [浅色窄窗口音频转换](runtime/canvas-workflow-2026-11-15/122-audio-prompt-preview-light-narrow.png)
- [视频默认 LoRA 与服务清单失败说明](runtime/canvas-workflow-2026-11-15/73-video-sidebar-dark.png)
- [素材使用状态与未登记文件](runtime/canvas-workflow-2026-11-15/121-project-resources-light-narrow.png)

## 注释复核

按本轮开始前快照统计：新增文件全文，已有文件只计新增和替换后的行，排除删除行、文档和未变更上下文。使用 TypeScript AST 识别注释，人工复核本轮注释用途与实际行为；混合行只计代码。

业务 C=20、B=198，注释率 **9.17%**；测试 C=9、B=148，注释率 **5.73%**。本轮多为已有组件接线和直接断言，必要说明集中在开关持久化、异步回包、回收权限及输入顺序边界；低于参考范围，没有加重复说明凑比例。逐文件统计见 [comment-audit.json](runtime/canvas-workflow-2026-11-15/comment-audit.json)。
