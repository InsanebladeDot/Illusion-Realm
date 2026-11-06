# 本地模型工具栏与手动匹配

2026-10-28。承接[三面板目录浏览](local-model-folder-browser-2026-10-28.md)，本轮只调整本地模型工具栏、排序和补全的手动触发语义。

## 当前行为

- 第一行：`[搜索图标 | 搜索内容 | 排列方式] 批量补全模型资料`。
- 第二行：左侧移动模型、删除模型；右侧三个视图密度入口。进入多选时保留原全选、清空、退出和确认流程。
- 排列菜单：名称、日期、大小、标记；分隔线；递增、递减。字段和方向独立保存，支持上下键循环、Home/End、Escape、Tab、外部点击关闭及确认后焦点返回。
- 日期为实际文件修改时间，大小为文件原始字节数。标记采用本地已保存的触发词，并在入口提示中说明；不是 Windows NTFS 标签或在线热度。
- 无属性或无标记项在两个方向都置后，同值按文件名和完整身份稳定回退。旧文档没有新属性时继续可读，重新扫描得到属性。
- 浏览、选中卡片、切换排序均不计算模型 SHA-256，也不查询 Civitai。选择标记时只按现有授权接口读取当前范围的小型旁车 JSON。
- 批量入口只打开面板，首次也需再点击内部“开始”才创建任务。已有队列只查看，不被背景筛选或重新打开替换。
- 单项 `busy` 与批量占用分开显示：批量运行时单项入口禁用，并独立提示占用原因，不再假称当前模型正在流式匹配。

## 文件与复用

| 文件 | 本轮职责 |
| --- | --- |
| `apps/next/src/view/toolBox/Tool/civitai/local-model-library.tsx`、同目录 CSS | 两行工具栏、管理插槽、移出右侧底部动作、窄屏不留空管理面板 |
| 同目录 `local-model-sort.tsx` | 本地排序、缺失回退、两组菜单选择；复用 `ContextMenuShell` 和 `useLocalModelMetadata` |
| 同目录 `local-model-recovery-batch.tsx` | 复用原队列和 `ResourceDialogShell`，入口只打开面板 |
| 同目录 `local-model-metadata-details.tsx`、`hooks/use-local-model-recovery.ts` | 单项执行状态与批量互斥状态分开显示，保留入口实时互斥校验 |
| `apps/electron/src/main/modules/models/scanner.js`、`packages/shared/src/types/localModel.ts` | 版本增加可选 `bytes`、`modifiedAt`；只取 stat，不读权重张量 |
| `apps/next/src/i18n/locales/{zh-CN,en}/toolBox.ts` | 同步排序和占用文案；本地排序与在线排序命名空间独立 |
| `scripts/smoke-local-model-metadata.js` | 真实扫描属性、两行几何、四字段排序、缺失置后、键盘、手动触发反证和原消费链回归 |

没有增加扫描通道或任意文件读取桥接。移动/删除继续使用原目录级接口与保护规则：同目录多权重或含后代权重时禁止单文件卡片发起整目录写操作。

## 实际验证与限制

- 最新 Next 静态导出成功，指纹 `3eb2aa693de4ce5d47f49bc7302d27ddcc35afb6d9ec8b1b9b92820c5a88d71c`，764 个输入文件。
- `pnpm typecheck`：在 `pnpm check` 中通过，包括渲染层与主进程。
- `pnpm lint`：0 error、33 条既有 warning。
- `smoke-local-model-metadata.js`：**53/53**，运行号 `2026-10-28T02-49-48-481Z-23756`。含不自动匹配的外部请求计数反证、真实 stat 和旁车排序、两个方向缺失置后、窄屏、主题、跨页停止重试、普通/高级 LoRA 触发词消费者。Windows 文件符号链接夹具因权限不足明确 SKIP。
- `pnpm verify` 在整仓检查链中通过；双语键、硬编码文案、英文基线和 `pnpm check:smoke` 通过。
- `pnpm check` 仍停在既有未引用翻译键：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`，没有宣称整仓通过。
- `verify-local-model-recovery.js` 九组断言通过，但两次都在其既有临时目录删除步骤报 `ENOTEMPTY`，退出 1。没有将该脚本记为完整通过，也未为本轮 UI 扩展改动它的清理实现。
- `verify-i18n-values.mjs --base HEAD` 扫描整个已有工作区时报告 `galleryPaintings.ts` 的 32 处既有可疑文案；该文件不在本轮修改范围。本轮不搬迁既有用户文案。

运行截图来自隔离临时模型夹具、仓库既有封面和真实 `app://` Electron 页面。本轮没有验证实际 Civitai 网络、真实模型推理、用户模型移动删除或安装包；没有重新打包 Setup。没有重新运行未受本轮代码影响的视频编辑器和 Agent 服务商专项。

## 注释审计

以本轮修改前定向快照 `ir-model-toolbar-baseline` 为基线；只统计本轮新增/替换行，新文件统计全文。JS/TS/JSX 用语法解析识别注释，混合行只计代码，CSS 使用其注释语法；人工核对说明与真实职责、边界及测试期望。

业务 C=311、B=133，**70.05%**；测试 C=127、B=54，**70.17%**。逐文件见[审计数据](model-library-toolbar-comment-audit.json)。新增普通逻辑函数检查未超过 30 有效代码行；保留既有扫描器遍历结构。

例如，“公共打印机被占用不代表自己的文档已开始打印”解释单项进度与批量互斥的区别；缺失值不能设成最大数再整体反转的说明解释为何未知项在递减时也保持末尾。测试用不同大小、反向日期和空触发词，而不是从产品比较器反算期望。

## 真实运行图

![排列菜单](runtime/model-toolbar/model-sort-light.png)

![深色两行工具栏](runtime/model-toolbar/model-library-dark.png)

![窄屏详情](runtime/model-toolbar/model-library-narrow.png)
