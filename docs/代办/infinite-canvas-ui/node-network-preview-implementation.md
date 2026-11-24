# 节点网预览与超分卡片（2026-11-13）

双击节点正文打开节点网预览，首先显示被双击节点。底部列出沿连线双向可达的全部节点，包括间接上下游和分支；没有连线的节点只预览自己。这里的“同一张网”按连接关系判断，不按类型、名称或选中集合判断。返回顺序沿用工程节点顺序，不改变生成依赖方向。

## 交互与复用

- 大图、元信息、左右切换、底部缩略条、定位与关闭按参考图组织；完整适配图片和视频，不裁掉内容。深浅主题使用原画布变量。
- 正文双击进入预览；标题双击仍重命名，媒体按钮和输入框保留原操作。文字及便签通过原文字编辑动作继续修改。
- 图片、视频、音频直接复用 `CanvasMediaPreview` 和现有播放、波形、定位、截帧组件；文字显示真实内容，场景显示已有取景图。没有结果的节点显示空态，不用参数或样例冒充媒体。场景三维内容和合成工程不在此新增实时渲染器。
- 外壳复用 `CanvasOverlay` 的主区定位、焦点循环和返回；预览期间隔离背景编辑快捷键。Escape关闭，左右键切换，Tab仍在浮层内。
- 打开先暂停底层媒体，切换或关闭时卸载旧会话，暂停、移除src并释放读取任务；不会修改文件、节点位置、连线、保存数据或撤销历史。缓存就绪状态通过读取真实readyState补齐，不派发假成功事件。
- 超分节点改成卡内左上固定 `SeedVR2 7B ×2`，下方预览，底部“一键启用”。删除旧卡下配置面板、下拉和重复开关；只有点击才提交，旧enabled/scale不改变固定配置，重开不自动运行。仍走原执行队列、取消和工程目录保存。
- 普通图片的超分开关放在画质右侧，复用 `UpscaleOptions` 的紧凑形态和原开关；创作页仍使用原完整配置。

## 文件职责

| 文件 | 本次职责 |
| --- | --- |
| `canvas-network.ts` | O(V+E)队列遍历连通分量，忽略失效端点，不递归、不修改工程 |
| `canvas-network-preview.tsx` / `.module.css` | 主预览、只读切换、底部缩略条、键盘、主题与媒体卸载 |
| `infinite-canvas-page.tsx` | 正式React Flow双击入口、原浮层装配、定位和返回焦点 |
| `canvas-media.tsx` / `.css` | 原播放器增加可选完整适配、解码尺寸回调和就绪快照 |
| `canvas-node.tsx` / `reference-ui/node-components.tsx` | 卡内超分装配、正文双击预览与便签原编辑入口 |
| `reference-ui/upscale-panel.tsx` / `generation-panel.tsx` | 卡内固定超分信息、原图片画质旁开关 |
| `components/create/upscale-options.tsx` / `canvas-upscale-job.ts` | 公共紧凑布局、独立节点显式固定×2提交 |
| `canvas.module.css` / 双语`canvas.ts` | 卡内布局与中英文可见文案 |
| `verify-canvas-network.js` / `lib/check-canvas-network.js` | 生产遍历纯检查、正式页面自动双击/媒体/键盘回归 |
| `lib/check-seedvr2.js` / `smoke-infinite-canvas.js` | 适配卡内按钮及独立专项入口，保持串行Electron运行 |

## 验证与证据边界

最终源码静态构建指纹：`d8cf92b935fddbcf34c3463859d644434d6d6d7ab3274d50e7fab610ef2d6bf9`，1115个输入。

类型检查、完整lint（0错误、37既有警告）、末次受影响文件lint、静态构建通过。生产遍历检查覆盖双向、间接分支、环、孤立、断线、失效端点、原对象不变及2000节点链。语言键、中文基线、英文基线、脚本引用和冒烟规则通过。

Electron各专项结果、截图及增量审计在本记录末尾列出。均为自动事件，使用正式静态页面；文件、SQLite和本地媒体解码真实执行。超分专项中的任务接口返回固定图片/视频，是HTTP替身，不代表真实SeedVR2推理或画质验证。

重新执行 `pnpm check` 退出1：类型与Electron模块检查通过后，门禁被既有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 阻断；后续不宣称自动全部通过。单独Meta检查仍退出1，原因是未修改的 `MetaFieldRow.tsx` 中文注释被当作字段文案；真实语料缺失，golden baseline未验。未扩大范围修这些问题。

