# 独立对比图像节点（2026-11-13）

## 使用方式与边界

画布空白处右键 → **图像 → 对比图像**。图片节点右键也有相同入口，自动接入当前图片；普通添加菜单和图片拉线菜单同样提供对比图像。视频拉线不提供图片对比。

普通两张图片按接线先后分配：第一张为原图、第二张为处理图。接入图片超分节点时，无论接线顺序，超分输出固定为处理图；只接超分节点也会沿它的一层输入找到原图。不遍历整张网猜测来源，不因选中、移动改变左右身份。

两图在同一视口按完整画面适配，**上层原图、下层处理图，左原图｜右处理图**。默认分界在50%；拖线只改变原图的裁切范围，图片位置与尺寸不跟随鼠标改变。先读原图，结果真实解码就绪后才显示对比线；结果未生成时保留原图，失败时保留原图并提供重试，不用旧图冒充成功。原图自身读取失败沿用既有媒体错误与重试。

分界线支持鼠标、触摸指针和键盘：左右键每次2%，Shift每次10%，Home/End到两端。拖动取消恢复抓取时比例；卡内拖动时Escape取消。节点网预览沿用其Escape关闭行为，方向键在分界线上调整比例，不切换节点。分界比例是各显示实例的临时查看状态，不写工程、不消耗撤销。

这是只读对比节点，不提交生成任务、不输出新图片、不改变原图文件。两图比例相同时完整对齐；不同比例各自contain，不提供像素注册、自由缩放、差异热图或视频对比。

## 复用与实际改动

| 入口或机制 | 实际复用与本轮差异 |
| --- | --- |
| 节点外壳、选择、移动、尺寸、复制/删除与历史 | 原CanvasNode/CanvasNodeCard、reducer和React Flow；新增`CanvasAddKind: compare`，落盘仍为`kind: image, mode: compare` |
| 右键 | 公共CascadeMenu，增加图像子菜单；从级联菜单进入原添加列表时保留右键落点，避免节点全部重叠到顶部 |
| 媒体生命周期 | 原CanvasMediaPreview，增加可选的真实loading/ready/error通知；保留15秒超时、重试、localfile协议与原清理 |
| 对比显示 | CanvasCompareNode解析直接输入，CanvasImageCompare负责叠放和分界；卡片及节点网大预览引用同一个组件 |
| 输入规则 | 原connectionError拒绝第三张图、非图片来源与对比输出；不取消原自连、重复和循环检查 |
| 保存与恢复 | 原SQLite文档、工程JSON和连线；无新IPC、数据库字段或媒体副本。shared与主进程同步限制compare只属于image，主进程校验连线约束 |
| 主题与语言 | 原画布语义变量、CanvasChip与中英文词条；未新建配色或菜单组件 |

新业务文件：`canvas-compare-sources.ts`、`canvas-compare-node.tsx`、`canvas-image-compare.tsx`、`canvas-image-compare.module.css`，均位于`apps/next/src/view/infinite-canvas/`。其余为既有菜单、卡片、网预览、媒体、输入、创建/生成边界及两端校验的局部接入。生成守卫明确拒绝compare，不把隐藏按钮当作唯一保护。

只订阅直接输入以及超分的一层原图输入；拖动分界不写Zustand工程快照。每个打开的对比实例仍有两张原生图片的解码/纹理开销，大图可能占用较多内存；未增加全图像素缓冲、Base64副本或后台推理。未做超大图、百节点或长期压力验收。

## 验证与证据

验证针对正式Next静态导出，Electron专项串行运行。自动鼠标/键盘和DOM事件均归自动验证，不算人工操作。专项使用真实PNG文件、localfile读取、SQLite保存、重开及capturePage像素检查；蓝原图/红处理图用于清楚验证左右来源，红图是本地生成的测试PNG，**不是AI超分结果或画质证据**。

最终同一构建指纹为`4304ba83bec5f96e2024d60610b32a5f7155aa8eb6217e7c5b63bc9206a090dd`（1119输入）。结果如下，逐项日志见[证据目录](runtime/image-compare-2026-11-13/)：

