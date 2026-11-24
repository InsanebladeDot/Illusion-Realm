# 音频节点紧凑参数调整（2026-11-13）

## 结果与复用

本轮替代上一轮画布音频的批量入口。音频固定生成一份，移除批量与数量菜单；旧工程的 `audioParameters.count` 保留格式兼容，但执行器不再据此连续请求。创作页原有批量能力保持原规则。

节点底部显示 MiniMax H3、秒数、“参数”和 ↑。点击“参数”打开原侧栏，直接复用创作页 `AudioGenerationForm` 的设置形态，保留主模型、扩展、加载设置、步数和种子，移除侧栏中的时长控件及工作流秒数摘要。

秒数直接调用现有 `VideoNumberPicker → ParameterPopover → SegmentedControl`，提供2、5、10及自定义，摘要使用一位小数秒。时长仍保存为本节点的 `audioParameters.durationSeconds`，实际请求读取该值。没有配置时从对应原模板读取默认秒数：无参考4秒、有参考5秒。

正文复用原 `ImageReferencePrompt`，仅音频形态将高度从160px减为80px；长文本内部滚动，助手保留原位置。图片、视频和创作页的输入高度不受影响。没有增加未接通的音色、音乐或录音服务。

实际修改：

| 文件（相对仓库根） | 职责 |
| --- | --- |
| `apps/next/src/view/infinite-canvas/canvas-audio-controls.tsx` | 原模型胶囊、秒数浮层和参数按钮的音频组合；按上游引用读取模板默认值 |
| `apps/next/src/view/infinite-canvas/reference-ui/generation-panel.tsx` | 挂载音频组合，音频移除批量，保留统一箭头与快捷提交 |
| `apps/next/src/view/infinite-canvas/reference-ui/canvas-theme.css` | 音频正文80px，使用原主题和内部滚动 |
| `apps/next/src/view/create/audio-generation-form.tsx` | 设置形态不再显示时长；默认完整表单保留原控件 |
| `apps/next/src/view/infinite-canvas/canvas-audio-job.ts` | 固定入队一次，保持取消、保存和回填边界 |
| `scripts/lib/check-canvas-audio.js` | 验证半高、长文本、秒数选择、取消、实际请求时长与旧批量兼容 |

## 实际验证

静态指纹 `ea3f4c0b98e56588f06a50164c7fbc2f0511d2adcc9cd472e237123b949a0ba7`，1132个输入。Electron冒烟均串行，使用新静态导出与隔离临时工程。

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出0 |
| `pnpm lint` | 退出0，0错误/37既有警告 |
| `pnpm --filter @illusion-realm/next build` | 退出0 |
| `node scripts/verify-canvas-audio-lora.js` | 6/6 |
| `node scripts/verify-minimax-audio.js` | 6/6组 |
| `CANVAS_GENERATION_SMOKE=1 CANVAS_AUDIO_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 最终27/27，退出0 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 原创作音频19/19，退出0 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 单独重跑149/149，退出0；首次入口失败记录保留 |
| `node scripts/check-smoke-rules.js`、`node scripts/check-script-refs.js` | 退出0 |
| `pnpm check` | 退出1，仍停于原三个未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` |

环境变量写法为示意，PowerShell使用 `$env:名称='1'`。完整检查停止后的步骤不计通过；前轮Meta与人工待验记录继续保留。

关键行为包括：80px实际计算高度、长正文滚动、无批量菜单、2秒预设、自定义2.5秒、Escape取消3.5秒草稿、侧栏无重复时长、最终请求含2.5秒、节点参数隔离、连线参考默认5秒、单次上传与官方引用标记、取消和失败恢复、SQLite及归档重开。旧 `count=6` 的工程实际只发送一个请求、保留一个结果节点。

首轮专项中三条关联断言失败：复用测试的 `fill` 会主动失焦并确认数值，导致测试在按Escape前已提交3.5秒。改用保持焦点的输入事件后验证取消，未修改产品规则或放宽断言。原失败日志保留。

完整画布首次等待新建表单超时，截图显示更新公告遮挡工程库入口；没有出现本轮音频页面或执行音频代码。确认无测试残留进程后单独重跑一次，149/149通过。入口竞态仍是测试限制，没有借本轮修改公告或工程库业务。

## 证据与限制

自动事件包括DOM点击/输入、Electron键盘和鼠标、CDP真实文件输入；正式preload、SQLite、工程复制、归档和媒体解码实际执行，播放验证时间推进。账号、HTTP模型回包、短WAV和LoRA权重内容使用夹具，不是人工操作或真实模型推理。真实GPU生成、音质、扬声器、系统文件框和此前人工待验继续未验。

秒数仍受原工作流0.1–60秒执行校验；数字浮层只负责输入，不扩大服务能力。没有大文件或大模型库压力测试。正文减小不改变引用文件的读入内存；世界坐标面板仍通过原画布平移查看，窄窗可达性已验证。

[截图与完整日志](runtime/canvas-audio-compact-2026-11-13/)

![音频无批量、半高输入和秒数参数](runtime/canvas-audio-compact-2026-11-13/110-audio-node-dark-inline.png)

![浅色窄窗](runtime/canvas-audio-compact-2026-11-13/111-audio-node-light-narrow-inline.png)

## 增量审计

基线为 `logs/canvas-audio-compact-baseline`，新增文件全文、修改文件仅本轮新增及替换最终行，排除删除行及已有工作区修改。按语法识别注释后复核有效内容，混合行计代码、空行和定界符不计。业务 **8/(8+33)=19.51%**，测试 **4/(4+37)=9.76%**；主要为复用接线、直接断言与旧批量兼容，必要边界已有说明，不为20%–30%参考补重复注释。

[逐文件注释审计](canvas-audio-compact-comment-audit.json) · [函数审计](canvas-audio-compact-function-audit.json)。本轮触及的普通逻辑及测试函数无超过30有效物理行，JSX装配另计。未进行GitHub提交或合并。
