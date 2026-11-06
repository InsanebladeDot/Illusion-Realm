# 无限画布验证记录

## 最新：名称显示与拖动更新优化（2026-11-06）

正式静态 Electron **104/104通过，人工项待验**。名称可见、长名省略、窄窗口与保存恢复已覆盖；类型、lint、模型检查及构建通过，全仓 `pnpm check` 仍有既有词条门禁失败。详见本文末尾本轮记录和 [实施记录](title-drag-implementation.md)。

## 历史：图片拖动、视频显示与复制/移动导入（2026-11-06）

**自动验收完成，人工项待验。** 详见 [媒体修复实施记录](media-fix-implementation.md)。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0，最终日志 `logs/canvas-media-fix-typecheck-final.log` |
| `pnpm lint` | 退出 0，0 错误、33 个既有警告；`logs/canvas-media-fix-lint-final.log` |
| Next 静态构建 | 退出 0；`logs/canvas-media-fix-build-final.log` |
| `node scripts/verify-canvas-project.js` | 退出 0；真实磁盘复制/移动、拒绝、格式与归档反证 |
| `pnpm check:locale-keys` | 退出 0，19 个命名空间一致 |
| 最终静态 Electron | 退出 0，**100/100**；`logs/canvas-media-fix-runtime-final.log` |
| 开发模式 Electron | 退出 0，**100/100**；`logs/canvas-media-fix-runtime-dev.log` |
| `pnpm check` | 退出 1，类型及模块验证后，gates 停于既有三词条未引用；`logs/canvas-media-fix-check.log` |

最终静态指纹：`5a76cba70199827d73fca07e221661b8bff434ed5ead9a37b9dbf196e34231a4`，924 个输入；冒烟实际核对一致。最终静态截图原始目录 `C:/Users/18305/AppData/Local/Temp/ir-canvas-RC6zJm`。开发模式截图单独位于 `ir-canvas-2xOqOH`，不混作发布产物截图。

增量自动覆盖：每批默认复制、Escape 取消后原文件及原图保留、真实临时视频移动后来源消失/正文一致/目标解码、混合媒体追加、图片正文 Electron 鼠标注入拖动、图片无重复覆盖控件；并回归播放互斥、错误/缺图、重开恢复、剪贴板、尺寸、工程交换与截图截帧。静态及 dev 分别运行，同一轮仅一个 Electron。临时 dev 服务已停止，没有终止用户应用。

格式检查使用已知字节，不作为解码证据。Electron 使用实际 PNG、H.264 MP4、PCM WAV；系统框为 CDP chooser 注入真实 File，外部 drop 为合成 DragEvent。没有人工 Windows 选择框、资源管理器拖放、扬声器试听、完整键盘/读屏或系统缩放证明；此前待验项不改变。未获取用户截图里失败视频的原文件，未验证其具体编码；大文件、真实文件锁/来源删除失败、跨盘性能未实测。

业务增量 **239/(239+102)=70.09%**，测试增量 **173/(173+72)=70.61%**。基线、逐文件范围、哈希与排除口径见 [审计记录](media-fix-comment-audit.json)。`pnpm check` 的既有三词条为 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；其后未执行的子检查不宣称通过。

截图：[图片拖动](runtime/media-fix-image-drag.png) · [导入方式确认](runtime/media-fix-import-choice.png) · [移动后视频解码](runtime/media-fix-video.png) · [浅色窄窗口](runtime/media-fix-light-narrow.png)。

## 上一轮：工程交换、节点剪贴板与尺寸（2026-11-06）

**自动验收完成，人工项待验；不标记全项验收通过。** 本轮详见 [实施记录与功能规范表](project-clipboard-implementation.md)。以下旧阶段证据继续保留，旧 57/57、74/74 和注释数字不替代本轮结果。

