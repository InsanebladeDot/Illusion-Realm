# 漫画对话框：两栏合成编辑器

日期：2026-11-03。正式入口 `/tools/image/cartoon`；旧 `/cartoon` 复用重定向。漫画分镜 `/tools/image/comic` 独立保留。

## 已实施

- 默认左侧图片画布、右侧属性两栏，移除常驻左素材栏；主区不足640px时上下排列。
- 右侧“选择模板样式”打开公共资源弹窗，支持本地名称、用途、类别搜索及分类筛选。选择后新增独立气泡实例并关闭弹窗。
- 48种轮廓依据 `docs/待办/资源/comic-dialogue-templates/index.html` 的既有样式生成透明PNG，总计620,528字节；正文作为独立SVG文字层编辑。产品不执行参考HTML脚本。
- 选择、拖动、横竖排、对齐、文字颜色、字号、字距、行高、宽度、旋转及透明度；每个实例状态独立。
- 后续四角缩放补充已完成；本轮实现、36项回归、最新截图与增量统计见 [四角缩放记录](cartoon-dialogue-resize-2026-11-03.md)，下方25项结果保留为前次实施记录。
- 后续文字锁定/双击编辑、10种离线字体、细淡边框与顶部旋转已完成；见[字体与交互记录](cartoon-dialogue-fonts-2026-11-03.md)。系统字体限制等下方历史说明以该后续记录为准。
- Delete删除当前选中气泡；输入框、可编辑区域、资源弹窗内受保护。Escape取消选择，Ctrl/Command+Z撤销，Ctrl+Y或Ctrl+Shift+Z重做。一次拖动只形成一次撤销记录。
- 背景真实文件导入、损坏图片反馈、取消保留内容、实际宽高显示和真实PNG导出。导出复用预览SVG，移除选择工具。
- 工具名称与说明放入公共窗口标题槽，与本地模型库目录共用外壳。

工作区先前已有旧漫画文件及默认六张资源的删除，本轮保留这些修改，不把已有删除计为本轮新增成果。当前直接进入合成页面，不恢复旧前置设置页。

## 文件与复用

| 范围 | 职责与复用 |
| --- | --- |
| `apps/next/src/view/cartoon/dialogue-page.tsx` | 会话装配、文件操作边界，复用ResourceDialogShell、downloadBlob与用户文档读取 |
| `dialogue-library.tsx` | 复用LibraryCard、SimpleSelect；previewFit=contain注入完整轮廓，公共卡片默认cover保留 |
| `dialogue-properties.tsx` | 复用视频编辑器EditorAction、EditorFloatField、EditorGroup、EditorPlaceholder，以及ColorPicker；不共享视频业务状态 |
| `dialogue-stage.tsx`、`dialogue-render.ts` | 自然坐标拖动、共用文字排版、预览及PNG；像素画布复用image-editor能力 |
| `dialogue-history.ts`、`use-dialogue-editor.ts` | 局部不可变文档历史、实例选择与快捷键；无新增全局状态或IPC |
| `use-dialogue-template-picker.ts` | 模板窗焦点进入、Tab边界、关闭归还 |
| `dialogue-data.ts`、`dialogue-types.ts`、`dialogue-templates.json` | 静态目录与实例参数分离 |
| `dialogue.module.css` | 仅本工具两栏与容器查询，不改公共GIF宿主 |
| `apps/next/src/components/window-titlebar-content.tsx` | children注入门牌内容；本地模型库与漫画标题实际调用 |
| `window-titlebar.tsx`、`library/library-card.tsx`、`ToolBoxMain.tsx` | 仅增加本次槽位、图片fit参数与入口；保留原工作区其他修改 |
| `apps/next/src/i18n/locales/{zh-CN,en}/dialogue.ts`、`cartoon-templates.json`及两端index | 本次双语文案与48模板信息；JSON导入声明兼容Node检查器 |
| `apps/next/public/cartoon-templates/` | 48个离线轮廓文件，不含用户背景或对白 |
| `scripts/smoke-cartoon-dialogue.js` | 独立Electron实际页面回归，临时用户目录隔离 |

## 实际验证