| 实际命令或专项 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm typecheck` | 退出0 | `compare-node-typecheck.log` |
| `pnpm lint`、受影响文件ESLint | 退出0；完整lint为0错误37既有警告，受影响文件0警告 | `compare-node-lint.log`、`compare-node-lint-affected.log` |
| `pnpm --filter @illusion-realm/next build` | 退出0，静态导出，不是安装器构建 | `compare-node-build.log` |
| `node scripts/verify-canvas-compare.js` | 退出0，源角色、待生成、只读与非法输入反例 | `compare-node-pure.log` |
| `node scripts/verify-canvas-project.js` | 退出0，生产两端格式及原工程回归 | `compare-node-project.log` |
| `CANVAS_COMPARE_SMOKE=1` | 15/15，退出0 | `compare-node-smoke.log` |
| 原画布，无专项环境 | 149/149，退出0 | `compare-node-canvas.log` |
| `CANVAS_NETWORK_SMOKE=1` | 14/14，退出0 | `compare-node-network.log` |
| `CANVAS_GENERATION_SMOKE=1` + `SEEDVR2_SMOKE=1` | 25/25，退出0 | `compare-node-upscale.log` |
| `CANVAS_CONNECT_RATIO_SMOKE=1` | 27/27，退出0 | `compare-node-connect-ratio.log` |
| `pnpm check` | 最终再跑退出1，既有词条门禁 | `compare-node-check-final.log` |
| `pnpm check:meta` | 退出1，既有字段检测；真实语料未验 | `compare-node-meta.log` |
| `check:locale-keys`、`check:i18n`、`check:i18n:en`、`check:refs`、`check:smoke` | 单独运行退出0 | 相应前缀日志 |

Electron各专项入口均为`pnpm exec electron scripts/smoke-infinite-canvas.js`，环境变量只选择场景，仍验证静态构建新鲜度和失败退出码。纯检查使用生产TS转译与真实主进程校验，虚构路径只验形状；Electron才验证实际文件和解码。超分回归沿用HTTP固定媒体替身，未运行真实SeedVR2。未提交、上传或合并GitHub。

保留了修复前失败：Electron移动夹具漏掉按住标记；原测试仍等待旧右键入口；级联“添加节点”重置右键落点造成真实重叠（已修）；覆盖已解码文件不能可靠制造失败，改用真实缺失的新路径；offscreen窗口innerWidth先于ResizeObserver更新，等待尺寸稳定后适配并断言节点可见。未用放宽业务断言、伪造就绪事件或反复重试隐藏失败。

`pnpm check`实际重跑仍退出1，门禁被`auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`三条既有未使用词条阻断。单跑Meta仍因未改动的MetaFieldRow.tsx注释检测退出1，真实golden语料缺失。与本轮无关，未顺手改写这些功能或基线。

人工拖动手感、触屏实体操作、屏幕阅读器、系统DPI、真实AI超分画质、大图压力和安装包未验证。此前UI-08等人工待验继续保留，不改为通过。状态为**本轮自动验收完成，人工项待验；全仓检查仍有上述失败**。

## 增量审计

基线为本轮修改前`logs/compare-node-baseline/`逐文件快照，新增文件计全文，修改文件只计新增及替换后的行，保留其他脏修改。拖线脚本只替换一条菜单期望，基线由已读原行反向还原，未将原脚本全文算成本轮新增。注释候选逐条核对，空行、装饰/定界符、纯类型JSDoc不计有效注释；混合行计代码。业务**17/(17+135)=11.18%**、测试**12/(12+189)=5.97%**，逐文件结果见同目录`image-compare-comment-audit.json`。必要说明已覆盖输入角色、只读性、解码、换源、分界换算与测试边界，低于20%–30%参考，也未达到用户粘贴规则中的70%；未为比例补重复注释。

新增普通逻辑函数不超过30有效物理行。AST列出的长函数为页面/媒体/卡片/对比展示装配，按展示例外处理；新增专项分发从原30行边界拆为独立的预览专项选择，未压行规避。详见`image-compare-function-audit.json`。

![正式深色画布：左原图、右处理图](runtime/image-compare-2026-11-13/110-compare-dark.png)

![浅色窄窗口：同一节点和分界线](runtime/image-compare-2026-11-13/111-compare-light-narrow.png)
