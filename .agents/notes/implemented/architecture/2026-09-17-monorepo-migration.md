# Monorepo Migration — Architecture Decision

## Status
Implemented（按 `task/任务.md` 阶段 1–6 执行完成）

## Context
项目此前是「单包」结构：Next.js 应用在根目录（`src/`、`public/`、`next.config.ts`），
Electron 主进程在根目录 `electron/`，构建配置写在根 `package.json` 的 `build` 字段，
包管理用 npm（`package-lock.json`）。

这种布局的问题：
- 主进程与渲染进程同处一个依赖树，`electron`/`next` 的依赖混在一起，无法独立构建；
- 跨进程类型只能靠根 `tsconfig.json` 的 `@/*` 别名共享，主进程（CJS）拿不到这些类型；
- 打包配置与 Web 构建配置耦合在同一个 `package.json` 里。

## Decision
改为 pnpm workspace 三包结构（与 `.agents/skills/*` 规范一致）：

| 包 | 职责 | 入口 |
|----|------|------|
| `apps/next` | 渲染进程（Next 16 App Router，`output: "export"`） | `apps/next/src/app` |
| `apps/electron` | 主进程 + preload（手写 CommonJS） | `apps/electron/main.js` |
| `packages/shared` | 跨进程类型 + 纯数据常量（`@illusion-realm/shared`） | `packages/shared/src/index.ts` |

## Migration Details（含实际踩坑与偏离任务书之处）

### 1. 类型迁移的 import 兼容策略
任务书要求「把 `src/types/` 全部文件移到 `packages/shared/src/types/`」。全项目有 ~580 处
`@/types|x` 形式的 import，逐处改写风险高、噪音大。实际做法：
- 文件按任务书迁移；
- 在 `apps/next/tsconfig.json` 的 `paths` 中让 `@/*` 同时解析 `./src/*` 与
  `../../packages/shared/src/*` —— 历史 import 一行都不用改；
- 主进程侧不依赖这些类型（仍是 JS），因此不存在解析问题。

### 2. shared 去框架化（任务书未要求，但必须做）
移过来的类型里有 6 个文件反向依赖渲染进程框架：
`extension/gallery/model/presetPrompt/role.ts` → `next/image` 的 `StaticImageData`，
`navigation.ts` → `lucide-react` 的 `LucideIcon`。
pnpm 的隔离布局让 shared 无法解析这些类型（共享包不能依赖 apps），因此：
- 新增 `types/common.ts`：`ImageAsset`（结构兼容 `StaticImageData`）、
  `IconComponent`（`ComponentType<IconComponentProps>`，仅 type-only import react）；
- 迁移后 6 个文件与渲染进程 6 处引用全部改用新类型（`apps/next/src` 共 11 处）。

### 3. 纯数据常量下沉
`types/userData.ts` 反向 import `@/data/{imageSizes,profile,historyFolders}`。
为保持 shared 自洽，把这三个**纯模块**一并迁到 `packages/shared/src/data/`
（渲染进程继续用 `@/data/*` 命中，无感）。

### 4. `.d.ts` → 真实模块
`electron.d.ts` 里的 `export * from './electron.d'` 会被 Turbopack 当作真实运行时 re-export，
构建报 “export doesn't exist”。改名为 `types/electron-api.ts`（真实模块，恰好也是技能规范
要求的文件名），并补上它原先缺失的 `AnimadexSearchParams/Result` import。
`png-chunks.d.ts` 保留为命令式 ambient 声明，由 `src/index.ts` 顶部的 `/// <reference>` 引入。

### 5. 目录层级变化引起的路径修正
- `appProtocol.js` 的静态导出目录：`../out` → dev 用 `../next/out`、打包用 `resources/next-out`；
- 新增 `apps/electron/appPaths.js`：统一 `getAppRootDir()`。
  **关键**：dev 下必须仍返回「工作区根」，否则默认输出目录与
  `user/illusion-realm.json` 会从 `Priveate-blog-main\` 漂移到 `Illusion Realm\apps\`，
  老用户数据等于“消失”。
- `changelog:read`、`sync-changelog.mjs`（`logs.md` 仍在工作区根）同步修正。

### 6. 打包（electron-builder）
- 配置从根 `package.json#build` 抽到 `apps/electron/electron-builder.yml`；
- **Next 静态导出目录在 app 目录之外**（`apps/next/out`），electron-builder 不会把外部目录
  收进 asar；改为 `extraResources: ../next/out → resources/next-out`；
- 显式配置 `electronDist: node_modules/electron/dist`，否则打包时会去拉
  `electron-v43.7.1-win32-x64.zip`（本机网络下 ETIMEDOUT）；
- 输出目录走任务书的 `release/`（`apps/electron/release`），已 gitignore。

### 7. 锁文件与依赖
npm → pnpm 迁移后，旧根 `node_modules`（npm 布局）与 pnpm 隔离布局混用会导致
同一依赖出现两份（例如 `lucide-react` 1.25.0 与 1.46.0），React 类型身份分裂使 tsc 报错。
处理：删除旧 `node_modules`、以 `pnpm-lock.yaml` 为唯一来源；
Electron 二进制通过 `pnpm electron:install`（npmmirror 镜像）单独下载。

## Consequences
- (+) 进程边界由包结构强制，shared 真正成为单一事实来源；
- (+) `pnpm typecheck / lint / build / pack` 全部可跑通，打包产物已冒烟验证；
- (+) 用户数据与输出目录路径与迁移前**完全一致**；
- (-) 主进程仍是手写 CommonJS + JSDoc 空壳类型，`checkJs` 仍为 false，
  「主进程类型安全」这件事没有因为迁移而变好（仍是待办）；
- (-) `apps/next/tsconfig.json` 的 paths 双段解析属于兼容层，
  新代码应优先 `@illusion-realm/shared` 显式导入。

## Known Follow-ups（未在本次迁移中处理）
1. 主进程 IPC 通道名仍是字面量（`"userData:read"` 等），未接入 `IPC_CHANNELS`；
2. 主进程返回值不是统一的 `IpcResponse<T>`（`{success,data|error}`）形状；
3. 渲染进程 49 个既有 ESLint error（`react-hooks/set-state-in-effect` 35 +
   `react-hooks/refs` 14）在迁移前后完全一致，属既有问题，需要单独一轮修复；
4. `packages/shared` 尚未引入 Zod schema（`schemas/` 目录与 `ipc-result.ts` 未创建）。
