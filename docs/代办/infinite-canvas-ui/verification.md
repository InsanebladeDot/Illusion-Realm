# 无限画布验证记录

## MiniMax 资源标记与提示词预览（2026-11-13）

↑ 左侧“预览提示词”直接复用原参数浮层与转换正文，右下角原助手发送官方标记。图片 `<Picture N>`、视频 `<Video N>`、音频 `<Slot N>`；旧 `<Audio N>` 在转换时兼容升级。H3 图片编辑的真实 builder 同步接入，撤销恢复原 `@` 草稿，缺失引用阻止请求，迟到结果保留待确认。图片参数沿用原换行规则，不压盖新入口。

类型、lint（0错误/37旧警告）、最终静态构建通过。Electron 串行：预览专项 **24/24**、画布音频 **27/27**、原创作视频 **172/172**、原创作音频 **19/19**、H3 编辑 **15/15**、原助手 **78/78**、完整画布 **149/149**。纯音频契约 **6/6组**、图片生成纯检查 **221项**，语言键/基线与脚本护栏通过。预览专项首次节点挂载等待失败、后一次主题动画遮罩消费拖动的失败日志保留；修正的是自动输入前提，最终断言未放宽。截图发现的参数压盖已通过原换行机制修正并增加几何反证。

UI 自动事件、实际本机媒体/SQLite/写盘、HTTP 生成夹具、IPC 转换替身与人工未验分别记录。真实 GPU、模型画质/音质及此前人工待验未标为通过；画布视频原执行器仍未接通。全仓 `pnpm check` 继续因既有三个未引用词条退出1，后续未执行步骤不计通过。业务增量注释 **20.26%**、测试 **8.48%**，低于参考的原因及逐文件范围见[独立实施记录](canvas-reference-preview-implementation.md)。[深浅主题截图与日志](runtime/canvas-reference-preview-2026-11-13/)。

## 节点网切图浅色外框（2026-11-13）

局部取消预览期间main的1px边线和4px留白，退出恢复。类型、lint（0错误/37旧警告）、静态构建通过；静态与开发Electron专项串行各48/48通过。覆盖深浅主题、窄窗口、键盘/点击切换与空节点，原平移缩放及媒体清理继续通过。修复前3项失败及修复后一次尺寸交付时序失败日志保留；自动事件/媒体夹具与人工未验分开，之前待验及全仓检查阻塞不变。增量业务注释50%（1/2行）、测试17.65%（3/17行），范围与偏离原因见[独立记录](preview-frame-implementation.md)。

## 节点网预览滚轮缩放（2026-11-13）

main内滚轮向上放大、向下缩小，每次10个百分点，沿用10%–400%与原工具栏状态；包含留白，排除footer、工具控件和文字/音频阅读区。类型、lint（0错误/37旧警告）、静态构建及串行Electron44/44通过。自动鼠标/滑块前提与人工未验分别报告，原完整检查阻塞保留。增量业务注释8.33%、测试6.98%，原因与逐文件范围见[本轮实施及日志](preview-wheel-implementation.md)。

## 图片按住拖动与预览复用（2026-11-13）

节点网预览解除必须先放大的拖动限制，100%、缩小、旋转后均可按住平移。与创作页原大图预览共同调用抽出的图片手势Hook，清理旧的两份拖动逻辑；不改工程与媒体文件。单击不误关、双击重置、取消与失焦结束、关闭重开无抓手残留。

类型、lint（0错误/37旧警告）、静态构建通过；串行Electron节点网38/38、创作大图24/24、对比15/15通过。自动鼠标事件与失焦注入分别记录，实体鼠标手感等人工项继续待验；完整check旧阻塞保留。增量业务注释8.97%、测试7.69%，偏离参考的原因、失败尝试与基线见记录。

[复用、实际验证与截图](preview-pan-implementation.md) · [增量注释审计](preview-pan-comment-audit.json)

## 预览 main 留白悬停修正（2026-11-13）

顶部工具的触发范围扩大为整个main展示区，包含图片周围四边留白；应用导航与底部资源条不触发。复用既有工具、显隐和媒体生命周期，不增加监听体系。

类型、lint（0错误/37旧警告）、Next静态构建通过；正式静态页面Electron自动鼠标回归 **30/30**，覆盖深色与浅色960×720窗口、四周留白、图片、footer与导航。没有新增人工验收，之前人工待验与完整check既有阻塞继续保留。本轮增量业务注释33.33%、测试10.00%，小范围修改未为比例凑数。

[实施、验证边界与注释统计](preview-main-hover-implementation.md) · [截图与日志](runtime/preview-main-hover-2026-11-13/)

## 独立对比图像节点（2026-11-13）

右键图像→对比图像，普通两图按接线先后；超分输出固定在右，单接超分自动解析原图。卡片与节点网大预览共用原媒体组件和对比显示，先读原图，结果就绪再显示分界，失败保留原图并可重试。保存只保留节点身份及边，不复制媒体。修复级联菜单进入添加列表时丢失右键落点、节点重叠的问题。

最终静态构建1119输入，指纹`4304ba83bec5f96e2024d60610b32a5f7155aa8eb6217e7c5b63bc9206a090dd`。Electron串行：对比专项**15/15**、原画布**149/149**、节点网**14/14**、超分**25/25**、图片拖线与比例**27/27**，独立计数不累加。真实PNG/localfile/SQLite、实际捕获像素、物理指针拖动、键盘两端、普通两图、缺失结果/修复重试、重开、两主题及960×720可见布局通过；模型接口使用固定媒体替身，未运行AI超分。

`pnpm typecheck`、完整lint（0错误37既有警告）、末次受影响文件lint、Next静态导出通过；生产源角色与输入反例、shared/主进程格式、原工程兼容、双语键、i18n基线、脚本引用和冒烟规则通过。`pnpm check`实际重跑退出1：auth.verifySuccess、canvas.reference、canvas.styleTransfer三条既有未使用词条阻断门禁，后续未全部自动执行；Meta单独退出1，仍为未改的MetaFieldRow.tsx字段注释检测，真实golden语料缺失。

业务增量**17/(17+135)=11.18%**、测试**12/(12+189)=5.97%**，必要注释已复核；低于20%–30%参考，也未达粘贴规则中的70%，未凑数。新增普通逻辑函数≤30有效物理行，展示装配按规则豁免。**本轮自动验收完成，人工项待验**；真实AI画质、大图压力、触屏/系统DPI、安装包未验；UI-08等此前人工项维持原状态。[实施与截图](image-compare-implementation.md) · [日志证据](runtime/image-compare-2026-11-13/) · [注释审计](image-compare-comment-audit.json) · [函数审计](image-compare-function-audit.json)。

## 节点网预览与卡内超分（2026-11-13）

双击正文默认显示被双击节点，连线按双向连通分量收集，不改变原依赖方向。左右切换、底部缩略条、定位、关闭、焦点返回、背景快捷键隔离、音视频退出释放、浅色窄窗口、孤立节点与便签编辑专项14/14。正式静态页面使用自动Electron输入和DOM事件，真实本地文件、SQLite和媒体解码，不是人工验收。

