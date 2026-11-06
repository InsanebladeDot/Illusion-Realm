# 快捷词、图片移动与素材区比例调整

日期：2026-11-04。保留任务开始时的工作区修改，仅完成本轮三个相关请求。

## 实际行为与复用

- 视频编辑器：复用 `EditorWorkspace`、`MediaPanel`、`MediaItem` 与节目预览，仅调整局部 CSS。三栏保持属性宽度，把原预览余额的三分之一交给素材；双栏按同一余额比例调整；小于 1040 的单栏继续用原紧凑面板入口。项目坐标、片段变换、时间模型、播放和导入逻辑不改。
- 素材卡：固定 140×148 CSS 像素、封面槽 130×74，网格按 140px 自动增减列数，不用 `1fr` 拉伸卡片。文件名省略、类型/时长/分辨率/帧率/音轨保持三行紧凑布局，加载与错误占位共用尺寸，列表样板继续保留原行布局。
- 快捷词：抽取 `components/prompt-tag.tsx`，模型触发词与创建页共同调用。创建页注入追加/移除；模型详情注入复制。拆词复用 `missingLoraTriggerWords`，支持英文逗号、中文逗号与换行，不拆短语内部空格，忽略重复词。逐颗删除保留旧存储槽位，避免旧长段被展开后触发24条上限丢词。
- 清空：当前分类提供“清空快捷词”，只清快捷来源，不清正文和其他分类。读取用户文档区分缺字段与显式空数组，清空后重新加载不会恢复默认词。
- 图片移动：生成图右键新增“移动到…”，使用已有系统目录选择框。单图与原批量移动共同调用 `useMoveGeneratedImages`，复用输出根决议、路径边界与 `moveImagesToFolderOnDisk`，没有新增 IPC 或文件系统实现。取消不改文件，目标限输出根及其子目录，真实磁盘服务保留重名避让与旁车迁移。成功后通知图库/中心预览失效并重新扫描；未命中当前图不关闭其预览。剪切/粘贴语义由实际移动完成，不覆盖操作系统剪贴板。

## 修改文件

业务：`components/prompt-tag.tsx`、`utils/prompt-quick-words.ts`、`hooks/use-move-generated-images.ts`、`utils/promptTabs.ts`、`view/create/promptAssembly/PromptAssemblyPanel.tsx`、`view/toolBox/Tool/civitai/model-trigger-words.tsx`、`view/create/GeneratedImageContextMenu.tsx`、`GeneratedImageActionLayer.tsx`、`CreateHistorySidebar.tsx`、`view/CreatePage.tsx`、`view/toolBox/Tool/video/editor/editor.module.css`，以及 zh-CN/en 的 create 与 promptAssembly 词条。以上渲染路径相对 `apps/next/src/`。

回归：`scripts/lib/check-prompt-quick-words.js`、`scripts/lib/check-history-move.js`、`scripts/lib/check-video-filmstrip.js`、`scripts/smoke-prompt-assembly.js`、`scripts/smoke-create-layout.js`。旧图片右键断言同步改为四项并核对移动项，文件夹/漫画菜单项数保持原约定。

## 验证

构建指纹：`83ca68071c6791795f7ba219aa8df186a3eb70b2ed87b44e89c1f1deeb7417f0`，872 个输入。所有 Electron 套件串行执行，静态导出新鲜度检查通过，测试结束无本轮 Electron 进程残留。

