# 工程资源管理与节点网预览（2026-11-13）

本轮按用户指定顺序先处理资源归属、保存关闭与回收，再调整节点网预览。保留工作区原有修改；没有提交、上传或合并 GitHub，也没有改动实际用户工程文件。

## 资源规则与使用

| 来源或状态 | 展示 | 自动进入 temp | 到期删除 |
| --- | --- | --- | --- |
| 用户在文件管理器直接放入工程目录的文件 | 未知归属，原位列出 | 否 | 否 |
| 旧版本文件，没有本轮明确登记 | 未知归属 | 否 | 否 |
| 软件复制导入、生成完成、工程包解包的已登记副本 | 受管 | 保存并关闭后，所有工程都无引用才允许 | 入区满24小时后再次核对 |
| 仍被独立节点、参考图、场景或合成器使用 | 受管 | 否；没有连线也算引用 | 否 |
| 手动选择“保留素材”的受管文件 | 已保留 | 否 | 否 |
| 原地址被外部替换或内容改变 | 新正文按未知归属展示，旧登记停止自动回收 | 否 | 否 |
| 回收区恢复 | 回原地址并保留，重新计时前需取消保留并再次失去引用 | 否 | 否 |

点击底栏“导入本地素材”或节点导入入口先进入工程素材库。支持图片、视频、音频、未知归属、回收区筛选；“使用素材”直接建立节点或参考，不复制第二份；“导入本地素材”再打开原系统文件选择流程。列表本身不算引用，闲置但希望保存的受管素材可点“保留素材”。

未知归属是清单分类，不实际搬到另一个目录。手放的 `1.png / 1.mp4 / 1.wav` 保持原位置和相互关系，不会因为没有节点引用而消失。它们经“使用素材”接到节点，也不会因此自动获得删除资格。用户明确选择视频移动导入时，原有确认及移动语义继续保留。

## 磁盘与数据位置

```text
user/
  Infinite Canvas/
    library.sqlite             # 工程目录表、受管资源台账、保存关闭资格
    工程目录/
      .canvas-owner            # 核对工程归属
      project.sqlite           # 原画布节点、连线、参数和引用
      Picture/                 # 图片，沿用现有大小写
      video/                   # 视频
      Audio/                   # 音频
      用户手放文件或子目录/     # 原位未知归属，不重排
    temp/
      .canvas-resource-trash   # 必须有正确归属标记
      资源UUID/原文件名         # 回收隔离，避免同名覆盖
```

回收区占用固定 `temp` 名称，新建名称为 temp 的画布使用安全目录 temp-canvas，显示名仍为 temp。已有不明 temp 目录不接管、不清空，回收会延期并记录固定诊断类别。

数据库追加 migration-004，版本4、48张业务表；原已发布迁移不重写。不使用 ORM，媒体正文仍在文件系统。新增两个独立实体：

| 表 | 存放 | 关键属性与关系 |
| --- | --- | --- |
| canvas_resource | Infinite Canvas/library.sqlite | resource_id主键；workspace_id+relative_path唯一；类型、来源、磁盘身份、状态、入区/到期时间、保留标记 |
| canvas_resource_release | 同上 | workspace_id主键；只有明确成功保存并关闭才能获得回收资格，重新打开撤销资格 |

下面九宫格展示逻辑关系，跨工程数据库不伪造外键：

| 工程与节点 | 资源身份 | 磁盘正文 |
| --- | --- | --- |
| **工程目录表** canvas_library_entry → 定位project.sqlite | **受管台账** canvas_resource → 对照文件身份 | **分类目录** Picture / video / Audio |
| **节点与引用** canvas_node、canvas_media_reference、场景/合成器附表 → 收齐实际依赖 | **关闭资格** canvas_resource_release；打开/挂起租约暂缓回收 | **未知归属文件** 只扫描展示，不补台账、不移动 |
| **撤销/剪贴板/在途任务** 打开工作区时整体保护 | **回收状态** active → moving → trashed → purging → deleted；恢复走restoring | **temp/资源UUID** 24小时从真正入区开始计算，恢复清零 |

这里的依赖扫描复用现有 `nodeReferences`，包含节点media、inputImages、导演台预览/全景/道具图和合成器资产。跨工程引用、同源多节点均保护；坏工程、损坏归属或读取失败中止清理，不能当作空工程。工程包导入后即使尚未保存，素材库也读取当前编辑文档的workspace。

## 实现与复用