最终同一静态构建下，原画布149/149、超分及创作复用25/25通过，与节点网14/14串行执行，不累加为一个通过率。超分接口使用HTTP固定媒体替身，未运行真实模型。

最终静态构建指纹 `d8cf92b935fddbcf34c3463859d644434d6d6d7ab3274d50e7fab610ef2d6bf9`，1115输入。类型、完整lint（0错误37警告）、末次受影响文件lint与构建通过；双向分支/环/断线/孤立/失效边/2000链纯检查、双语键、i18n基线、脚本引用与冒烟规则通过。完整 `pnpm check` 仍退出1，被auth.verifySuccess、canvas.reference、canvas.styleTransfer三条既有未使用词条阻断；单跑Meta也因原MetaFieldRow.tsx注释检测失败，真实语料缺失。

独立超分删除旧配置面板，固定7B×2且仅显式点击执行；原创作页完整配置继续复用。真实GPU超分、人工、系统DPI、安装包及大网压力未验，之前UI-08人工待验状态不变。增量业务19/(19+200)=8.68%、测试9/(9+155)=5.49%；低于参考范围，不满足历史70%阈值，未凑注释。串行完整回归结果、实际截图、修复前失败及逐文件审计见 [本轮记录](node-network-preview-implementation.md)。

## 工程内直接保存媒体（2026-11-12）

画布本地图片/H3/Anima、独立图片/视频超分直接指定工程分类目录；同目录已落盘文件原址登记，外部来源仍复制。保留创作页图库规则和旧数据，补输出文件独立标识以避免同秒短任务号覆盖。

最终静态构建指纹 `83053969a96c00a3b6d8852c4fe2f2fbb80bff4611870be773a4037a0a0c7921`，1112输入。生成/引用专项23/23、超分/创作专项24/24、原画布149/149；Electron串行。七次生成恰好七个工程PNG，图库无副本；视频超分存video，创作页仍存图库。三类真实文件I/O、同路径复用、跨工程复制、链接目录拒绝、两端空列表契约与原工程格式通过；纯算法219项、参数338项通过。

类型、lint（0错误37既有警告）、最终静态构建通过。重新运行 `pnpm check` 退出1，类型和Electron模块通过后停在既有未引用词条 auth.verifySuccess、canvas.reference、canvas.styleTransfer；后续未自动全部执行。输出路径、双语键、冒烟规则单独通过。Meta单跑仍因未改的MetaFieldRow.tsx注释检测退出1，真实语料golden baseline缺失，不称全仓检查通过。

自动事件＋HTTP固定媒体/远端返回替身，生产IPC、SQLite与工程磁盘写入真实执行；真实GPU推理、人工、系统DPI、安装包和长期压力未验。UI-08等人工待验不变。旧重复文件未清理，外部原件默认保留，服务自身缓存不在范围，正常视频/音频生成仍未接通。业务增量32.29%、测试11.48%，偏离参考范围的原因与修复前失败日志见 [完整记录](project-output-implementation.md)。

## SeedVR2 超分、卡片加载与 H3 侧栏留白（2026-11-12）

复用原画布开关、创作表单、共享队列、模型匹配、生成 IPC、PNG Meta、视频保存和受管导入。图片后处理默认关闭、SeedVR2 7B ×2；原图落盘后才提交第二次请求。超分节点只接一张图片或一个视频，只有配置不显示提示词。加载反馈移入目标卡片；H3 设置两侧留白，窄窗口和浅色也检查。新增超分使靠近底部的比例浮层裁切，已修正共用浮层边界，修复前失败日志保留。

最终静态构建通过：1111 输入，指纹 `c2a6830c6bf66045277c94824fde4e4fe85c3e4785ad05f429ac243b98eb4518`。专项22/22、连线/比例27/27、原画布149/149、生成及资源引用22/22、原创建编辑62/62、SQLite磁盘往返4/4均通过；Electron串行。纯工作流/原子创建/单输入219项、两端参数338项及工程格式检查通过。原创建编辑专项在边界修复前运行，共用浮层修复仅影响画布，未改该创作组件。

