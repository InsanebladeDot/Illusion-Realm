# 创作页提示词助手：翻译历史

入口为提示词输入框内的「提示词助手 → 翻译历史」。普通提示词、负面提示词及高级组装分类复用同一入口与记录集合。

## 行为与边界

- 成功响应后记录原文、译文、完成时间、供应商、实际模型和当时预设名称。
- 默认最新在前，可切换最早在前。展开查看原文/译文，可复制完整译文；查看与复制不覆盖当前输入。
- 沿用本地用户文档 `promptAssistant.history`，最多保留最近 100 条。旧文档没有该字段时为空库，不回溯功能启用前的翻译。
- 翻译期间编辑原文或切换分类产生的待确认结果仍保留；撤销替换不删除历史。401、403、空返回及截断输出等失败不产生成功记录。
- 偏好保存排队，函数补丁在执行时读取最新历史，避免两个输入框的回包相互覆盖。历史保存失败单独提示，已经返回的译文继续交给原冲突保护处理。
- 没有新增 IPC、密钥存储或数据库。历史字段不进入发给模型的请求；原转换 schema 只提交既有请求字段。

## 修改与复用

| 文件 | 本轮职责 |
| --- | --- |
| `components/prompt-assistant/assistant-menu.tsx` | 同一菜单增加历史入口 |
| `components/prompt-assistant/prompt-assistant-toolbar.tsx` | 管理查看页与关闭焦点 |
| `components/prompt-assistant/assistant-history.tsx` | 参数化记录行、时间方向与对照查看 |
| `components/prompt-assistant/use-prompt-transform.ts` | 成功响应边界记录发送快照 |
| `stores/usePromptAssistantStore.ts` | 兼容旧数据、归一化和串行保存 |
| `utils/prompt-translation-history.ts` | 字段校验、日期排序、id 去重及数量上限 |
| `packages/shared/src/types/prompt-assistant.ts` | 可选历史字段及记录类型 |
| `i18n/locales/{zh-CN,en}/create.ts` | 双语界面文案 |
| `scripts/smoke-prompt-assistant.js`、`scripts/lib/check-prompt-translation-history.js` | 复用原静态页、正式 preload、隔离文档和回归步骤 |

表中渲染侧路径均相对 `apps/next/src/`。页面外壳复用 `ResourceDialogShell`，创建页窄屏进入现有 main 宿主；剪贴板复用 `copyText`。原翻译、预设编辑、撤销与分类组装继续保持各自业务状态。

## 实际验证

- `pnpm typecheck`：通过。
- `pnpm lint`：通过，0 error、33 条既有 warning。
- `pnpm --filter @illusion-realm/next build`：通过，28 个静态页面；指纹 `6f9f205ffc25a38f3905fcecf0d7818560c3c0017a0eb2219a16d54c9d4e28d6`。
- `pnpm check:locale-keys`：通过。
- 正式归一化函数的临时反证检查：缺省旧数据、坏字段、非法日期、重复 id、原文逐字保留、输入不被修改及 100 条保留边界通过。
- `pnpm exec electron scripts/smoke-prompt-assistant.js --qa-dir=C:/Users/18305/AppData/Local/Temp/ir-translation-history-2026-11-01`：最终通过 77/77，保留原 66 项回归并新增 11 项历史断言。覆盖空态、成功/失败、原文快照、时间方向、真实系统剪贴板、草稿保留、多个来源共享、供应商快照、重载恢复及窄屏 main 布局。
- `pnpm check`：类型、Electron 模块与通道检查通过；随后门禁被工作区已有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 阻断，后续串联检查未执行。
- 本轮相关已跟踪文件 `git diff --check` 通过；新增回归脚本语法检查通过。

首轮复制断言因隐藏离屏文档没有焦点超时。测试补上正常显示/聚焦并验证 `document.hasFocus()`，没有替换产品剪贴板接口；之后实际写入与读回通过。首次浅色截图拿到窗口显示切换期间的旧合成帧，已调整到稳定阶段重拍，最终再次 77/77。失败与最终通过记录均留在 `logs/smoke-runs.log`。

真实组件运行截图（远端使用受控响应，不代表公网翻译质量验证）：

- `C:/Users/18305/AppData/Local/Temp/ir-translation-history-2026-11-01/translation-history-light.png`
- `C:/Users/18305/AppData/Local/Temp/ir-translation-history-2026-11-01/translation-history-dark.png`
- `C:/Users/18305/AppData/Local/Temp/ir-translation-history-2026-11-01/translation-history-narrow.png`

未验证真实公网服务响应质量、真实用户目录的写入权限故障、系统拒绝剪贴板时的实机反馈、触屏及读屏体验。未重新生成 setup 安装包，旧安装版本不会自动包含本轮改动。

## 增量注释率

基线为 `C:/Users/18305/AppData/Local/Temp/ir-translation-history-baseline-ywukkr26/baseline.json`，保留工作区既有修改，只统计本次新增/替换行；新增文件统计全文。按中文有效说明与非空代码分别计数，代码/注释混合行仅算代码，独立注释定界符及空行不计。

| 文件 | 有效注释 C | 非空代码 B |
| --- | ---: | ---: |
| assistant-menu.tsx | 8 | 3 |
| prompt-assistant-toolbar.tsx | 15 | 5 |
| use-prompt-transform.ts | 28 | 8 |
| usePromptAssistantStore.ts | 33 | 14 |
| shared prompt-assistant.ts | 26 | 11 |
| zh-CN/create.ts | 15 | 9 |
| en/create.ts | 15 | 9 |
| assistant-history.tsx | 109 | 47 |
| prompt-translation-history.ts | 40 | 17 |
| smoke-prompt-assistant.js | 20 | 13 |
| check-prompt-translation-history.js | 157 | 61 |

业务合计 C=289、B=123，70.15%；测试合计 C=177、B=74，70.52%。数量统计后核对职责、失败边界与断言含义；例如以“排队盖章”解释保存时才合并最新历史，以“成功收据”区分模型结果与是否应用到当前草稿。普通业务逻辑函数未超过 30 行有效代码；展示 JSX 按职责保留，未为行数制造包装组件。