- 最终正式 Electron `app://app/canvas`：退出 **0，91/91**。`logs/canvas-project-runtime-final.log`；harness 汇总已写入 `logs/smoke-runs.log`。同一隔离窗口串行运行，没有终止用户原应用。
- 最终静态构建指纹：`0fa75e8bc14d5b8d6d0778b139226796bcd1a728205f1698d518c3c99063ef01`，923 个输入；冒烟实际核对指纹，没有跳过产物新鲜度。
- Node 格式反证通过：生产复制/打包/解包、原文件不改、同名分配、归属拒绝、部分失败、旧字段兼容、正文去重、坏图、路径穿越、后缀、大小/摘要、截断与回滚。格式样本是已知字节，不当作媒体解码证据。
- Electron 增量覆盖 C/X/V、无底稿隐藏粘贴、文本隔离、新身份与历史、连线右键/Delete、三种卡片/非法草稿、真实 FFmpeg PNG、工程导出/移开旧目录/导入/重新解码、独立新归属、取消/坏包保留图与按钮恢复。
- PNG、H.264 MP4、PCM WAV 真正落盘并被 Chromium 解码；缺图/坏 MP4 也保留节点。媒体进度来自实际事件。未获取截图里用户那个具体视频，未宣称所有编码已兼容。
- `pnpm typecheck` 通过；`pnpm lint` **0 错误、33 个既有警告**；Next build 通过；双语键、i18n 两项基线、冒烟规则检查通过。对应日志名见实施记录。
- 最终 `pnpm check` **退出 1**，在 gates 停于既有 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 未引用，详见 `logs/canvas-project-check-complete.log`。后续子检查未跑的不说通过；双语/i18n 为另行补跑。
- 本轮发现的通道副本引号审计、旧 canvas.duplicate 词条、空白菜单与级联提前卸载、归档监听累积已修复；早期失败日志保留，不累计其部分通过数。最终没有 MaxListeners 警告。

自动 chooser 是 CDP 提供真实磁盘 File；外部 drop 是 File + 合成 DragEvent；右键是 DOM 合成，菜单/部分键盘是 Electron 注入；工程系统框与截帧保存框是返回路径夹具。生产文件读写、FFmpeg 和实际解码没有替换成成功 mock。离屏软件渲染窗口截图不等于人工桌面操作。

人工系统框多选/取消/保存、资源管理器实体拖入、实体细线右键、完整键盘/读屏/IME、扬声器、触控板、系统缩放与多屏仍待验。未录屏、未跨电脑实际拷贝，未测超大包/长视频性能，未单独同时挂载 A/B；旧视频/GIF/漫画完整回归及安装版未跑。此前人工待验项目原样保留。

复用原节点、参数、公共级联菜单、浮层、图标按钮、编辑事务、localfile 及工具箱截帧。工程包只恢复当前画布与引用媒体，不包含系统设置、镜头、选择、播放进度或撤销栈。模型生成、云端任务/同步、结果传播、画布多轨合成与成片渲染导出仍未接通。

本轮注释基线是请求前工作区快照，不混入历史成果；业务 **1558/(1558+664)=70.12%**，测试 **535/(535+228)=70.12%**。范围、行区间、基线哈希与排除方法见 [project-comment-audit.json](project-comment-audit.json)。历史全量未达标结论不重写。

截图已归档：

- [自定义卡片](runtime/project-custom-card.png)
- [视频底栏/截帧](runtime/project-video-transport.png) · [真实输出 PNG](runtime/project-captured-frame.png)
- [便携工程恢复](runtime/project-restored.png)
- [坏包保留画布](runtime/project-error.png)
- [深色媒体](runtime/project-media-dark.png) · [浅色窄窗口](runtime/project-media-narrow.png)

## 以下为此前阶段记录


更新日期：2026-11-06。结论：**UI 交互自动验证完成，人工项待验；全仓门禁和注释率未全部通过。**