类型通过，lint为0错误37既有警告。重新实际运行完整 `pnpm check`，退出1，停在既有词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`；后续路径、目录、语言、冒烟规则、脚本引用、i18n与双语键已单独运行通过。单独Meta检查退出1，未修改的`MetaFieldRow.tsx`中文JSX注释被当作字段文案，真实语料golden baseline缺失而跳过，不能声称Meta检查通过。

**证据边界：**自动Electron/DOM事件运行正式静态页面；生产IPC、SQLite和隔离目录文件读写真实执行。模型清单、任务结果与/free响应来自本机HTTP固定媒体夹具，图片普通像素缩放不等于AI超分，固定视频回包不等于实际视频推理。真实SeedVR2/H3推理、画质、长视频性能、显存、安全取消边界的服务端实测、手动操作和系统缩放仍待验。此前UI-08等人工待验不变。正常画布视频生成仍禁用。

增量业务注释 **28/(28+439)=6.00%**、测试 **10/(10+203)=4.69%**；以任务开始快照统计，必要说明已逐项复核，低于20%–30%参考且不满足历史70%阈值，未凑数。新增普通函数≤30有效行；原CreatePage生成处理54行只增加参数透传，保留既有范围。`/free`仅表示请求被接收，不宣称显存已经完全释放或不会OOM。

[实施、复用与真实截图](seedvr2-upscale-implementation.md) · [日志和截图](runtime/seedvr2-upscale-2026-11-12/) · [逐文件增量审计](seedvr2-upscale-comment-audit.json)

## MiniMax H3 多参考文字改图与按钮反馈（2026-11-12）

类型、lint（0错误37既有警告）、最终静态构建通过。H3 专项 15/15、Anima/蒙版/边缘 62/62、原画布 149/149，Electron 串行；工作流与隔离纯检查179项、两端参数契约314项及工程格式检查通过。截图来自正式页面，自动事件与HTTP固定图片回包不代表真实H3推理；人工与真实模型联调仍待验。`pnpm check`重跑仍因 auth.verifySuccess、canvas.reference、canvas.styleTransfer 三项既有未引用词条退出1。业务增量14.29%、测试8.13%，偏离参考值原因、构建内存失败与测试修正均见 [完整记录](minimax-image-edit-implementation.md)。

## 帧率横条与单下边框输入（2026-11-12）

正式静态Electron视频专项31/31、原画布149/149，串行退出0；新五档预设、一行展示、黑底透明内层、自定义单下边框、整数错误、真实指针改选及失焦确认、时长取消、保存重开和两节点隔离通过。类型、lint（0错误37既有警告）、最终受影响组件lint及Next构建通过；160种模板尺寸、292项两端参数契约和双语键通过。统一check仍因三个既有未引用词条退出1。业务注释21.74%、测试22.58%；自动事件不替代人工或真实模型验收。[记录与截图](fps-strip-implementation.md)。

## 面积滑块与横向比例条（2026-11-12）

类型、lint（0错误37既有警告）、Next静态构建通过；Electron视频配置27/27、图片/视频拖线比例27/27、原画布149/149，串行退出0。原生滑块Home/End/方向键、0.1步进、实时宽高、黑底无灰框、横向八项、两主题及960×720边界、撤销/保存/隔离通过；真实模型与人工手感未验。统一check仍因三个既有未引用词条退出1。业务增量25.00%、测试12.50%，测试低于参考范围，未凑数。[实施、截图、证据与限制](minimax-slider-implementation.md)。

## MiniMax比例与百万像素（2026-11-12）

静态Electron专项24/24、原画布149/149、真实SQLite18/18，均串行退出0。两端参数契约292项、两个模板×八比例×十档160种宽高映射、原H3/图片28,740案例及原工程格式回归通过；类型、lint（0错误37既有警告）、Next静态构建、双语键、中英文基线与冒烟规则通过。`pnpm check`重跑退出1，仍为auth.verifySuccess、canvas.reference、canvas.styleTransfer三个既有未引用词条，后续串联检查未自动全部完成。

深浅主题及960×720真实页面截图、撤销重做、SQLite保存重开和A/B隔离均属自动事件验证；纯工作流测试仅翻译函数替身，模板与算法真实。未调用模型，视频生成按钮继续禁用；人工、系统DPI、真实模型服务待验。业务增量16.33%、测试10.37%，低于20%–30%参考范围，原因和行号见[独立记录](minimax-megapixels-implementation.md)。本轮失败定位及最终日志均保留，历史人工待验不改写。

## 最新：图片铺满、边缘缩放与手掌恢复（2026-11-11）

图片卡片四边及右下角复用原图引擎缩放，铺满显示，原媒体不变；撤销、取消、SQLite保存重开接通。工具箱分类悬停不加矩形轮廓，键盘焦点保留。正式静态Electron专项6/6、原画布149/149；四边实拖与非100%画布缩放通过，人工手感与系统缩放待验。

[完整实施、实际截图、迁移结果与检查失败项](../../design/sqlite-migration-2026-11-11.md)。当前注释要求已按用户更新为20%–30%参考；下面70%记录保留历史含义。

## 图片拖线创建与八种比例（2026-11-11）

正式静态Electron专项27/27、原画布149/149、视频配置17/17，串行且退出0。图片输出自动鼠标拉到空白后使用原添加菜单创建图片/视频节点，原子撤销/重做、Escape、外部点击、方向焦点、八项实际可见及保存重开通过。参数267项、纯算法94项、工程格式、类型、lint（0错误37警告）、Next构建、双语键和中英文基线、冒烟规则通过。统一check退出1，仍为auth.verifySuccess、canvas.reference、canvas.styleTransfer三个既有未引用词条，不称全仓全通过。

最终指纹6976ab2d6e7bf6c531ae6588914abf640b98910ebc66f69d24d624ebb279066c。专项使用参数初态夹具、Electron自动鼠标、DOM菜单和真实隔离JSON读写；人工操作、触屏、系统DPI、真实模型服务与长期压力未验。图片目标采用原图片编辑流，视频只建立配置节点、不自动生成。业务增量71.84%、测试70.44%，早期工作区修改与人工待验不改写。[独立实施、失败修复与证据](connection-ratio-implementation.md)。


## 视频输出参数与创建模式标签（2026-11-11）

正式静态Electron：视频输出/原侧栏17/17、原画布149/149、创建标签10/10，串行且均退出0。参数两端契约241项、纯算法70项、原工程格式、类型、lint（0错误37警告）、Next构建、语言键与中英文基线、冒烟规则通过。统一check重跑退出1，仍停在auth.verifySuccess、canvas.reference、canvas.styleTransfer未引用词条，后续串联项没有自动跑完；独立语言与规则结果分别归档，不称全仓全通过。

最终指纹608c1c1dfa112ed5c57991c5538d502ea0e63c3fc28416060ef4661bcaa8a4c7。视频参数17项是DOM/自动键盘和真实临时JSON读写；标签包含Chromium真实自动指针hover，人工操作未验。首次主题媒体查询与宿主外观不一致的截图没有冒充深色证据，修正测试主题入口后最终两主题截图已逐张查看。帧数已由用户明确确认是每秒帧数FPS，现有实现与该定义一致；不把配置接入宣称视频推理通过。业务增量70.50%、测试70.08%，统计基线和证据边界见[实施记录](video-output-implementation.md)及[runtime/video-output-2026-11-11](runtime/video-output-2026-11-11/)。原人工待验和视频执行未接通状态不变。

## 最新追加：请求、原组件配置、引用与卡片（2026-11-11）

本次为正式 `app://` 页面、生产 preload 和新鲜静态产物上的自动验收；人工项目仍待验。构建日志、各次运行日志、增量审计JSON与实际截图统一归档在 [runtime/generation-quality-2026-11-11](runtime/generation-quality-2026-11-11/)。最终构建指纹 `b21b4a1a8c3f525a43f69904385da882148790648e2e65afb5f810b9e8c2b1bc`，1076输入文件；最后仅调整测试截图夹具坐标与文档，产品源码未再改。

### 实际自动结果

| 检查 | 结果 | 证据与边界 |
| --- | --- | --- |
| `pnpm --filter @illusion-realm/next build` | 通过 | `ir-canvas-delivery-build.log`；静态导出，不是Windows安装包验收 |
| `pnpm check` | 退出1 | 类型与Electron模块/IPC通过，随后门禁因3个未引用词条中止；后续串联项当时未执行 |
| `pnpm lint` | 0错误、37警告 | `ir-canvas-delivery-lint.log`；不称零警告 |
| 原画布完整回归 | 149/149、退出0 | `ir-canvas-delivery-all.log` |
| 图片生成与名称专项 | 21/21、退出0 | `ir-canvas-delivery-generation-final.log`；10次本地HTTP夹具、1次远端返回夹具，真实推理=false、人工=false |
| 视频原组件设置 | 8/8、退出0 | `ir-canvas-delivery-video.log`；主模型/辅助槽回显、A/B隔离、重置、主题/窄窗、JSON重开 |
| 分类和版本模型卡片 | 17/17、退出0 | `ir-card-height-smoke.log`；两个实际调用方、固定文字区与footer几何、选择与封面回归 |
| 图片管理 | 31/31、退出0 | `ir-canvas-delivery-history.log`；生产文件移动、取消、冲突、排序与改名重开 |
| 创建页文字改图 | 62/62、退出0 | `ir-canvas-delivery-edit.log`；旧创建页布局与编辑模式回归 |
| 首页与原弹窗 | 20/20、退出0 | `ir-home-hover-delivery-final.log`；两主题、三入口真实自动指针采样及原生dialog路径 |
| 图片参数纯检查 | 191项通过 | `ir-canvas-delivery-parameters.log` |
| 生成与改名纯检查 | 61项通过 | `ir-canvas-delivery-generation-pure.log`；不是模型推理 |
| 工程格式与公共引用 | 通过 | `ir-canvas-delivery-project.log`、`ir-canvas-delivery-references.log` |

Electron专项严格串行，原用户应用进程没有终止。自动鼠标/键盘、DOM事件和真实文件读写分开描述：文件改名专项确实通过原图库服务移动PNG、核对旧路径消失及新文件字节相同；生成返回仍为夹具，不能借真实PNG和真实文件保存宣称真实模型效果通过。

