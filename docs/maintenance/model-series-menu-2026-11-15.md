# 创作页模型系列菜单

修复 SDXL / Anima 两项交互：未悬停时透明，当前项只保留勾选；悬停时高亮。系列说明浮层完整显示，不再受创建输入栏的滚动区域裁切。

## 原因和复用

- `workspace-shell.css` 原来把系列入口下的所有按钮都设为 `var(--muted)`，覆盖选项背景。现在只作用于带 `aria-haspopup="listbox"` 的入口按钮。
- `ModelSeriesSelector` 沿用原系列数据、切换回调和菜单外壳，选项装配移到 `model-series-option.tsx`，移除多余的说明残留状态。
- 说明内容共用 `SeriesTips`。桌面说明通过 Portal 放到 body，复用现有 `useCascadePosition` 的侧向定位、边缘夹取、滚动跟随及清理；窄屏保留原行内说明。鼠标离开、失焦或菜单关闭时卸载说明。
- 未改工作流、模型加载和用户配置的数据契约，无新增文案。

## 实际验证

```powershell
pnpm --filter @illusion-realm/next build
pnpm --filter @illusion-realm/next exec eslint src/view/create/ModelSeriesSelector.tsx src/view/create/model-series-option.tsx
node --check scripts/lib/check-model-series-menu.js
pnpm exec electron scripts/smoke-create-layout.js --model-series-only
```

构建、构建内 TypeScript 检查及目标组件 ESLint 通过。Electron 专项 **20/20 通过**，使用新鲜静态导出、真实创建页、隔离用户目录和原主题入口：

- 深浅主题、两个系列的默认透明底色、悬停高亮和当前项勾选。
- 右侧说明跨出 rail，窗口空间不足时向左展开；1440px 和 900px 窗口边界检查。
- 切换后更新入口并关闭菜单，说明同步卸载；重新打开无残留状态。
- 键盘聚焦显示说明、失焦收起，无 hydration 或渲染状态错误。

已目视核对下列运行截图。离屏窗口通过浏览器焦点仿真验证聚焦事件，未运行实体窗口遮挡测试或真实模型推理。未运行全仓库完整检查，局部通过不代表全仓库门禁通过。

[浅色悬停](runtime/model-series-menu-2026-11-15/model-series-light-sdxl.png) · [深色悬停](runtime/model-series-menu-2026-11-15/model-series-dark-anima.png) · [窄窗口向左展开](runtime/model-series-menu-2026-11-15/model-series-narrow-dark-anima.png)

[构建日志](runtime/model-series-menu-2026-11-15/build.log) · [专项日志](runtime/model-series-menu-2026-11-15/smoke.log)

首次运行发现公共 CSS 覆盖选项底色，修正后重建；第二次运行发现离屏窗口缺少焦点前提，补齐测试焦点仿真后专项通过。失败记录保留在 `logs/smoke-runs.log`。

## 注释审计

基线为本轮编辑前工作区快照，不使用 HEAD，保留已有改动。新增文件计全文，修改文件只计新增和替换行。TS/TSX/JS 通过 AST 识别注释，CSS 单行人工计数，说明内容人工复核。

| 文件 | 有效纯注释 C | 非空代码 B |
| --- | ---: | ---: |
| ModelSeriesSelector.tsx | 0 | 3 |
| model-series-option.tsx | 3 | 31 |
| workspace-shell.css | 0 | 1 |
| smoke-create-layout.js | 0 | 2 |
| check-model-series-menu.js | 4 | 51 |

业务 **7.89%（3/38）**，测试 **7.02%（4/57）**。本轮主要为展示装配与直接交互断言，已说明浮层脱离滚动栏、定位复用、悬停前提和离屏焦点边界，不为达到参考比例添加重复注释。新增普通逻辑函数在 30 行以内；既有冒烟入口 main 原为 36 行，本轮只增加两行专项注册，未扩展为测试编排重构。

[逐行统计](runtime/model-series-menu-2026-11-15/comment-audit.json)
