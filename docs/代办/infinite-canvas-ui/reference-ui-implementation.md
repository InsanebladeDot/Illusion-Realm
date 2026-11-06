# 组件样式库追加优化实施记录

实施日期：2026-11-06。入口：正式 `/canvas`。当前代码使用资料包的 `components.tsx`、`canvas-components.css`、交互文字规范和组件状态映射作为基准。

## 复用和映射

| 外部组件 | 正式文件 / 导出 | 实际调用关系 |
| --- | --- | --- |
| CanvasIcon、IconButton、CanvasChip、SegmentedControl、CanvasSwitch | `reference-ui/canvas-icon.tsx`、`components.tsx` | 节点工具条、参数面板、设置、视图与合成器共用 |
| CanvasNode、NodeActionBar、NodePort | `reference-ui/node-components.tsx`、`canvas-node.tsx` | 同一 `CanvasNodeCard`，由 kind、title、selected、content、ports 及回调注入差异 |
| GenerationPanel | `reference-ui/generation-panel.tsx` | 文本/图片/视频/音频各自选项；图片比例复用 CanvasChip + SegmentedControl |
| AddNodeMenu、CanvasDock、ProjectHeader、ViewControls、CanvasCounters | `reference-ui/canvas-chrome.tsx` | 正式工作区与 CanvasToolbar 装配，图数据和镜头只有一个事实来源 |
| CanvasSettings | `reference-ui/canvas-settings.tsx` | 只启用已绑定图引擎的参数，未接能力禁用 |
| CompositionEditor | `reference-ui/composition-editor.tsx` | 仅空工程 UI；播放、素材添加和导出禁用 |
| 浮层生命周期 | `canvas-overlay.tsx` | 设置、帮助、重命名、重读确认、合成器共用 |
| 编辑器事务 | `canvas-reducer.ts`、`use-canvas-editor.ts`、`canvas-editor-context.tsx` | 菜单、快捷键、节点与端口动作进入同一个 reducer |
| 序列化及恢复 | `canvas-model.ts`、`canvas-document.ts`、`use-canvas-persistence.ts` | 接既有用户 JSON 分段合并与生产写盘器 |
| 共享数据 | shared 的 `infinite-canvas.schema.ts`、`types/infinite-canvas.ts` | 纯数据 schema 和推导类型，不引入 React/Electron 运行时 |

新增 UI 文件集中在 `apps/next/src/view/infinite-canvas/reference-ui/`。路由在 `apps/next/src/app/canvas/page.tsx`；接入改动限于导航、已有 CSS 入口、双语词条和用户文档类型/合并/导出。没有复制新 AppShell，没有新 IPC，没有任意文件操作桥接。

`canvas-components.css` 维护组件内部几何和状态；`canvas.module.css` 只适配工作区、图引擎 Handle 和浮层布局。没有把交付包 HTML、Showcase 或 NodeFixture 放进正式页面。

## 状态与文字

- 普通图标按钮维持正常/hover 反馈，按住不凭经验额外缩放或变亮；添加菜单有独立的按住底色。
- 禁用按钮原生阻止动作，禁用菜单也不出现可执行式 hover；Home/End 和方向键跳过不可用条目。
- 手掌、点阵、小地图、音频/视频模式使用实际业务状态，失焦不取消选择，focus 不冒充 selected。
- 不叠主题焦点圈；键盘位置用资料内的淡底反馈。Windows forced-colors 保留系统可见标记，未进行实机辅助模式验收。
- 保留节点选中框、参数胶囊的细线、上浮和阴影，不全局清除 border/box-shadow。画布根元素的快捷键焦点不再出现浏览器整圈白框。
- Poppins 候选栈、13px 提示词/1.5 行高、11px 媒体模式、正常字重、35% placeholder、换行及菜单斜体徽标规则沿用资料。
- 节点标题继续按二十个 UTF-16 单元加省略号；完整标题保留在 title。画布名称和胶囊长文字不撑开布局。
- 提示词仍是基础 textarea；`/` 快捷词和 `@` 富文本引用尚未接通，placeholder 不暗示这些能力已经可用。
- 图片比例浮层处理选项聚焦、Escape、选中后关闭和焦点返回；外部点击只关闭，不抢走用户刚切到的焦点。
- 浮层打开前捕获触发器，工作区 inert 后不再猜原焦点；Tab 排除隐藏和禁用控件。
- 动效遵守 prefers-reduced-motion，不靠动画结束事件决定业务成功。

## 本轮发现并修复的集成问题

