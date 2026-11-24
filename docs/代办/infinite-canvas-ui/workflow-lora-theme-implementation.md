# 画布黑白主题、提示词转换与 LoRA 配置

日期：2026-11-09。本轮承接工作流选择，只实现配置与 UI，不接真实生成或结果回填。既有导演台、媒体、性能优化等工作区修改继续保留。

## 行为与复用

| 入口 | 复用实现 | 本轮差异与数据归属 |
| --- | --- | --- |
| 图片/视频工作流 | CanvasChip、CascadeMenu、创建页模板登记 | 点击选项同时打开配置；再点当前项仍可设置 |
| 提示词输入 | PromptAssistantToolbar、AssistantMenu、原转换 hook | 每个节点自己的 ref、contextId 和读写回调；注入 neutral 外观 |
| 图片 LoRA | ExtensionSelectDialog、SelectedExtensions | ANIMA、SDXL 和文字改图按原系列筛选；文字改图继承原 AnimeEditV2 默认 |
| 视频 LoRA | VideoLoraSelect、原资源选择与文件名转换 | MiniMax 基础流/参考流独立；Wan2.2 按创建页现状明确提示未接通 |
| 配置与嵌套资源页 | ResourceDialogShell、ModelVersionDialog | 可选 tone 参数贯穿门户；不传的创建页调用保持原外观 |
| 保存、复制与撤销 | 原画布事务、serializeCanvas、用户文档与工程包 | workflowLoras 按节点及工作流保存，继承默认与显式空数组分开 |

黑白配色继续由 nativeTheme 和 prefers-color-scheme 决定。输入区、工作流菜单、转换菜单、配置页和内层选择页使用中性表面；不再从应用蓝色背景继承。中性入口也重新指定文字色，避免标题和关闭图标继承 body 已计算的蓝色。原 LoRA 选择器的权重滑条、版本、多选、搜索、缺图和确认规则继续复用。

仅确认的 LoRA 数组进入当前节点；取消内层选择不改变配置。修改权重、移除和工作流切换使用不可变更新。复制节点后修改副本不影响原件，两个工作流的列表也不互相替换。模型文件仍由用户本机资源索引提供，工程只存引用和权重，不复制模型权重正文或凭据。

配置页按点击加载，不在空画布初次加载时引入整套模板与资源选择页。未引入新 IPC 通道；shared schema 和主进程等价校验同步约束行形状、权重范围、数量、重复身份和工作流归属。非法值保留为错误，不靠放宽校验让保存假成功。

## 集成修复

真实回归发现：按 schema 顺序归档 LoRA 表时，旧序列化把所有可选键都写成内存属性。图片节点因此携带 minimax:undefined，在 JSON 写盘前即被严格归属校验拒绝。现在只输出实际存在的模板键，仍保留 []；两端白名单没有放宽。

永久格式回归新增直接执行生产 serializeCanvas 的用例：先验证内存结果，再验证 JSON 与 schema 的字段顺序；图片和视频都覆盖，且明确检查原配置没有被改写。不能先 JSON 化再验，否则 undefined 键会提前消失而掩盖故障。

两处旧 UI 回归把“全页面不存在 inert”当作背景恢复条件，新增工具条合法收起动作使其误报。断言现限定到实际返回控件/卡片的祖先，并同时要求对应浮层卸载；原文件保留、节点数和焦点要求均保留。

## 检查与证据

证据目录：[runtime/workflow-lora-theme-2026-11-09](runtime/workflow-lora-theme-2026-11-09/)。最终数量、指纹及退出状态见该目录 smoke.log、build.log 和 verification。

| 检查 | 本轮结果 |
| --- | --- |
| pnpm typecheck | 退出 0，含渲染 strict 和主进程 tsc |
| pnpm lint | 退出 0，0 错误、37 项既有警告 |
| pnpm check:locale-keys | 退出 0，20 个命名空间键一致 |
| Next 静态构建 | 通过；最终指纹随 build.log 归档 |
| 正式 Electron 回归 | **140/140，退出 0；自动验证完成，人工项待验** |
| node scripts/verify-canvas-project.js | LoRA 两端契约及内存序列化专项通过；完整脚本退出 1，原 checkRoundTrip 的 canvas-invalid-media 仍存在 |
| pnpm check | 退出 1：门禁仍报 auth.verifySuccess、common.localeNameSelf、create.generationTasks.active 三个既有未引用词条；此前类型、Electron 模块/IPC 检查已通过，后续串联项未执行 |
| 修改的 Node 回归脚本语法 | 通过 |

