# 并行下载列表固定位置修复

## 原因与边界

`useModelDownloadStore.update` 以前每次先过滤掉同编号任务，再追加最新快照。`ModelDownloadList` 又倒序展示数组，因此最后收到进度事件的任务会跑到最前面。两个下载交错通知时便反复交换位置。

现在已有任务按 id 原位置替换，只有首次出现的任务追加到数组。沿用原列表组件和下载事件链路，新下载仍显示在顶部；进度、失败、重试与完成不会触发重新排队。真正删除任务仍移除对应行，revision 仍防止旧事件覆盖新状态。未更改主进程传输、并发数量、IPC 或持久化格式。

## 验证

- 新增真实 Electron 并行回归：两个独立模型目录通过原下载管理器、preload、Zustand 和下载中心组件下载。启动错开 150ms，以 25ms 间隔采样 72 次，同时确认两条任务字节数都增加。
- 最初 150ms 的采样曾在旧版误通过；调整夹具错开启动并提高采样频率后，旧静态产物明确失败：86/87，退出码 1，失败项为 `Concurrent progress keeps newest-first rows in fixed positions`。此处保留反证过程，不把第一次误过当作修复证据。
- 修改 store 后重新静态构建，指纹校验通过（743 个文件，摘要前缀 `02b005e1cb12`）。同一回归最终 87/87，退出码 0，包含取消、断点重试、完成、删除、历史恢复、暗色和窄窗口的既有检查。
- 最终日志：`logs/smoke-model-download-ui-2026-10-27T10-54-03-928Z-29620.log`；摘要已追加至 `logs/smoke-runs.log`。
- `pnpm typecheck`、`pnpm lint`、Next 构建、冒烟规则校验通过；lint 仍有 33 条既有 warning。
- `pnpm check` 在类型及 Electron 模块检查通过后，因已有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 停止；后续检查未执行。
- 专项夹具仍打印缺失 `account:me` / `agent:catalog` handler 的既有日志，不影响下载断言；未把这些日志描述为本次修复成果。

只使用隔离临时目录，未关闭用户正在运行的客户端，未读写真实下载队列。没有访问真实 C 站验证网络速度，也未重新制作安装包；已安装版本需更新打包产物才包含修复。

## 注释与范围审计

基线为本轮修改前的文件快照，保存于系统临时目录 `ir-download-order-2026-10-27`。仅统计本轮新增及替换行，删除行和已有修改不计入；TypeScript AST 识别注释边界，人工复核说明是否有效。

| 类别 | 文件 | C | B | C/(C+B) |
| --- | --- | ---: | ---: | ---: |
| 业务 | `apps/next/src/stores/useModelDownloadStore.ts` | 10 | 3 | 76.92% |
| 测试 | `scripts/smoke-model-downloads.js` | 54 | 23 | 70.13% |

注释用“固定座位”解释任务更新机制，并记录测试为何要错开启动、为何慢采样会漏掉换位。新增并行验证函数为 22 行有效代码，store 更新回调为 7 行，均小于 30 行。
