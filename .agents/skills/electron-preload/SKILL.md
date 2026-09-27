### `.agents/skills/electron-preload/SKILL.md`

---
name: electron-preload
description: >
  Electron 预加载脚本开发规范。当需要编写或修改 preload 脚本时使用。
  触发关键词：preload, contextBridge, exposeInMainWorld, electronAPI, window.api。
  适用于：暴露主进程 API 给渲染进程、类型安全的桥接层设计等场景。
---



## Entry File
- Preload entry: `apps/electron/preload.js`（CommonJS，随 asar 分发，无需编译）
- Loaded via `webPreferences.preload` in `apps/electron/main.js`（`path.join(__dirname, 'preload.js')`）
- 类型定义（供渲染进程消费）位于 `packages/shared/src/types/electron-api.ts`

## API Surface Design
- Expose a SINGLE object via `contextBridge.exposeInMainWorld('electronAPI', { ... })`.
- Group APIs by domain:
```ts
contextBridge.exposeInMainWorld('electronAPI', {
  // Image generation
  image: {
    generate: (params: GenerateImageParams) => ipcRenderer.invoke(IPC_CHANNELS.GENERATE_IMAGE, params),
    onProgress: (cb: (data: ProgressData) => void) => {
      const listener = (_: any, data: ProgressData) => cb(data);
      ipcRenderer.on(IPC_CHANNELS.GENERATE_IMAGE_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GENERATE_IMAGE_PROGRESS, listener);
    },
  },
  // File operations
  file: {
    openDialog: (options?: OpenDialogOptions) => ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN_DIALOG, options),
    saveDialog: (options?: SaveDialogOptions) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_DIALOG, options),
  },
  // System
  system: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_VERSION),
  },
});
```

## Type Safety
- Define the `ElectronAPI` interface in `packages/shared/src/electron-api.ts`:
```ts
export interface ElectronAPI {
  image: {
    generate: (params: GenerateImageParams) => Promise<IpcResult<ImageResult>>;
    onProgress: (cb: (data: ProgressData) => void) => () => void;
  };
  file: {
    openDialog: (options?: OpenDialogOptions) => Promise<IpcResult<string[]>>;
    saveDialog: (options?: SaveDialogOptions) => Promise<IpcResult<string>>;
  };
  system: {
    getVersion: () => Promise<IpcResult<string>>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```
- This file is shared between preload (implementation) and renderer (consumption).

## Event Listener Cleanup
- Every `on*` method MUST return an unsubscribe function.
- Renderer side MUST call unsubscribe in useEffect cleanup or component unmount.
- Never accumulate listeners — always remove before re-adding.

## Security Rules
- NEVER expose `ipcRenderer` or `ipcMain` directly.
- NEVER expose `require`, `process`, or `Buffer` to renderer.
- NEVER use `contextBridge.exposeInMainWorld` with `process` or `Buffer`.
- Expose only typed, validated, minimal API surface.

## Anti-patterns (Forbidden)
- ❌ Multiple `exposeInMainWorld` calls (use one, group by domain)
- ❌ Exposing `ipcRenderer.send` / `ipcRenderer.invoke` directly
- ❌ Passing callbacks through IPC (use event listeners instead)
- ❌ Importing renderer packages (React, etc.) in preload



---
> 现状备注：`apps/electron/preload.js` 通过 `contextBridge.exposeInMainWorld('electronAPI', ...)`
> 一次性暴露按域分组的方法（selectFolder / comfyGenerate / videoRun / …），与上述规范一致。
> 主进程侧 IPC 通道名目前仍是字面量（如 `"userData:read"`），
> 后续接入 `packages/shared/src/ipc-channels.ts` 时按 `domain:action` 统一收敛。