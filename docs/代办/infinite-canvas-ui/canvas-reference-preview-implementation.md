# MiniMax 资源标记与提示词预览（2026-11-13）

## 行为与范围

| 当前任务资源 | 原稿别名示例 | 提交 / 预览 / 转换助手 |
| --- | --- | --- |
| 第一张图片 | `@image1`、`@picture1`、`@图1` | `<Picture 1>` |
| 第一个视频 | `@video1`、`@视频1` | `<Video 1>` |
| 第一份音频 | `@audio1`、`@音频1` | `<Slot 1>` |

图片、视频、音频各自编号。同类型素材的 UI 稳定编号允许断号，正式标记按当前实际上传顺序连续编号，名称不决定身份。删除后引用缺失会显示明确错误，提交与转换请求均拦截。手输官方标记也检查范围；旧 `<Audio N>` 草稿在转换时升级为 `<Slot N>`，再次转换保持不变。

画布图片、视频、音频面板在 ↑ 紧邻左侧提供“预览提示词”。使用原参数浮层，支持 Escape、外部点击关闭；只读显示当前提示词，不上传文件或发起生成。空稿提示先输入，错误显示原转换器信息。图片参数多时沿用 MiniMax 视频的换行布局，避免新增入口压盖原参数。

MiniMax 的右下角原转换助手发送官方标记，要求服务保留标记，回包再规范化、校验。撤销恢复原 `@` 草稿；历史保存实际发送与交付文本。等待期间文字或资源表改变时进入待确认，不自动覆盖；明确应用时仍检查当前资源。普通 SDXL、Anima、远端图片等未启用此预处理，继续原请求规则。

## 真实复用与数据边界

| 现有实现 | 本轮接入 |
| --- | --- |
| `utils/comfy/video-reference-media.ts` | 继续唯一三类标记转换与动态端口顺序；音频标签改为 Slot，兼容旧 Audio |
| `view/create/prompt-conversion-preview.tsx` | 新增纯正文展示形态，创作页保留原 details，画布直接调用相同正文 |
| `reference-ui/parameter-popover.tsx` | 直接承载预览；只补充无表单内容的键盘聚焦目标 |
| `ImageReferencePrompt`、`PromptInput`、`PromptAssistantToolbar` | 通过可选 prepare 传入 H3 规则，沿用原编辑、转换、冲突、历史与撤销 |
| `useCanvasPromptMedia` | 从原编辑适配器提取当前节点输入表，编辑与预览共用获取机制，各实例不串值 |
| `imagePromptMedia` | 创作图片编辑与正式 H3 builder 共用上传次序编号，不读取文件或创建 URL |

实际图片编辑 builder 已转换 `instruction`，不是仅改变预览。创作视频、Role TTS 继续原执行器。画布视频执行器仍未接通，生成箭头原禁用边界保留；其现有输入依旧只支持图片，未因复用转换器宣称新增视频/音频连接能力。创作页 H3 参考视频工作流本来支持三种资源，已验证混合输入。未改 IPC 产品契约、媒体归属、工程保存格式或资源清理策略。

预览不持有媒体字节；原编辑器、上传器和队列继续拥有文件及 URL 生命周期。浮层监听、尺寸观察与焦点由原壳负责卸载清理。异步转换返回后复核当前上下文、原文与资源表；局部请求 hook 只负责请求锁和 busy，保留原成功历史存储链。

## 实际验证

所有 Electron 冒烟串行执行，读取真实静态导出并检查源码指纹。最终源码指纹为 `53e0b1aa5358c8df4db8b221a35b40b7519bdbff9a5f93e2d51fcd90b975df90`，1135 个输入。记录在[运行证据](runtime/canvas-reference-preview-2026-11-13/)。