## 最终运行

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | 通过，Next 和 Electron 类型检查 | `logs/canvas-reference-typecheck.log` |
| `pnpm lint` | 0 errors、33 条已有 warnings，画布无新增 lint 问题 | `logs/canvas-reference-lint.log` |
| `pnpm --filter @illusion-realm/next build` | 通过，静态导出包含 `/canvas` | `logs/canvas-reference-build.log` |
| `pnpm check:locale-keys` | 通过，19 个命名空间双语键一致 | 实际命令输出；本轮没有删除词条基线 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | **57/57 通过** | `logs/canvas-reference-runtime.log`、`logs/smoke-runs.log` |
| `pnpm check` | **失败，退出 1**；类型和 Electron verify 后，在既有未引用词条门禁阻断 | `logs/canvas-reference-check-final.log` |
| 业务及测试注释率 | **均未达 70%** | `comment-audit.json`；本页下方 |
| 实体鼠标、触控板、IME、系统缩放及多屏 | **未验证** | 不能由自动输入替代 |

最后构建内容指纹：`3208cc64b9d41e252db9c8eeb3f060e3831ed87d58116409d806cede95a8eaad`，913 个输入文件。Electron 启动时核对内容指纹，不测旧导出。

`pnpm check` 当前仍报告：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。没有改动这些范围外词条或降低门禁基线。后续串联检查没有执行，不能因为前半段通过就把整条命令记为通过。

## 自动覆盖

- 正式导航顺序、空画布、四类节点创建、参数输入、独立副本、删除、撤销/重做。
- 真实 Handle 语义连接、重复/类型/循环拒绝、删除关联边。
- Electron 鼠标平移/拖动、缩放后抓取偏移、Escape 恢复，以及取消后的后续保存。
- 工具按钮 hover/按住无全局描边；菜单独立按住反馈，禁用项没有 hover 或动作。
- 菜单 Home/End、音频模式移开失焦后的持续选中、视频与音频模式独立。
- Tab 到模式选项后的无额外主题轮廓；画布根快捷键焦点不出现浏览器白框。
- 点阵与小地图真实图层和 aria-pressed 同步，手掌模式禁用节点拖动。
- 参数收起后无隐藏表单站点，重开仍归当前节点。
- 比例浮层选项聚焦、Escape 关闭/返回、选完提交、外点关闭不抢焦点、切换选择仍保留比例。
- 设置真实开关、inert 工作区、关闭后的触发器焦点返回、合成器空态服务禁用。
- 正常保存写真实临时 JSON；保留无关用户文档段；完整刷新后从磁盘恢复节点/参数/边且不恢复选择。
- 后加 mode 参数仍显示正确保存状态；写入失败时旧文件与当前草稿保留；重试核对真实文件内容。
- 应用外壳浅/深主题，1600×1000、1280×800、960×800、600×800 CSS 窗口；底栏不越出画布，窄屏仍有导航入口。

这些尺寸是测试窗口/CSS 视口，不是独立测得的编辑器容器尺寸，也不是 Windows 125%/150% 系统缩放。该历史轮次画布按资料保持深灰；后续白色主题见本文新增记录。

## 证据分类

| 类别 | 本轮实际使用 | 能证明 / 不能证明 |
| --- | --- | --- |
| 生产 Electron 页面 | 正式 `app://app/canvas`、静态导出、生产 preload | 页面实际渲染及桥接边界；不是独立 HTML 样板 |
| Electron 自动输入 | 鼠标移动、按住、松开、节点拖动、滚轮及部分键盘 | 自动输入路径和计算样式；不是人工手感验收 |
| DOM 自动事件 | 按钮 click、表单 setter/input/focusout、端口语义 click | React 事件与事务接线；不是实体拖线证明 |
| CDP | CSS 视口和页面加载后的焦点模拟 | 离屏键盘焦点绘制；不是操作系统焦点或系统缩放证明 |
| 真实写盘 | 随机临时 `illusion-realm.json`，生产 writeUserData | 本地保存、刷新恢复、其他段保留；不访问真实账户作品 |
| 夹具 / 失败注入 | 游客与外壳空初始化，拒绝写入开关 | 隔离和错误恢复；没有用 mock 成功代替磁盘证明 |
| 人工操作 | 本轮没有 | 实体拖线、触控板、IME、读屏、系统缩放等继续待验 |

