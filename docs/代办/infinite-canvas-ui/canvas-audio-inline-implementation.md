# 画布音频统一输入与生成入口（2026-11-13）

## 本轮结果

按用户图2，将音频提示词和生成操作放回节点下方的原输入面板。删除侧栏内重复的提示词标题、输入、转换预览、音频载入块和底部生成区；侧栏保留主模型、扩展、模型加载、时长、步数及种子。参考音频改用节点输入区原有的加号与附件壳。

音频与图片实际调用同一个 `PromptGenerationPanel`，同一个 `CanvasVideoPrompt → ImageReferencePrompt`、`PromptTools`、批量浮层和 ↑ 按钮。点击 ↑ 或 Shift+Enter 均提交当前节点；空白提示词和忙碌时禁用。去掉音频原无业务的音色、音乐、录音等占位。音频未获得图片比例、画质、超分设置。

## 复用和数据边界

| 位置 | 实际改动 |
| --- | --- |
| `view/create/audio-generation-form.tsx` | 原组件新增 `settings` 展示形态；默认完整表单不变。设置形态不挂载正文、附件和生成区，表单 Enter 不触发生成 |
| `view/infinite-canvas/canvas-audio-panel.tsx` | 仅适配节点的模型与采样参数，直接使用原音频表单的设置形态 |
| `view/infinite-canvas/reference-ui/generation-panel.tsx` | 音频不再使用独立设置胶囊替代输入，接入原提示词面板、批量和统一箭头 |
| `canvas-video-prompt.tsx` | 同一引用编辑器按媒体类型注入音频候选；保留引用列表的稳定身份，输入不会反复重建候选 |
| `canvas-reference-inputs.tsx` | 原加号、附件结构适配单音频参考；手导项可移除，连线项仍通过原连线菜单断开 |
| `canvas-audio-parameters.ts` | 收窄参考查询的输入类型，不改实际编号或校验规则 |
| `canvas-node.tsx`、`infinite-canvas-page.tsx` | 提交回调回到节点面板；侧栏移除提交、导入回调 |
| `reference-ui/canvas-theme.css` | 音频使用与图片、视频同一内容高度规则 |
| `scripts/lib/check-canvas-audio.js` | 用正式新入口验证提示词、生成、参考、批量、存储及恢复 |
| `scripts/lib/check-canvas-media.js` | 导出原文件选择辅助方法供音频回归复用，不复制一套选择器拦截 |

表中业务文件均位于 `apps/next/src/`。没有新增音频表单、请求队列、IPC、数据库字段或保存规则；任务继续使用上一轮 MiniMax 音频队列与工程 `Audio/` 目录。批量读本节点 `audioParameters.count`，不改变创作页数量或草稿。媒体播放、取消和卸载清理沿用现有实现。

## 实际验证

最终静态构建指纹：`66c7fa3896d4cd630a044614fb85af9a2154bba76f35556e460e69d52ce8df5a`，1131 个输入。

| 命令或场景 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出0 |
| `pnpm lint` | 退出0；0错误、37项既有警告，本轮新增警告已消除 |
| `pnpm verify` | 退出0 |
| `pnpm --filter @illusion-realm/next build` | 退出0，生成最新静态导出 |
| `node scripts/verify-canvas-audio-lora.js` | 6/6 |
| `node scripts/verify-minimax-audio.js` | 6/6组 |
| `CANVAS_GENERATION_SMOKE=1 CANVAS_AUDIO_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 最终22/22，退出0 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 原创作音频19/19，退出0 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 原完整画布149/149，退出0 |
| `CANVAS_GENERATION_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 原生成23/23，退出0 |
| `pnpm check` | 退出1，仍被原有三个未引用词条阻塞：`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` |

环境变量写法为示意；PowerShell 使用 `$env:名称='1'`。所有 Electron 检查串行运行，未关闭或接管用户现有应用。完整 check 停止后的检查不称作通过；前轮 Meta 误判、golden 语料缺失及人工待验记录继续保留。

22项覆盖空输入禁用、设置表单不可误提交、节点独立参数、侧栏无重复控件、Shift+Enter、箭头生成、停止、服务失败恢复、连线参考上传与官方 Audio 标记、深浅主题、窄窗滚动和镜头平移后完整可达、手导参考、SQLite重开、归档字节还原、批量两卡及视频原扩展选择。

首轮19项、第二轮21项通过；随后补充窄窗实际平移后的按钮可达性，最终22项通过。截图中节点贴近画布边缘造成的裁切，通过移动测试节点及真实镜头平移补齐证据，没有修改公共画布坐标或缩小字体来隐藏问题。

## 证据类别与限制

- 自动事件：DOM点击与输入、Electron鼠标和键盘注入、CDP提供真实磁盘File。正式静态页面、preload、SQLite、工程复制、归档和媒体解码实际执行，播放检查包含时间推进。
- 夹具：游客账号、HTTP生成回包、短WAV和LoRA权重占位内容；未运行真实模型推理。不能把自动事件或夹具结果称为人工操作、真实音质和真实权重加载验证。
- 人工：本轮无人工验收；此前人工待验全部保留。实体系统框、输入法、触控板、扬声器和实际GPU推理仍未验。
- 性能：没有新增全局时钟或播放器；参考只订阅当前上游数据。未做大文件和超大模型库压力测试，单参考读入File的内存限制、批量逐项请求耗时沿用上一轮记录。
- 布局：面板仍随节点处于世界坐标，适配全部只计算卡片；窄窗可平移画布完整查看输入，此行为已用真实鼠标事件验证，没有另建浮动坐标体系。

## 截图

![深色节点原输入组件](runtime/canvas-audio-inline-2026-11-13/110-audio-node-dark-inline.png)

![参数侧栏无重复正文与生成](runtime/canvas-audio-inline-2026-11-13/110-audio-node-dark-settings.png)

![浅色窄窗平移后可见完整输入和箭头](runtime/canvas-audio-inline-2026-11-13/111-audio-node-light-narrow-inline.png)

完整日志见 [本轮证据目录](runtime/canvas-audio-inline-2026-11-13/)。截图来自幻域实际静态页面，不是独立HTML样板。

## 增量注释与函数检查

以 `logs/canvas-audio-inline-baseline` 的本轮开始快照统计，排除旧工作区修改、删除行和未变上下文。仅统计最终新增/替换物理行；有效纯注释计C，混合行计B，空行和单独注释定界符不计。逐项复核注释用途、参数边界和测试类别后，业务 **16/(16+41)=28.07%**，测试 **5/(5+52)=8.77%**。测试低于20%–30%参考，增量主要为原选择器迁移和直接断言；已说明正式入口、键盘注入与镜头平移，不为比例添加重复说明。

[逐文件注释统计](canvas-audio-inline-comment-audit.json) · [函数检查](canvas-audio-inline-function-audit.json)。按AST定位后复核本轮触及的普通函数和回调，无超过30有效物理行；JSX展示装配不机械限制。本轮未提交或合并GitHub。
