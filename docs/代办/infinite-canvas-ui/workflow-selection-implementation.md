# 画布工作流选择与默认配置

日期：2026-11-09。按用户确认，仅接通工作流选择和默认配置身份，不执行生成、不回填结果。保留此前导演台、媒体与性能优化的工作区修改。

## 实现与复用

| 节点 | 可选工作流 | 缺字段默认 | 原配置来源 |
| --- | --- | --- | --- |
| 图片 | ANIMA、SDXL、图片编辑·文字改图 | ANIMA | 创建页 imageWorkflow.ts 两套基础模板、anima-edit-workflow.ts 文字改图链 |
| 视频 | MiniMax H3 图生视频、全能参考、Wan2.2 | DEFAULT_VIDEO_WORKFLOW_ID，当前为minimax | 创建页 VIDEO_WORKFLOWS 登记表 |

默认配置在本轮表示选用原模板，没有将步数、CFG、CLIP、VAE、模型文件名复制到节点，也没有接通参数编辑、模型扫描或执行器。图片默认系列与既有生成构建器一致；视频清单直接读取原登记表。不会继承或改写创建页正在编辑的全局草稿。未来生成必须按同一编号消费原模板，当前入口不代表生成已接通。

复用 CanvasChip，以及创建页翻译菜单、画布右键共用的 CascadeMenu。节点类型注入适用清单，onChange交回原节点事务；菜单展开只属于当前实例。工作流字段随原复制、撤销、序列化与保存机制保留，不改变提示词、比例、素材或节点类型。

主要文件：

- `apps/next/src/view/infinite-canvas/canvas-workflow-picker.tsx`：菜单与默认身份。
- `reference-ui/generation-panel.tsx`：接入图片/视频面板，为比例入口补明确定位标记。
- `canvas-model.ts`：从shared推导字段并序列化。
- `packages/shared/src/schemas/infinite-canvas.schema.ts`与主进程`modules/canvas/project-validation.js`：可选字段、等价白名单及类型归属校验。
- 双语canvas词表：名称及“仅选择配置”说明。
- `scripts/verify-canvas-project.js`：合法、缺字段、null、未知编号、跨类型误用反证；`scripts/smoke-infinite-canvas.js`：比例测试改用语义定位，保留原焦点断言。

没有新增IPC通道。旧无字段节点只在显示时回落，查看不触发保存；非法编号及图片/视频串用编号拒绝。音频、文本、导演台不接本轮字段。

## 实际检查

证据集中在[runtime/workflow-selection-2026-11-09](runtime/workflow-selection-2026-11-09/)。

| 检查 | 实际结果 |
| --- | --- |
| pnpm typecheck | 通过，含渲染strict和主进程tsc |
| pnpm lint | 0错误、37项既有警告；新增选择器、面板与模型另有定向ESLint通过 |
| pnpm check:locale-keys | 通过，20个命名空间 |
| pnpm check:i18n / check:i18n:en | 通过，中文21/基线66、英文772/基线3092 |
| Next静态构建 | 通过，指纹a86cdf54ceffdb1817a87f66b5f3860e100128b0b94b09251f0e4ab1b684debf |
| 串行Electron正式画布回归 | **126/126，退出0**；118项原回归加8项工作流场景 |
| 工作流两端契约专项 | 通过，真实shared safeParse与主进程对照 |
| node scripts/verify-canvas-project.js全脚本 | **退出1**，checkRoundTrip → prepareArchive报canvas-invalid-media；任务前脚本在当前工作区同样失败 |
| pnpm check | 本轮未运行，不挪用历史结论 |

完整格式失败见project-format.log，任务前脚本对照见project-format-baseline.log。它与Electron工程包往返通过属于不同输入，不能互相抵消。未修改旧预期或放宽校验隐藏失败，本轮不标记全部检查通过。

Electron使用真实静态入口app://app/canvas、生产preload、隔离用户目录和真实磁盘JSON。新增场景覆盖图片默认/三项清单、视频默认/登记项、跨类型隔离、文字改图可选但生成禁用、撤销、Escape关闭及焦点返回、视频选择保留、保存及完整刷新恢复。原回归覆盖实际媒体解码/播放、导入、卡片尺寸、拖动、历史、主题/窄窗与工程包。

工作流扩展通过临时诊断驱动插入原冒烟阶段，使用按钮事件和Electron自动输入，不反射React内部状态。扩展尚未整理为常驻Electron测试；两端契约已进入仓库脚本。系统框沿用原返回夹具，不当作人工系统选择或资源管理器实体拖入。测试媒体为实际可解码磁盘文件，不是生成结果。

首次诊断撤销恢复选择快照后仍找旧面板，已改为重新选择图片再检查。第二次原比例测试用“第一个可展开胶囊”误点新增工作流，已补语义定位，未放宽原焦点与提交预期。修正后完整重跑126/126，不累加历史部分通过数。

## 真实截图

- [图片菜单，默认ANIMA](runtime/workflow-selection-2026-11-09/workflow-00-image-options-dark.png)
- [图片选择SDXL](runtime/workflow-selection-2026-11-09/workflow-01-image-sdxl.png)
- [视频选择Wan2.2](runtime/workflow-selection-2026-11-09/workflow-02-video-wan.png)
- [完整回归后的工程与媒体](runtime/workflow-selection-2026-11-09/workflow-03-restored.png)
- [浅色媒体与公共菜单](runtime/workflow-selection-2026-11-09/local-media-light-menu.png)

均为正式Electron运行截图。人工查看新增菜单未见裁切。工作流展开证据为深色；浅色截图是公共菜单回归，不冒充浅色工作流专门验收。

## 注释与未验证

以请求开始前TEMP快照为基线，新增文件全文，已有文件仅diff新增/替换行；空行和定界符不计，混合行仅计B。人工复核模板来源、无副作用、兼容和焦点说明。业务 **C108/B45=70.59%**；测试 **C36/B15=70.59%**，明细及基线哈希见[comment-audit.json](runtime/workflow-selection-2026-11-09/comment-audit.json)。横卡独立增量见[对应记录](media-card-default-implementation.md)，不重复计数。

有效说明示例：“默认只在展示时回落，查看旧节点不会触发自动保存或弄脏作品”；“工作流和比例现在都有展开状态，使用独立语义标记识别比例入口”。普通新增动作与校验函数未超过30行，展示组件按职责装配。

未接通：真实生成、结果回填、模型文件选择、参数覆盖、服务探测和上传。生成保持禁用，没有假成功。人工鼠标/键盘全路径、系统缩放、扬声器试听、多屏、大工程、长时性能、同时挂载两套画布A/B本轮未执行，旧待验保留；本轮自动覆盖同画布图片/视频实例隔离。
