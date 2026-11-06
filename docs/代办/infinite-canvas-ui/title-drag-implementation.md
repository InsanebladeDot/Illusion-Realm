# 画布名称显示与拖动更新优化

日期：2026-11-06。范围仅 `/canvas` 名称显示、移动路径的计算与渲染更新；保留开始前全部工作区修改。

## 原因与修复

名称已写进工程，但项目头仍固定210px，新增的打开、导出、保存和重载图标挤掉了名字。沿用 `ProjectHeader`，改为内容决定宽度、受实际宿主限制；图标不收缩，名称区域可收缩且最多200px。保留省略、完整 title、原按钮交互和主题，不修改工程名称数据。

拖动时存在三处额外负担：reducer 每项再 find 原节点，产生平方级查找并重建全部节点；保存签名逐帧序列化整图；宿主重新创建动作对象，Context 通知全部卡片。修复使用真实 React Flow `applyNodeChanges` 保留未动节点引用；松手比较改为 Map；持久化签名缓存起手快照，松手再读取实际节点；动作 Provider 使用稳定转发器，提交后更新最新回调；卡片 memo 只比较实际读取的 id、data、selected，位置绘制继续归 React Flow 外壳。

这像移动一张便签时，只改它的摆放位置，不让所有便签重抄正文。不是停止画布更新：参数、选择、主题和各播放器内部状态仍可正常刷新。没有声称已用浏览器性能录制证明全部卡顿都来自 DOM，也没有测得固定 FPS。

## 复用与边界

继续复用 `ProjectHeader`、`CanvasNode`、`GenerationPanel`、React Flow 和原 reducer/历史/保存入口。名字、内容、选中态与动作仍通过原参数和回调注入；不新增拖动引擎、节点业务副本或存储格式。

稳定的 Context 仅转发动作，不搬入全局状态；每个 Provider 自有 ref，多画布数据不会因同一组件共享。多实例同时挂载 A/B 尚未实测；同图副本、跨媒体模式和原参数隔离已由运行回归覆盖。

## 实际验证

| 检查 | 结果 | 记录 |
| --- | --- | --- |
| `pnpm typecheck` | 通过 | `logs/canvas-title-drag-typecheck.log` |
| `pnpm lint` | 0错误，33个既有警告 | `logs/canvas-title-drag-lint.log` |
| `node scripts/verify-canvas-project.js` | 模型及工程格式检查通过 | `logs/canvas-title-drag-model.log` |
| 两个新增/修改测试脚本 `node --check` | 通过 | 实际命令退出0 |
| `pnpm --filter @illusion-realm/next build` | 通过 | `logs/canvas-title-drag-build.log` |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | **104/104通过** | `logs/canvas-title-drag-runtime.log`、`logs/smoke-runs.log` |
| `pnpm check` | **退出1，既有未引用词条失败** | `logs/canvas-title-drag-check.log` |

新构建指纹：`889b67441d37eaa0538974e6cac53cebd6fcca3ad82458745d45054a616ba53e`，924个输入文件；冒烟启动核对新鲜度，正式 `app://app/canvas` 和生产 preload。

模型反证加载实际 reducer 和真实 React Flow，只有翻译函数回显 key，不包含窗口或媒体。相同300节点、移动最后一项：任务前 ID 读取90,600次、未动节点引用被替换；修复后301次、未动引用保留。另断言目标坐标/data、拒绝旧 replace、手势中无历史增长、松手只记一笔及撤销恢复。对照见 `title-drag-model-comparison.json`。这不是毫秒跑分或实机拖动证明。

Electron 自动回归包含名称按钮改名、短名实际文字宽度、长名省略/full title、960×720窗口边界和真实保存刷新恢复；继续覆盖节点输入/副本参数隔离、拖动抓取偏移、Escape、撤销重做、保存失败重试、连线和主题。真实 PNG/MP4/WAV 通过生产本地协议解码，视频/音频 currentTime 推进、互斥暂停、资源释放、截帧和工程包重开均通过。媒体是实际文件，不是探测成功返回值 mock；外壳账户为游客夹具，系统 chooser 由自动接管，文件拖入为合成事件，仍不能当作人工验证。

`pnpm check` 本轮实跑仍在 `check:gates` 被 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 挡住；后续串联门禁未执行，不宣称全仓通过。没有删除词条或降低基线。

## 截图与限制

- [短名称可见](runtime/title-drag-readable-name.png)
- [长名称与窄窗口](runtime/title-drag-long-name-narrow.png)
- [图片正文移动及真实视频](runtime/title-drag-real-media.png)

原始截图目录：`C:/Users/18305/AppData/Local/Temp/ir-canvas-Hr2LmQ`。截图已实际打开检查。

本轮无人工鼠标手感验收、用户大型工程、GPU性能录制、触控板、IME、系统缩放、多屏或长时压力测试；未重跑开发服务器模式。历史人工待验维持原状态。撤销仍有整图快照成本；选择、测量或非拖动编辑也可能重新计算签名，尚未承诺五千节点流畅。

模型生成、云端上传、任务提交、真实结果传播、画布成片渲染导出、多轨合成及多工程列表继续未接通；工程包交换与单草稿保存保持原契约。没有修改旧视频/GIF/漫画的公共业务实现，也没有宣称其完整场景重新验收。

## 增量注释

基线为本轮开始前工作区快照 `ir-canvas-title-drag-baseline-qjo_iluy`，不是 Git HEAD；新增文件全文、已有文件仅新增及替换后行。混合行计代码，空白/定界符/重复说明排除，按职责、原因、边界和断言核对，明细见 `title-drag-comment-audit.json`。

- 业务：C64、B27，**70.33%**。
- 测试：C162、B69，**70.13%**。

注释例子说明“固定分机号码”对应动作转发，以及拖动起手快照仅影响保存状态签名、不延迟真实位置绘制。测试注释分别解释 ID 访问指标与实际帧率的边界、文字元素宽度与头部按钮总宽度的区别。历史全量未达标审计保留，不由本轮结果覆盖。