- 主进程继续使用原工程库队列、SqliteClient Worker、固定命名SQL、registerHandle、IpcResult和preload通道；仅扩展原请求操作，不开放任意SQL或文件删除能力。
- 资源台账只在真实复制/生成/解包成功后登记。普通同工程路径复用不登记；原文件身份使用设备、文件号、创建时间、大小和修改时间，外部改名仅在同一分类目录唯一匹配时跟随。
- 媒体接收与回收共用串行队列。先把搬运意图写入SQL，再建立不覆盖目标的同盘硬链接并移除旧入口，完成后再记状态。中断可续接；恢复有同名冲突时保留双方。
- 只有成功保存并关闭工作区才释放资源；挂起和普通保存不释放，生成期间仍可挂起并在后台回填保存。渲染进程崩溃只撤租约，不冒充成功关闭。
- 工程素材库复用 `LibraryCard`、`CanvasChip`、`SegmentedControl`、`CanvasOverlay`、原节点工厂和输入数量约束。列表不请求模型、不上传媒体。
- 预览复用原 `CanvasMediaPreview`、音视频生命周期、`CanvasCompareNode` 和原连通分量计算。查看缩放、位移与旋转独立于节点属性，不写文件或工程。
- 底栏图标和预览工具共同使用 `HoverTip`，自绘黑色延时说明、渐入渐出、键盘聚焦及卸载清理；移除这些图标的原生title。该公共组件提取了既有蒙版提示机制；本轮没有替换蒙版按钮本身或全站其他提示。

主要新增文件是主进程 `resource-files/ledger/recycle/sessions/lifecycle/catalog.js`、SQL migration-004与resource-queries、渲染 `canvas-project-resources`、`canvas-existing-media`、`canvas-preview-tools`、`use-network-view` 和公共 `hover-tip`。现有导入、生成结果登记、工程包、合成器媒体、工程会话、shared schema及双语词条均接通。逐文件本轮增量见审计JSON，不包含此前全部未提交功能。

## UI与生命周期

节点网底部使用三个紧凑胶囊：关联计数、左右切换、定位。缩略条少时居中，多时横向滚动；仅选中项左下显示前缀名，其他项没有下方文件名。主内容透明、图片圆角，打开预览只虚化原工作区；无限画布本身背景不改。

内容区域移入显示顶部信息/重置、缩放按钮与滑块、顺逆90度旋转、关闭；经过footer或应用导航不触发。旋转有过渡，减少动态偏好保留。信息读真实解码宽高和媒体大小。切换时重建查看实例，旧播放器停止并释放；焦点若随旧播放器卸载丢失，会交回预览根，ESC仍可关闭并返回原触发点。查看对比图时滑块方向键不被节点切换抢走。

底栏设置图标固定宽高、min-width/min-height与零padding，保持正圆。图标及带字图标共用悬停1.1倍绘制变换，不改变布局宽高。连线继续读取原主题token，浅深主题沿用系统主题信号，没有新增第二套主题开关。

## 实际验证

全部 Electron 套件串行执行，使用隔离临时目录；正式页面测试读取新鲜静态导出，指纹 `b8b920eb5c7044ffbcb22c1d6565485060c3c03346ad6c12370efb39b961206e`（1126输入）。

| 运行命令 | 结果 | 验证边界 |
| --- | --- | --- |
| pnpm typecheck | 通过 | Next与主进程 |
| pnpm lint | 通过，37项既有警告 | 0错误 |
| pnpm --filter @illusion-realm/next build | 通过 | 静态导出 |
| pnpm exec electron scripts/verify-canvas-resources.js | 9/9 | 真实SQL/磁盘，时间注入测24小时边界 |
| pnpm exec electron scripts/verify-canvas-library.js | 18/18 | 原创建/删除/归属/竞争保护 |
| pnpm exec electron scripts/verify-sqlite.js | 6/6 | v4、48表、索引、5000样本与Worker响应 |
| pnpm exec electron scripts/verify-sqlite-migration.js | 4/4 | 实际旧结构升级与反读 |
| pnpm exec electron scripts/verify-sqlite-asar.js | 3/3 | 真实asar内SQL及Worker，不代表安装器验收 |
| CANVAS_RESOURCES_SMOKE=1 + Electron画布冒烟 | 4/4 | 正式IPC与资源库深浅主题、窄窗口 |
| CANVAS_NETWORK_SMOKE=1 + Electron画布冒烟 | 20/20 | 真媒体解码、播放、切换、工具、焦点和长网 |
| CANVAS_COMPARE_SMOKE=1 + Electron画布冒烟 | 15/15 | 原图/结果真实解码，对比线与主题 |
| 普通 Electron画布冒烟 | 149/149 | 原导入/移动/播放/错误/复制剪切粘贴/保存恢复 |
| CANVAS_GENERATION_SMOKE=1 + Electron画布冒烟 | 23/23 | HTTP夹具，真实文件回填与挂起保存 |
| CANVAS_GENERATION_SMOKE=1 SEEDVR2_SMOKE=1 + Electron画布冒烟 | 25/25 | 服务夹具，真实串行请求及文件，非真实推理 |
| node scripts/verify-canvas-project.js | 通过 | 原归档、非法包反证、LoRA契约 |
| pnpm check | 退出1 | 既有未引用词条auth.verifySuccess、canvas.reference、canvas.styleTransfer阻塞 |
| 单独运行check后续子检查 | 9项通过，Meta失败 | MetaFieldRow.tsx既有注释误判；真实golden语料缺失仍跳过 |