| 检查 | 结果与证据边界 |
| --- | --- |
| `pnpm typecheck` | 通过，含渲染与主进程 |
| `pnpm lint` | 通过，0 错误 / 33 既有警告 |
| Next 静态构建 | 通过，28 路由导出 |
| 快捷词专项 | 8/8：逗号分词/去重、单颗追加、删除不截掉第25颗之后、260字符长词实际存在且边界正确、清空不动正文/其他分类、真实JSON落盘与重载 |
| 图片移动/图库排序 | 27/27：单图取消/真实移动、批量取消/越界/不存在目标、真实源移除、同名避让、JSON旁车、宽窄布局与原排序/批量改名回归 |
| 共享右键菜单 | 7/7，生成图新增整理项、文件夹与漫画菜单旧场景正常 |
| 模型来源 | 63/63，共享tag的单颗/全部复制、换行分组、失败提示及原下载资料回归 |
| 视频 LIVE-02 | 145/145，新增缩小比例与卡片固定尺寸反证；覆盖横屏640×360/30fps/AAC、竖屏360×640/24fps/无音轨的真实MP4探测/解码；导入、选择、播放、时间线、修剪、速度、构图、锁轨、主题/尺寸矩阵与清理继续通过 |
| 文案基线/双语键 | `check:i18n`、`check:i18n:en`、`check:locale-keys` 通过 |
| `pnpm check` | 退出1，主进程验证通过后在既有三个未引用词条停止：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。后续链条未全量运行，不记整体通过 |
| `verify-i18n-values --base HEAD` | 退出1，报告45处任务前删除的旧漫画字体/画廊静态文案；本轮未改这些文件，保留为既有工作区差异 |

自动事件、真实磁盘和真实媒体证据分别对待：系统选目录与选视频使用返回值夹具；视频文件真实编码、探测和解码，内部鼠标/键盘通过 DOM/CDP。夹具日志存在未注册的 `account:me`、`models:downloadList` 或 `window:control` 请求；这些与相关测试能力无关，未隐瞒也不扩大修复。本轮没有系统目录框人工点击、Explorer 人工拖入、扬声器试听或 Windows 系统缩放验证；不把自动通过改写成这些人工项通过。跨磁盘移动、权限拒绝、大图库吞吐与部分失败的事务回滚没有实测；原移动服务不新增事务承诺。

截图来自正式静态工作区、真实视频帧或真实临时PNG文件，没有用设计稿或mock预览代替：

- [素材区扩大/较小播放器，浅色](screenshots/create-tags-move-video-layout-2026-11-04/video-assets-light.png)
- [深色/真实帧与固定卡片](screenshots/create-tags-move-video-layout-2026-11-04/video-assets-dark.png)
- [1280容器](screenshots/create-tags-move-video-layout-2026-11-04/video-assets-1280.png)、[960容器](screenshots/create-tags-move-video-layout-2026-11-04/video-assets-960.png)
- [快捷词逐颗展示](screenshots/create-tags-move-video-layout-2026-11-04/quick-tags.png)
- [图片右键移动](screenshots/create-tags-move-video-layout-2026-11-04/image-context-move.png)、[移动后源目录真实空态](screenshots/create-tags-move-video-layout-2026-11-04/image-move-success.png)

## 注释与函数审计

基线为 `C:/Users/18305/AppData/Local/Temp/ir-tags-move-baseline-fmi22z0b/baseline.json`，视频CSS与相关测试在首次修改前追加快照。只统计本轮新增/替换行，新文件统计全文；不把历史工作区修改计入。扫描纯注释、混合行只计代码，人工复核真实机制与边界，剔除重复说明。逐文件数量与摘要见 [增量审计](create-tags-move-video-layout-comment-audit-2026-11-04.json)。业务 C=290、B=120，有效注释率 70.73%；测试 C=241、B=98，有效注释率 71.09%；两类各剔除3行重复解释。

变换/移动函数使用 TypeScript AST 去注释、正常打印后核对有效物理行：路径选择16、请求收尾19、移动hook15、单图测试22、布局测试13；新增普通函数均不超过30行，JSX展示装配单列豁免。例：用“长购物单剪成词卡”解释展示拆词与存储槽保留的区别；用“搬家更新仓库清单后归还门钥匙”解释 finally 重扫和释放互斥锁的责任。

本轮不推进后续编辑器保存、导出或新剪辑功能，也不改写 UI-08 仍未完成的人工验收结论。
