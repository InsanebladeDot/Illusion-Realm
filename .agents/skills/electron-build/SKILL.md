---
name: electron-build
description: 修改本项目开发启动、Electron 打包资源、Windows 安装向导或分发配置时使用；按现有构建链验证产物，新增平台或自动更新仅在任务需要时实施。
---

# 构建与分发

遵守根目录 [AGENTS.md](../../../AGENTS.md)。命令从仓库根执行，以两端 `package.json` 与实际构建配置为准。

## 现有命令

| 命令 | 实际用途 |
| --- | --- |
| `pnpm dev` | 并行启动 Next 与 Electron，Electron 等待 3000 端口 |
| `pnpm --filter @illusion-realm/next build` | 导出页面并记录源码构建指纹 |
| `pnpm pack` | 先导出 Next，再构建客户端目录 `apps/electron/release/win-unpacked` |
| `pnpm build` | 先导出 Next，再运行 `apps/electron/scripts/build-installer.cjs` |
| `pnpm check:packaged-agent` | pack 后检查真实打包路径上的 Agent，缺前提退出 2 |

主进程/preload 为手写 CommonJS，tsc 用于类型检查，不把它描述成生成主进程 JS 的步骤。

## 两层安装结构

- 客户端配置：`apps/electron/electron-builder.yml`，输出相对该包的 `release/`，启用 asar。
- 安装向导配置：`apps/electron/installer/electron-builder.yml`。构建脚本先生成客户端 NSIS 引擎，再用 portable 封装独立安装向导。
- 最终安装器位于 `apps/electron/release/setup/Illusion-Realm-Setup-${version}.exe`；portable 是安装向导外壳，不代表客户端免安装版。
- 保留引擎清单校验、当前用户安装、卸载时保留用户数据及完成页控制启动的行为。不要绕过向导直接启用 NSIS 安装后自动运行。
- 当前构建不自动发布。客户端免安装版、macOS/Linux 完整分发、签名和自动更新按明确任务另行接入，不能因已有图标配置宣称已支持。

## 资源与依赖

- 客户端 asar 收录 `src` 等白名单文件；安装向导和构建脚本按各自配置分发。
- `extraResources` 中的 `next-out`、`agent`、`ffmpeg` 及许可等资源按现有路径分发。变更资源位置时检查协议服务、Agent 和 FFmpeg 的定位代码。
- 开发静态导出是 `apps/next/out`，打包后是 `resources/next-out`。资源路径不能依赖开发目录层级。
- 主进程不运行时 require Zod 或 shared 的 TypeScript。新增运行依赖要检查实际导入和打包收录，不照搬通用依赖清单。
- 原生依赖按当前 Electron 版本重建；现有 Agent 环境能在开发机运行不等于目标机器可运行。
- 打包态判断用 `app.isPackaged`；保留已有开发、测试和工具环境开关。不要打入密钥或提交构建产物。

## 验证

按根规则运行检查，再按变更范围验证目录包、安装器或目标平台。打包成功不等于安装成功；安装流程测试使用隔离目录，不能覆盖真实用户数据。冒烟遵守单次运行和构建新鲜度要求；缺少目标平台、签名或安装验证时明确说明。代码注释遵守 [comment-coverage](../comment-coverage/SKILL.md)。
