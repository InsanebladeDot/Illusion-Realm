---
name: electron-preload
description: 修改 Electron preload 的桥接方法、事件订阅或启动语言快照时使用；维护现有 electronAPI 签名和隔离边界。
---

# Preload 桥接

遵守根目录 [AGENTS.md](../../../AGENTS.md)。入口为 `apps/electron/src/preload/index.js`，使用手写 CommonJS，随 asar 分发。接口类型位于 `packages/shared/src/types/electron-api.ts`。

## 现有 API

- 保持当前 `window.electronAPI` 的顶层方法结构，例如 `selectFolder`、`comfyGenerate`、`videoRun`、`controlWindow`；不要为整理文档改成 `image.generate` 等嵌套接口。
- 通道引用 `apps/electron/src/common/ipc-channels.js` 的 `IPC_CHANNELS`；不暴露可传入任意通道名的 `invoke` 或 `send`。
- invoke 方法原样返回 `Promise<IpcResult<T>>`，由渲染封装解包。桥接层不替业务吞错、写入文件或重排参数。
- 类型修改同步 shared 的 `ElectronAPI` 和真实调用方。JS 使用 JSDoc 引用类型；动态载荷用 `unknown` 验证，不使用 `any` 或直接运行 TypeScript 语法。

真实方法与通道对应关系：

| 方法 | 通道 | 请求成功时的数据 |
| --- | --- | --- |
| `selectFolder(defaultPath?)` | `DIALOG_SELECT_FOLDER` | 路径或取消时的 `null` |
| `controlWindow(action)` | `WINDOW_CONTROL` | 窗口当前最大化状态 |
| `onWindowMaximized(callback)` | `WINDOW_MAXIMIZED` | 事件布尔值；方法返回取消订阅函数 |

请求校验及返回约定见 [electron-ipc](../electron-ipc/SKILL.md)。preload 可以过滤事件载荷，但不能替代主进程的输入和权限校验。

## 事件订阅

- listener 留在 preload，只将业务数据交给 callback，不转发 `IpcRendererEvent`。
- 每次订阅返回独立取消函数，使用同一 listener 引用调用 `removeListener`；不使用 `removeAllListeners` 影响其他订阅者。
- 渲染调用方在 effect 清理或卸载时取消订阅；事件不等于首次状态快照，需要初始值时沿用对应查询接口。

## 启动语言例外

`window.initialLocale` 是已有的独立同步快照，由 `apps/electron/src/common/initial-locale.js` 解析启动参数。首帧决议语言时就要读取，不能改成异步 invoke 或延迟到 effect。

沿用入口中的暴露方式：

```js
const initialLocale = parseInitialLocale(process.argv);
if (initialLocale !== undefined) {
  contextBridge.exposeInMainWorld("initialLocale", initialLocale);
}
```

保留原始值，合法语言与回退由渲染层决议；缺值时不暴露，不能向 contextBridge 传入 `undefined`。因此不设置“只能调用一次 exposeInMainWorld”的禁令；新增暴露仍须有具体需求和最小数据范围。

## 安全与验证

不暴露 `ipcRenderer`、`require`、`process`、`Buffer` 或主进程模块。窗口沿用 `contextIsolation: true`、`nodeIntegration: false`；当前 `sandbox: false` 支持 CommonJS preload 的本地 require。

按根规则检查类型与通道注册；事件改动验证两个订阅者互不干扰、卸载后不再回调。启动语言改动运行 `pnpm check:initlocale` 及相关启动冒烟；只有普通浏览器验证不能证明 preload 正常。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
