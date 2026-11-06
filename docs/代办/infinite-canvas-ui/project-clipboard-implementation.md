# 无限画布：节点编辑、受管资产与可移植工程

日期：2026-11-06。入口：`app://app/canvas`。

**状态：自动验收完成，人工项待验。** 本轮最终 Electron **91/91**；全仓 `pnpm check` 仍因三个既有词条失败。没有将自动事件或系统框返回值夹具标记为人工操作。

## 功能表

| 功能 | 正式入口与实现 | 数据/失败边界 |
| --- | --- | --- |
| 连线删除 | 选中线后 Delete/Backspace，或右键“删除连线” | 复用原 remove 与历史；单选边右键先清旧节点选择，不删除端点或媒体文件 |
| 复制/剪切/粘贴 | 节点菜单、Ctrl/Command+C/X/V；文本工具条复制 | 会话节点底稿；copy 不增加节点，cut 先拍快照再删，paste 产生新 id；无底稿不显示粘贴 |
| 原立即重复 | Ctrl/Command+D | 保留原有操作；与 copy 底稿明确区分 |
| 三种卡片 | 右键“卡片样式”的公共额外展开菜单 | 正方形 284×284、长方形 502×284、自定义宽 160–1200/高 100–900 整数；只改展示壳 |
| 视频读取收尾 | 原节点内容插槽与实际 video | 成功来自 loadeddata/canplay；读取超过 15 秒或 error 显示重试/更换，引用与其他节点保留 |
| 视频操作 | 视频下沿紧凑底栏 | 播放/暂停、真实时间、定位、静音与全屏；状态来自所属媒体事件，不开假进度定时器 |
| 当前帧输出 | 视频“截取当前帧” | 复用工具箱 pickOutputFile、runVideoEdit(frame)、已有 FFmpeg 配置；真实写 PNG，不上传 |
| 资产归档 | 系统选择、多选、外部文件拖入共同导入流程 | preload getPathForFile → 受限复制 IPC → 原 importMedia/updateNodeData；异步失败不清旧图 |
| 工程导出 | 项目头下载图标 | 导出 `.ircanvas`，包含节点参数、位置、连线与当前引用媒体正文；取消不发成功 |
| 工程导入 | 项目头文件夹图标 | 未保存时先确认；主进程验图/路径/长度/摘要，全部完成才替换图；坏包与取消保留当前作品 |
| 草稿保存 | 原保存按钮、Ctrl/Command+S | 仍写统一 illusion-realm.json 的 infiniteCanvas 段；外部工程导出不冒充草稿已保存 |

普通输入框保留原生文字 C/X/V，媒体控件、菜单和浮层不被画布快捷键抢占。剪贴板含选中节点及其内部边，不带连向未选节点的引用；新节点和边重新映射身份。会话底稿不进入工程或撤销栈。

## 组件与业务复用

- 复用 `CanvasNode`、`CanvasNodeCard` 内容插槽与 `GenerationPanel`；尺寸通过 `data.card`、局部 CSS 高度变量注入，不复制三套 JSX。
- 节点、连线与尺寸级联菜单引用现有 `CascadeMenu`，复用创建页的定位、额外展开、焦点及键盘交互。
- 项目头继续使用 `ProjectHeader`/`IconButton`，导入导出差异由 action 回调传入；尺寸表单复用 `CanvasOverlay`/`CanvasChip`。
- 所有编辑入口仍经过 `canvas-reducer`、原 snapshot/commit/restore；文件复制和工程打包保持独立主进程服务，不能与节点删除合并成系统删除。
- 本地预览复用 `buildLocalFileUrl` 与既有 `localfile://` Range 服务。视频底栏从父媒体会话注入 onSeek/onMute，不另建播放器源或进度 store。
- 截帧复用工具箱已有 FFmpeg 作业；没有改动旧视频编辑器/GIF/漫画的业务状态或媒体引擎。

## 资产目录

默认根是 `dirname(getDefaultUserDataPath())`，即软件**既有默认 user 目录**；不按 renderer 当前工作目录拼地址，不新增用户设置存储层。

```text
user/
  illusion-realm.json              # 原统一用户文档
  [画布安全目录名]/
    .canvas-owner                 # 目录归属 UUID，不入工程包
    video/                        # 视频受管副本
    Picture/                      # 图片受管副本
    Audio/                        # 音频受管副本
```

首次导入按画布名安全化分配目录；同名已有文件夹不接管，生成 UUID 后缀新目录。之后改画布标题只改显示名，folder 保持稳定。资产名带随机身份与安全化原名，显示仍保留用户原基本名。

导入使用异步 `copyFile(COPYFILE_EXCL)`，不剪切、改写或删除外部原件。相同来源多次导入可以生成多个受管副本；复制节点则只复用已有地址。删除节点和撤销目前不回收资产，以免破坏历史与底稿，因此可能留下无引用文件。工程导出只收当前图引用，**不扫描打包整个目录**。

