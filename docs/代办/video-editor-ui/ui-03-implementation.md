# UI-03 素材区实施记录

日期：2026-10-30｜状态：已完成，等待验收｜范围：R02 素材面板

## 实施内容

R02 现在使用一个参数化 `MediaPanel`：调用方传入素材数组、整库状态和选择回调；面板内部只保存查询词、媒体类型条件和素材 ID。查询按文件名做大小写不敏感匹配，类型与查询取交集；清除条件恢复全部结果，但不会清掉之前选中的素材。素材行仍由 UI-02 的 `MediaItem` 负责视频封面、图片封面、音频波形、长文件名省略和缺图占位。

导入入口继续使用 UI-02 的 `EditorAction`，因为真实文件选择和媒体探测还没有接入，所以按钮禁用并说明原因。加载、错误、空库和搜索无结果都复用 `EditorPlaceholder`；缺封面只影响缩略图槽，仍允许选择，整库加载/错误则禁用搜索和分类。`EditorMediaSamples` 在现有样板路由增加 A/B 两个独立面板，固定演示五项素材、长名称、缺图、单行加载/错误、整库加载/错误、空库和超长列表，不把状态控制塞进正式工作区。

素材高亮只调用面板的 `onSelect(id)`，没有片段 ID、播放头或属性回调。因此点击素材不会创建时间线片段，也不会改 R03/R04；这与 UI-02 的片段选择隔离样板共同验证。A/B 两个面板各自持有 query、kind 和 selected，切换一个实例不会改变另一个实例。

## 复用关系与边界

| 组件/文件 | 用途 | 复用方式 |
| --- | --- | --- |
| `editor-panels.tsx` 的 `MediaItem` | 每一行素材的统一封面、类型、时长和状态外壳 | 通过 `EditorMediaAsset`、`selected`、`onSelect`、`state` 注入差异；正式区与样板共同使用 |
| `editor-panels.tsx` 的 `MediaPanel` | R02 工具、筛选和结果滚动区 | `assets`、整库 `state`、`onSelect` 参数化；不接收时间线业务状态 |
| `editor-controls.tsx` 的 `EditorAction` | 导入、分类、清除条件和样板状态按钮 | 回调、`pressed`、`disabledReason` 注入行为；无回调的真实业务入口继续禁用 |
| `editor-controls.tsx` 的 `EditorPlaceholder` | 空库、无结果、加载、错误和缺图 | 传入状态与双语 message，避免复制占位 JSX/CSS |
| `editor-media-samples.tsx` | UI-03 独立演示数据与场景切换 | 只提供固定夹具；不读取文件、不请求后端、不写正式工程 |
| `check-video-ui-media.js` | UI-03 Electron 运行回归 | 复用 UI-02 的窗口、等待器和截图目录；不创建第二个 Electron 进程 |

UI-04–UI-08 的真实播放、节目预览、属性提交、时间轴剪辑、拖动分隔条和完整业务导入仍保持独立待办。GIF 和旧视频工具没有改动。

## 实际验证

- Next 静态导出构建成功，最新源码指纹为 `eed81ccd7cbd83039c7b65907c3f5f3fcb128c86da025fb21521bf41f6cae355`。
- `pnpm typecheck` 通过；`pnpm lint` 通过，0 错误、33 个仓库既有警告。
- `pnpm exec electron scripts/smoke-video-editor-ui.js` 真实运行 **77/77**：包含 UI-02 原有回归、搜索和类型交集、Enter/ Escape、空库/无结果、整库加载/错误、长名/缺图、单行加载/错误禁用、A/B 状态独立、滚动归属、深浅主题、700px 窄窗口、返回后五个时间线片段和零媒体业务调用。
- 真实截图保存在 [`runtime/ui-03-2026-10-30`](runtime/ui-03-2026-10-30)：默认浅色、默认深色、错误样板、浅色样板、深色样板和窄窗口样板。
- `pnpm check` 在既有 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 未引用词条门禁处停止；这不是 UI-03 新增的词条。单独的双语键、i18n、脚本引用和冒烟规则检查通过。

未验证真实文件导入、媒体探测、解码、播放、拖放到时间线、波形生成、分页性能、Windows DPR/遮挡和完整读屏软件；这些属于真实业务或后续 UI 任务，当前没有用演示状态冒充已接通。

## 注释率

按本轮前定向快照 `ir-ui03-baseline-ny4o62j8` 统计新增/替换行，删除和历史代码不计；独立文件按全文统计，混合行按代码计，先用脚本计数再人工复核是否说明职责、边界和失败恢复。

| 类别 | 有效注释 C | 代码 B | 注释率 |
| --- | ---: | ---: | ---: |
| 业务代码（面板、样板、样式、词条和宿主调整） | 171 | 71 | 70.66% |
| 测试代码（Electron 冒烟与 UI-03 helper） | 245 | 101 | 70.81% |

业务与测试侧均达到 70% 要求。代表性注释包括“筛选只遮住书架，不把书签移到第一本可见书”，解释 query/filter 与 selected ID 分离；以及“loading/error 不启动定时器假装探测完成”，说明样板为何不模拟业务成功。