**自动事件**：DOM点击、Electron鼠标/键盘输入、CDP选择真实临时文件；音视频currentTime真实推进，关闭后src确实移除。不是人工操作。**夹具**：HTTP生成返回固定像素、游客账户、系统选择器自动提供文件、注入主进程时间模拟到期、构造中断状态；没有请求收费模型。**人工**：本轮无人工验收，原有待验项全部保留。

检查中发现并修复了预览切换卸载焦点后ESC失效、素材浮层缺底板与窄窗溢出，以及工程包切换素材归属未保存时列表过旧的问题。原画布首轮自动回归因测试未等待按需加载的素材库而报“选择器未打开”；修正测试等待后原149项通过。中间静态导出曾被新鲜度门禁拒绝，按要求重建后执行；旧失败日志保留，不记为通过。长网新增夹具曾构造不符合输入规则的图片链、把卡片放在最小缩放仍不可见的位置，以及误查导航按钮的滚动宽度；均修正夹具后再验证，未把这些失败归咎于产品或用重试掩盖。

## 证据与尚未验证

[正式截图与运行日志](runtime/resource-management-preview-2026-11-13/) · [增量注释审计](resource-management-preview-comment-audit.json) · [函数长度审计](resource-management-preview-function-audit.json)

![工程素材：深色](runtime/resource-management-preview-2026-11-13/120-project-resources-dark.png)

![工程素材：浅色窄窗口](runtime/resource-management-preview-2026-11-13/121-project-resources-light-narrow.png)

[参考图与实际运行并排对照（素材不同，供结构核对）](runtime/resource-management-preview-2026-11-13/reference-runtime-comparison.png)

![真实图片查看、旋转和信息](runtime/resource-management-preview-2026-11-13/102-network-image-tools-dark.png)

尚未人工核验鼠标手感、实际扬声器、Windows实体系统框、资源管理器真实拖入、超大文件/万节点压力、非NTFS磁盘和真正断电。24小时通过注入时间边界验证，没有连续等待一天。不把软件渲染截图当作硬件GPU性能或视觉相似度百分比测量。

## 性能与安全限制

1. 只要存在任意打开/挂起画布，整轮回收都会延期，包含已在temp的到期资源；这是保护撤销、剪贴板和在途任务的保守选择。软件退出时不运行清理，重新启动补查，运行期间每5分钟检查一次，不保证24小时整点删除。
2. 每轮清理读取所有存活工程依赖和受管台账，不逐帧扫描、不读取媒体全字节；大型工程库仍有SQL打开与文档扫描成本。素材清单最多2000文件、8层深度，有截断提示；更深文件仍可明确导入。
3. 回收使用同盘硬链接，不支持该能力的文件系统会保留文件并报告诊断，不悄悄降级为覆盖式移动。没有给其他程序加独占文件锁，外部同时改动的极端竞争不作绝对保证。
4. 台账登记失败时保留已经生成或复制的正文，后续显示为未知归属，不为了清理磁盘冒险删除成果。旧未登记资源本轮不回补归属。
5. 导演台已有全局输出仍按原保存服务处理，外部引用受保护但不进入本轮工程内自动回收；没有扩展导演台媒体落盘策略。整画布删除继续沿用现有明确确认的删除机制，不把节点回收temp策略擅自替换整工程删除。
6. 预览同时保留原工作区DOM并做一次背景虚化；选择项仅一个主播放器，可见视频缩略项才解码首帧。未做GPU显存或真实FPS基准。视频播放器操作条随查看表面缩放/旋转；变换是查看行为，不是重新编码或导出。

## 增量注释与函数审计

任务开始快照 `logs/resource-management-baseline` 保留了本轮之前的未提交实现。新增文件全文、修改文件仅新增及替换后的最终行；JS/TS/TSX/CSS/SQL按注释语法核对，类型JSDoc、装饰定界符不计，混合行只计代码。旧测试脚本缺少完整开工快照，仅统计能明确定位的本轮适配行，不宣称覆盖此前全部测试增量。

业务有效增量注释 **75/(75+804)=8.53%**；测试可审计增量 **20/(20+317)=5.93%**。低于20%–30%参考范围的主要原因是表结构、类型、UI装配和断言增量；必要的归属、异步失败、恢复、中断及资源清理说明已逐项复核，不重复说明或凑数。普通新增业务与新测试函数不超过30有效代码行；三个超过30行的页面JSX装配属于展示例外，事件函数另行核对。旧测试脚本未改动的长函数没有借此轮全仓重构。

停止在本轮资源管理与预览UI范围。需要重新启动应用以加载主进程与SQL迁移；本轮未替用户退出正在运行的窗口。
