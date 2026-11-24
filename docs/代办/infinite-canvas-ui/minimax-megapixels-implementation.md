# MiniMax 节点：比例与百万像素

日期：2026-11-12。正式入口为无限画布中的 MiniMax 视频节点。自动验收完成，人工项待验。

交互追加更新：十档按钮已改为0.1～1.0滑块，比例恢复横向原组件，深色浮层改为画布黑底。[当前样式、截图和新回归](minimax-slider-implementation.md)。下文的双列菜单及对应截图保留为首轮实施历史，数据和工作流契约继续适用。

## 交互与尺寸

MiniMax 图生视频、参考生视频共用原比例浮层，比例直接读取创作页 `IMAGE_SIZE_PRESETS` 的八项参数。原视频画质入口替换为 **0.1、0.2、0.3、0.4、0.5、0.6、0.7、0.8、0.9、1.0 百万像素**，缺省为1.0。菜单和节点下方都显示最终 `宽 × 高 px`。图片的1K/2K、自定义尺寸及历史Wan配置保持原规则，未将面积档位扩展到它们。

设比例为a:b、面积预算为m，使用 `P=m×1024×1024`，先求 `s=√(P/(a×b))`，再把 `a×s`、`b×s` 交给原 `clampVideoSide`。这是本轮明确采用的1024²面积口径，两边沿用本地H3的32像素对齐，仍受现有64–1472范围约束。不是以短边、长边或上次尺寸乘倍率计算，取整后实际面积可能偏离所选预算，菜单有说明。

| 比例 | 百万像素 | 最终宽高 |
| --- | --- | --- |
| 16:9 | 0.1 | 416×256 |
| 9:16 | 0.1 | 256×416 |
| 16:9 | 1.0 | 1376×768 |
| 9:16 | 1.0 | 768×1376 |
| 1:1 | 1.0 | 1024×1024 |

取整可能使0.1档的实际比例偏离数学比值，按钮仍保留用户选择的比例；像素读数显示真实结果。每次按原始比例和面积重新计算，来回切换不累计舍入误差。参数多时底部自然换行，像素单独显示一行，提交入口仍保留。

## 复用、保存与工作流

| 职责 | 实现与边界 |
| --- | --- |
| 菜单外壳、焦点、Escape | 直接复用 `ParameterPopover`、原画布按钮与主题变量；新增组件只提供十档数据和回调 |
| 面积换算 | `canvas-video-resolution.ts` 调用原视频尺寸对齐方法，不建立第二套H3范围规则 |
| 输出读取 | 原 `canvasOutputDimensions` 为界面和工作流提供相同最终像素 |
| 节点事务 | `ratio`、可选 `videoMegapixels` 与既有 `videoOutput` 同笔更新，沿用复制、撤销、重做 |
| 原视频表单 | `CanvasVideoSettings` 仍直接引用创作页的主模型、扩展、模型加载三个组件；共用本节点的 `templateOverride` |
| 工作流宽高 | `getCanvasVideoWorkflowTemplate` 克隆原模板，调用 `applyVideoResolution`，写入实际 `MiniMaxH3ImageToVideo` / `MiniMaxH3ReferenceToVideo` 节点的 `inputs.width/height` |
| 工程存储 | shared与主进程均验证十档枚举及视频归属；序列化保留字段，SQLite沿用已有配置JSON列，不改SQL表结构或迁移用户文件 |

明确保存了旧 `videoOutput`、尚无面积字段的节点保留原值，面积入口显示“自定义”；用户主动选面积或比例后才切到新规则。旧自定义可能超出本地H3范围，因此仅浏览旧节点侧栏时保留原模板，不自动把其旧尺寸送入H3或偷偷改写工程。新增节点默认面积可计算，但读取本身不会建立保存事务。

**画布视频生成执行器仍未接通，原请求按钮继续禁用。** 本轮接通配置与工作流参数构建，没有上传媒体、调用模型、生成或导出视频；不能把模板验证当作真实推理成功。原创作页的视频执行流程未修改。

## 实际验证