- `pnpm typecheck`：通过，包含Next与Electron。
- `pnpm lint`：通过，0错误、33条既有警告。
- `pnpm --filter @illusion-realm/next build`：通过；最终指纹 `4c414fc32a86eb50577d3285296bf3d2f2c9b996a26d9ca6e79144a96904e8f7`。
- `pnpm check:locale-keys`、`pnpm check:i18n`、`pnpm check:i18n:en`：通过。
- `node scripts/check-smoke-rules.js`：通过。
- `pnpm exec electron scripts/smoke-cartoon-dialogue.js`：最终25/25通过，运行前源码指纹一致。
- 新增普通逻辑与测试函数按TypeScript printer的正常分行复核，未发现超过30行者；JSX装配按职责检查。

Electron覆盖：两栏无固定素材库、标题槽、不同模板与同款实例隔离、输入框Delete保护、选中删除及撤销、真实指针拖动和整次撤销、模板焦点进入/越界Tab返回/关闭归还、48PNG真实加载、无搜索结果保留作品、弹窗Delete保护、本机JPEG导入、1080方图尺寸、空文件选择与损坏PNG保留背景、真实PNG尺寸和像素差异、深浅主题、720px及540px窗口、GIF宿主和本地模型库标题槽、React水合错误检查。

`pnpm check` 在既有门禁失败后停止；单独重跑 `pnpm check:gates`仍有同样三个未引用键：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。未改无关词条，未宣称全仓check通过。完整链在门禁后的其余项目未全部执行。

## 截图与产物

均来自正式静态导出、正式preload与app协议下的真实Electron页面，不是参考图或mock组件截图。账户、用户文档、空模型扫描及缺FFmpeg状态用独立夹具隔离；本地背景读取、48PNG、SVG绘制、指针事件和PNG编码均为真实执行。

- [浅色两栏](screenshots/cartoon-dialogue-2026-11-03/editor-light.png)
- [深色两栏](screenshots/cartoon-dialogue-2026-11-03/editor-dark.png)
- [模板弹窗](screenshots/cartoon-dialogue-2026-11-03/templates-light.png)
- [720px](screenshots/cartoon-dialogue-2026-11-03/editor-narrow.png)、[540px](screenshots/cartoon-dialogue-2026-11-03/editor-small.png)
- [真实导出PNG](screenshots/cartoon-dialogue-2026-11-03/comic-dialogue.png)

截图背景使用仓库已有 `apps/next/src/assets/logo/logo.jpg`，未使用用户私人附件。

## 边界与未验证

- 当前是页面内存会话，离开前需导出PNG，界面明确提示；没有新增工程保存、自动草稿或云同步。
- 旧自定义图片只读恢复合法PNG/JPEG/WebP data URL；用户文档中的原素材和字体记录不删除。此次没有恢复旧自定义素材编辑及字体管理界面。
- 系统选择器的原生鼠标点击、真实保存路径确认未人工验证；CDP绑定真实本机文件后走生产onChange。取消用空files验证内容边界，不冒称人工取消证明。
- 未覆盖真实前台遮挡、所有触摸设备或所有DPR；GIF只验证宿主兼容，未验证转码；本地模型库只验证标题槽，未验证真实模型扫描。
- 当前采用固定字格估算，组合emoji与复杂印刷排版不保证精确字形测量；48轮廓保留参考样式原有细节，不声称对每个样式都完成独立成品像素金标。
- 英文模板样例目前使用通用英文短句，非逐项文学翻译。

## 增量注释审计

按任务前 `baseline.json` 快照区分已有修改，新增源码全文、修改文件仅新增/替换行统计；删除及上下文不算。JSON静态数据、PNG、文档与构建产物不属源码分母。纯有效注释计C，混合行及括号/import/类型计B。文本扫描后核对行为，并删除已识别的重复与不准确说明。

- 业务：C=1268、B=533，**70.41%**。
- 测试：C=279、B=117，**70.45%**。
- [逐文件审计、基线位置及摘要](cartoon-dialogue-comment-audit-2026-11-03.json)。

有效说明示例：用“地图坐标与显示比例”解释逆SVG矩阵的坐标转换；用“画稿叠放”解释历史及一次拖动只存一个起点。测试注释明确CDP真文件导入与原生选择器人工操作的证据边界。
