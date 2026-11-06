# 无限画布：白色主题与本地媒体导入

日期：2026-11-06。入口：`/canvas`，位于“创建”导航下方。本轮为组件样式库版本的追加更新，保留已有工作区修改。

## 复用关系与业务边界

| 既有能力 | 本轮接入 | 变化方式 |
| --- | --- | --- |
| 资料 CanvasNode、GenerationPanel | 图片/视频/音频真实来源 | 原节点内容插槽与 kind、selected、onReplace 参数，不建第二套节点 |
| IconButton、CanvasChip、AddNodeMenu | 文件夹导入、菜单导入、缺图更换/重试 | 回调传意图，保持资料交互与细线反馈 |
| 应用 nativeTheme/themeSignals | 白色与深灰画布 | prefers-color-scheme 与局部语义色，无独立主题开关 |
| preload.getPathForFile、buildLocalFileUrl、localfile 协议 | 系统多选及拖入 | 共享一个导入流程，不用 File.path，不新增 IPC |
| reducer、五十步历史、统一用户 JSON | 导入/替换/撤销/保存重开 | data.media 可选字段，旧作品无需迁移 |

节目合成器仍是独立空态；视频编辑器、生成队列、模型生成、云端上传、导出不接通。连接只建立已有本地图引用，未实现媒体沿图执行传播。

## 实际修改

- `canvas-media-import.ts` 分类文件、获取真实引用与创建独立节点；`use-canvas-media-import.ts` 让工作区多选、拖入和单卡替换共用处理与错误边界。
- `canvas-media.tsx` 复用节点插槽显示 img/video/audio，真实 load/loadeddata/error 驱动状态；失败保留引用，可重试或更换。
- `canvas-media.css` 完整比例展示、原生控件、长文件名省略及状态层；`reference-ui/canvas-theme.css` 补白色卡片、浮层、表单、连线和小地图。
- 现有 page、node、toolbar、context、reducer、model 接入最小参数；shared schema 增加可选 media 且要求 kind 一致，zh-CN/en 同步。
- `scripts/lib/check-canvas-media.js` 在原冒烟窗口追加真实媒体验证，不并发启动第二个 Electron。

支持候选后缀：png/jpg/jpeg/webp/gif/avif/bmp；mp4/webm/mov/m4v/mkv/avi；mp3/wav/ogg/m4a/aac/flac/opus。扩展名允许选择不保证 Chromium 支持该容器中的所有编码，无法解码会显示错误而非假成功。

文件仅保存 path、name、kind、size；没有读取全文件 ArrayBuffer、计算哈希或存 base64。资源读取复用原协议流及 Range。移动原文件后会缺图，需要恢复或更换来源；保存画布不会打包媒体副本。

## 生命周期

加载、错误、播放位置属于各卡临时状态，不进入工程历史。同一工作区播放事件暂停其他音视频；离开选中、document.hidden 或卸载会暂停。卸载移除监听、清空 src 并 load 释放旧缓冲；换源与重试重建解码会话，不使用 Blob URL。图片完整显示，不随浅色主题反色。

原生 controls 内键盘操作隔离画布 Delete/Space 等快捷键。重复导入同文件可得到独立节点，替换保留节点 ID/连线。多选中的坏文件不会清空已有作品；取消无新增事务；失败只在相应卡片显示。

## 检查与证据

- `pnpm typecheck`：通过，日志 `logs/canvas-media-typecheck.log`。
- `pnpm lint`：0 错误、33 个已有警告，日志 `logs/canvas-media-lint.log`。
- `pnpm check:locale-keys`：通过，日志 `logs/canvas-media-locale.log`。
- `pnpm --filter @illusion-realm/next build`：通过，最终日志 `logs/canvas-media-build-verified.log`，918 输入指纹 `10b346da253b3cbbf967a69d3947b702772f2ed91e0ad57e9e54cc566fa70d96`。
- `pnpm check`：实际重跑仍失败。`typecheck`、Electron 模块检查通过，门禁自检停在既有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`，日志 `logs/canvas-media-check-final.log`。本轮新增遗留 `canvas.upload` 已删除，未扩大修改其他领域词条；后续短路子检查不算通过。
- `pnpm exec electron scripts/smoke-infinite-canvas.js`：修正测试前提后完整运行 **74/74**，首个通过日志 `logs/canvas-media-runtime-rerun.log`。最终静态产物复核结果另记于文末。

测试使用实际 ffmpeg 生成文件与生产 preload/协议/写盘器。CDP 选择真实文件、DOM 合成拖入、Electron 自动鼠标键盘、真实解码事件分别记录；没有人工操作证据，不把自动事件称为资源管理器实体拖入。外壳游客初始化和保存失败注入是夹具，不是媒体成功证据。

首轮测试失败保留：未选中音频却要求取消选择暂停，缺少前提；文件选择测试缺 userGesture，之前残留的激活权限过期后导致拒绝。修正测试建立的前提并重跑完整链路，没有修改产品预期或重试隐藏失败。

## 注释审计与限制

基线：`C:/Users/18305/AppData/Local/Temp/ir-canvas-media-baseline-jh_9qc5g`，来自本次请求开始前工作区快照。新增文件全文、已有文件增量；CSS/JSX 同步计入，纯说明 C、混合行 B，排除空行/定界符与重复说明。业务 **643/918=70.04%**，测试 **317/452=70.13%**，逐文件见 `media-theme-comment-audit.json`。已复核资源释放、选择框激活边界和证据分级说明，例如“像会议室递话筒”对应工作区播放互斥；FileList 立即复制说明清空 input 不丢失来源的原因。早期全量注释未达标记录原样保留。

人工待验：系统选择框实际多选/取消、资源管理器实体拖入、扬声器、完整读屏/IME/键盘路径、系统缩放、多屏及长时间运行。未运行双画布同时挂载 A/B；已验证三种媒体状态独立和同源副本。旧视频/GIF/漫画完整回归未执行。

性能限制：节点仍保留原世界尺寸；新批次两列排列不会自动避开旧节点。媒体由原生元素按需读取，没有集中解码调度、缩略图缓存或可见区卸载；没有验证多个 4K 长视频的性能。候选格式白名单不是全部编码兼容承诺。

## 最终静态产物复核

`logs/canvas-media-runtime-final.log`：退出 **0，74/74**。详细日志 `logs/smoke-infinite-canvas-2026-11-06T04-17-23-896Z-36256.log`；摘要已追加 `logs/smoke-runs.log`，该运行开头的构建新鲜度检查通过。截图源目录 `C:/Users/18305/AppData/Local/Temp/ir-canvas-OPK6gX`，已复制进本任务 runtime。

- [白色主题与三类媒体](runtime/media-theme-light.png)
- [深色主题](runtime/media-theme-dark.png)
- [白色添加菜单](runtime/media-theme-light-menu.png) / [设置](runtime/media-theme-light-settings.png)
- [960×720 白色窗口](runtime/media-theme-light-narrow.png)
- [真实解码失败](runtime/media-theme-decode-error.png)
- [保存重开与找回原文件后恢复](runtime/media-theme-restored.png)

本轮状态：功能与自动回归完成，人工项待验。没有启动后续生成或合成开发。

附加核对 `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` 退出 1：HEAD 比较覆盖工作区 183 个文件，报告 45 条既有消失文案，涉及 cartoonFonts、galleryPaintings 等，未报告 canvas 文件。完整输出 `logs/canvas-media-i18n-values.log`；未为修复该全仓基线扩大本轮范围。
