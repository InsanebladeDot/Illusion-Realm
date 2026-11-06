---
name: electron-ipc
description: 修改 Electron 请求、事件或跨进程参数时使用；按现有通道、registerHandle 和 IpcResult 契约接通主进程、preload 与渲染层。
---

# IPC 契约

遵守根目录 [AGENTS.md](../../../AGENTS.md)。以下路径相对仓库根；本技能只约束本次涉及的通道，不授权重命名既有 API。

## 单一来源

| 内容 | 位置 |
| --- | --- |
| 通道定义 | `packages/shared/src/ipc-channels.ts` |
| 主进程与 preload 共用副本 | `apps/electron/src/common/ipc-channels.js` |
| 返回类型 | `packages/shared/src/ipc-result.ts` |
| 请求形状 | `packages/shared/src/schemas/` |
| 注册与异常收敛 | `apps/electron/src/main/ipc/result.js` |
| 注册汇总 | `apps/electron/src/main/ipc/register.js` |

新增通道须同步两份常量并接入注册汇总；已有通道保持名称、参数顺序和取消语义。主进程不能运行时 require shared 的 TypeScript 源码。

## 请求与返回

- 请求响应走 preload 的 `ipcRenderer.invoke`，主进程统一用 `registerHandle(channel, handler, validator)`。
- `validator` 接收 `unknown[]`，合法返回 `null`，非法返回不含敏感数据的错误文案；助手将其转换为 `INVALID_ARGUMENT`。
- 校验器必须安全处理任意输入，不能抛错。当前助手在业务 `try` 之前调用校验器；需要解析 JSON 时在校验器内捕获解析错误。
- shared 的 Zod schema 定义形状；主进程使用等价手写校验，核对可选值、范围、枚举与转换语义。Zod 当前是开发依赖，不能直接作为主进程运行依赖使用。
- handler 返回业务数据，由助手包装成功结果；不要再返回 `ipcOk(...)` 或嵌套 `IpcResult`。业务异常由助手收敛，脱离 handler 的异步任务须自行捕获并收尾。
- 返回只使用 `IpcResult<T>`：成功为 `{ success: true, data }`；失败为 `{ success: false, error: string, code?: string }`。不要返回 Error 对象或另设 `details` 契约。

真实注册示例来自 `apps/electron/src/main/core/windows/window.handlers.js`；下列函数已在该文件定义，不另建同名实现：

```js
registerHandle(IPC_CHANNELS.WINDOW_CONTROL, controlWindow, validateWindowControl);
```

这里 `controlWindow` 返回布尔值；`validateWindowControl` 拒绝未知动作；包装与错误码由注册助手负责。

渲染封装复用 `apps/next/src/utils/ipcResult.ts`：需要报告失败的操作用 `unwrapIpc`，允许回落的读取用 `unwrapIpcOr`。取消、空结果和失败应分别处理；连接中断等 Promise 拒绝也要捕获，并恢复加载状态。

## 事件与权限

- 主进程通知用 `webContents.send`；事件载荷按既有类型传递，不套请求返回包装。
- preload 只转发业务载荷，不传 Electron 事件对象；订阅返回只清理本次 listener 的函数。
- 窗口操作从 `event.sender` 确定目标；鉴权、路径和资源访问校验在主进程执行，不能只靠前端按钮禁用。
- 不暴露任意通道调用，不使用同步 IPC，不记录令牌、密钥、用户路径或向渲染层返回堆栈。

## 验证

运行根规则要求的检查；`pnpm verify` 检查通道与注册，类型检查覆盖桥接签名。按变更验证合法输入、非法输入无副作用、失败/取消、订阅清理；真实业务回归使用对应既有验证或冒烟脚本。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
