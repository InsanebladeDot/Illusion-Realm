# UI-04 · LIVE-03 实施与验收记录

日期：2026-11-04｜状态：代码与自动回归完成，人工实机项部分未验证，等待验收

## 本轮范围与前置核对

已读取 AGENTS.md、comment-coverage、nextjs-renderer、interface-ui-design、ui-parameter-reuse、UI-04/LIVE-02 实施记录，并核对实际导入、播放器与工程代码。仓库没有独立 LIVE-01 历史实施记录，本轮按实际代码与 LIVE-02 记录复核，没有补造历史验收。

最初任务为 LIVE-03 验收收尾；用户随后明确扩大范围，要求固定所属轨道拖动、真实滚动、右键操作和分离音频，再要求所有自定义右键菜单复用创建图片菜单 UI。本记录按最终授权范围描述。UI-05–UI-08 仍待办，不把必要的提前交互标成整项完成。

## 首段 4 秒、次段 8 秒的实际事实

读取正式工程 DOM 的 start/end，保留完整源长，得到：

| 实例 | 开始 | 结束 | 占位 |
| --- | --- | --- | --- |
| 首段移动后 | 4 | 7.266666666666667 | 98 帧 |
| 第二段 | 8 | 11.266666666666667 | 98 帧 |

两段相隔 **22 帧（0.733333 秒）**，没有重叠。源容器时长 3.25 秒，30fps 工程占位向上取整为 98 帧，不能把工程占位反写源元数据。保留 [实际起止 JSON](runtime/live-03/placement-facts.json)、[拖动前](runtime/live-03/live-02-before-move-light.png)、[拖动后](runtime/live-03/live-02-after-move-light.png)。

新增独立六秒反例：`[0,6)` 移到 4 后成为 `[4,10)`，与固定 `[8,14)` 重叠，正确拒绝。另测接触边界、一帧交集、负起点和输入不可变。原算法没有此处碰撞错误；提取共用碰撞方法供分离/复制复用，没有缩短片段或修改预期迁就结果。

## 实现与复用

| 文件/公共组件 | 改动及边界 |
| --- | --- |
| `live-timeline-model.ts` | 共用 `hasTimelineOverlap`，按同轨整数帧与半开区间校验；新增分离、同轨末尾复制、仅删实例的纯命令 |
| `use-live-timeline.ts` | 固定手势起始轨道；跨轨显示原轨无效轮廓并拒绝提交；透明拖动影像避免系统影子纵向漂移；右键、Shift+F10/菜单键、Escape 焦点恢复、局部 Delete |
| `editor-timeline.tsx` / `editor-clip-shell.tsx` | 原片段壳注入右键回调；真实分离音轨使用音符，不冒用演示波形；滚动、标尺和播放头沿用原单一坐标 |
| `live-source-preview.tsx` | 同一媒体生命周期适配真实 video/audio；单源播放暂停、切源和退出清理；分离后的 V1 实例禁用开启声音 |
| `editor-panels.tsx` / `video-editor-view.tsx` / `editor.module.css` | 共用预览标题插槽传入窄窗入口；名称参与 flex 收缩并省略，修复绝对定位按钮压住标题；素材/片段选择仍各自独立 |
| `live-clip-menu.tsx` | 只接收当前 clipId、素材能力及有限回调，不拥有工程数组、不发文件 IPC |
| `components/context-menu-item.tsx` / `context-menu-shell.tsx` | 从创建图片菜单抽取真实共用行、危险项、分隔和底部名称；188px 默认宽度、相同图标/行高/悬停/焦点/禁用外观与主题表面 |
| 创建图片、历史文件夹、旧视频区间、蒙版选区、漫画图片菜单 | 全部实际引用共享行，原创建页基准也改用共享组件；删除确认、文件操作、像素修改与效果业务仍各自拥有 |
| 双语 `toolBox.ts` | 补齐轨道限制、分离音轨、复制、已分离/音频实例等 9 个词条，语言键一致 |