| 检查 | 结果与证据范围 |
| --- | --- |
| `pnpm typecheck` | 退出0；统一check中再次完成两端类型检查 |
| `pnpm lint` | 退出0，0错误、37条既有警告，本轮文件无新增警告 |
| `pnpm --filter @illusion-realm/next build` | 退出0，正式静态导出及指纹完成 |
| `node scripts/verify-canvas-megapixels.js` | 退出0；固定宽高、非法输入、两个真实模板×八比例×十档，共160组合；其余模板内容不变、默认、旧尺寸、复制独立性 |
| `node scripts/verify-canvas-image-parameters.js` | 退出0，292项两端契约；字段省略、null、字符串、越档、非视频归属、序列化保留 |
| `node scripts/verify-video-resolution.js` | 退出0，既有H3/图片尺寸回归，28,740个尺寸/倍率案例 |
| `node scripts/verify-canvas-project.js` | 退出0，原格式、模型配置及300节点拖动索引回归 |
| `electron scripts/verify-canvas-library.js` | 串行退出0，18/18；真实临时SQLite保存重开、A/B不串值及原创建删除恢复回归 |
| `CANVAS_VIDEO_SETTINGS_SMOKE=1 electron scripts/smoke-infinite-canvas.js` | 串行退出0，24/24；真实静态页面、十档菜单、横竖像素、撤销重做、时长/FPS、模型重置、节点隔离、保存重开、两主题、960×720菜单可达与边界 |
| `electron scripts/smoke-infinite-canvas.js` | 串行退出0，原画布149/149，包含原图片输出与媒体交互 |
| 双语键、中英文文案基线、冒烟规则 | 独立运行退出0 |
| `pnpm check` | **退出1**，仍停在既有门禁：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 三个未引用词条；后续串联项未自动全部执行，不称全仓通过 |

本次静态构建指纹：`b19b888a2445b7127ffe9c327cee0a0b5641c5f38347e885651d944f86c3d0e0`。自动回归依次执行，未终止用户应用、未改写用户工程。测试窗口使用隔离资源根、真实生产IPC与SQLite。宽高构建测试在本进程转译生产纯模块，翻译函数为仅返回键名的替身；未替换尺寸算法和原模板。

两次早期UI测试失败日志保留：一次误把含“画面比例”前缀的按钮当成纯比例文字；两次都在撤销后直接读取已取消选中的属性DOM。修正测试为原按钮语义和正常重新点选后通过，未通过修改产品历史机制绕过断言。最后补充正常平移后窄窗菜单边界，最终24/24。模型设置测试环境未连接ComfyUI，日志保留 `comfy:listModels` 无handler提示，不将离线原组件验证当作真实模型目录或服务验收。

未验证：人工鼠标手感、实体完整键盘路径、系统DPI、实际ComfyUI模型执行、显存和性能压力、真实视频生成/导出。此前UI-08及其他人工待验项保持原状态。

## 增量注释审计

基线为 `logs/canvas-megapixels-baseline/` 的任务开始副本；三份新业务文件和一份新验证器统计全文，修改文件只统计新增/替换后的行。图片契约验证器基线通过仅移除本轮新增 `checkMegapixels` 及调用重建，未把原有修改混入。按语法识别纯注释并人工复核职责、边界与反例，混合行只计代码，空行及注释定界符不计。

业务 **C=16/B=82，16.33%**；测试 **C=17/B=147，10.37%**。低于当前仓库20%–30%参考，也未达到旧版70%要求；增量主要是显式字段映射、枚举和直接断言，必要的面积口径、旧值兼容、模板隔离和测试证据说明已保留，不重复注释凑比例。[逐文件行号](minimax-megapixels-comment-audit.json)。本轮普通逻辑函数无超过30有效行项；原 `GenerationPanel` 为JSX展示装配，按项目例外处理。

## 运行截图

以下为正式Electron静态导出的自动操作截图，空视频节点未生成任何媒体。

![深色面积菜单](runtime/minimax-megapixels-2026-11-12/78-minimax-megapixels-menu.png)

![竖屏面积与最终宽高](runtime/minimax-megapixels-2026-11-12/78-minimax-megapixels-portrait.png)

![浅色960×720，正常平移后展开菜单](runtime/minimax-megapixels-2026-11-12/81-minimax-megapixels-light-restored.png)

[构建、检查、原回归及失败日志](runtime/minimax-megapixels-2026-11-12/)。
