# 创作页提示词分组：手动排序模式

## 完成的行为

普通态把“提示词分组 / 按当前顺序组合 / 调整顺序”放在同一工具栏。点击“调整顺序”后，原面板切换为纵向排序列表，显示手柄、序号、分组名称、填写标记和内容片段数；取消与完成固定在模式栏中，列表单独滚动。

- 鼠标拖拽或键盘空格提起、方向键移动、空格放下，只修改当前排序草稿。
- “完成”一次提交最终顺序，回到按新顺序排列的普通分组栏，实际生成词随之更新。
- “取消”丢弃本轮草稿，保留之前确认的顺序。拖动中的 Esc 只取消这次拖动。
- 当前分组与正文按稳定 id 保留，完成后焦点回到“调整顺序”。
- 图片排序保存在原用户文档的 promptTabs 数组内，蒙版仍属于独立编辑会话。
- 关闭高级面板或宽窄布局迁移导致面板重建时，未确认草稿取消；已经确认的队列保留。
- 内容数量按英文逗号、中文逗号、换行的非空片段计算，用于识别分组，不宣称是模型 token 数。

## 文件与复用

| 文件（相对仓库根） | 职责 |
| --- | --- |
| `apps/next/src/view/create/promptAssembly/PromptAssemblyPanel.tsx` | 普通工具栏、模式切换、提交和焦点恢复；普通编辑 DOM 隐藏保留，避免工具状态被销毁 |
| `apps/next/src/view/create/promptAssembly/prompt-group-order-editor.tsx` | 一个参数化排序编辑器；通过 tabs、activeId、disabled、onCancel、onConfirm 注入不同实例 |
| `apps/next/src/utils/promptTabs.ts` | orderPromptTabs 根据身份名单安排最新对象，忽略失效/重复 id，新增成员追加到末尾 |
| `apps/next/src/stores/useCreateFormStore.ts` | 图片队列整批提交，继续使用既有 persist |
| `apps/next/src/stores/use-mask-prompt-store.ts` | 蒙版队列整批提交及原任务锁，保持 session 范围 |
| `apps/next/src/i18n/locales/{zh-CN,en}/promptAssembly.ts` | 双语排序入口、模式、项数与键盘说明 |
| `scripts/lib/check-prompt-order-editor.js` | 指针/键盘、取消/完成、宽窄布局及主题回归 |
| `scripts/lib/check-prompt-drag.js` | 保留真实 Chromium 指针 helper，移除旧即时排序专用断言 |
| `scripts/smoke-prompt-assistant.js` | 接入新排序回归，更新蒙版确认前后及独立性断言 |

直接复用既有 `components/sortable-list.tsx`、dnd-kit 传感器和 `reorderPromptTab`，没有修改公共拖拽容器或 GIF 调用方。图片与蒙版共用展示和纯排序算法，生成、翻译、持久化及业务锁仍归原调用方；不新增 IPC、用户文档分区或全局排序状态。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过；全量 check 中再次通过 |
| `pnpm lint` | 通过，0 error / 33 条既有 warning |
| `pnpm check:locale-keys` | 通过，18 个命名空间键一致 |
| `pnpm --filter @illusion-realm/next build` | 通过，28 个静态页面；指纹 `86b78989c01101650d42acd63642bd65b2c5919e69769bede11df0dc06f23571` |
| `pnpm exec electron scripts/smoke-prompt-assistant.js --qa-dir=C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01` | 78/78 通过；新增模式、确认前正文/保存队列不变、取消、真实指针、真实键盘、活动分组、焦点、重载及蒙版隔离 |
| `pnpm check` | 类型、Electron 模块/通道检查通过；check:gates 被既有未引用词条拦住：auth.verifySuccess、common.localeNameSelf、create.generationTasks.active；后续串联项未执行 |
| 相关已跟踪文件 `git diff --check`、新增脚本语法 | 通过 |
| 新排序测试函数长度 | moveWithKeyboard 8 行，checkSession 25 行，checkAppearance 20 行；普通逻辑均不超过 30 行 |

第一次类型检查遇到用户正在运行的 Next 开发服务器临时重建 `.next/dev/types`，报告一个已消失的生成文件；随后正常类型检查及构建均通过，没有关闭用户开发进程或修改类型配置。第一次冒烟已经 78/78；为使窄屏截图展示全部行，测试增加原生滚动到面板中央后重跑，最终仍为 78/78。结果已追加到 `logs/smoke-runs.log`，仅销毁本轮测试窗口。

真实静态页面运行截图，已人工核对浅色、深色、窄屏与返回状态：

- [普通态入口](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-order-browse-before.png)
- [浅色排序态](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-order-edit-light.png)
- [深色排序态](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-order-edit-dark.png)
- [900px 窄屏排序态](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-order-edit-narrow.png)
- [完成后返回普通态](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-order-browse-after.png)
- [蒙版确认后状态](C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-2026-11-01/prompt-group-order-mask.png)

冒烟使用正式 preload、业务 store 和真实 Chromium 输入；远端翻译使用隔离的受控响应，不代表公网翻译或 ComfyUI 实际生成验证。未验证触屏、读屏、系统多种缩放比例、任意短窗口；未单独重跑 GIF 交互，公共拖拽实现未变更。未重新打包 setup，已有安装包不会自动包含本次修改。

## 增量注释率

基线为本轮实施前的工作区快照 `C:/Users/18305/AppData/Local/Temp/ir-prompt-order-edit-baseline-3bivce_u/baseline.json`，没有把已有翻译历史或更早的排序改动计算为本次成果。修改文件只统计新增/替换后的行，新文件统计全文；空行、删除行、未变更上下文与纯注释定界符不计；混合行归代码。文本识别后人工核对注释描述与当前行为，业务与测试分别汇总。

| 文件 | 有效注释 C | 非空代码 B |
| --- | ---: | ---: |
| PromptAssemblyPanel.tsx | 53 | 23 |
| prompt-group-order-editor.tsx | 112 | 49 |
| promptTabs.ts | 27 | 9 |
| useCreateFormStore.ts | 8 | 3 |
| use-mask-prompt-store.ts | 11 | 5 |
| zh-CN/promptAssembly.ts | 6 | 3 |
| en/promptAssembly.ts | 6 | 3 |
| **业务合计** | **223** | **95** |
| smoke-prompt-assistant.js | 20 | 5 |
| check-prompt-drag.js | 0 | 1 |
| check-prompt-order-editor.js | 133 | 59 |
| **测试合计** | **153** | **65** |

业务 `223 / (223 + 95) = 70.13%`；测试 `153 / (153 + 65) = 70.18%`。

示例：用“先在便签安排座位、完成才交给店员”解释本地草稿与正式队列的区别；用“核对账本与桌上便签”解释为什么测试要分别读用户文档回执与排序 DOM，避免只看到视觉变化就宣布成功。