旧视频区间含速度、音量表单，保留较宽容器及即时效果回调，操作行统一；不会把它的切分/倒放业务接入新工程。蒙版顶部横向工具栏保留，只有右键分支换成共享行。漫画子菜单需向侧面展开，保留原 Portal/定位以防公共滚动壳裁切，但共用尺寸、表面、行与分隔。调色表单、按钮下拉及系统原生文本菜单不属于这次自定义业务右键菜单迁移。

分离音频为**工程里的独立源音轨引用**：保留 start/end/sourceIn/sourceDuration，优先 A1，冲突回退 A2，两轨冲突整体拒绝且不静音原 V1。原文件不提取 WAV、不复制或删改；其他同源视频实例不受影响。音轨可同轨移动、复制、删除及单源试听；不是多轨节目合成。

## 实际检查与证据等级

静态导出构建成功，28 路由；指纹 `9b853fae66688da4a3a30c79fdfa33209ae44bea5ded68d1a402321568fd4796`，854 输入文件。[构建记录](runtime/live-03/build-fingerprint.json)。以下 Electron 套件均串行检查该指纹，不运行过期 out，不关闭用户正在使用的客户端。

| 检查 | 本轮结果 | 证据范围 |
| --- | --- | --- |
| `pnpm check` 中的 typecheck | 通过 | 渲染与主进程类型 |
| `pnpm lint` | 0 错误 / 33 既有警告 | 无新增 lint 错误 |
| `pnpm --filter @illusion-realm/next build` | 通过 | 正式静态导出、页面生成和构建类型检查 |
| `pnpm check` 中 Electron 模块校验 | ALL PASS | 模块依赖、通道副本、注册与 IPC 结果等 |
| `pnpm check` 整体 | 未通过 | 既有未引用键 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 阻断 gates；后续链未全部执行 |
| `pnpm check:locale-keys` | 通过 | 18 命名空间双语键一致 |
| 脚本约定 / 引用检查 | 通过 | smoke harness 与脚本入口约定 |
| `verify-i18n-values --base HEAD` | 未通过 | 大工作区原有 `cartoonFonts.ts` / `galleryPaintings.ts` 删除项 45 条可疑；本轮不恢复这些旧资源 |
| LIVE-02 扩展回归 | **65/65** | 实际媒体与 DOM、Chromium 内部拖放、DOM 键盘、工程/音轨纯模型反例；最终重复运行只因补菜单入场截图等待 |
| LIVE-01 回归 | **19/19** | 原生系统选择框经 Windows UIAutomation 多选/取消；真实 probe、封面、播放、异常和清理；未替换 showOpenDialog 返回值 |
| 静态 UI 与 legacy/GIF 宿主 | **97/97** | UI-02–04 A/B 隔离、状态、响应式与旧宿主 |
| 共享菜单专项 | **7/7** | 创建图片、文件夹、漫画删除/恢复/子菜单可见命中；公开 DOM 事件 |
| 原视频区间效果 | **9/9** | 右键参数、复制粘贴、切分删除、短窗口菜单；真实 FFmpeg 输出/声音幅度/倒放顺序 |
| 蒙版专项 | **134/134** | 含选区右键定位/取消、原像素字节、颜色表单、工具/缩放/主题与工作流契约 |

[本轮冒烟摘要](runtime/live-03/smoke-runs.log) 保留失败与重跑，不用后续通过覆盖历史。新菜单专项初次 5/7：文件夹在缩放动画中读到临时矩形，改为等待最终透明度并读取布局宽；漫画“首格 img”选择器实际会命中第二格，改为先取首格再查其 img，仍要求其余四图保留。原视频副本测试一度用 DOM 最后一项错误命中 A1，改用前后 ID 差集识别 V1 新实例。均未改变产品预期或片段长度。

原视频效果脚本有既有 `account:me` 夹具未注册诊断，效果/导出 9 项通过；不能把该诊断描述成真实账号联调成功。

横屏/竖屏 H264 样本分别 640×360/30fps/AAC、360×640/24fps/无声。时间线样本 3.25 秒，原生选择框样本 6 秒，均为实际磁盘编码文件。[时间线独立探测](runtime/live-03/media-facts.json)、[系统选择框样本探测](runtime/live-03/native-picker-media-facts.json)。