### 检查失败与独立补跑

统一check当前门禁失败为 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 未引用，没有为通过门禁新增虚假调用。中止后独立补跑输出路径、文件计数、语言决议、冒烟规则、脚本引用、初始语言参数、中文基线、英文基线、双语键，均退出0；日志前缀 `ir-canvas-delivery-check-`。

独立 `pnpm check:meta` 退出1：`MetaFieldRow.tsx` 的“字段标识已与文案分离（无中文字面量）”断言失败，该文件本轮未修改。真实语料不存在而跳过golden baseline也如实保留；没有标成实际语料通过。完整检查尚未全部通过。

先前整页创建回归曾有4项失败：导航展开/收起间距、宽屏嵌套模型约200px的4:5比例、预览缩放。它们不在本轮修改文件内，但未完成完整任务前构建A/B，不绝对归因于既有问题，也不将本次62项编辑专项或17项资源专项冒充整页全绿。旧日志 `runtime/generation-quality-2026-11-11/ir-canvas-create-smoke.log` 保留供复查。

命名专项首轮真实暴露带点主体被旧改名接口截短；已修调用适配，最终21项全部重跑。首轮 `ir-canvas-delivery-generation.log` 和 `filename-failure-before-fix.png` 保留。之前因同名section误点及公告遮挡造成的测试前置问题，分别修精确选择器、经真实关闭公告解决，没有删除DOM或更改预期来凑通过。

### 截图与未验证

- 卡片：`create-extension-versions.png`、`create-extension-selected.png`，真实分类/版本页，隔离模型名与封面夹具；当前默认字号已实测，另外两档只有规则接入，未实体操作验收。
- 名称：`76-video-filename-reference.png`、`77-image-filename-reference.png`；方形20×20引用图、文件主体显示与重开，底层仍保留Picture编号。
- 视频设置：`73-video-sidebar-dark.png`、`74-video-sidebar-light-narrow.png`、`75-video-minimax-series.png`；参数夹具不是实际权重加载。
- 画质与调度器：`66-quality-2k-dark.png`到`69-schedulers-bottom-dark.png`；只保留可读的菜单方向证据，不将被裁的旧顶部截图称为完整菜单。
- 首页：`home-*-hover-*.png`，计算样式和自动指针采样通过；用户GPU原闪白前后对照未实测。
- 文件管理：本次`history-move-light.png`等是浅色截图。旧文件名含dark的窄窗画面实际为浅色，不作为深色证据。

真实ComfyUI/Euzhi推理、模型权重、实体系统选择框/资源管理器拖入、完整键盘/IME/读屏、Windows系统缩放、扬声器、用户GPU与长期大工程性能均保持未验证；UI-08人工项不改写为通过。文件改名与用户JSON没有跨文件原子事务，进程中断、磁盘满、ACL和旁车失败未注入；跨工程外部引用不扫描重定向。视频生成未接，不扩展视频导出、混音或多轨业务。

### 本次各追加阶段增量注释

| 阶段 | 业务 C / B / 有效率 | 测试 C / B / 有效率 |
| --- | --- | --- |
| 图片请求与画质 | 879 / 362 / 70.83% | 797 / 341 / 70.04% |
| 视频设置与首页 | 158 / 67 / 70.22% | 236 / 101 / 70.03% |
| 图片浮动条 | 42 / 18 / 70.00% | 15 / 4 / 78.95% |
| 文件主体与引用 | 242 / 102 / 70.35% | 225 / 96 / 70.09% |
| 公共卡片高度 | 19 / 6 / 76.00% | 22 / 7 / 75.86% |

按每个追加请求开始前快照统计新增替换物理行，新增文件全文计入；混合行只计代码、注释定界符和重复说明不计。已人工核对职责、事务、错误和证据边界，逐文件hash与区间见归档审计JSON。视频阶段picker早期快照依据已知补丁重建，其余为当时实际字节快照；不冒称全是原始快照，不以HEAD把其他工作区修改计入。不相加为全仓注释率，历史未达标记录不变。示例：卡片说明固定字号档和缺少说明仍占位的原因；改名说明为何历史和剪贴板也必须更新路径。名称阶段新增普通逻辑函数审查无超过30有效行的问题。

## 最新：原视频合成器直接嵌入（2026-11-10）

原组件功能接入与专项自动验证完成，人工项待验，注释门槛未通过。正式静态Electron **21/21**；原画布回归 **146/146**，串行执行。真实本地成片经生产协议解码为 **854×480 / 2.020136秒**，画布出口创建了视频节点和来源连线。

