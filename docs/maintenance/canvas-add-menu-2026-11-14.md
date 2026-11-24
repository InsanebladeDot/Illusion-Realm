# 画布节点菜单与批量导入（2026-11-14）

## 本次结果

- 空白处右键直接打开完整节点菜单，取消“添加节点”中间入口；底部加号调用同一个组件。顶部小标题沿用参考图。
- 图像分类和批量图片、视频分类支持鼠标悬停展开，也可点击保持展开；移入子列继续操作。Escape 关闭整份菜单，左右方向键进入或返回分类。
- 一级、二级列共享画布表面、文字、边框、圆角和实测高度。窗口右侧不足时向左展开；上下位置限制在窗口内，长列表内部滚动。横向连一列也放不下时沿用公共菜单的逐级返回方式。
- 批量图片、视频均提供“从资源库导入 / 本地导入 / 现有节点资源”。中文标签保持单行；更长的翻译省略显示，完整名称保留在提示中。

## 复用与业务边界

| 实际复用 | 本次接入 |
| --- | --- |
| `components/cascade-menu.tsx`、`use-cascade-position.ts` | 原翻译菜单继续使用默认外观；画布通过 `appearance`、`equalHeight` 注入外观和等高要求，不复制第二份菜单引擎 |
| `reference-ui/canvas-add-menu.tsx` | 右键和加号共用一份节点、来源配置；旧 `image-add-menu.tsx` 已删除 |
| `CanvasProjectResources`、`LibraryCard`、`CanvasChip`、`useCanvasResources` | 两种资源来源复用原选择窗口、卡片、多选、全选与错误处理；只注入来源、类型和确认回调 |
| `useCanvasMediaImport`、`canvasImportMedia`、`createMediaNode` | 本地选择、文件复制/移动、工程台账、卡片工厂和撤销都用原流程；没有新增 IPC 或文件格式 |

资源库素材复制进当前工程后建节点；原库文件保留。本地图片直接复制，本地视频仍先选择复制或移动，默认复制。“现有节点资源”按当前节点主媒体地址去重，创建独立节点但复用文件，不创建连线；旧画布的外部媒体地址也可列出，但该选择页不提供删除源文件。仅作为参数附件、没有节点主媒体的引用不算这里的“现有节点资源”。

每批节点一次进入撤销历史。全局库复制分批串行，每次至多 200 份；部分文件被拒绝时，成功项仍建节点，选择页保留并显示部分失败。请求异常由原资源窗口接住，恢复忙碌状态。关闭选择页会使当前请求身份失效，迟到结果不再回填节点；已经完成的磁盘副本由原资源台账管理，不尝试删除来源文件或假装回滚。

菜单本身不创建媒体对象或计时器；图片、视频的解码与卸载清理由原媒体卡片负责，复制成功不等于媒体已经解码。

## 验证

| 命令或场景 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 通过，包含主进程检查 |
| `pnpm lint` | 0 错误、37 条既有警告；本次失效的 `useEffect` 引用已删除 |
| `node scripts/verify-canvas-generation.js` | 248 项通过，纯逻辑检查，不代表运行推理 |
| `pnpm check:locale-keys` | 双语键一致 |
| `node scripts/check-smoke-rules.js`、`node scripts/check-script-refs.js` | 冒烟约定与脚本引用检查通过 |
| `pnpm --filter @illusion-realm/next build` | 静态导出通过；最终指纹 `9cb645d822703a009b8b201a8580c647b484c0a978c29ba1d1ef0ab2beb24401` |
| 菜单与批量导入 Electron 专项 | 28/28：两主题、右键/加号、悬停与点击、等高同色、右下边界、窄窗、六种来源路径、批量撤销重做、真实文件与 SQLite、重开恢复 |
| 图像对比与菜单 Electron 专项 | 21/21：图像/对比节点创建、键盘分类、真实对比像素、滑杆、保存恢复、浅色窄窗 |
| 创建页提示词助手 Electron 专项 | 78/78：保护公共级联菜单另一实际调用方，包含多级列、左右避让、主题、键盘及原翻译流程 |
| `pnpm check` | 类型与 Electron 模块检查通过；随后被原有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer` 阻挡，后续串联检查未运行 |

Electron 专项串行运行，均从正式 `app://` 静态导出加载，保留指纹检查与超时/退出护栏。菜单和媒体专项使用隔离工程、生产 preload/IPC、真实文件复制和 SQLite。鼠标悬停、按键为 Electron 自动输入；部分点击为 DOM 事件。本地文件通过 CDP 代替系统框选取，未人工操作系统选择框。

