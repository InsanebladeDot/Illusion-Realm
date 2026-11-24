# 节点输入面板复用与按钮单行（2026-11-14）

## 结果与复用关系

此前三类节点已共用 `GenerationPanel → PromptGenerationPanel`、原引用编辑器与基础控件，但图片/视频和音频仍有不同的输入高度、页脚排版。因此此前属于部分复用，不能称为图2的统一面板。

本轮从现有音频输入面板抽出 `reference-ui/generation-panel-frame.tsx`，原音频与图片、视频、文字节点都实际调用同一个外壳。它拥有边框、收起按钮、操作行、生成箭头和 Shift+Enter；内容、参数、附加操作与可用状态通过插槽及回调注入。没有复制一套音频版或视频版外壳。

共同正文采用音频的80px输入区，长文本由原编辑器滚动。参数保持单行，优先省略模型名称，按钮不被压扁。视频宽高读数独立置于操作行下方。菜单基于共同操作行定位，避免像素说明把菜单顶到按钮上。

共同按钮继续调用 `CanvasChip`、`IconButton`、`SegmentedControl`；参数展开继续调用 `ParameterPopover`，预览正文继续调用创作页的 `PromptConversionPreview`。`CanvasVideoPrompt → ImageReferencePrompt` 仍是唯一媒体引用输入。模型、比例、画质、帧率、秒数、批量与超分保留自己的参数和确认行为。

此前齿轮使用16×18的手绘外轮廓；本轮统一图标入口改用项目已安装的 Lucide `Settings`，按钮和SVG仍保持方形、中心圆等轴缩放，沿用原颜色及线宽。

## 实际修改

- `apps/next/src/view/infinite-canvas/reference-ui/canvas-icon.tsx`：标准齿轮。
- `apps/next/src/view/infinite-canvas/reference-ui/generation-panel-frame.tsx`：从原面板抽出的共同外壳。
- `apps/next/src/view/infinite-canvas/reference-ui/generation-panel.tsx`：所有节点接入同一外壳，注入原内容、参数及动作。
- `apps/next/src/view/infinite-canvas/reference-ui/canvas-theme.css`：共用紧凑输入、单行页脚和菜单位置，移除被替代的媒体高度差异规则。
- `scripts/lib/check-canvas-prompt-preview.js`：在现有正式画布用例中加入三媒体真实几何、菜单避让、浅色窄窗检查。

## 运行验证

使用真实静态导出 `app://app/canvas` 和生产 preload，串行启动隔离Electron窗口，不结束用户应用、不写用户工程。

| 命令 | 本轮结果 |
| --- | --- |
| `pnpm typecheck` | 退出0，渲染与主进程类型检查通过 |
| `pnpm lint` | 退出0；0错误、37项已有警告 |
| `pnpm --filter @illusion-realm/next build` | 退出0；1136输入，最终指纹 `db19db5a5a45726d52f597f273687a6184af57c5a5f81c0735c8bb0f15424b3d` |
| `CANVAS_PROMPT_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 最终34/34，退出0 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 最终149/149，退出0 |

专项覆盖三个节点的80px输入和单行操作、真实矩形无重叠、齿轮等轴缩放、正式标记预览、工具栏转换与撤销、过期回包保护、缺引用拦截、浅色窄窗及菜单不遮按钮。整体回归包含节点移动/复制/删除、参数独立、保存重开、实际媒体导入解码与播放，以及公共控件键盘路径。

实际截图和完整日志见 [本轮证据](runtime/canvas-panel-reuse-2026-11-14/)。深色图片、视频、音频及960px浅色窗口均来自实际Electron页面。媒体读取、SQLite写入是真实执行；转换服务回包和账号使用夹具。自动DOM/Electron事件不属于人工验收，没有真实模型推理、人工视觉验收或性能跑分。

## 失败记录与边界

早期图标断言错误要求六齿轮外轮廓外接框为正方形，实际圆心与SVG均未拉伸；已改为检查实际等轴变换。窄窗测试曾在拖动鼠标松开尚未处理时打开浮层，或把节点头放到工程工具条下，均留下失败日志后修正测试布局与输入顺序，没有掩盖产品失败。

复用期间实际截图发现像素说明造成预览菜单压住操作行，已修正共同锚点，并加入各类菜单避让断言。最后只采用最终指纹对应的通过记录。较早26/26、29/29及中间149/149不代替最终构建验证。

本轮未运行完整 `pnpm check`；此前三项未引用词条、Meta语料问题及所有人工待验项继续保留。没有接通画布视频执行器，视频参数可编辑不代表可生成。业务队列、存储契约及服务接口保持原边界。

固定600px世界坐标面板继续采用画布平移/缩放查看；特别窄的窗口不会把整张面板压成手机表单。超长模型名称省略，完整身份仍在原模型选择器内。没有增加全局订阅、计时器或常驻媒体实例，未验证大节点数量性能。

## 增量注释审计

两次需求追加分别以任务开始快照为基线，保留工作区已有修改；只统计新增/替换后的非空物理行，新外壳按全文统计。纯有效中文注释人工核对，混合行计代码，文档不计。

- 齿轮/图片按钮阶段：业务 C=3、B=13，18.75%；测试 C=2、B=9，18.18%。见 [首段审计](canvas-settings-icon-comment-audit.json)。
- 面板复用追加阶段：业务 C=20、B=55，26.67%；测试 C=1、B=6，14.29%。见 [追加审计](canvas-panel-reuse-comment-audit.json)。移动到新插槽的有效JSX注释也按新增行计算。

少量测试新增行为由既有场景公共说明覆盖，低于参考比例不凑数。新增普通事件与辅助函数均不超过30有效物理行；展示组件JSX按装配职责审查。