类型、lint（0错误、37既有警告）、Next静态构建、55项合成契约、原工程格式、双语键与i18n检查通过。`pnpm check`实际退出1，既有阻塞为 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`，不是全部检查通过。最终产物指纹 `eac9d2053074a6eddb5b56bf5bb51964446b57fddf2c7199908177c3f39569d0`。

DOM/CDP与Electron输入属于自动验证；另存为返回夹具与人工系统框明确区分。实际媒体、编码和磁盘写入使用生产能力。原工具保持固定深色；浅色宿主、960×720窗口已自动检查，不声称完成原组件浅色重绘。旧人工待验和未覆盖性能项继续保留。

本轮有效增量注释率：业务19.05%、测试20.18%，均未达70%，不标记完整验收通过。[实施、检查与边界](original-video-composition-implementation.md) · [真实截图与日志](runtime/original-video-composition-2026-11-10/)。以下历史轮次中的“静态合成器/成片导出未接通”以本节为当前结论，不回写旧证据。

## 节点文生图侧栏与分层工作流（2026-11-10）

**自动验证完成，人工项待验；完整统一检查并未全部通过。** 正式静态画布 **140/140**、创建页资源选择专项 **15/15**，两项串行且均退出0。参数两端契约与序列化专项 **175例通过**。本轮数量不累加之前133/134项运行结果。

新增侧栏使用原创建页主模型、LoRA、CLIP/VAE、正反提示词、尺寸与采样组件。原三层级联菜单与倍数选择复用现有组件；参数按节点及模板保存，不使用创建页全局草稿。自动验证正负词回写、尺寸双向同步、自定义标签、模板隔离、复制后嵌套值隔离、真实写盘、完整页面刷新、Delete隔离、内层Escape及关闭焦点返回；深浅主题、960×720窗口的可用主区与自身滚动也已覆盖。

类型、lint（0错误、37既有警告）、双语键、中文/英文i18n基线和Next静态构建通过。指纹：`4aa5fa30c243119e5febcc3ae2675bca830e25413122cb9a73da17871dc3f9df`。

`pnpm check`实际退出1，停在三个既有未引用词条：auth.verifySuccess、common.localeNameSelf、create.generationTasks.active；此前类型和Electron模块/IPC检查通过，后续串联检查未执行。完整工程格式脚本退出1，原checkRoundTrip报canvas-invalid-media；不将专项通过扩大为全部格式通过。修复前lint依赖错误日志也保留，最终已经通过。

业务增量有效注释 **70.54%（C558/B233）**，测试 **70.29%（C440/B186）**，工作区任务前快照为基线，人工排除两类各6行重复说明。详见 [独立实施记录](workflow-sidebar-implementation.md)及[审计/日志](runtime/workflow-sidebar-2026-11-10/)。

真实Electron截图：[深色](runtime/workflow-sidebar-2026-11-10/61-sidebar-anima-dark.png)、[浅色](runtime/workflow-sidebar-2026-11-10/62-sidebar-light.png)、[窄窗](runtime/workflow-sidebar-2026-11-10/63-sidebar-narrow.png)、[三级菜单](runtime/workflow-sidebar-2026-11-10/64-workflow-anima-series-anima.png)、[倍数条](runtime/workflow-sidebar-2026-11-10/60-batch-strip.png)、[刷新恢复](runtime/workflow-sidebar-2026-11-10/65-sidebar-restored.png)。

证据边界：DOM事件/Electron自动输入为自动验证；隔离JSON与媒体解码为真实磁盘证据；模型索引、系统框返回及外部拖放含测试夹具。人工操作、系统缩放、真实权重加载/推理、双画布同时挂载与长时性能未验证，旧人工待验项不改写。真实生成与结果回填继续禁用。

## 最新：黑白主题、提示词转换与 LoRA（2026-11-09）

正式静态 Electron **140/140，退出 0；自动验证完成，人工项待验**。最终指纹 `efa833e70c83dcc636b10b541581dd2ead842796e0fa978033761c422154ce96`。所有截图由这份产物的正式 app://app/canvas 入口生成，见 [证据目录](runtime/workflow-lora-theme-2026-11-09/)。

本轮通过：深浅工作流菜单、配置与嵌套资源页；实际标题 RGB；600px 配置布局；复用提示词工具条复制；ANIMA/SDXL/MiniMax 选择过滤、权重提交、嵌套 Escape、默认项移除后不复活、工作流与副本隔离；真实 JSON 保存、完整刷新、工程包往返。原节点、连接、历史、拖动、取消、媒体播放和主题/窄窗场景继续回归。

`pnpm typecheck`、`pnpm lint`（0 错误、37 项既有警告）、Next 静态构建、`pnpm check:locale-keys`、两项 i18n 基线均退出 0。`pnpm check` 实际重跑退出 1，仍停在三个既有未引用词条 auth.verifySuccess、common.localeNameSelf、create.generationTasks.active；类型和 Electron 模块/IPC 检查通过，后续串联检查未执行。完整工程格式脚本仍退出 1：checkRoundTrip 的 canvas-invalid-media；LoRA 两端校验和直接执行生产序列化的新增回归已在其前通过。**不标记全部检查通过。**

LoRA 使用测试模型索引，不是实际推理加载。菜单与权重为 DOM 自动事件，部分操作为 Electron 指针/按键注入；原系统框返回为夹具、文件拖入为合成事件。真实媒体解码与磁盘保存属于实际本地服务证据，仍不能代替人工系统拖入、真实模型加载、翻译服务、Windows 缩放或扬声器试听。以往人工待验保持原状态。

业务 C342/B143 = **70.52%**；仓库测试 C76/B32 = **70.37%**。统计任务开始快照的新增/替换行，并排除重复说明；基线哈希、逐文件统计和人工排除项见 [comment-audit.json](runtime/workflow-lora-theme-2026-11-09/comment-audit.json)。临时扩展驱动的局限、调试失败及修复说明见 [实施记录](workflow-lora-theme-implementation.md)，没有累加失败运行的部分通过数。

真实截图：[深色工作流](runtime/workflow-lora-theme-2026-11-09/workflow-lora-01-neutral-menu-dark.png)、[深色 LoRA 配置](runtime/workflow-lora-theme-2026-11-09/workflow-lora-02-anima-settings.png)、[浅色配置](runtime/workflow-lora-theme-2026-11-09/workflow-lora-05-anima-settings-light.png)、[复用资源选择页](runtime/workflow-lora-theme-2026-11-09/workflow-lora-06-shared-picker-light.png)、[原提示词工具条](runtime/workflow-lora-theme-2026-11-09/workflow-lora-07-prompt-toolbar-light.png)、[窄窗](runtime/workflow-lora-theme-2026-11-09/workflow-lora-08-settings-narrow-light.png)。

## 最新：默认横卡与工作流选择（2026-11-09）

正式静态Electron串行回归 **126/126，退出0**。新增8项覆盖图片/视频默认清单、选择隔离、文字改图与禁用生成、撤销、Escape/焦点、保存和重开；原118项继续回归真实媒体、主题/窄窗、工程包等。仅自动验收，旧人工待验项保留。

类型、lint（0错误/37既有警告）、双语键、i18n基线、Next构建通过；指纹`a86cdf54ceffdb1817a87f66b5f3860e100128b0b94b09251f0e4ab1b684debf`。工作流两端契约专项通过；完整格式脚本退出1，checkRoundTrip报canvas-invalid-media，任务前脚本在当前工作区同样失败。本轮未运行pnpm check，不能标记全检查通过。

横卡业务增量注释率75%，测试未改不适用；工作流业务108/(108+45)=70.59%，测试36/(36+15)=70.59%。基线与人工复核说明分别见[横卡实施记录](media-card-default-implementation.md)、[工作流实施记录](workflow-selection-implementation.md)。[本轮日志/截图/审计](runtime/workflow-selection-2026-11-09/)包含失败对照。

工作流扩展使用临时诊断驱动、DOM事件及Electron自动输入；系统对话框返回为夹具，真实媒体由磁盘解码，保存用真实临时JSON。没有人工操作、系统缩放或真实生成证明；生成保持禁用。未进行单独浅色工作流菜单全状态、双画布同时挂载、旧视频/GIF/漫画全链或高负载验收。

## 最新：节点微交互修复（2026-11-06）

正式静态 Electron **115/115 通过，自动验证完成、人工项待验**。复用节点、参数与 Handle；没有改工程格式、位置事务或媒体生命周期。详见 [实施记录](node-interaction-implementation.md)。

| 检查 | 本轮实际结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0；`logs/canvas-interactions-typecheck.log` |
| `pnpm lint` | 退出 0，0 错误、33 个既有警告；`logs/canvas-interactions-lint.log` |
| Next 静态构建 | 退出 0；`logs/canvas-interactions-build.log` |
| 正式 Electron 串行回归 | 退出 0，115/115；`logs/canvas-interactions-smoke-final.log` |
| `pnpm check:smoke`、`git diff --check` | 退出 0；换行格式提示不是断言失败 |
| `pnpm check` | 退出 1；类型、模块校验后停于既有三个词条未引用；`logs/canvas-interactions-check.log` |

本轮新增自动覆盖：展开箭头的真实顺时针 90° 矩阵、键盘 Enter、原地长按不弹参数、随后短按恢复、右键不弹参数、位移拖动不弹参数、端口屏幕位移上限、接收连接的内容板倾斜且 Handle 固定、Escape/移开复位、真实视频细选框、减少动态时实际停止跟随。原导入、解码、播放互斥、缺图/错误恢复、剪贴板、尺寸、工程往返及窄窗口等继续通过。

最终构建指纹 `45f8464ea33f920434a80a9881a9e1f92cda57eaaeb324e6632ec63e523d855a`，927 个输入；冒烟实际核对一致。115/115 汇总已追加 `logs/smoke-runs.log`。原始截图目录 `C:/Users/18305/AppData/Local/Temp/ir-canvas-zmKExq`；[展开箭头](runtime/node-arrow-expanded.png)、[长按收起](runtime/node-press-collapsed.png)、[连线倾斜](runtime/node-port-connection-tilt.png)、[真实视频浅色](runtime/node-interaction-light.png)、[深色](runtime/node-interaction-dark.png)。媒体截图顶部错误提示来自刻意导入坏工程的前置回归，原图与可操作状态正确保留，不代表本轮导入失败未处理。

键鼠为 Electron 输入注入，连接起点包含 DOM 语义 click，减少动态为 CDP 媒体特征模拟；未新增人工桌面操作证明。不将其写成实体鼠标拖线、系统减少动态设置、触控板、系统缩放或大工程流畅度通过。此前人工待验项原样保留；这轮没有再次运行 dev 或独立 A/B 双宿主。

首次回归发现 Enter 被图库处理后按钮失焦，已共用键盘激活助手修复；下一次发现新增测试显式折叠未恢复，导致旧模式测试读不到表单，已通过真实箭头恢复测试前提，没有改产品预期。失败日志保留，最终 115 项不累计失败尝试的通过数。

增量有效注释：业务 **333/(333+140)=70.40%**，测试 **197/(197+83)=70.36%**；按本轮开始前无画布修改的 HEAD 基线统计，剔除重复概述候选，见 [逐文件审计](node-interaction-comment-audit.json)。既有全仓性能修改不计入本轮。`pnpm check` 仍停于 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；其后未执行的子检查不宣称通过。

## 上一轮：名称显示与拖动更新优化（2026-11-06）

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



## 导演台影响回归（2026-11-07）

导演台复用原画布节点、浮层、持久化与工程包。最终静态构建指纹 `1b103b719e1b6ef19017c31d87be254638425a6f425f370583976d652ad30cf8`。

- 正式导演台25/25；DPR=1.25自动渲染25/25；均与原画布串行运行。
- 原无限画布115/115，包括本地媒体解码/互斥、剪贴板、卡片尺寸、失败保护和工程包往返。
- 真实用户、原生系统操作与高负载性能没有由这些自动事件替代。旧人工待验项保持原状态。
- 完整范围、截图、既有 pnpm check 阻塞和未达标注释率见 [导演台验证](../director/verification.md)。


## 工程库、挂起与所有节点尺寸（2026-11-12）

状态：本轮已实现并完成以下自动验证，人工项待验。完整 `pnpm check` 仍失败，不标为全仓检查通过。详细复用、目录、关系九宫格和恢复边界见 [实施记录](project-library-suspend-resize-implementation.md)。

静态构建指纹：`7856e41aabc2b8ed87c650867e842c849f8605f2f8f3158ce93d25d9f1e36302`（1092个输入）。正式 Electron 冒烟均先通过构建新鲜度检查，再串行运行；最终只清理各测试拥有的窗口，没有终止用户应用。

| 命令（仓库根） | 结果 | 证明范围 |
| --- | --- | --- |
| `pnpm typecheck` | 通过，退出0 | 渲染层与主进程类型；最终 `pnpm check` 中亦通过 |
| `pnpm lint` | 通过，0错误/37项已有警告 | 未将警告写为清零 |
| `pnpm --filter @illusion-realm/next build` | 通过，退出0 | 静态页面，不是安装器构建 |
| `pnpm --filter @illusion-realm/electron check` | 通过，119文件、0处nocheck | 主进程类型纳管 |
| `CANVAS_LIBRARY_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | **7/7，退出0** | 七类节点、隐藏缩放线、右键尺寸锁、固定全部/解除固定、真实默认尺寸、A/B隔离、挂起、关闭重开、隐藏Delete反证、分类、多选、搜索、软删除、深浅主题及960×720窗口 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | **149/149，退出0** | 原节点、连接、拖动、表单复用、媒体导入/解码、保存失败保护、复制剪切、工程包往返等 |
| `CANVAS_GENERATION_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | **22/22，退出0** | 自动事件 + 11笔本机HTTP请求 + 1笔远端返回夹具；含挂起时任务完成、真实PNG回填与SQLite保存、切回、取消和失败保护；不是实际推理 |
| `CANVAS_RESIZE_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | **6/6，退出0** | 真PNG完全填充、四边/角、五种光标、撤销重做、Escape、缩放坐标、失焦手掌恢复、SQLite重开、浅色窄窗及工具箱悬停 |
| `pnpm exec electron scripts/verify-canvas-library.js` | **6/6，退出0** | 实际SQLite、目录归属、软删除不复活、旧草稿复制迁移及失败恢复、外部文件保留、UUID与shared规则对照 |
| `pnpm exec electron scripts/verify-sqlite.js` | **6/6，退出0** | 原SQLite契约，版本3/46表 |
| `pnpm exec electron scripts/verify-sqlite-migration.js` | **4/4，退出0** | 原001/002内容与文档恢复继续有效 |
| `pnpm exec electron scripts/verify-sqlite-asar.js` | **3/3，退出0** | 实际asar内SQL/Worker、独立工程创建及重读；不是安装器实测 |
| `node scripts/verify-canvas-project.js` | 通过，退出0 | 原工程格式、归档及300节点移动反证 |
| i18n / 英文基线 / 语言键 | 通过 | 硬编码21≤基线66；英文未翻译772≤现行额度；20命名空间键一致 |
| 冒烟约定、脚本引用检查 | 通过 | 未增退出码逃逸或失效脚本引用 |
| `pnpm check` | **失败，退出1** | 通道核对已通过：94个双端一致；当前停在既有三个未引用词条：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` |
| `pnpm check:meta`（单独运行） | **失败，退出1** | 原 `MetaFieldRow.tsx` 的中文JSX注释被静态扫描误报为字段中文字面量；本轮未改该文件。真实语料缺失导致golden baseline另行SKIP，不能称通过 |

PowerShell 环境开关示例：`$env:CANVAS_LIBRARY_SMOKE='1'`，再运行表内 Electron 命令；不同专项使用独立进程，执行前清除其他专项环境变量。生成夹具使用仓库根的资源路径，因此应采用 `pnpm exec electron`，不是在 electron 包目录下执行。

本轮发现并修复：

- 直接SQL保存遇到IPC可选字段 `undefined`，反读与原JSON省略语义不同；在工程边界归一化后再事务写入。
- 所有节点接上透明缩放热区后，端口周围20px区域被边缘吞掉；端口层级优先后原跟随、连线和各边缩放同时回归。缩放测试选择边缘四分之一处，避开连接端口区域，不放宽尺寸预期。
- 远端图片生成仍用旧用户根导致新工程owner找不到；默认根改为与导入服务相同的 `Infinite Canvas`，未放宽文件归属验证。
- 原测试直读JSON和直接等编辑器不再对应正式工程库；现从真实SQLite独立读回，经列表打开工程，失败注入也落在实际工程保存请求上。

中途失败保留在 `logs/smoke-infinite-canvas-*`：包含一次100000ms看门狗超时（没有形成任何成功断言，按超时失败记录），初始化刷新时序、历史清选择后的旧测试控件定位、以及修复前的端口/Euzhi目录回归。没有把失败尝试混入最终通过数或改成通过；最终证据使用上表明确通过的运行。

证据分类：

- **自动事件**：DOM click/contextmenu、Electron鼠标键盘、CDP文件输入；不等于人工点击或资源管理器拖放。图和媒体结果均从生产文件/数据库反读，不靠UI成功文案自证。
- **夹具**：游客账户、系统框返回路径、外部生成服务。生成测试的PNG是真文件，像素来自固定夹具；没有请求收费模型、没有验证模型质量。
- **人工**：本轮无新增人工验收。完整实体键盘、鼠标手感、Windows系统缩放、资源管理器拖入、扬声器试听继续未验证；之前的人工待验项不改写。
- **性能**：未做巨量项目与多挂起实例压力测试。保留DOM和解码实例会增加内存；没有用算法计数或软件渲染截图宣称真实FPS提升。

真实用户数据没有在本轮CLI测试中搬迁。产品首次打开工程库自动复制迁入旧画布；迁移仅在隔离临时目录实际验证，原用户SQL与原素材保留。分类是逻辑关系，删除是保留磁盘文件的软删除。

截图和最终日志：[本轮证据目录](runtime/canvas-library-2026-11-12/)。截图来自正式运行窗口，属于自动验证证据；没有录制人工操作视频。

![无蓝色缩放框与固定全部开关](runtime/canvas-library-2026-11-12/92-library-fixed-all.png)

![浅色工程库与挂起名单](runtime/canvas-library-2026-11-12/95-library-light.png)

![图片自由缩放后的真实内容](runtime/canvas-library-2026-11-12/81-image-resized.png)

注释按任务开始快照及明确的本轮适配行统计，新增文件全文计入；旧工作区修改、旧大段注释不混入。JS/TS/TSX/CSS/SQL纯有效注释候选经逐项核对职责、异常、迁移及清理边界；类型JSDoc、单独定界符不计，混合行只计代码。业务/测试低于20%–30%参考范围：主要增量是显式组件装配、字段映射及直接断言，必要边界说明已复核，不补重复文字凑比例。准确C/B与逐文件范围见 [增量审计](project-library-comment-audit.json)。

最终统计：业务 **40/(40+841)=4.54%**，测试 **14/(14+441)=3.08%**。部分前轮未提交冒烟缺少完整任务开始快照，仅列出已明确核对的本轮适配行；这些文件的测试数字是可审计子集，不能据此宣称完整增量覆盖。审计 JSON 保留具体行号与范围限制。普通业务函数和四个新增验证文件的最终长度扫描均无超过30行项；源码未再修改，未重复构建或扩大回归。

## 新建应用失败修复（2026-11-12）

旧草稿源目录缺失的反证用例修复前退出1；修复后工程库存储8/8、正式界面8/8通过（自动事件与隔离旧草稿夹具），覆盖应用关闭表单、进入工程与真实SQL重读。类型、lint通过；完整check仍停在既有三个未引用词条。仅主进程及测试修改，静态指纹核对通过，无需重建Next。业务注释25%，测试5.48%；人工项目保持待验。[完整结果、失败尝试与截图](canvas-create-fix-implementation.md)。

## 删除画布释放资源（2026-11-12）

最新行为替代此前软删除约定：确认后实际清理工程与自有素材目录；旧软删可从“清理已删画布资源”继续清理；共享引用、归属和路径安全预检仍有效。目录表保留少量删除身份，不重建旧工程。

最终存储13/13、正式工程库9/9、原画布149/149、asar3/3退出0；类型、lint、Next构建与语言检查通过。完整check退出1，仍停在既有三未引用词条。实际文件与数据库验证独立于UI成功文案，自动事件/软删状态与EBUSY故障夹具/未验证人工分开报告。业务增量注释5.62%、测试3.07%，普通函数≤30行。详见 [实施、完整检查与真实截图](canvas-delete-implementation.md)。

## 新建连点与画布内删除失败（2026-11-12）

本轮最终：真实SQLite/目录存储 **17/17**，正式工程库 **10/10**，原画布 **149/149**，串行Electron均退出0。覆盖十次同轮提交仅一笔创建、删除十连点仅一笔请求、同名重建、旧登记失败工程找回、失败回收与丢失回执保护；旧归属/跨工程引用保护继续有效。首次存储失败揭示小数mtime写入整数列，修复后重跑通过，失败日志保留。

类型、lint、Next静态构建、i18n及语言键通过，lint保留37项旧警告。重新运行完整 `pnpm check`，退出1，仍停在三个既有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`；未执行的后续步骤不称通过。指纹 `1e3526032d2915b890df9550d6430e1dcaf17e45b307e6a4882b003d8bc4ed51`（1093输入）。