## 修复前失败记录

- 新增状态断言曾报告音频底色和键盘阴影失败：底色读取到了 200ms 过渡中间帧，离屏页面没有活动焦点前提。改为等待最终计算值、加载后启用焦点模拟，没有把错误中间值改成成功预期。
- 比例 Escape 被画布捕获提前消费，是真实产品缺陷；修复局部键盘边界后通过。
- 焦点模拟曾在没有页面 frame 的加载前调用，触发 **100000ms 看门狗超时失败**，日志为 `logs/smoke-infinite-canvas-2026-11-06T02-32-53-805Z-29272.log`。修复调用时机后串行重跑；没有将该超时计为通过。
- 深入保存检查发现取消拖动事务未收尾，以及 mode/createdAt 字段顺序导致签名假脏；分别修复事务清理和规范序列化，再跑完整链路。

失败历史没有从日志抹除。当前 57/57 是上述修复完成后的最终独立运行，不把历史 30/30、39/39 或诊断部分通过数累加进去。

## 截图

最终运行截图临时来源：`C:/Users/18305/AppData/Local/Temp/ir-canvas-6RyZMa`，已复制为 `runtime/reference-ui-*.png`。包括四类参数、添加菜单、工具/菜单按住、音频失焦选中、比例浮层、设置、合成器、深色外壳、600px 窗口、真实重开和保存失败。

[原图/实现对照](runtime/reference-ui-video-comparison.png) 是原资料局部图与正式 Electron 截图等尺寸裁切并排；没有按背景占比计算还原度，也不声称字体、DPI、文案和全部状态像素一致。

## 未接通与未验证

模型生成、云端上传、任务队列、结果引用传播、导出、云端、批量任务、协作、导演台、3D World 及画布多轨合成未接通。旧视频编辑器不接收画布节点，任务状态没有被本轮改写。

人工待验：实体鼠标拖线、重叠节点端口命中、触控板、完整键盘/读屏路径、中文 IME、Windows 系统缩放、多屏和长时间运行。同时挂载两个画布的 A/B 回归未执行；节点副本和跨媒体模式独立性已自动验证。旧视频/GIF/漫画完整回归未运行；本轮没有修改其公共业务组件。

## 注释率

完整新增文件及已有画布接入行按技能统计；混合行只计代码，空行和定界符不计，英文原样资料说明不计有效中文注释。旧审计遗漏 reference-ui 等新文件，已归档并重新核对。没有为继续工作重置基线。详见 `comment-audit.json`。

| 范围 | 有效注释 C | 代码 B | C/(C+B) | 70%要求 |
| --- | ---: | ---: | ---: | --- |
| 业务 | 236 | 1370 | 14.69% | 未达 70% |
| 测试 | 97 | 401 | 19.48% | 未达 70% |

注释已补充事务、坐标/连线、焦点、异步失败、保存规范化和测试证据边界，但仍低于要求，不能标记注释规范验收通过。

## 白色主题与本地媒体增量验收（2026-11-06）

正式入口仍为 `app://app/canvas`。业务代码复用资料组件；新媒体只进入原节点内容插槽。实际截图来自 Electron，测试素材由随包 ffmpeg 在随机临时目录生成：180×320 PNG、320×180/24fps/3s H.264 MP4、3s PCM WAV，另有坏 MP4 与 TXT。它们是可实际读取和解码的媒体，不是探测返回值 mock；也不等于已测试用户所有编码。