最终静态指纹：`efa833e70c83dcc636b10b541581dd2ead842796e0fa978033761c422154ce96`。i18n 中文为 21/基线 66，英文未翻译为 772/3093，均通过现有门禁；双语键一致。

真实截图：[深色菜单](runtime/workflow-lora-theme-2026-11-09/workflow-lora-01-neutral-menu-dark.png)、[深色配置](runtime/workflow-lora-theme-2026-11-09/workflow-lora-02-anima-settings.png)、[浅色配置](runtime/workflow-lora-theme-2026-11-09/workflow-lora-05-anima-settings-light.png)、[资源选择页](runtime/workflow-lora-theme-2026-11-09/workflow-lora-06-shared-picker-light.png)、[转换工具条](runtime/workflow-lora-theme-2026-11-09/workflow-lora-07-prompt-toolbar-light.png)、[600px 配置布局](runtime/workflow-lora-theme-2026-11-09/workflow-lora-08-settings-narrow-light.png)。

LoRA UI 扩展通过临时诊断驱动串入原冒烟，用测试模型索引分别提供 ANIMA、SDXL、MiniMax 条目。没有读取真实 LoRA 权重或发起推理。点击、双击权重输入与菜单属于 DOM 自动事件，部分选择、拖动与按键使用 Electron 自动输入；均不冒称人工验收。

保存、完整刷新、工程包往返使用真实临时 JSON 与磁盘服务；媒体回归实际解码测试图片、视频和音频。系统文件选择返回为原有夹具，外部拖入为合成事件。它们不能作为人工系统选择框或资源管理器拖入证明。截图来自正式 app://app/canvas 静态入口和生产 preload，不是独立 mock 页面。

自动覆盖：黑白菜单及配置、原提示词工具条复制、工作流系列过滤、调权、嵌套 Escape、显式清空默认项、不同工作流隔离、复制节点隔离、真实保存与刷新；并回归原节点、连线、历史、拖动、取消、主题、窄窗、媒体与工程包。检查失败与最终通过分开记录，不累加失败运行中的部分通过数。

调试过程中的问题分别是：失焦后访问已卸载的权重输入；两处过宽 inert 断言；实际 LoRA 保存失败；多节点回归后试图实体点击离屏旧节点；白色 token 被构建压缩为 #fff 而诊断仅接受 #ffffff。最后一项改为接受同一白色的等价写法，并补核标题实际 RGB；未改变产品色值或放松白色要求。

## 注释与限制

本轮以开始前 TEMP 快照为基线，已有文件仅统计新增/替换行，新配置文件统计全文；不把先前工作区修改计成本轮成果。业务与仓库测试分别统计，空行、定界符不计，混合行仅计 B；复核时排除重复说明。逐文件、基线哈希和复核排除项见 comment-audit.json。

业务 **C342/(342+143)=70.52%**，仓库测试 **C76/(76+32)=70.37%**。本统计不覆盖未交付的临时探索驱动，不把它们算作已达标的常驻测试源码。

有效说明示例：“JSON 会省略 undefined，但保存前先验内存对象，因此不能指望写盘替我们清理”；“折叠的提示词工具条也有局部 inert；取消只需恢复承载卡片的画布主体”。新增动作/校验/序列化普通函数保持 30 行内，展示组件按职责装配。

未验证：真实模型目录的大规模选择、实际加载 LoRA 推理、真实翻译服务请求、人工全键盘/读屏/IME、Windows 系统缩放、扬声器试听、同时挂载两套画布及长时性能。原人工待验全部保留。临时 UI 扩展驱动尚未整理成常驻仓库测试；关键保存与数据契约回归已进入永久脚本。

未接通：真实生成与结果回填、Wan2.2 LoRA 选择、基础模型/CLIP/VAE 文件覆盖。生成继续禁用，选择模型不显示推理成功。LoRA 是每节点配置，不会改创建页正在编辑的全局草稿。