自动DOM/Electron事件、登记/回执/列表失败夹具分别报告；真实用户工程仅只读检查，没有删除或迁移现场文件。人工连点、真实系统操作与大目录性能仍未验证，之前人工待验不变。增量业务注释12.28%、测试3.33%，未宣称注释比例全部达标；普通业务与新增测试函数≤30行。[详细实施与真实截图](canvas-library-retry-implementation.md) · [日志](runtime/canvas-retry-2026-11-12/) · [审计](canvas-library-retry-comment-audit.json)。


## 工程资源与预览UI（2026-11-13）

- 真实SQLite和临时文件：资源9/9、原工程库18/18、SQLite6/6、迁移4/4、asar3/3通过，Electron串行退出0。
- 正式静态页面自动事件：素材库4/4、预览20/20、对比15/15、原画布149/149、生成与挂起23/23、超分25/25通过。媒体真实解码和播放；生成服务使用HTTP返回夹具，不能称作真实模型验收。
- 类型、lint（0错误/37旧警告）、Next静态构建通过。完整check退出1，仍停于三个旧未引用词条；单独跑后续9项通过，Meta仍被MetaFieldRow.tsx旧注释误判阻塞，真实golden语料缺失。没有宣称全仓通过。
- 手放文件永不因无引用而回收；实际用户工程没有在本轮验证里迁移或清理。24小时通过主进程时间注入验证，不是实等一天。人工系统框、实体鼠标键盘、扬声器、断电与大规模性能仍待验，前轮人工待验项继续保留。
- 增量业务注释8.53%，测试可审计子集5.93%；低于20%–30%参考，不用废话凑数。基线和范围限制、失败尝试、性能及安全限制见独立记录。