- `pnpm typecheck` 通过（Next strict + 主进程）；`pnpm lint` 0 错误、33 个已有警告。
- `pnpm check:locale-keys` 通过，19 个命名空间键一致。
- Next 静态构建通过；最终构建与 Electron 运行信息见下方实施记录。
- 自动选择框：CDP 拦截原生 chooser，真实磁盘 File 经生产 getPathForFile 进入作品；不是人工系统框验证。
- 自动拖放：Chromium 真实 File 配合合成 DragEvent，验证共同导入流程；不是资源管理器实体拖入。
- 实际解码与播放：真实自然尺寸/时长、currentTime 推进、音视频互斥、离开选择暂停、媒体内 Delete 隔离、删除后 src 释放。
- 多选追加不清空旧节点；错误来源可更换；不支持格式拒绝且已有文件保留；原生 cancel 事件保留工程。
- 同源多节点身份独立；撤销删除重新解码；真实用户 JSON 写盘后刷新，缺失文件保留引用，找回后重试恢复。
- 通过应用主题入口切换白色，核对画布、卡片、参数、菜单和设置；960×720 CSS 视口另有截图，不冒充系统缩放。

首轮失败保留在 `logs/canvas-media-runtime.log`：播放用例未建立先选中后取消的前提；选择框自动 click 未带 userGesture，激活过期后被浏览器拒绝。已修正测试前提和激活方式，不放宽产品预期。完整重跑 `logs/canvas-media-runtime-rerun.log` 为 **74/74**。

统一 `pnpm check` 首次新增未引用 canvas.upload，已从双语词表删除；其他未引用词条的最终核对结果见实施记录。命令中断后未执行的后续子检查不宣称通过。

人工操作本轮未执行：系统选择框多选/取消、资源管理器实体拖入、扬声器试听、完整键盘/读屏/IME、Windows 125%/150% 系统缩放。此前待验状态全部保留。未单独挂载两套画布做 A/B、未测试大文件或大量并行解码、未完整回归旧视频/GIF/漫画。

增量注释范围以本次请求开始前工作区快照为基线，不将早期画布新增代码计入本轮。业务 **643/(643+275)=70.04%**，测试 **317/(317+135)=70.13%**。逐文件、范围和基线哈希见 `media-theme-comment-audit.json`；此前全量未达标审计继续保留。

最终静态产物运行：`logs/canvas-media-runtime-final.log`，退出 **0 / 74/74**。指纹 `10b346da253b3cbbf967a69d3947b702772f2ed91e0ad57e9e54cc566fa70d96`，截图已归档 `runtime/media-theme-*.png`。最终 `pnpm check` 仍停在既有三词条：auth.verifySuccess、common.localeNameSelf、create.generationTasks.active，退出 1；不是全部检查通过。

附加核对 `node apps/next/scripts/verify-i18n-values.mjs --base HEAD` 退出 1：HEAD 比较覆盖工作区 183 个文件，报告 45 条既有消失文案，涉及 cartoonFonts、galleryPaintings 等，未报告 canvas 文件。完整输出 `logs/canvas-media-i18n-values.log`；未为修复该全仓基线扩大本轮范围。
## 名称显示与拖动更新增量验收（2026-11-06）

本轮最新结果：正式静态 Electron **104/104通过**。名称、长名省略、窄窗口边界与保存重开已覆盖；原拖动、取消、历史、真实媒体与工程包回归保留。实施细节与截图见 [title-drag-implementation.md](title-drag-implementation.md)。这次未重跑开发模式，不挪用此前100/100作为本轮结果。

类型与 lint 通过（0错误、33既有警告），模型/工程检查及 Next 构建通过。`pnpm check` 本轮重跑退出1：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 仍未引用，后续串联检查未执行。日志统一前缀 `logs/canvas-title-drag-`。

300节点模型移动 ID 读取从90,600降至301，未动节点引用保留；仅为算法反证，**没有测得 DOM FPS 或人工拖动手感**。业务增量70.33%、测试增量70.13%，基线与明细见 `title-drag-comment-audit.json`。人工、系统缩放、同时挂载A/B、大工程和长时性能待验项继续保留。

