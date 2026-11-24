# 标题栏历史与面包屑

## 实现

- head 左侧新增后退、前进，读取浏览器真实历史。初次进入没有历史时禁用；后退后可前进；后退再打开其他页面会丢弃旧的前进分支。刷新不清空历史，replace 不新增记录。
- Next 继续负责路由与滚动恢复，沿用原页面转场。没有另建历史栈，也没有改写 pushState。
- `apps/next/src/data/route-metadata.ts` 集中登记页面名称、父级、用途和图标。覆盖全部 27 个实际页面，包括旧入口跳转。分类没有页面时只显示文字，真实祖先可以点击。
- 标题栏复用 `WindowTitlebarContent`、`HoverTip`、caption 按钮样式和既有页面转场。悬停与键盘聚焦可查看用途，不使用原生 title 代替。
- 共用 HoverTip 按实际尺寸收回窗口内，标题栏调用通过 layer 参数提高层级；默认调用保留原层级、延时和动画。
- 模型库保留相对目录显示，不把磁盘根路径放入面包屑。登录页继续只显示系统窗口控件。
- 小于 640px 只展示当前页；小于 360px 隐藏面包屑，保留历史按钮和窗口控制。无 Navigation API 的浏览器禁用历史按钮。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `apps/next/src/utils/window-route-history.ts` | 校验同源历史目标、订阅原生历史变化 |
| `apps/next/src/hooks/use-window-route-history.ts` | 订阅历史边界并调用原有 Next 路由 |
| `apps/next/src/data/route-metadata.ts` | 页面元数据、父级关系与兼容入口 |
| `apps/next/src/components/window-route-navigation.tsx` | 历史按钮、面包屑、用途提示与目录展示 |
| `apps/next/src/components/window-titlebar.tsx` | 将导航放入原 head，保留任务、账户和窗口控件 |
| `apps/next/src/components/window-titlebar-content.tsx` | 共用标题栏内容槽 |
| `apps/next/src/components/hover-tip.tsx` / `.module.css` | 提示框边界计算与窗口层级 |
| `apps/next/src/app/workspace-shell.css` | 标题栏窄窗口规则 |
| `apps/next/src/i18n/locales/{zh-CN,en}/nav.ts` | 双语导航名称和用途 |
| `scripts/verify-window-route-metadata.js` | 对照真实页面检查登记和父级 |
| `scripts/lib/check-window-route-navigation.js` | 真实窗口导航与提示交互回归 |
| `scripts/smoke-setup-checklist.js` | 复用既有隔离窗口，新增 navigation 模式 |
| `scripts/smoke-cartoon-dialogue.js` | 更新旧门牌断言；本轮未运行整套漫画编辑回归 |

## 实际验证

最终静态产物指纹：`f25281b0e44a610a44068fa6a25b21254a81a4766f58afb127ea636bf35deeb2`。

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过；最后的 HoverTip 修改另外通过最终构建的 TypeScript 检查 |
| `pnpm lint` | 通过，0 错误，37 条原有警告；最后改动另跑相关文件 ESLint 通过 |
| `pnpm --filter @illusion-realm/next build` | 通过，静态导出和指纹已更新 |
| `node scripts/verify-window-route-metadata.js` | 通过：27 个实际页面、父级、兼容入口和未知路径 |
| `pnpm exec electron scripts/smoke-setup-checklist.js --navigation` | 最终 28/28 通过：真实鼠标/键盘、分支、replace、刷新、用途提示、深浅主题、820/650/390/320px、英文 |
| `pnpm exec electron scripts/smoke-create-layout.js --shell-only` | 最终 13/13 通过 |
| `pnpm check:locale-keys` / `pnpm check:i18n` / `pnpm check:i18n:en` | 通过 |
| `pnpm exec electron scripts/smoke-login.js` | 未全通过：1535×900、1120×640、1280×640 三项布局矩阵断言失败；简洁 head、拖动边界、游客进入/退出、重开恢复通过。未声称这些失败已由基线证明与本次无关 |

本轮未运行完整 `pnpm check`、打包安装和整套工具箱回归。未修改用户配置，也未停止用户运行中的应用。所有 Electron 冒烟串行执行。

测试修正记录：首次焦点仿真在空白页等待超时；随后移动到页面加载后。启用焦点仿真后，真实鼠标须等待页面转场顶层退场；重载后重新启用焦点仿真，并等待 pointerleave 后再独立测试键盘焦点。早期失败保留在 `logs/smoke-runs.log`，最终通过不覆盖它们。

## 截图

已人工查看实际导出运行截图，目录为 `docs/screenshots/window-route-navigation-2026-11-15/`。

![浅色标题栏与用途提示](../screenshots/window-route-navigation-2026-11-15/route-cartoon-light.png)

![深色标题栏与用途提示](../screenshots/window-route-navigation-2026-11-15/route-cartoon-dark.png)

![390px 窗口](../screenshots/window-route-navigation-2026-11-15/route-narrow-390.png)

## 注释与函数核查

基线为任务开始时保存的 `ir-window-navigation-baseline-20261115`，保留开始前已有修改。新增源码统计全文，修改源码仅统计本次新增与替换行；文档、截图和删除行不计。JS/TS/TSX 通过语法注释范围识别，CSS 按块注释识别；人工复核有效说明，混合行计代码。

- 业务：C=14、B=242，5.47%。
- 测试：C=6、B=175，3.31%。
- 低于 20%–30% 参考：本次包含集中式路由数据和交互断言；说明已覆盖真实历史、同源边界、订阅清理、虚拟分类、未知路径与测试窗口前提，未为比例添加重复说明。
- 新增或修改的普通逻辑函数没有超过 30 行；JSX 装配按组件职责核查。
- 逐文件结果见 `window-route-navigation-comment-audit-2026-11-15.json`。