[完整实施与验证命令](resource-management-preview-implementation.md) · [最终截图与日志](runtime/resource-management-preview-2026-11-13/) · [注释审计](resource-management-preview-comment-audit.json) · [函数审计](resource-management-preview-function-audit.json)

## MiniMax 音频与视频 LoRA（2026-11-13）

本轮共享真实创作音频表单和请求队列，画布参数独立入 SQLite，参考音频进入工程依赖索引；MiniMax LoRA 支持大小写不敏感、多层目录和同目录全部权重。

类型、lint（0错误/37旧警告）、Electron模块验证、Next静态构建通过。合同6/6、原音频合同6/6组、原工程格式通过；串行Electron：画布音频/LoRA18/18、创作页音频19/19、原画布149/149、原生成23/23。覆盖参考上传与连线、停止、失败恢复、批量两卡、真实播放推进、深浅主题/窄窗、SQLite重开与归档资源字节还原。生成服务、账号与权重内容使用夹具，不能称为真实模型推理验收。

重新运行完整check退出1，仍停在既有三个未引用词条；前轮Meta和人工待验保持原记录。中途反读白名单漏项已修复，失败与测试定位问题保留诊断，不计入最终通过数。业务增量注释12.76%、测试3.12%，必要边界复核后不凑比例；本轮普通函数≤30有效行。