早期失败日志保留：首次公告遮住卡片；缓存媒体实际有帧但内部就绪未同步；测试使用错误的Electron方向键名；关闭返回目标未明确；窄窗口亚像素比较；新增音频测试使用不合法连线；改窗口、适配镜头及主题波纹尚未结束就双击。分别修正对应生产边界或测试前提后验证，未用放宽连接规则或伪造媒体事件换取通过。

人工交互、系统DPI、安装包、真实GPU超分、复杂编码和大工程长期压力未验证。此前UI-08等人工待验项保持原状态。媒体就绪/失败沿用原15秒有界等待；大网的遍历为线性开销，缩略条仍挂载所有条目的DOM，图片懒加载，视频仅为可见缩略项解码，不宣称已经完成列表虚拟化或大量视频性能验收。

## 增量审计

以本轮首次修改前逐文件快照为基线，保留工作区已有修改；新增文件统计全文，旧文件仅计本轮新增和替换行。扫描候选逐条复核；空行、定界符和未变更历史注释不计，混合行只算代码。普通新增逻辑函数≤30有效物理行；AST报告中的长函数为既有页面/展示装配，未为行数创建空包装。

本轮注释率低于20%–30%参考，也未达到粘贴规则中的历史70%阈值；必要说明已覆盖网络边界、只读性、媒体释放、缓存事件、测试替身与异步几何等待，没有为比例补重复注释。精确统计与逐文件范围见同目录审计JSON。

业务增量 **19/(19+200)=8.68%**；测试增量 **9/(9+155)=5.49%**。[逐文件注释审计](node-network-preview-comment-audit.json) · [函数候选审计](node-network-preview-function-audit.json)。统计包含本轮超分UI调整；不把整个脏工作区当成本轮改动。

## 最终运行结果

| 命令/专项环境 | 实际结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | 退出0 | `canvas-network-typecheck-final.log` |
| `pnpm lint`、受影响文件ESLint | 退出0；全量37警告，末次受影响文件0错误0警告 | `canvas-network-lint-final.log`、`canvas-network-lint-affected.log` |
| `pnpm --filter @illusion-realm/next build` | 退出0；Next静态导出，不是安装器构建 | `canvas-network-build-final.log` |
| `node scripts/verify-canvas-network.js` | 退出0；生产遍历反例及长链通过 | `canvas-network-pure.log` |
| `CANVAS_NETWORK_SMOKE=1` | **14/14，退出0** | `canvas-network-smoke-final.log` |
| 无专项环境的原画布回归 | **149/149，退出0** | `canvas-network-canvas-final.log` |
| `CANVAS_GENERATION_SMOKE=1`、`SEEDVR2_SMOKE=1` | **25/25，退出0**；含原创作页复用回归 | `upscale-card-smoke-final.log` |
| `pnpm check` | 退出1；三条既有词条门禁 | `canvas-network-check.log` |
| `pnpm check:meta` | 退出1；原字段注释误判、真实golden语料缺失 | `canvas-network-meta.log` |
| `check:locale-keys`、`check:i18n`、`check:i18n:en`、`check:refs`、`check:smoke` | 单独运行退出0 | 对应同名前缀日志 |

Electron冒烟入口均为 `pnpm exec electron scripts/smoke-infinite-canvas.js`；每个专项独立启动，最终三个专项串行执行，不将独立计数相加成一次验收。摘要另由既有harness追加到 `logs/smoke-runs.log`。本轮未打包安装器、未提交或上传GitHub。

日志和截图集中在 [本轮证据目录](runtime/node-network-2026-11-13/)。窗口截图使用真实本地媒体测试素材，深色1600×913、浅色窄窗口960×721，未用参考图冒充实现。

![正式节点网视频预览](runtime/node-network-2026-11-13/100-network-video-dark.png)

![浅色窄窗口节点网图片预览](runtime/node-network-2026-11-13/101-network-image-light-narrow.png)

![独立超分卡内模型与启用按钮](runtime/node-network-2026-11-13/96-upscale-card-idle-dark.png)

![普通图片画质右侧的超分开关](runtime/node-network-2026-11-13/98-upscale-inline-quality-dark.png)

状态：本轮功能自动专项完成；人工、真实推理及上述全仓检查失败继续单独列示，不标记全部验收通过。
