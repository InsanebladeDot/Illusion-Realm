# 注释清理记录（2026-11-14）

本轮只改注释，不改功能。检索了 1260 个第一方源码和脚本文件，重点清理人工复核后确认重复、过长或过期的说明：共 20 个文件、328 处，注释块从 4143 行缩为 389 行，净减少 3754 行。

## 清理范围与写法

- 删除同一规则反复解释、代码逐行翻译、空泛的“失败定位方法”和过期阶段进度。
- 简单用途一句话说清；涉及异步、坐标、资源和数据兼容时，保留必要边界。
- 保留 JSDoc 类型、检查指令和界面区域名。没有为了达到注释率补充说明。
- 例如，引用编辑器前的 23 行说明改为：“只订阅来源数据，移动节点不重建引用列表。连线和已选附件共用一份编号表；资源库候选选中后才加入请求。”
- 例如，公共卡片文件头改为：“各资料库共用的卡片；调用方提供展示数据和操作回调。”

保留的关键规则包括：空数组表示清空配置；隐藏与锁定各管不同的事；同源片段独立定位；过期播放回执不能继续播放；写入超时不代表取消；测试替身不能证明真实生成成功。

扫描覆盖 Next、Electron、Agent、shared 和项目脚本，排除依赖、构建产物和外嵌第三方原组件。长注释启发式筛出 529 个候选文件、37012 行候选块；这些数字不代表全部都是无效注释。本轮没有逐一人工验收所有候选，Python 文档字符串等也未修改，不能据此宣称全仓注释已清理完。

## 统计与基线

基线是任务开始时的工作副本，包含此前已有的 466 项工作区改动；不用 HEAD 覆盖它们。原字节、逐块替换清单、统计和验证日志保存在本机 `logs/comment-cleanup-2026-11-14/`，该目录为本机审计材料，不作为随包资源。

下表的“块行数”包含注释定界符；C 只计替换后的有效纯说明行，排除空行、装饰线、单独定界符和类型标签。B 是本次新增或替换的代码行，不计未改上下文和删除行。

| 文件 | 清理处数 | 块行数：前 → 后 | C | B |
| --- | ---: | ---: | ---: | ---: |
| `apps/next/src/view/infinite-canvas/canvas-video-prompt.tsx` | 3 | 27 → 3 | 3 | 0 |
| `apps/next/src/components/library/library-card.tsx` | 11 | 76 → 7 | 7 | 0 |
| `apps/next/src/view/toolBox/Tool/video/editor/program-clock.ts` | 11 | 175 → 20 | 20 | 0 |
| `apps/next/src/view/toolBox/Tool/video/editor/use-live-timeline.ts` | 37 | 621 → 48 | 48 | 0 |
| `apps/electron/src/main/modules/canvas/project-validation.js` | 18 | 293 → 22 | 22 | 0 |
| `packages/shared/src/schemas/infinite-canvas.schema.ts` | 18 | 227 → 24 | 24 | 0 |
| `scripts/verify-agent-loras.js` | 35 | 311 → 41 | 41 | 0 |
| `apps/next/src/utils/generation-statistics.ts` | 25 | 223 → 16 | 16 | 0 |
| `apps/electron/src/main/modules/ffmpeg/waveform.js` | 12 | 154 → 16 | 16 | 0 |
| `apps/next/src/view/infinite-canvas/use-canvas-media-import.ts` | 19 | 225 → 20 | 20 | 0 |
| `apps/next/src/view/create/image-create-panel.tsx` | 12 | 167 → 10 | 10 | 0 |
| `apps/next/src/view/infinite-canvas/reference-ui/generation-panel.tsx` | 13 | 179 → 14 | 14 | 0 |
| `apps/next/src/view/create/history-image-order-dialog.tsx` | 20 | 191 → 13 | 13 | 0 |
| `apps/electron/src/main/storage/sqlite/client.js` | 14 | 155 → 37 | 20 | 0 |
| `apps/electron/src/main/modules/models/scanner.js` | 5 | 78 → 6 | 6 | 0 |
| `apps/next/src/stores/use-mask-prompt-store.ts` | 11 | 147 → 11 | 11 | 0 |
| `apps/next/src/stores/use-audio-create-store.ts` | 7 | 116 → 10 | 10 | 0 |
| `apps/next/src/view/cartoon/dialogue-stage.tsx` | 13 | 143 → 17 | 17 | 0 |
| `scripts/verify-generation-statistics.js` | 31 | 484 → 21 | 20 | 0 |
| `apps/electron/src/main/modules/animadex/local-catalog.js` | 13 | 151 → 33 | 18 | 0 |

业务侧：18 个文件、262 处，3348 → 327 行，C=295、B=0。测试侧：2 个文件、66 处，795 → 62 行，C=61、B=0。两类增量注释率均不适用：此次仅改说明，不把纯注释变更报告为 100%，也不为比例改动代码。本文档不计入源码统计。

## 实际验证

| 命令或检查 | 结果 |
| --- | --- |
| `node logs/comment-cleanup-2026-11-14/verify-equivalence.cjs` | 20/20 通过。基线与当前文件去除注释后的编译输出逐字一致；JSDoc 类型和检查指令逐行一致。 |
| `pnpm typecheck` | 通过；最终 `pnpm check` 内再次执行也通过。 |
| `pnpm lint` | 通过，0 错误、37 条现有警告。最终再次执行结果相同。 |
| `pnpm check` | 未通过。在类型检查、Electron 模块校验通过后，门禁自检因三个未引用词条失败：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`。涉及词条和门禁文件本轮未修改；后续串联检查未执行。 |
| `node scripts/verify-agent-loras.js` | 未通过。24 组检查后，替身缺少 `./video-workflow-models` 依赖声明。用任务开始时的脚本在原目录解析依赖，得到相同失败。 |
| `node scripts/verify-generation-statistics.js` | 未通过。替身缺少 SeedVR2 工作流 JSON 的模块映射。用任务开始时的脚本对照，得到相同失败。 |

两个脚本的基线对照没有覆盖工作副本，而是把原脚本文本放在原入口路径加载；依赖仍来自同一个工作区。失败日志分别保留在 `agent-loras.log` / `agent-loras-baseline.log` 和 `generation-statistics.log` / `generation-statistics-baseline.log`。

未运行构建、Electron 界面冒烟、人工操作或 GPU 生成：本轮没有运行代码或 UI 变化，以编译输出和类型指令一致性检查确认修改边界。不把测试替身或源码检查当作实机验证，也不扩大范围修复上述原有失败。