[完整实施、命令和未验证项](canvas-audio-lora-implementation.md) · [最终证据](runtime/canvas-audio-lora-2026-11-13/) · [注释审计](canvas-audio-lora-comment-audit.json) · [函数审计](canvas-audio-lora-function-audit.json)

## 音频统一节点输入（2026-11-13追加）

音频接入原图片提示词面板、引用编辑器、批量浮层和 ↑，参数侧栏复用原音频表单的设置形态，不重复正文/载入/生成。空输入禁用，支持 Shift+Enter；节点状态独立，参数表单提交不能误发请求。

类型、lint（0错误/37旧警告）、Electron模块验证、最新Next静态构建通过；音频/LoRA合同6/6、原音频合同6/6组通过。串行Electron：新音频入口22/22、原创作音频19/19、原画布149/149、原生成23/23。实际SQLite/文件/归档/解码执行，生成回包和账号使用夹具；没有真实推理或人工验收。窄窗通过真实镜头平移完整查看输入及箭头，世界坐标布局保持原规则。

完整check仍退出1，停在原三未引用词条，后续未执行不算通过；Meta与此前人工待验保持原记录。业务增量注释28.07%、测试8.77%，未为参考比例凑数；普通函数≤30有效物理行。

[完整实施与实际命令](canvas-audio-inline-implementation.md) · [截图与日志](runtime/canvas-audio-inline-2026-11-13/) · [注释审计](canvas-audio-inline-comment-audit.json) · [函数审计](canvas-audio-inline-function-audit.json)

## 音频固定单份与紧凑参数（2026-11-13最新）

音频移除批量，旧count=6也只请求一次；参数侧栏直接复用模型与高级设置，秒数改用节点原浮层，正文缩为80px。类型、lint（0错误/37旧警告）、静态构建和两组音频合同通过；串行Electron专项27/27、原创作音频19/19、完整画布单独重跑149/149。自动事件与真实SQLite/文件/解码执行，生成服务回包使用夹具；人工及真实推理继续未验。

完整check仍退出1，原三个未引用词条阻塞未修复，前轮Meta及人工项保留。首轮专项的主动失焦测试误差、完整画布首次公告遮挡入口均保留失败记录，不计入最终通过。业务增量注释19.51%、测试9.76%，普通逻辑函数≤30有效物理行。

[实施与限制](canvas-audio-compact-implementation.md) · [截图与日志](runtime/canvas-audio-compact-2026-11-13/) · [注释审计](canvas-audio-compact-comment-audit.json) · [函数审计](canvas-audio-compact-function-audit.json)


## 节点输入面板真正共用（2026-11-14）

此前共享输入逻辑仍有图片/视频与音频的高度和排版差异。本轮以实际音频面板为基准提取GenerationPanelFrame，所有节点直接调用同一外壳、80px输入、单行操作与生成箭头；内容、参数和动作通过插槽/回调注入。原基础按钮、参数浮层、引用编辑器与提示词助手继续直接复用。设置图标由手绘路径切换为项目标准齿轮，中心圆与SVG无轴向压缩。

类型、lint（0错误/37旧警告）和Next静态构建退出0。最终指纹db19db5a5a45726d52f597f273687a6184af57c5a5f81c0735c8bb0f15424b3d，1136输入。串行Electron专项34/34、完整画布149/149退出0；覆盖实际几何、菜单避让、深浅主题、960px窄窗、快捷键、参数独立、媒体与保存重开。只使用自动DOM/Electron事件；转换服务和账号使用夹具，无真实推理或人工视觉验收。

图标外接框断言错误、窄窗测试的鼠标排队/工具条遮挡，以及中间发现的菜单压行问题均留有失败记录；菜单压行已实际修复并新增断言。早期成功记录不代替最终构建。本轮未再运行完整check，原三个未引用词条、Meta问题和以前人工待验继续保留。

齿轮/图片单行阶段增量注释业务18.75%、测试18.18%；追加复用阶段业务26.67%、测试14.29%，按各自任务起点快照人工复核，低于参考比例不凑数。新增普通函数≤30有效物理行。固定世界坐标面板仍通过画布平移查看，未做大规模性能验证。

[复用调用关系、修改文件与验证边界](canvas-panel-reuse-implementation.md) · [最终截图及日志](runtime/canvas-panel-reuse-2026-11-14/) · [追加注释审计](canvas-panel-reuse-comment-audit.json)


## 全局资源库与手动删除（2026-11-14）

工程/全局来源直接共用LibraryCard、CanvasChip、SegmentedControl；@直接复用创作页ImageReferencePrompt和PromptMediaMenu，通过可选分组、选择回调登记节点附件。全局库批量复制三类媒体，不创建节点/连线；全选再次点击全部取消。手动删除核对当前草稿、全部保存工程、其他打开租约及文件身份，未知文件只允许明确选择删除，不参与自动无引用回收。

类型、Electron检查、lint（0错误/37旧警告）、Next静态构建、i18n和双语键检查通过。最终指纹5fe5dc72ef2e6c73a2bb4e6e39545f2cdb91b2be49ed9000d308b489724a9ddb，1139输入。串行Electron：新资源合同6/6、原回收9/9、全局页面14/14、提示词34/34、原创作音频19/19、完整画布149/149。真实SQLite、文件复制/系统回收、静态页面及原媒体解码执行；CDP和DOM/Electron自动事件、回收失败注入、外部服务夹具分开记录，没有人工或真实模型验收。

完整check仍退出1，被原三个未引用词条阻塞，后续未执行不算通过。中间的禁用控件点击、主动失焦/显式保存测试前提和离屏尺寸1px差异均记录，修正后完整跑完，未以成功截图覆盖失败。以前Meta、人工待验和视频生成执行缺口保持原状态。

增量业务注释7.84%（37/472）、测试5.19%（14/270），低于20%–30%参考，复核边界后未凑数。新增/修改普通函数≤30有效行，原main31行未变。列表2000条、分批200文件，完整工程依赖扫描和大规模性能限制见[实施记录](canvas-global-resources-implementation.md) · [截图和日志](runtime/canvas-global-resources-2026-11-14/) · [注释](canvas-global-resources-comment-audit.json) · [函数](canvas-global-resources-function-audit.json)。
