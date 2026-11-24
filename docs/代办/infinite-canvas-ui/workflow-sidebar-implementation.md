# 节点文生图侧栏、工作流分层与生成数量

日期：2026-11-10。范围是画布配置与 UI，用户已确认参数绑定当前画布节点，互不串值；未接真实生成。工作区先前的导演台、媒体、性能与其他修改保留。

## 实现与复用

| 区域 | 复用来源 | 注入差异与业务边界 |
| --- | --- | --- |
| 工作流菜单 | 创建页同款 CascadeMenu、原模板登记 | 本地 → Anima → 标准文生图/图片编辑·文字改图；本地 → SDXL → 标准文生图；非本地明确禁用。视频保留原登记列表 |
| 设置与数量 | IconButton、原 ImageRatioPicker/SegmentedControl | 费用横杠改为设置图标；数量显示 ×1，展开 ×1/×2/×4/×6。比例与数量复用焦点、关闭和提交行为 |
| 右侧外壳 | 原画布图标按钮、主题变量、工作区宿主 | 紧凑圆角、无边框、独立正文滚动；不包含导演台图层内容，不加全屏遮罩 |
| 主模型 | Create ModelCoverSelect、ModelSelectDialog | 传入当前节点模型身份、原系列过滤与回调；仅增加可选 neutral 外观，创建页未传参数时保持原样 |
| LoRA | 既有 ImageLoraSettings、ExtensionSelectDialog、SelectedExtensions | 权重、搜索、版本与确认继续复用；不同节点/模板保留各自数组 |
| CLIP/VAE | WorkflowModelSettings、原模板解析 | 当前模板及节点覆盖；SDXL checkpoint 内置输出沿用原说明，不伪造独立加载槽 |
| 正反提示词 | PromptInput、NegativePromptSection、原转换助手 | 传独立编辑器编号、受控值和节点回调；正向与卡片正文同步，负面词按模板保存 |
| 尺寸和采样 | CreationSizeSelector、AdvancedSettingsSection、GenerationSamplingFields | 使用原单位、范围、种子草稿、预设与交互，覆盖只写当前节点 |
| 事务和保存 | 原画布命令、序列化、用户文档服务和工程包 schema | 不新增 store、IPC 通道或存储层；仍支持原历史、复制和恢复 |

侧栏按打开动作分包加载，不挂载整个 CreatePage，不订阅创建页全局生成草稿、队列或结果图库。可复用资源目录及预设偏好，正文和确认参数归节点。只有明确进入当前节点的配置才挂载侧栏；取消选择、删除或换节点后旧表单卸载。主资源浮层/媒体导入期间侧栏卸载，隐藏字段不参与键盘路径。

外壳跟随参考图的停靠方式：可用主区右侧留12px，最大352px宽，圆角16px；正文内部滚动、头部关闭入口固定。深浅主题使用同一组件及原 nativeTheme 机制，不创建额外主题开关。没有测量视觉相似度百分比。

## 数据与一致性

- `workflow` 保留原稳定编号；`batchSize` 为可选1/2/4/6，仅图片合法，缺省显示 ×1，不为旧文档自动写默认值。
- `imageParameters` 为可选表，仅图片合法，键限 `anima`、`sdxl`、`anima-edit`。每项可保存模型身份、CLIP/VAE覆盖、负面词、步数、CFG、采样器、调度器、种子及完整尺寸输入。
- 默认值从原模板/构建工具读取；已改字段优先，未改字段继承模板。音频和视频不接受图片参数表，主进程与 shared 同步校验。
- 正向词复用节点既有 `prompt`；LoRA继续使用既有 `workflowLoras`，没有第二份镜像。模型文件只保存引用，不复制权重正文或凭据。
- 自定义尺寸在页脚明确显示“自定义”；预设与快捷比例双向同步。改比例不改变卡片世界坐标、源文件尺寸或素材内容。
- 主模型身份找不到本地索引时显示保存的文件基本名/缺图，避免回退到无关示例模型。模板文件名不表示该模型已安装。
- 序列化按 schema 固定键序，避免“已保存却仍显示未保存”；未知模板、额外字段和非法值仍拒绝，未放宽保存边界。
- 修改使用不可变合并，复制节点保留初始参数，后续编辑不影响原件。没有通过共享创建页 store 实现隔离。

旧版本一的可选兼容保持不变；默认配置不意味着模型加载或推理已成功。本轮已接通主模型/CLIP/VAE配置，替代上一轮记录中这三项“未接通”的状态；真实执行仍未接通。

## 检查与实际证据

