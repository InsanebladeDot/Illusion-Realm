### `.agents/skills/electron-main-process/SKILL.md`

---
name: electron-main-process
description: >
  Electron 主进程开发规范。当需要编写或修改主进程代码时使用。
  触发关键词：main process, BrowserWindow, app, Tray, Menu, dialog, shell, nativeTheme, powerSaveBlocker, autoUpdater。
  适用于：创建窗口、系统托盘、原生菜单、文件对话框、系统通知、自动更新、电源管理等场景。
---



## Technology Constraints
- Electron 35+ (latest stable)
- Node.js runtime — full access to fs, path, child_process, crypto, etc.
- Entry file: `apps/electron/main.js`（CommonJS：`require` / `module.exports`，**不是** ESM/TS）
- 窗口与协议：`apps/electron/appProtocol.js`、`apps/electron/appPaths.js`
- 一个文件一个职责。禁止 god-file。

## Window Management
- 所有 BrowserWindow 都在 `apps/electron/main.js` 的 `createWindow()` 中创建（当前为单窗口应用）。
- 若新增窗口，先抽出 `windows/create-window.ts`，并集中管理窗口配置（size / minSize / frame / webPreferences）。
- Default webPreferences for ALL windows:
  ```js
  {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: path.join(__dirname, 'preload.js'),
  }
  ```
- DevTools: only open in development mode (`!app.isPackaged`).
- Use `BrowserWindow.getAllWindows()` to check existing windows before creating duplicates.

## App Lifecycle
- Handle `ready`, `window-all-closed`, `activate`, `before-quit` events explicitly.
- On macOS, re-create window on `activate` if no windows exist.
- On `before-quit`, save application state and clean up resources.
- Single instance lock: `app.requestSingleInstanceLock()` — reject second instance.

## Native Modules
- Native modules (better-sqlite3, sharp, etc.) must be rebuilt for Electron: `electron-rebuild`.
- Import native modules ONLY in main process. Never in preload or renderer.
- Wrap native module calls in try-catch with graceful fallback.

## File Operations
- All file paths resolved via `app.getPath()` — never hardcode user directories.
- Use `app.getPath('userData')` for app data, `app.getPath('downloads')` for exports.
- File I/O operations must be async (`fs.promises` or `fs-extra`).
- Validate file paths before operations to prevent path traversal attacks.

## Anti-patterns (Forbidden)
- ❌ Creating BrowserWindow without explicit webPreferences
- ❌ Using `nodeIntegration: true`
- ❌ Blocking the main event loop (no sync file reads, no long computations without worker_threads)
- ❌ Storing secrets in plain text files
- ❌ Using `remote` module (deprecated and removed)
- ❌ Importing renderer-only packages (React, Next.js) in main process



---
