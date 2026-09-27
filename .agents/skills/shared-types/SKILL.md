### `.agents/skills/shared-types/SKILL.md`

---
name: shared-types
description: >
  跨进程类型共享规范。当需要定义主进程和渲染进程之间共享的类型、接口、常量时使用。
  触发关键词：shared types, IPC result, Zod schema, GenerateImageParams, ElectronAPI, ipc-channels。
  适用于：定义 IPC 数据传输类型、共享常量、Zod 校验 schema 等场景。
---



## Location
All shared code lives in `packages/shared/src/`:
```
packages/shared/src/
├── ipc-channels.ts       # IPC channel name constants（当前仅 CHANNEL_TEST 占位）
├── index.ts              # Barrel export（types + data + ipc-channels）
├── modules.d.ts          # 第三方无类型模块的 ambient 声明（png-chunks-*）
├── types/
│   ├── index.ts          # types barrel
│   ├── common.ts         # ImageAsset / IconComponent 等框架无关基础类型
│   ├── electron-api.ts   # ElectronAPI interface（window.electronAPI 的类型）
│   ├── userData.ts       # 持久化文档聚合类型（USER_DATA_VERSION 等）
│   ├── settings.ts / model.ts / gallery.ts / comfy.ts / …
│   └── png-chunks.d.ts   # 命令式 ambient 声明（被 index.ts 用 /// reference 引入）
└── data/                 # 跨进程共用的纯常量/纯函数（无 React/Next 依赖）
    ├── index.ts
    ├── imageSizes.ts     # IMAGE_SIZE_PRESETS / DEFAULT_ASPECT_RATIO
    ├── historyFolders.ts # DEFAULT_FOLDER_ID
    └── profile.ts        # DEFAULT_PROFILE / PROFILE_TABS
```

### 硬性约束（迁移时踩过的坑）
- **禁止 `@/*` 别名**：shared 内部一律用相对路径（`./comfy`、`../data/imageSizes`）。
  Turbopack 会把 `.d.ts`/barrel 当运行时模块处理，别名会让构建直接失败。
- **禁止反向 import `apps/*`**；也不得依赖 `next/image` 等渲染进程框架类型。
- `react` 只允许 **type-only import**（`IconComponent = ComponentType<...>`），
  保证主进程引用 shared 时不会把 React 打进产物。
- barrel 里不要 `export * from './xxx.d.ts'`：`export *` 会生成真实 re-export，
  导致 Turbopack 报 "export doesn't exist"；声明型文件改名为真实模块（如 `electron-api.ts`）
  或用 `/// <reference path>` 引入。

## IPC Result Type
All IPC responses use this standard shape:
```ts
export interface IpcResult<T> {
  success: true;
  data: T;
}

export interface IpcError {
  success: false;
  error: string;
  details?: unknown;
}

export type IpcResponse<T> = IpcResult<T> | IpcError;
```

## Zod Schema Sync
- Every type that crosses IPC boundary MUST have a corresponding Zod schema.
- Schema file name matches type file: `types/image.ts` → `schemas/image.schema.ts`.
- Export inferred type FROM the schema (single source of truth):
```ts
// schemas/image.schema.ts
import { z } from 'zod';

export const GenerateImageSchema = z.object({
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(2000).optional(),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  steps: z.number().int().min(1).max(150).default(30),
  cfgScale: z.number().min(1).max(30).default(7),
  seed: z.number().int().optional(),
});

export type GenerateImageParams = z.infer<typeof GenerateImageSchema>;
```

## Rules
- NEVER define the same type in both main and renderer — import from `packages/shared`.
- NEVER use `any` in shared types. If truly dynamic, use `unknown` with type guard.
- All shared types must be plain objects (no class instances, no functions, no Date objects — use ISO strings).
- Barrel export from `packages/shared/src/index.ts` for clean imports.

## Anti-patterns (Forbidden)
- ❌ Duplicating type definitions across apps/electron and apps/next
- ❌ Using class instances in IPC data (they don't serialize)
- ❌ Using Date objects in IPC data (use ISO 8601 strings)
- ❌ Importing from apps/next or apps/electron inside packages/shared (creates circular dependency)



---
