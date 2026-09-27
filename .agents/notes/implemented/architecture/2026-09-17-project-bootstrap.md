### `.agents/notes/implemented/architecture/2026-09-17-project-bootstrap.md`

# Project Bootstrap — Architecture Decision

## Status
Implemented

## Context
Illusion Realm is a desktop AI creation tool built with Electron + Next.js.
The project needs a clear separation between main process (OS-level operations)
and renderer process (UI), with secure IPC communication between them.

## Decision
Adopted a monorepo structure with three workspace packages:
- `apps/electron`: Main process + preload scripts
- `apps/next`: Next.js 15 renderer (App Router)
- `packages/shared`: Types, schemas, IPC channel definitions

## Alternatives Considered
1. **Single-package Electron + Next.js integration (e.g., next-electron)**
   - Rejected: Tight coupling, harder to test, no clear process boundary
2. **Tauri instead of Electron**
   - Rejected: Need Chromium for 3D model viewer (Three.js), Tauri's WebView insufficient
3. **Separate Git repos for main and renderer**
   - Rejected: Shared types become painful, version sync issues

## Consequences
- (+) Clear process boundary enforced by package structure
- (+) Shared types prevent IPC data shape mismatches
- (+) Each app can be developed and tested independently
- (-) Slightly more complex build pipeline (need to build both apps)
- (-) pnpm workspace learning curve for new contributors

## Status Update (monorepo 迁移已落地)
上述 monorepo 结构已按 `task/任务.md` 的 6 个阶段实施完成，详见
`.agents/notes/implemented/architecture/2026-09-17-monorepo-migration.md`。
本文件随后记录的「8 个文件清单」为技能包初始化记录，保留备查。

---
全部 8 个文件都给你了 ✅ 最终文件清单：

| # | 文件路径 | 用途 |
|---|---------|------|
| 1 | `.agents/skills/electron-main-process/SKILL.md` | 主进程开发规范 |
| 2 | `.agents/skills/electron-ipc/SKILL.md` | IPC 通信规范 |
| 3 | `.agents/skills/electron-preload/SKILL.md` | 预加载脚本规范 |
| 4 | `.agents/skills/nextjs-renderer/SKILL.md` | Next.js 渲染进程规范 |
| 5 | `.agents/skills/electron-build/SKILL.md` | 构建打包规范 |
| 6 | `.agents/skills/shared-types/SKILL.md` | 跨进程类型共享规范 |
| 7 | `AGENTS.md` | 根目录常驻规则 |
| 8 | `.agents/notes/implemented/architecture/2026-09-17-project-bootstrap.md` | 架构决策记录 |

放到对应目录后重启 DeepSeek Harness 会话即可生效。后续新增模块（比如 ComfyUI 工作流、AI 推理引擎等），按同样的格式在 `.agents/skills/` 下新建文件夹写 SKILL.md 就行。

---