最终静态指纹：`4aa5fa30c243119e5febcc3ae2675bca830e25413122cb9a73da17871dc3f9df`。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 退出0，渲染 strict 与主进程类型均通过 |
| `pnpm lint` | 退出0，0错误、37项既有警告 |
| `pnpm --filter @illusion-realm/next build` | 静态导出通过，指纹已核对 |
| `pnpm check:locale-keys` | 退出0，20个命名空间键一致 |
| `pnpm check:i18n` / `pnpm check:i18n:en` | 均退出0；硬编码21/基线66，英文未译772/允许3097。英文检查有既有director词表模块类型提示，未修改包类型配置 |
| `node scripts/verify-canvas-image-parameters.js` | 175例通过，shared/主进程、类型归属、坏值、键序、保留及不改输入；纯契约证据 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 140/140，退出0，正式 `app://app/canvas` 静态产物及生产 preload |
| `pnpm exec electron scripts/smoke-create-layout.js --resource-selection-only` | 15/15，退出0；串行运行，创建页旧资源选择、封面、嵌套页、权重与移除回归 |
| `pnpm check` | 退出1，三个既有未引用词条：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。此前类型、Electron模块/IPC检查通过，之后串联项未执行 |
| `node scripts/verify-canvas-project.js` | 退出1；已有拖动/LoRA契约通过，原 `checkRoundTrip` 仍报 `canvas-invalid-media`。此前已用任务前脚本复现，本轮保留失败，不等同于全部格式验收通过 |

本轮新增的孤立词条 `canvas.countOne` 已从双语表删除。最终 lint 发现原关闭回调遗漏编译器推断依赖，已显式登记稳定 setter 并重跑通过；修复前日志保留。页面重载验证也改为先等待真实导航完成，再等待用户数据水合，避免旧DOM短暂满足条件被当作恢复成功。

自动覆盖：三级菜单、数量选中/焦点/Escape、设置入口、原组件挂载、主模型/LoRA弹层互斥、Delete隔离、正负词同步、比例/自定义双向同步、Anima/SDXL隔离、复制节点嵌套参数隔离、真实保存与完整页面刷新、关闭焦点返回、深浅主题、960×720窗口的实际主区边界和自身滚动。原媒体导入、真实解码、播放互斥、节点/连接、历史、拖动、取消及工程包自动往返继续通过。

证据分开说明：

- 纯数据脚本不加载模型，不证明推理可用。
- DOM click/input、Electron自动鼠标键盘是自动事件；未作为人工操作验收。
- 保存走生产服务到随机隔离JSON，再直接读磁盘；页面刷新重建组件后从用户文档恢复。
- 媒体回归使用可实际解码的临时磁盘图片、视频和音频；系统框返回/外部拖放沿用自动夹具，不等同于人工系统选择和资源管理器拖入。
- 真实模型目录扫描、权重读取与服务推理没有由空索引或测试资源夹具替代。

## 截图与日志

[全部证据](runtime/workflow-sidebar-2026-11-10/)包含最终构建、类型、lint、check、两个串行Electron、纯契约、完整工程格式失败和注释审计。

- [深色侧栏](runtime/workflow-sidebar-2026-11-10/61-sidebar-anima-dark.png)
- [浅色侧栏](runtime/workflow-sidebar-2026-11-10/62-sidebar-light.png)
- [960×720窗口](runtime/workflow-sidebar-2026-11-10/63-sidebar-narrow.png)
- [分层工作流](runtime/workflow-sidebar-2026-11-10/64-workflow-anima-series-anima.png)
- [数量展开条](runtime/workflow-sidebar-2026-11-10/60-batch-strip.png)
- [重开恢复](runtime/workflow-sidebar-2026-11-10/65-sidebar-restored.png)

这些图片来自正式Electron工作区；没有把资料HTML截图当作项目实现。浅色截图等待真实应用主题及波纹结束，不使用瞬时主题状态截取黑色旧覆盖层。

## 注释与边界

基线为本轮开始前工作区快照，已有修改只计本轮新增/替换物理行，新文件全文。人工排除两类各6行重复说明，混合行仅计代码，空行/定界符不计；逐文件基线哈希、当前哈希、变更范围和排除行见 [comment-audit.json](runtime/workflow-sidebar-2026-11-10/comment-audit.json)。

业务 **558/(558+233)=70.54%**；测试 **440/(440+186)=70.29%**。普通动作/校验/辅助函数检查在30有效行内；JSX装配组件按既有规则不机械套用函数限制。有效解释包括工作单附表类比，以及 reload 返回void为何不能直接当作已完成导航。

未接通：真实生成、结果回填、远端工作流、Wan2.2 LoRA、模型下载/执行、云端任务和画布成片合成。生成按钮保持禁用，没有假延时或假成功。

未验证：人工完整键盘/读屏/中文IME、Windows系统缩放、实体系统选择框和资源管理器拖入、扬声器试听、真实模型大目录及权重加载、实际生成、同时挂载两套画布、长时间和大工程性能；完整旧视频/GIF/漫画链路未重跑。本轮新增表单可能随输入形成较多原历史事务，未实施防抖或历史合并性能改造。此前人工待验保持原状态，不标记全部验收通过。
