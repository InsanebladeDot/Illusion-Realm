### `.agents/skills/electron-ipc/SKILL.md`

---
name: electron-ipc
description: >
  Electron IPC 通信规范。当需要编写主进程与渲染进程之间的通信代码时使用。
  触发关键词：ipcMain, ipcRenderer, contextBridge, invoke, send, on, handle, channel, preload API。
  适用于：定义 IPC 通道、编写预加载脚本暴露 API、渲染进程调用主进程能力、主进程推送事件到渲染进程等场景。
---



## Core Principle
IPC is the ONLY communication channel between main process and renderer.
All data crossing this boundary must be serializable (no functions, no class instances, no Symbols).

## Channel Definition
All IPC channel names are defined in `packages/shared/src/ipc-channels.ts`:
```ts
export const IPC_CHANNELS = {
  // Image generation
  GENERATE_IMAGE: 'image:generate',
  GENERATE_IMAGE_PROGRESS: 'image:generate-progress',
  // 3D model
  MODEL_LOAD: 'model:load',
  MODEL_EXPORT_POSE: 'model:export-pose',
  // Asset library
  ASSET_LIST: 'asset:list',
  ASSET_IMPORT: 'asset:import',
  // File operations
  FILE_SAVE_DIALOG: 'file:save-dialog',
  FILE_OPEN_DIALOG: 'file:open-dialog',
  // System
  SYSTEM_GET_PATH: 'system:get-path',
  SYSTEM_GET_VERSION: 'system:get-version',
} as const;
```
- NEVER use string literals as channel names. Always reference `IPC_CHANNELS`.
- Channel naming convention: `domain:action` (e.g., `image:generate`).

## Request-Response Pattern (Preferred)
Use `ipcMain.handle` + `ipcRenderer.invoke` for all request-response flows:

Main process:
```ts
ipcMain.handle(IPC_CHANNELS.GENERATE_IMAGE, async (_event, params: GenerateImageParams) => {
  const validated = GenerateImageSchema.parse(params);
  try {
    const result = await imageService.generate(validated);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: serializeError(error) };
  }
});
```

Preload:
```ts
contextBridge.exposeInMainWorld('electronAPI', {
  generateImage: (params: GenerateImageParams) =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_IMAGE, params),
});
```

Renderer:
```ts
const result = await window.electronAPI.generateImage(params);
if (!result.success) {
  showToast(result.error);
  return;
}
```

## Event Push Pattern (Main → Renderer)
Use `webContents.send` ONLY for one-way notifications (progress, status changes):
```ts
mainWindow.webContents.send(IPC_CHANNELS.GENERATE_IMAGE_PROGRESS, { percent: 45 });
```
- Renderer listens via `ipcRenderer.on` in preload, exposed as `onGenerateProgress(callback)`.
- Always remove listeners in cleanup (useEffect return / component unmount).

## Input Validation
- ALL parameters received by `ipcMain.handle` MUST be validated with Zod schemas.
- Validation happens in main process, NOT in preload.
- Return typed error on validation failure:
```ts
import { ZodError } from 'zod';
try {
  const validated = Schema.parse(params);
} catch (err) {
  if (err instanceof ZodError) {
    return { success: false, error: 'Invalid parameters', details: err.flatten() };
  }
  throw err;
}
```

## Error Serialization
- Never throw raw Error objects across IPC (they lose stack traces and may contain sensitive info).
- Use a `serializeError()` utility that extracts: `{ name, message, code? }`.
- Never include file paths, system info, or stack traces in error messages sent to renderer.

## Anti-patterns (Forbidden)
- ❌ Using `ipcMain.on` for request-response (use `ipcMain.handle` instead)
- ❌ Using `ipcRenderer.sendSync` (blocks renderer process)
- ❌ Exposing raw `ipcRenderer` object via contextBridge
- ❌ Passing functions, class instances, or DOM elements through IPC
- ❌ Using string literals for channel names
- ❌ Handling IPC without try-catch
- ❌ Sending large binary data through IPC (use file paths instead, let renderer read via dedicated API)


---
