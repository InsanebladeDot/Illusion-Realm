# 画布 MiniMax 音频与视频 LoRA 修复（2026-11-13）

无限画布音频卡的 MiniMax H3 入口打开现有参数侧栏，直接挂载创作页的完整音频表单。生成结果回到发起卡，批量其余结果成为独立音频卡。视频扩展沿用图片的同一个资源选择器，修复 MiniMax 深层目录及同目录多个权重遗漏。

## 复用关系与业务边界

| 位置 | 实际复用 | 本轮差异 |
| --- | --- | --- |
| 创作页 `RoleTtsPanel`、画布 `CanvasAudioPanel` | 同一个 `AudioGenerationForm`，由原 RoleTtsPanel 提取，原入口同步改用 | 创作页仍持有原常驻草稿/结果；画布参数归当前节点 |
| 音频表单 | 原主模型、VideoLoraSelect、模型加载、@引用、提示词助手、转换预览、AudioUpload、时长、步数、SeedFields、GenerateFooter | 画布上传音频成为受管工程引用；连线参考展示来源，不通过上传控件删边 |
| 图片、视频、音频扩展 | `SelectedExtensions → ExtensionSelectDialog → ResourceSelectDialog / ModelVersionDialog` | MiniMax 系列路径大小写不敏感，接受更深目录，同目录各权重保持独立身份；Anima/SDXL 系列过滤维持原规则 |
| 音频请求 | 原 `enqueueAudioGeneration`、构图、模型解析、上传、FIFO、取消和保存 | 增加可选输出目标，画布直接保存到工程 `Audio/`，创作页省略参数时不变 |
| 配置侧栏 | 原 `CanvasImageSidebar` | 完整音频表单在画布样式域外展示，避免世界坐标下的长表单裁切 |
| 保存/资源/导出 | 原 SQLite 节点参数附表、`nodeReferences`、工程归档器 | 新增 `audioParameters` 白名单、参考音频索引及归档校验；媒体字节不进入数据库 |

节点字段包括主模型、步数、时长、种子/随机开关、1/2/4/6批量、LoRA、两种模板独立的辅助加载覆盖、可选参考音频。shared schema 和主进程校验配对；旧无音频参数工程可继续打开。字段顺序规范化，重开不会仅因键序不同出现假未保存。

没有音频输入时使用原创作页文生音频图，有参考时使用原参考音频图。多参考或空音频来源拒绝提交，不偷偷取第一条。生成输出不会隐式成为本节点的下一次参考。节点提示词、参数和撤销记录不写入创作页全局草稿。

## 生命周期与资源

请求开始冻结当前节点参数；原 FIFO 保证图片、编辑和音频共用执行槽。画布批量逐项入队，不并行冲击显存。首项用当前种子，后续随机，与创作页原批量逻辑一致。回填按稳定节点 ID，期间的其他编辑不被旧工程快照覆盖。

停止时先中止批次控制器，再取消当前队列项，避免下一项继续提交；读取参考有60秒上限。离开画布按现有工作区任务清理，迟到结果不写回卸载实例。创作页自己的常驻任务仍按原行为保留。保存阶段遵守原队列保护，不承诺取消已经完成的磁盘副作用。

生成文件直接进入当前工程 `Audio/`，随后只登记已有文件，不再复制一份到图库。上传参考同样走原受管导入。参考音频加入统一依赖索引，因此导出、删除保护和 temp 回收都看得见；未知归属文件的保留规则不变。

## 实际验证

以下为最终独立运行结果，Electron 套件依次运行，没有并行启动冒烟，也没有终止用户应用。

