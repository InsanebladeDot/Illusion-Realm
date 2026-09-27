### `.agents/skills/electron-build/SKILL.md`

---
name: electron-build
description: >
  Electron 应用构建打包规范。当需要配置或修改构建、打包、签名、自动更新时使用。
  触发关键词：electron-builder, electron-forge, asar, dmg, nsis, appx, code signing, autoUpdater, publish。
  适用于：打包配置、多平台构建、应用签名、自动更新、CI/CD 等场景。
---



## Build Tool
- Use `electron-builder` for packaging and distribution.
- Config file: `apps/electron/electron-builder.yml` (NOT in package.json).

## Build Output
- Output directory: `release/` (gitignored).
- Platform targets:
  - Windows: NSIS installer (.exe) + portable (.exe)
  - macOS: DMG + ZIP (universal binary for Intel + Apple Silicon)
  - Linux: AppImage + deb

## ASAR Packaging
- Enable ASAR by default: `asar: true`.
- Unpack native modules: `asarUnpack: ['**/*.node']`.
- NEVER commit `release/` directory to git.

## Dependencies
- `dependencies` in package.json: packages needed at runtime (axios, better-sqlite3, zod).
- `devDependencies`: packages needed only at build time (electron, electron-builder, typescript).
- If a runtime import fails after packaging, check it's in `dependencies` not `devDependencies`.

## Environment Variables
- Build-time env vars prefixed with `BUILD_` (e.g., `BUILD_APP_VERSION`).
- Runtime env vars: use `app.getPath()` and config files, NOT `process.env` (unreliable in packaged app).
- API keys: NEVER bundle in build. Load from user config file at runtime.

## Auto Update
- Use `electron-updater` with `autoUpdater`.
- Check for updates on app start (with 5-second delay to avoid blocking startup).
- Notify user via renderer IPC when update is available.
- Support manual check in Settings page.

## Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:electron\" \"pnpm dev:next\"",
    "dev:electron": "cd apps/electron && electron .",
    "dev:next": "cd apps/next && next dev",
    "build": "pnpm build:next && pnpm build:electron",
    "build:next": "cd apps/next && next build",
    "build:electron": "cd apps/electron && tsc",
    "pack": "pnpm build && electron-builder --dir",
    "dist": "pnpm build && electron-builder",
    "dist:win": "pnpm build && electron-builder --win",
    "dist:mac": "pnpm build && electron-builder --mac",
    "dist:linux": "pnpm build && electron-builder --linux"
  }
}
```

## Anti-patterns (Forbidden)
- ❌ Putting electron-builder config in package.json (use separate yml file)
- ❌ Bundling API keys or secrets in the build
- ❌ Forgetting to rebuild native modules for Electron target
- ❌ Committing release/ output to git
- ❌ Using `process.env.NODE_ENV` checks in packaged app (use `app.isPackaged`)



---