按钮导入为**真实系统选择框自动化**；内部拖动为 Chromium 输入驱动，取消/键盘/菜单包含 DOM 合成事件；外部 File 路径回归为 Chromium Files 载荷。数值长片段、音轨冲突和导航确认回答为明确夹具。上述证据不能当成人工资源管理器 OLE 拖入或人工键盘操作。

## 主题、尺寸与真实运行截图

浅深主题分别验证编辑器 host 1600×1000、1280×800、960×720（实测宽含 0.25px 舍入，容差 1px）；无横向溢出、信息条在底、导入可达、片段数保持、窄窗标题不压按钮。[浅色尺寸事实](runtime/live-03/layout-light.json)、[深色尺寸事实](runtime/live-03/layout-dark.json)。DPR=1；这不是125%/150%系统缩放证明。

- [真实系统多选导入](runtime/live-03/live-01-import-light.png)
- [拖动草稿](runtime/live-03/live-02-drag-feedback-light.png)、[非法落点](runtime/live-03/live-02-invalid-drop-light.png)、[横滚后放置](runtime/live-03/live-02-scrolled-light.png)
- [浅色宽窗](runtime/live-03/live-03-light-1600x1000.png)、[深色窄窗](runtime/live-03/live-03-dark-960x720.png)
- [真实音轨分离](runtime/live-03/live-03-audio-detached.png)、[统一后的片段右键菜单](runtime/live-03/live-03-clip-menu.png)
- [创建图片基准菜单](runtime/live-03/shared-image-context-menu.png)、[文件夹菜单](runtime/live-03/shared-folder-context-menu.png)、[漫画侧向子菜单](runtime/live-03/shared-comic-context-menu.png)、[旧视频菜单](runtime/live-03/shared-legacy-context-menu.png)

截图来自真实 Electron capturePage，已打开核查。早先一次菜单截图处于入场尚未绘制帧，已补有界入场等待后重新采集；归档使用最终实际可见菜单图，不使用旧空菜单截图。未录制操作视频。

## 仍未验证与仍禁用

前台全屏程序占用系统桌面，用户已要求保留此限制，不强占鼠标。因此以下未标成通过：资源管理器真实 OLE 拖入；人工拖素材入轨/移动/取消与完整焦点路径；实际系统键盘逐帧/逐秒；扬声器音频试听；真实125%/150%系统缩放；多显示器；系统级强制关闭；桌面操作录屏。已验证的是真实媒体事件、DOM/CDP 输入与路由退出清理，不等同于上述人工项。

仍禁用：属性数值修改、修剪、切分、吸附、跨轨移动、加轨、保存/恢复/导出、撤销重做、真实外部音频导入和波形、节目多轨合成/连续播放、播放头拖动、时间线缩放、窄窗临时面板展开、分隔条拖动。旧版视频工具原有这些能力不受新工程禁用边界替换。

## 增量注释率

[逐文件审计](ui-04-live-03-comment-audit.json)：业务 **70.38%**（C=525，B=221）；测试 **70.37%**（C=399，B=168）。按本轮/菜单迁移前快照统计新增和替换行，新增文件全文，删除和未变上下文不计，混合行只 B；人工核对后保守剔除16行重复说明。双语基线精确反向扣除本轮9个新增键，未把整个未提交工作区算成本轮成果。

有效说明例子：把素材/片段比作原件/安排表，音轨分离比作同页乐谱分给另一演奏者；解释V1静音和音轨创建必须原子成功，音轨满时不得只静音原件。测试解释为什么按轨道分组的 DOM 不能用末项查视频副本，以及为什么节点已挂载不等于入场菜单已经被截图画出。

新增普通业务/测试辅助函数均按正常展开复核不超过30行；JSX装配按职责例外。已有 `smoke-create-layout.js` 的 main、checkFileInteractions 等长编排函数仍保留，本轮只接入专项/共用菜单测试调用，未借此全局改写历史回归脚本。

本轮停在 LIVE-03，等待验收；未推进 UI-05–UI-08。
