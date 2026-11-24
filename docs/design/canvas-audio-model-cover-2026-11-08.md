# 画布音频、导演台居中与模型封面修复

日期：2026-11-08。范围为本轮两个连续请求，保留工作区此前的导演台、画布和性能修改。

## 实现与复用

- 导演台场景节点的空态内容组水平、垂直居中，沿用 `SceneNodeContent`、原节点外壳和打开入口；不改场景数据和机位逻辑。
- 画布音频直接调用视频编辑器 `ClipWaveform`，通过 `presentation="player"`、源入点、窗口跨度和进度注入展示差异。时间线原调用不传新参数，保留原 16px 声音槽。
- 波形来自生产 `videoWaveform` 服务。实测发现旧服务调用 `probeVideo` 拒绝 WAV，现为波形内部增加仅检查第一条音轨与时长的探测；视频导入仍保留必须含视频流的原校验。
- 音频复用现有 `CanvasVideoControls` 的真实播放动作、事件快照、静音与定位回调。原 audio 继续负责解码，关闭原生 controls，换成对称波形、细播放线、中央播放按钮、时间和格式标签。
- 六秒窗口跟随真实源时间滚动，短文件完整显示；开始与结束限制在源范围内。暂停后窗口停止，不用计时器推进进度。采样失败和媒体解码失败分别保留错误。
- 播放互斥、换源、选择变化暂停与卸载清理由已有媒体会话负责。波形复用原有串行任务、限额缓存、取消和超时机制，不新增 IPC、上传或音频正文缓存。
- 模型选择共用 `ResourceSelectDialog`、`ResourceSelectionCard` 和 `ResourceCoverImage`。移除独立的版本展示草稿，封面与名称从真实待确认选择推导：单选显示所选项，多选取本组选择顺序中的首项，没有有效选择时取本组第一版。
- 默认预览不会自动勾选。主模型只能确认一项、LoRA 可以多项的业务限制仍由各自调用方负责；选项无封面时沿用已有缺图处理。

## 实际检查

| 命令/范围 | 结果 | 证据边界 |
| --- | --- | --- |
| `pnpm typecheck` | 通过 | 渲染与主进程类型；最终 `pnpm check` 也重新通过该阶段 |
| `pnpm lint` | 通过，0 error、35 条已有 warning | 包含最终渲染代码 |
| `pnpm --filter @illusion-realm/next build` | 通过 | 29 个静态路由，最终指纹 `4f13f4e0bfb01335d8b25486db082036761e2648dace67f75adf12ecce28b735` |
| `pnpm --filter @illusion-realm/electron check` | 通过 | 纯音频探测修改后执行，0 个 `@ts-nocheck` |
| `pnpm check:locale-keys` | 通过 | 20 个命名空间，新增音频操作名称双语一致 |
| `verify-i18n-values.mjs --base HEAD` | 通过 | 可疑 0，未批量改旧文案 |
| `electron scripts/smoke-create-layout.js --resource-selection-only` | 15/15 | 真实渲染组件，隔离模型/封面夹具；单选、多选顺序、取消首项、清空、重开和权重 |
| `electron scripts/smoke-minimax-workflow.js` | 169/169 | 第二个实际调用场景；主模型精确文件选择、重开、LoRA 及工作流参数回归；服务为本地夹具 |
| `electron scripts/smoke-infinite-canvas.js` | 118/118 | 真实 PNG、H.264 和九秒 PCM 文件，生产导入/本地协议/波形采样/保存恢复；自动输入事件 |
| `DIRECTOR_SMOKE=1 electron scripts/smoke-infinite-canvas.js` | 最终 26/26 | 空态内容真实几何居中、真实 WebGL、保存与恢复；首次动画像素断言失败，未改预期，单独复跑通过 |
| `VIDEO_FOCUS_HELPER=1 electron scripts/smoke-video-live-02.js` | 42/42 | 相关专项，非完整 LIVE 套件；真实 AAC 峰值、无音轨、取消、原片段波形尺寸和源区间 |
| `pnpm check` | **未全通过** | 类型与 Electron 模块通过，停在既有未引用词条门禁：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；后续检查未由该命令执行 |

Electron 回归串行运行，没有终止用户正在使用的应用。第一次封面专项因测试误用不存在的单选按钮、随后缺少完整套件初始化的输入节点引用而失败，修正测试前置后通过。第一次画布回归发现纯音频探测错误，修复后全套通过。失败日志均保留，未作为通过次数累计。

## 真实运行截图

- [导演台空态居中](runtime/canvas-audio-model-cover-2026-11-08/director-centered.png)
- [真实音频播放与滚动波形（深色）](runtime/canvas-audio-model-cover-2026-11-08/audio-waveform-dark.png)
- [同一真实素材与波形（浅色）](runtime/canvas-audio-model-cover-2026-11-08/audio-waveform-light.png)
- [单选第二版封面](runtime/canvas-audio-model-cover-2026-11-08/model-cover-single.png)
- [多选保持首选封面](runtime/canvas-audio-model-cover-2026-11-08/model-cover-multiple.png)

截图为静态构建在 Electron 内的实际运行画面。音频是 FFmpeg 生成的真实编码文件，封面为隔离测试图片；参考附件未覆盖到产品页面。

## 未验证和边界

- 未进行人工扬声器试听、人工系统文件框操作、资源管理器实体拖入、触控操作或系统缩放验收。
- 波形滚动由真实媒体事件更新，未额外启用每帧动画；极长音源仍需完整扫描后才能得到概览，长文件性能与全编码覆盖未验证。
- 波形为首条音轨的单声道振幅摘要，沿用视频编辑器的采样预算；不宣称声道分析、母带测量或音频编辑。
- 导演台动画像素断言出现一次波动，复跑通过仍保留该记录，不据此声称该用例完全无波动。
- 不新增模型生成、音频转码导出、媒体上传、混音或新的工程格式。

## 增量注释

按两个任务开始时的工作区快照统计新增/替换后的行，排除旧工作区修改、删除、空行和单独定界符；混合行仅记代码。统计文件与逐文件数据见 [注释审计](canvas-audio-model-cover-comment-audit-2026-11-08.json)。

业务和测试分开汇总，均超过 70%。有效说明包括“按排队取号而非货架位置展示首选封面”和“只查唱片目录卡，不要求纯音频含视频流”；同时说明了旧请求取消、暂停、真实文件证据与自动操作边界。
