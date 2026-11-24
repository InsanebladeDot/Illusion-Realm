# 历史导航触发 React 插入阶段更新

已修复 `useInsertionEffect must not schedule updates.`。改动只在历史订阅通知处，继续复用浏览器原生历史和已有标题栏按钮，不另外维护页面栈。

## 原因和改动

Next 16.2.10 的 `HistoryUpdater` 在 `useInsertionEffect` 内执行 `history.pushState / replaceState`。Chromium 的 Navigation API 会在这个调用中同步发出 `currententrychange`。项目原来的 `subscribeWindowHistory` 直接通知 `useSyncExternalStore`，因此 React 仍在插入阶段就收到标题栏更新请求。

`apps/next/src/utils/window-route-history.ts` 现在把通知排到微任务，在当前同步提交结束后读取最新历史。同一轮事件合并一次；退订先置为失效，防止已经排队的通知再调用旧组件。没有屏蔽 console、关闭严格检查或修改 React / Next 依赖。

## 实际验证

新增 `scripts/verify-window-history-notifications.js`：加载项目当前 React 开发包、生产历史订阅源码，在真实 Chromium 中从插入阶段写历史。

- 修复前准确捕获原错误，7 项中只有 2 项通过，命令以 1 退出。
- 修复后 7/7：push、replace、原生后退和前进、事件合并、退订清理、React 无警告。
- 这条独立回归不运行完整 Next Webpack 开发页面，也不替代静态导出冒烟。
- 重新构建静态导出后，`pnpm exec electron scripts/smoke-setup-checklist.js --navigation` 28/28：真实页面跳转、鼠标和键盘、刷新恢复、面包屑、窄屏及中英文均通过。
- `pnpm typecheck` 通过；`pnpm lint` 0 错误、37 项原有警告；路由元数据、脚本引用和冒烟约定检查通过。
- 本轮没有重跑完整 `pnpm check`，不将以上检查表述为全仓库门禁通过。

日志摘要见 `logs/smoke-runs.log`。开发版定向回归为 `2026-11-16T06-45-48-090Z-40772`，静态页面导航验证为 `2026-11-16T06-47-59-043Z-10564`。静态构建指纹为 `b5e89eb6e503e67bc4b54a99b049eb8b478cb3ebd37ea40b8194d97ab61bb9c9`。

## 注释核对

基线为本轮修改前保存的 `ir-history-notification-baseline-20261116/window-route-history.ts`，保留原工作区修改。业务只统计本轮新增及替换行，新增测试统计全文。按 TypeScript 语法范围区分代码和注释，再人工核对说明；混合行只计代码，空行和纯类型 JSDoc 不计有效注释。

| 文件 | 有效纯注释 C | 非空代码 B | C/(C+B) |
| --- | ---: | ---: | ---: |
| `apps/next/src/utils/window-route-history.ts` | 2 | 11 | 15.38% |
| `scripts/verify-window-history-notifications.js` | 4 | 118 | 3.28% |

两类均低于 20%–30% 参考范围。业务已解释延后通知和退订边界；测试集中解释开发包、复现机制及验证边界，其余为直接装配与断言，没有为比例补重复注释。两份文件的逻辑函数均未超过 30 行有效代码。