在同一页面先后打开不同工程时，会话剪贴板可保留；跨工程粘贴仍引用原工程受管地址，不自动再复制正文到当前目录。完整工程导出会将这些引用一起装包；这是当前路径归属边界，不应称为每次粘贴都已迁移资产。

## 规范化接口与工程格式

| 契约 | 类型来源 | 用途 |
| --- | --- | --- |
| UserDataInfiniteCanvas | shared `infinite-canvas.schema.ts` | version/name/workspace、节点 id/position/data、边 id/source/target/handles |
| data.card | InfiniteCanvasCardSchema | style、width、height；与生成 ratio 分开 |
| data.media | InfiniteCanvasMediaSchema | kind、path、name、size；不含 File、Blob URL、DOM 或解码状态 |
| workspace | InfiniteCanvasWorkspaceSchema | id UUID 与单层 folder，本机受管归属 |
| CanvasImportMediaRequest/Result | shared `canvas-project.schema.ts` | 标题、可选归属、文件清单；返回实际归属、成功媒体和拒绝基本名 |
| CanvasArchive | 同上 | format/version/document/assets；资产含相对 path、size、sha256 |
| 三个桥接方法 | shared ElectronAPI 与 preload | canvasImportMedia / canvasExportProject / canvasOpenProject；沿用 IpcResult |

第一版 `.ircanvas` **不是 ZIP**，其规范为：

| 顺序 | 字节 | 定义 |
| --- | ---: | --- |
| 1 | 8 | ASCII `IRCNVS01` |
| 2 | 4 | UInt32LE：随后 UTF-8 JSON 清单的字节长度 |
| 3 | 指定长度 | CanvasArchive 清单，上限 16 MiB |
| 4 | 资产总大小 | 按 assets 数组顺序拼接的原始媒体字节，不压缩、无分隔符 |

清单 `format="illusion-realm-canvas"`、`version=1`。节点文档仍 `version=1`，新增 card/workspace 为 optional，兼容旧草稿。包中删除本机 workspace，media.path 改为 `video/…`、`Picture/…` 或 `Audio/…`。相同路径正文去重，节点身份不合并。

导出先按流求 SHA256，写入时再次核对实际大小和摘要；同目录随机临时文件写完、sync、关闭后才 rename。媒体不整体装入内存。导入先验清单与图关系，再新建独立归属，按范围流提取、核对摘要；失败只回滚本调用新目录，删除前检查它是受管根的直接子目录。

拒绝未知版本、坏图/重复身份/非法连接/循环、绝对和穿越路径、重复资产名、类别/后缀不符、尺寸或长度错误、截断、尾随字节及校验和篡改。主进程用等价手写验证，不运行时导入 shared TS/Zod；请求错误返回 `INVALID_ARGUMENT`，文件失败收敛固定业务错误，不向界面暴露系统路径或堆栈。

包恢复节点、参数、位置、尺寸、连线及媒体；**不保存镜头、当前选择、菜单、播放器进度、撤销栈、系统主题、账户或密钥**。未知版本拒绝，不提供无规则猜测迁移。外部工程交换不替代统一用户 JSON。

## 视频加载与生命周期

此前视频仅等首帧事件、使用 metadata 预加载，在浏览器只读出头部或没有任何后续事件时可能一直显示读取。本轮允许继续加载真实数据，接 loadeddata/canplay，并加入有上界的失败状态；metadata 只更新时间/时长，不能当作首帧解码成功。

用户截图中的具体源文件未取得，**未证明其特定编码已兼容**。不支持编码或超时会保留文件引用并准确报错。当前实际解码证据是 FFmpeg 生成的 320×180、24fps、3s H.264 MP4，另有 PNG、PCM WAV 与坏 MP4。

播放器换源/重试重建会话，error/超时后屏蔽旧就绪事件；清理定时器、互斥/可见性监听，pause、remove src、load 释放缓冲。音视频互斥范围只在当前画布。文件导入、工程操作和截帧均检查页面寿命；保存框返回时页面已离开则不新启截帧，已提交 FFmpeg 作业仍由原任务服务收尾，不冒称卸载已经取消该作业。没有临时 Blob URL。

## 实际验证

| 检查 | 最终结果 | 日志 |
| --- | --- | --- |
| pnpm typecheck | 通过：Next strict 与主进程 | canvas-project-typecheck-final.log；最新完整 check 的类型阶段亦通过 |
| pnpm lint | 0 错误、33 个已有警告 | canvas-project-lint-final.log |
| Next build | 静态导出通过，923 个指纹输入 | canvas-project-build-final.log |
| node scripts/verify-canvas-project.js | 真实复制/归档/恢复及反证通过 | canvas-project-format-final.log |
| pnpm exec electron scripts/smoke-infinite-canvas.js | 退出 0，91/91 | canvas-project-runtime-final.log；smoke-runs.log |
| pnpm check:locale-keys | 19 个命名空间键一致 | canvas-project-locales.log |
| pnpm check:i18n | 通过：21/66 硬编码基线 | canvas-project-i18n.log |
| pnpm check:i18n:en | 通过既有基线；保留模块类型警告 | canvas-project-i18n-en.log |
| node scripts/check-smoke-rules.js | 通过 | canvas-project-smoke-rules.log |
| pnpm check | **失败 1 项**：既有 auth.verifySuccess、common.localeNameSelf、create.generationTasks.active 未引用；在 gates 阶段中断 | canvas-project-check-complete.log |

