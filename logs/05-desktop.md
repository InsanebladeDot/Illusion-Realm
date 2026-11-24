# 安装、数据、原型与门禁

## 关键结果

- 2026-11-24 打包 Agent 使用隔离 Python 和测试模型通过 22/22。安装器和真实机器整包安装的验收范围需分别查看。
- 2026-11-19 SQLite 迁移在写出断言前退出 1。此前 4/4 和基础 SQLite 6/6 仍是各自的历史证据。个人页最近 127/135，统计空态和导航断言待复核。
- 书房实时人偶捕获记录为退出 124。此处保留原型试验结果，完整实时交互仍待复核。
- 2026-11-24 上一轮 `pnpm typecheck` 通过，`pnpm lint` 为 0 错误、38 条警告。`pnpm check` 在 `check:gates` 退出 1，三个未引用词条为 `auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference`。后续步骤当次未运行。
- 2026-11-06 的构建体积对照中，`/create` 直接脚本从 6,829,279 B 降至 2,690,063 B，下降 60.61%。启动耗时、实际 GPU 占用与帧率尚未采集。

总索引包含 69 个专项、1776 次运行，退出 0 共 1055 次，退出 1 共 720 次，退出 124 共 1 次。

## 专项最近记录

本组 23 个专项，共 219 次历史运行。时间为北京时间（UTC+8）。断言数量只适用于当次运行，结论以进程退出码为准。最近一次失败时附上此前通过记录。原始运行使用 `run-id` 定位。

| 专项 | 最近时间 | 退出 / 断言 | 最近一次通过（最近退出非零时） | run-id |
| --- | --- | --- | --- | --- |
| `appearance` | 2026-10-22 14:09 | 0 / 72/72 | — | `2026-10-22T06-08-46-053Z-40856` |
| `input-focus-audit` | 2026-11-20 12:47 | 1 / 0/0 | 2026-11-20 · 0/0 | `2026-11-20T04-45-31-555Z-47988` |
| `installer` | 2026-11-17 14:09 | 0 / 33/33 | — | `2026-11-17T06-08-56-361Z-44068` |
| `login` | 2026-11-17 14:06 | 0 / 52/52 | — | `2026-11-17T06-06-10-505Z-37436` |
| `packaged-agent` | 2026-11-24 11:20 | 0 / 22/22 | — | `isolated-python-path` |
| `profile-ui` | 2026-11-11 17:23 | 1 / 127/135 | 2026-10-22 · 105/105 | `2026-11-11T09-22-20-128Z-55976` |
| `setup-checklist` | 2026-11-21 21:12 | 0 / 9/9 | — | `2026-11-21T13-12-28-537Z-35428` |
| `setup-schema-upgrade` | 2026-11-17 00:16 | 0 / 1/1 | — | `2026-11-16T16-16-02-179Z-42156` |
| `sqlite` | 2026-11-16 23:49 | 0 / 6/6 | — | `2026-11-16T15-49-10-644Z-4352` |
| `sqlite-asar` | 2026-11-15 22:13 | 0 / 3/3 | — | `2026-11-15T14-13-20-397Z-21444` |
| `sqlite-migration` | 2026-11-19 17:54 | 1 / 0/0 | 2026-11-15 · 4/4 | `2026-11-19T09-54-19-647Z-49856` |
| `study-room-door-choice` | 2026-11-19 23:14 | 0 / 17/17 | — | `local prototype, Electron 43.7.1` |
| `study-room-idle-door` | 2026-11-20 12:24 | 0 / 28/28 | — | `local prototype, Electron 43.7.1` |
| `study-room-idle-webm` | 2026-11-19 19:53 | 0 / 12/12 | — | `local prototype, Electron 43.7.1` |
| `study-room-portrait-prototype` | 2026-11-19 15:53 | 0 / — | — | `local HTML` |
| `study-room-puppet-live-capture` | 2026-11-19 16:50 | 124 / — | — | `replaced by fixed-time capture` |
| `study-room-puppet-prototype` | 2026-11-19 16:50 | 0 / — | — | `local HTML` |
| `study-room-washi-spotlight` | 2026-11-19 23:27 | 0 / 20/20 | — | `local prototype, Electron 43.7.1` |
| `toolbar-customize-eight` | 2026-11-22 00:26 | 0 / — | — | `standalone UI prototype` |
| `toolbar-unlock-status` | 2026-11-21 23:47 | 0 / — | — | `standalone UI prototype` |
| `toolbar-unlock-status-text` | 2026-11-21 23:53 | 0 / — | — | `standalone UI prototype` |
| `window-history-notifications` | 2026-11-16 14:45 | 0 / 7/7 | — | `2026-11-16T06-45-48-090Z-40772` |
| `window-titlebar` | 2026-10-27 12:11 | 0 / 79/79 | — | `2026-10-27T04-10-57-251Z-20848` |

## 本轮归档核对

2026-11-24 导演台 8 项用例、Agent 供应商契约和 42 处脚本引用检查通过。未翻译清单按需生成到 `logs/generated/i18n-backlog.md`，本次记录 740 / 3530。