1. 画布根捕获 Escape 早于比例面板处理，导致小浮层收不起来；给当前展开面板标注局部键盘边界。
2. inert 在浮层 effect 之前移走触发器焦点；在开窗事件捕获真实触发器，再交给共用浮层归还焦点。
3. Escape 取消拖动留下未释放事务，或过早解锁让同次 mouseup 的旧位置回写；立即恢复作品，保留迟到事件屏障到松手这一轮结束，并清理窗口监听/计时器。
4. 已创建 createdAt 的节点后来新增 mode 字段时，对象插入顺序与 schema 顺序不同；序列化固定字段顺序，签名和落盘快照一致，实际内容没有变化时不再显示未保存。
5. 禁用菜单仍命中 hover、项目长名撑开标题、点阵/小地图缺持续状态，均在原组件中修复，没有加平行按钮实现。

## 数据闭环与独立业务

保存的是 version、name、节点 ID/位置/参数/创建时间及有向边，排除 selected、dragging、measured、回调、DOM、菜单与焦点。读取先 schema 校验，再检查 ID 和连接，损坏文档进入错误态，不自动写空图。保存失败保留当前草稿和旧磁盘文件，可显式重试。单一用户文档的其他段由既有合并机制保留。

每个画布有自己的 reducer、连接临时起点、撤销、菜单和浮层。节点副本参数独立。未独立挂载两套画布做 A/B 实机验收，不把架构推断写成该项通过。持久化仍是同一个单草稿段，没有多工程列表。

引用只表示图关系，不传播真实媒体、不触发模型任务。模型、上传、历史、媒体播放、生成队列、导出、云端、批量处理、导演台、3D World 和多轨合成未接通。合成器链接只打开现有视频编辑器，旧工程业务保持独立。

## 真实证据及限制

正式 Electron 生产 preload、app:// 静态页面和临时用户 JSON 回归结果见 [verification.md](verification.md)。截图来自 capturePage，交互包括 Electron 鼠标/键盘输入、DOM 语义事件及 CDP 焦点模拟；这些不等于人工操作。

[视频对照图](runtime/reference-ui-video-comparison.png) 左侧为资料中的原程序 650×570 局部图，右侧为正式截图等尺寸裁切，没有缩放或补画内容。裁切来源见 [清单](runtime/reference-ui-comparison-source.json)。模型服务、图标字样、内容、字号的实际字体回退、宿主外壳及点阵对齐存在差异，不能宣称像素完全一致或用单一分数宣布所有组件达标。

[视频](runtime/reference-ui-video-parameters.png)、[图片](runtime/reference-ui-image-parameters.png)、[文本](runtime/reference-ui-text-parameters.png)、[音频](runtime/reference-ui-audio-parameters.png)、[菜单按住](runtime/reference-ui-menu-held.png)、[比例聚焦](runtime/reference-ui-ratio-popup.png)、[设置](runtime/reference-ui-settings.png)、[合成器](runtime/reference-ui-composition.png)、[重开](runtime/reference-ui-reopened.png)、[保存失败](runtime/reference-ui-save-error.png)。

实体拖线与重叠命中、触控板、中文输入法、完整读屏/键盘路径、系统缩放、多屏和长时间运行待验。窗口尺寸是 CSS 视口，不能写成系统缩放已实测。画布保持参考深灰，深浅主题验证覆盖周围应用外壳。大规模节点/连线性能未测试，整图历史最多五十份快照。

## 注释率

统计不缩小为本次最后几行：全部新增画布组件、CSS、schema、持久化、词条及冒烟脚本计全文；已有接入文件仅计本任务新增/替换行。混合行计 B，定界符、空行、英文原样资料注释和无效说明不计 C。逐文件见 [comment-audit.json](comment-audit.json)，旧记录保留为 [comment-audit.initial.json](comment-audit.initial.json)，旧记录遗漏新文件，不能作为本轮结论。

有价值的说明包括：取消拖动如撤掉搬运单、保留迟到事件屏障；写盘签名如统一归档标签；浮层开窗前留门牌以返回真实触发器；测试明确区分语义点击、焦点模拟和人工证据。本轮注释率仍低于 70%，规范验收未通过，不将自动交互通过写成全部完成。

| 范围 | 有效中文注释 C | 非空代码 B | C/(C+B) | 结论 |
| --- | ---: | ---: | ---: | --- |
| 业务 | 236 | 1370 | 14.69% | 未达 70% |
| 测试 | 97 | 401 | 19.48% | 未达 70% |