日志均在仓库根 `logs/`。完整 check 后续未执行的子检查不标记通过；locale/i18n 是单独补跑的结果。未触碰上述三条无关词条。

最终构建指纹：`0fa75e8bc14d5b8d6d0778b139226796bcd1a728205f1698d518c3c99063ef01`。最终截图根 `C:/Users/18305/AppData/Local/Temp/ir-canvas-9Y8OdI`，已复制至 runtime。

本轮曾出现的失败均保留：首次空白菜单回归超时，修复为未复制前继续用原添加菜单；子菜单被重复外部关闭器提前卸载，改由公共 CascadeMenu 自行负责。旧归档重复 pipeline 积累监听器，改成顺序文件句柄写入，最终无 MaxListeners 警告。通道副本引号格式导致静态审计漏读、旧 canvas.duplicate 词条未引用也已修复；最终 check 剩余项是上述既有三条。

自动 Electron 覆盖旧 74 项，并新增菜单与键盘复制、剪切、粘贴/身份、文本隔离、边右键/Delete/撤销、三种尺寸及非法草稿、真实 FFmpeg PNG、导出/移开旧目录/导入/再次真实解码、独立归属、取消和坏包保留作品。Node 格式检查还覆盖源不改、同名分配、归属拒绝、部分失败、旧字段兼容、同源正文去重、大小/摘要/穿越反证与回滚。

**证据区别**：系统 chooser 用 CDP 拦截并提供真实磁盘 File；外部 drop 用真实 File 加合成 DragEvent；右键是 DOM 事件，菜单点击与部分键盘为 Electron 注入；保存/打开系统框是路径返回值夹具。文件复制、打包、解包、FFmpeg 和浏览器解码均使用生产实现，未用成功结果 mock。离屏窗口与软件渲染截图不是实体桌面操作证据。

## 运行截图

- [自定义卡片](runtime/project-custom-card.png)
- [视频底栏与真实截帧](runtime/project-video-transport.png) · [实际导出 PNG](runtime/project-captured-frame.png)
- [旧目录移开后工程恢复](runtime/project-restored.png)
- [坏包失败但作品保留](runtime/project-error.png)
- [真实媒体深色](runtime/project-media-dark.png) · [浅色窄窗口](runtime/project-media-narrow.png)

## 未验证与限制

人工系统框多选/取消/保存覆盖、资源管理器实体拖入、实体右键细线命中、完整键盘/读屏/中文 IME、触控板、扬声器试听、Windows 125%/150% 系统缩放与多屏仍待验；此前状态不改写。未录屏，未实际跨电脑拷贝。未单独同时挂载 A/B 两套画布；同源节点身份与媒体会话独立已有自动检查。

未执行全部旧视频/GIF/漫画回归；本轮未改其业务服务，截帧真实使用既有 frame 作业。未运行安装器/打包分发，不声称安装版实测。未测超大包、大量长视频、磁盘满、掉电、全编码、移动硬盘断连或长期性能。

导出需要两遍读取源内容并做 SHA256，大工程受磁盘吞吐影响；清单内存上限不等于正文总大小上限。没有工程任务取消/百分比，不自动清理孤儿素材，不做全局内容哈希去重。每个可见音视频节点拥有独立解码器，大量节点资源消耗尚未验收。

模型生成、任务队列、结果传播、云端、协作、导演台、3D World、画布多轨合成与成片渲染导出仍未接通；本轮不把工程归档当成这些业务已完成。

## 增量注释与代码限制

基线为本请求开始前快照 `C:/Users/18305/AppData/Local/Temp/ir-canvas-project-baseline-b44k0wcn`，不以 HEAD 的全工作区累计变化冒充本轮。新文件全文、已有文件只计新增及替换后行；混合行计 B，空行/定界符/纯类型标记排除，完全重复说明只计一次。逐文件、基线哈希与变更行范围见 [project-comment-audit.json](project-comment-audit.json)。

| 范围 | 有效注释 C | 代码 B | C/(C+B) |
| --- | ---: | ---: | ---: |
| 业务 | 1558 | 664 | 70.12% |
| 测试 | 535 | 228 | 70.12% |

说明覆盖职责、失败和取消、文件归属、字节边界、剪贴板身份、资源清理与测试证据，并复核与行为对应。例：工程归档用“装箱单”解释顺序流与摘要；图校验用“逐层拆积木”解释非递归循环检查。数量扫描不代替语义核对，历史全量低注释审计继续保留。

本轮新增/修改的普通逻辑函数未发现超过 30 行有效代码；展示 JSX 按职责例外。扫描发现已有 `useCanvasPersistence` 为 36 行，本轮未修改，不为本任务扩大重构。保持 TypeScript strict、无新增 any。