| 命令 / 场景 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0；最终静态构建内 TypeScript 同样通过 |
| `pnpm lint` | 退出 0，0 错误 / 37 条原有警告 |
| `pnpm --filter @illusion-realm/next build` | 退出 0 |
| `node scripts/verify-minimax-audio.js` | 6/6 组；三类标记、稀疏编号、旧 Audio、重复转换、越界与实际音频工作流 |
| `node scripts/verify-canvas-generation.js` | 221 项；新增 H3 多图提示词及缺失引用反证 |
| `CANVAS_PROMPT_SMOKE=1` + `pnpm exec electron scripts/smoke-infinite-canvas.js` | 最终 24/24；三类节点预览、助手输入、原稿撤销、缺失引用、迟到结果、深浅主题、窄窗、参数不压盖 |
| `CANVAS_GENERATION_SMOKE=1 CANVAS_AUDIO_SMOKE=1` + 同一画布脚本 | 27/27；上传后实际音频图包含 `<Slot 1>`，工程内写盘、播放、取消、恢复与 LoRA 保持通过 |
| `pnpm exec electron scripts/smoke-minimax-workflow.js` | 最终 172/172；混合图片/视频/音频预览、转换助手、正式上传及图字段；删中间素材重编号 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 19/19；原创作音频、引用预览、生成与真实 WAV 解码播放 |
| `CANVAS_GENERATION_SMOKE=1 MINIMAX_IMAGE_EDIT_SMOKE=1` + 画布脚本 | 15/15；三张图实际上传，最终图正文为 `Edit <Picture 1> using <Picture 2> and <Picture 3>`，原创建表单和结果保存保持通过 |
| `pnpm exec electron scripts/smoke-prompt-assistant.js` | 78/78；普通转换、原稿冲突、撤销、历史、供应商、凭据和卸载回归 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js`（不设专项变量） | 149/149；选择、拖动、连接、复制删除、撤销、公共参数、深浅主题、窄窗、真实媒体与保存恢复 |
| 语言键、硬编码基线、英文基线、`verify-i18n-values --base HEAD` | 分别退出 0，未新增硬编码 UI 文案 |
| `check-smoke-rules.js`、`check-script-refs.js` | 退出 0 |
| `pnpm check` | 退出 1，仍停于原三个未引用词条：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` |

PowerShell 中分别设置上表环境变量后执行，不能将类 Unix 的前缀写法直接粘贴到 PowerShell。完整检查在词条门禁后未执行的步骤不算通过；此前 Meta、真实 GPU 与人工待验继续保留。

首次预览专项在重载工程后未等目标节点挂载就注入鼠标，测试选择器报错；补充节点等待后 21/21 通过。截图复核发现图片参数压盖，改为沿用原换行规则。加入窄窗平移检查后一次失败：主题扩散遮罩尚未结束，消费了自动拖动；补充可观察的主题完成前提后最终 24/24。原失败日志、旧成功日志均保留，不改产品拖动规则、不放宽断言。视频原套件先 169/169，接通新增混合转换断言后最终 172/172。

自动事件包括 DOM 点击/输入、Electron 鼠标/键盘与 CDP 媒体输入。画布专项转换服务使用明确的 IPC 替身，视频混合转换同样如此；旧助手套件使用生产主进程及受控 HTTP 服务。ComfyUI 生成响应为本机 HTTP 夹具，素材读取、preload、工程复制、SQLite、字节落盘与媒体解码执行生产实现。未进行人工操作验收、真实模型推理、音质或画质评估。

## 截图与性能限制

![深色图片节点：↑ 左侧预览与参数换行](runtime/canvas-reference-preview-2026-11-13/120-image-prompt-preview-dark.png)

![浅色窄窗音频：原稿 @audio1 与 Slot 预览](runtime/canvas-reference-preview-2026-11-13/122-audio-prompt-preview-light-narrow.png)

转换仅遍历当前任务引用表，不扫描图库、不解码媒体、不缓存跨节点结果。输入与预览使用同一获取 hook 的独立订阅，代价随当前引用数量和提示词长度增长；尚未进行超大资源表或长稿压力测试。浮层仍处于原画布世界坐标，视口平移与缩放沿用现有规则，未另建全窗口预览服务。

## 增量审计

基线为 `logs/canvas-reference-preview-baseline`，保留任务前已有工作区修改。新增文件计全文，修改文件只计本轮新增与替换后的最终行，不计删除和未变上下文；混合注释行计代码，空行、定界符不计，按语法候选逐条复核有效说明。

业务 **31/(31+122)=20.26%**；测试 **14/(14+151)=8.48%**。测试以已有脚本接线、标记期望调整和直接行为断言为主，共同 mock 与自动事件边界集中说明；低于 20%–30% 参考，不为比例补重复注释。[逐文件统计](canvas-reference-preview-comment-audit.json) · [函数审计](canvas-reference-preview-function-audit.json)。本轮触及的普通逻辑、事件及测试函数不超过 30 个有效物理行；页面 JSX 装配单独记录。未进行 GitHub 提交或合并。