| 命令 | 结果 | 实际覆盖 |
| --- | --- | --- |
| `pnpm typecheck` | 退出0 | 渲染与主进程类型 |
| `pnpm lint` | 退出0，0错误/37旧警告 | 原基线警告保留 |
| `pnpm verify` | 退出0 | 主进程模块、现有通道与请求契约 |
| `pnpm --filter @illusion-realm/next build` | 退出0 | 最新 Next 静态导出，指纹见证据日志 |
| `node scripts/verify-canvas-audio-lora.js` | 6/6 | 深层/大小写/多权重、两端反证、旧格式、复制隔离、归档索引、真实SQLite反读 |
| `node scripts/verify-minimax-audio.js` | 6/6组 | 原音频构图、参考和队列参数契约 |
| `node scripts/verify-canvas-project.js` | 退出0 | 原画布工程、LoRA参数及拖动模型合同 |
| `CANVAS_GENERATION_SMOKE=1 CANVAS_AUDIO_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 18/18 | 原表单参数/节点隔离、请求、工程落盘、真实播放、取消、失败恢复、连线参考、上传、SQLite重开、归档还原、批量回填、深浅主题/窄窗、视频LoRA四权重多选确认 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 19/19 | 创作页共享表单、主模型、参考、批量、路由保活、时长、播放、1500/720px |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 149/149 | 原画布编辑/撤销/复制/连线、缩放、侧栏、媒体与工程交换；原音频占位模式断言改验真实音频表单 |
| `CANVAS_GENERATION_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 23/23 | 原图片生成、参考、取消、挂起与结果回填不受音频适配影响 |
| 冒烟规范、脚本引用检查 | 退出0 | 新入口仍遵守原harness与引用约束 |
| `pnpm check` | **退出1，既有阻塞** | 停在三个原未引用词条：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`；后续未执行步骤不算通过 |

环境变量写法为示意；PowerShell 使用 `$env:名称='1'`。不同专项使用独立命令环境；不能把音频开关带入原生成回归。

前轮 Meta 扫描旧注释误判及缺少真实 golden 语料的记录继续保留，本轮未修复或宣称通过。完整check不通过，没有进行GitHub提交、Review或主要分支合并。

过程中发现并修正：第一次节点位置被项目标题遮挡；SQLite配置白名单漏音频字段导致反读失败；版本选择器误定位外层按钮；重开尚未挂载节点就定位。失败诊断保留在各次 `logs/smoke-infinite-canvas-*`，没有放宽产品校验。截图检查还发现长表单在节点下裁切，改为复用原侧栏。最终结果只按表中通过运行统计。

## 证据分类和限制

- 自动事件：DOM点击/输入、Electron鼠标键盘、CDP真实磁盘File输入。实际加载生产静态页面、preload、SQLite、工程复制、归档和媒体解码；音频播放断言检查currentTime推进，不只检查按钮。
- 夹具：游客账号、外部推理服务回包、测试音频。LoRA扫描真实递归读取临时多层目录，但权重文件为占位内容，不能据此声称真实模型加载成功。创作页套件替换生成IPC回包，画布专项走真实本机HTTP传输，两者区别保留。
- 人工：本轮无人工验收。没有验证真实ComfyUI模型推理、GPU显存、音质、实体扬声器、Windows系统框手动操作。所有此前人工待验项继续待验。
- 性能：参考读取为当前请求持有File，最大500MiB仍可能占较多内存；没有大文件压力测试。批量逐项执行会增加总耗时，前项已落盘而后项失败时文件保留，不冒充整批成功。超大LoRA库的列表性能仍沿用原选择器，未做压力基准。播放器和音质不以固定WAV回包评价。
- 用户数据：只操作隔离临时目录，没有迁移、清理或覆盖用户真实工程/模型。

[最终截图与日志](runtime/canvas-audio-lora-2026-11-13/)

![画布原音频表单](runtime/canvas-audio-lora-2026-11-13/110-audio-node-dark.png)

![浅色窄窗和真实音频卡](runtime/canvas-audio-lora-2026-11-13/111-audio-node-light-narrow.png)

![同一原扩展选择器显示深层目录四个权重](runtime/canvas-audio-lora-2026-11-13/112-minimax-deep-lora-versions.png)

## 增量审计

以 `logs/canvas-audio-lora-baseline` 任务开始副本为基线；新增文件全文，已有文件仅本轮新增/替换最终行，旧工作区修改及删除行排除。28个有增量的源码/测试文件逐项列在[注释审计](canvas-audio-lora-comment-audit.json)。

纯有效注释逐条复核，类型JSDoc、单独定界符、空行不计，混合行计代码。业务 **37/(37+253)=12.76%**，测试 **9/(9+279)=3.12%**。低于20%–30%参考范围，增量主要是原组件接线、参数校验和直接行为断言；取消、实例隔离、依赖归档、真实/夹具边界已有说明，不为比例补废话。原长注释没有复制到每个适配层。

TypeScript AST定位本轮触及的普通函数和回调，按实际非空/非纯注释物理行复核，JSX展示装配排除；无超过30有效行普通函数。[函数审计](canvas-audio-lora-function-audit.json)。