提示词助手的收费服务响应使用原夹具，不能当成真实模型推理；其设置页还记录了既有夹具未注册 `euzhiImage:secretStatus` 的日志，78 项断言通过不代表该独立接口已验收。人工手感、触屏、输入法、系统高 DPI、真实推理、超大资源列表和损坏/消失文件的批量复制失败未实测；此前人工待验项继续保留。

初次菜单运行在业务断言前失败：旧冒烟夹具额外创建了一套工程服务，与生产清理队列争写 `.legacy-imported`。菜单与对比专项不依赖旧草稿和失败注入，已改为直接使用生产服务。下一次运行发现测试误用不存在的“全选”属性选择器，已修正。相关失败日志保留，不计通过。后续修正单行标签并删除失效 import 后，最终静态产物重新构建和验证。

提示词助手曾在最后一次复核中等待分类的翻译结果超时，退出码 1，未当作通过。检查发现脚本点击分类后立即输入，尚未等待对应分类工具条挂载；已补充这个可观察状态等待，保留原断言。修正后最终产物上 78/78 通过，日志为 `assistant-smoke-settled.log`；失败记录为 `assistant-smoke-final.log`。

独立运行命令（每项退出后再运行下一项）：

```powershell
$env:CANVAS_ADD_MENU_SMOKE='1'
pnpm exec electron scripts/smoke-infinite-canvas.js
Remove-Item Env:CANVAS_ADD_MENU_SMOKE

$env:CANVAS_COMPARE_SMOKE='1'
pnpm exec electron scripts/smoke-infinite-canvas.js
Remove-Item Env:CANVAS_COMPARE_SMOKE

pnpm exec electron scripts/smoke-prompt-assistant.js
```

日志、逐项注释统计和最终截图：`logs/canvas-add-menu-2026-11-14/`。截图来自运行中的画布；蓝色图片和短视频为测试素材。

![深色两级菜单](../../logs/canvas-add-menu-2026-11-14/screenshots/140-add-menu-dark.png)

![浅色窄窗批量来源与边界避让](../../logs/canvas-add-menu-2026-11-14/screenshots/143-add-menu-light-narrow.png)

## 增量注释审计与限制

基线为任务开始时的 `logs/canvas-add-menu-2026-11-14/baseline/`，包含此前未提交修改。只统计本轮新增、替换后的行，新增文件统计全文；删除与上下文不计，代码混合注释算 B，括号/import/类型声明均算代码。变更中的纯注释均为单行中文说明或 JSX 注释，扫描后逐条复核用途与实际行为；明细见 `statistics.json`。

| 文件（省略公共路径前缀） | C | B |
| --- | ---: | ---: |
| `components/cascade-menu.tsx` | 0 | 9 |
| `components/prompt-assistant/use-cascade-position.ts` | 1 | 1 |
| `canvas-project-resources.tsx` | 1 | 23 |
| `infinite-canvas-page.tsx` | 1 | 29 |
| `use-canvas-media-import.ts` | 0 | 2 |
| `reference-ui/canvas-chrome.tsx` | 2 | 13 |
| `reference-ui/canvas-components.css` | 1 | 3 |
| `reference-ui/canvas-add-menu.tsx`（新增） | 1 | 33 |
| `canvas-batch-media.ts`（新增） | 2 | 23 |
| `i18n/locales/zh-CN/canvas.ts` | 0 | 1 |
| `i18n/locales/en/canvas.ts` | 0 | 1 |
| `scripts/smoke-infinite-canvas.js` | 1 | 4 |
| `scripts/lib/check-canvas-compare.js` | 0 | 10 |
| `scripts/lib/check-canvas-library-ui.js` | 0 | 1 |
| `scripts/lib/check-canvas-add-menu.js`（新增） | 4 | 148 |
| `scripts/smoke-prompt-assistant.js` | 1 | 3 |

业务 **9/(9+138)=6.12%**，测试 **6/(6+166)=3.49%**。低于 20%–30% 参考值：本轮主要是原组件接线、配置和行为断言，共同机制沿用原注释；新增说明覆盖来源、副作用、关闭后回填和测试证据边界，不为比例重复说明。删除的旧图像菜单不进入分母。普通新增逻辑函数未超过 30 行；展示组件按 JSX 装配职责核对。

本地文件选择仍受原单次 IPC 的 200 份限制；资源库选择器保留原列表截断提示。批量节点仍一次挂载，没有增加列表或节点窗口化；大量视频同时解码、几千节点和长时间操作的性能未验证。没有提交 GitHub、运行安装包、触碰用户工程或删除未知文件。
