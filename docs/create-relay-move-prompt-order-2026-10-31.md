# 创作页：Euzhi、图库移动与提示词队列

日期：2026-10-31。仅记录本轮增量，不包含工作区之前的模型匹配、编辑器等修改。

## 使用与复用

- 提示词组装顶部新增“自动排序”。打开后可拖动分类手柄，或选择分类用左/右箭头调整先后；最终提示词立即按队列拼接。关闭只收起排序控件，保留已排顺序。
- 默认分类和自定义分类使用同一个队列。复用 `assemblePrompt`，新增纯函数 `movePromptTab` 由图片 store 与蒙版 store 共用。界面仍是同一个 `PromptAssemblyPanel`，蒙版经 `assemblyStore` 注入独立草稿。
- 图片页队列沿用 `createForm.promptTabs` 保存；恢复时保留保存顺序，新补的默认分类放在末尾。蒙版仍维持原有内存会话，不新增落盘分区。模板仍按分类 id 保存/应用内容，加载模板不会重排队列。
- 创作页提示词助手新增 Euzhi。API Key、Grok 模型和推荐选择复用 Agent 已有能力；助手选站不改变 Agent 当前选站。设置表单明确共享凭据，保存/清除在两个入口同步生效。
- Euzhi 目的地址由主进程固定，复用原 OpenAI 兼容文本请求、错误映射、超时、原稿冲突检查和撤销。GLM/custom 配置保持各自独立。
- 图库多选工具栏新增“移动”。宽屏 side 与窄屏 main 文件管理页复用同一个 `CreateHistorySidebar`，不复制工具栏和多选业务。
- 移动复用 `selectLocalFolder`、`moveImagesToFolderOnDisk` 和已有主进程 `moveImagesToFolder`。当前目标沿用服务边界：输出根或其子目录；不更改下一次生成的位置。取消/失败保留勾选，成功按实际移动数量反馈，重名保护及旧 JSON 旁车跟随由原磁盘服务处理。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过；最终 Next 构建也重新完成渲染层 TypeScript 检查 |
| `pnpm lint` | 0 错误，33 条既有警告；最后拆分的助手 hook 另行 lint 通过 |
| `pnpm --filter @illusion-realm/next build` | 通过，28 个静态页面 |
| `pnpm check` 中 Electron 模块、通道与注册验证 | 通过 |
| `pnpm check` 全链 | 未全部通过：停在原有未引用键 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；之后阶段没有在该命令内继续运行 |
| 双语键、硬编码文案、英文基线、脚本引用专项 | 分别通过 |
| 提示词助手 Electron 离屏回归 | 63/63，通过真实静态页、preload 和生产凭据/转换 handler；Euzhi 远端响应由夹具替换 |
| 图库移动 Electron 离屏回归 | 12/12，真实 PNG 与文件移动；仅原生目录选择结果由夹具控制 |

回归包括：旧 GLM/custom 翻译、冲突与撤销；Euzhi 缺钥、共享保存/清除、固定地址与模型、供应商独立、重载与非法模型拒绝；调序后的合并正文、活动组内容不变、收起保留、文档恢复、浅深主题与窄屏；蒙版队列与图片分类快照独立；移动取消、空选择禁用、越界/不存在目录、嵌套目的地、重名不覆盖、真实源文件移除、旧旁车改名跟随及源目录刷新。

普通逻辑函数按 TypeScript printer 展开后复核，本轮新增或调整的逻辑函数不超过 30 行；JSX 展示装配按职责区分。已有未改动的旧冒烟函数不在本轮长度治理范围。

## 运行截图

截图是实际 Electron 渲染结果，未补画 UI。PNG 移动夹具不代表实际模型推理结果，Euzhi 夹具不代表付费公网调用。

- [提示词排序·深色](C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-qa/prompt-group-order.png)
- [提示词排序·浅色](C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-qa/prompt-group-order-light.png)
- [提示词排序·窄屏](C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-qa/prompt-group-order-narrow.png)
- [蒙版中的同一排序组件](C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-qa/prompt-group-order-mask.png)
- [Euzhi 供应商入口](C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-qa/prompt-euzhi-provider.png)
- [宽屏图库移动](C:/Users/18305/AppData/Local/Temp/ir-create-layout-Tyr0fk/history-move-light.png)
- [窄屏图库移动](C:/Users/18305/AppData/Local/Temp/ir-create-layout-Tyr0fk/history-move-dark-narrow.png)

## 未验证和边界

- 未用用户真实 Euzhi 密钥消费额度或验证公网服务、账户模型权限；已验证实际请求组装、固定地址和共享凭据链路。
- 未让用户人工操作系统文件夹选择窗口；回归控制其返回值后，实际磁盘移动由生产服务执行。
- 未验证跨盘移动、磁盘权限拒绝或中途部分完成后的事务回滚；不承诺原服务没有提供的原子性。
- 排序按钮的聚焦可达性已检查；离屏模式的桌面 Enter 激活未能可靠验证。保留原生 button 行为，未为测试增加重复的产品键盘处理。
- 后续同日增量已接入拖拽，前后移按钮保留；排序入口在响应式重挂载后收起，队列仍保留。
- 未打包安装器或执行真实 ComfyUI 图像生成，本轮没有修改这些业务。

## 增量注释统计

基线为本轮开工前的工作区快照（不是 Git HEAD）：
`C:/Users/18305/AppData/Local/Temp/ir-euzhi-move-baseline-ipa647df/baseline.json`。

仅统计快照后的新增/替换行；新测试 helper 统计全文，删除、空行、纯定界符及未改上下文不计。独占行注释计 C，混合代码行归 B。逐项复核职责、失败、资源与夹具边界，业务与测试分别统计；历史修改不计入本轮成果。

- 业务：C=353，B=151，C/(C+B)=70.04%。
- 测试：C=435，B=186，C/(C+B)=70.05%。

注释例子：队列交换以“排队点餐，订单跟随客人”解释稳定分类身份；测试以“先给搬家工人固定地址，真正搬箱子仍用正式流程”解释系统对话框夹具与真实磁盘行为的区别。

| 范围 | 文件 | C | B |
| --- | --- | ---: | ---: |
| 业务 | `packages/shared/src/types/prompt-assistant.ts` | 3 | 1 |
| 业务 | `packages/shared/src/schemas/prompt-assistant.schema.ts` | 6 | 2 |
| 业务 | `apps/electron/src/main/modules/prompt-assistant/service.js` | 39 | 12 |
| 业务 | `apps/electron/src/main/modules/prompt-assistant/prompt-assistant.handlers.js` | 6 | 3 |
| 业务 | `apps/next/src/stores/usePromptAssistantStore.ts` | 3 | 1 |
| 业务 | `apps/next/src/stores/use-agent-provider-store.ts` | 8 | 3 |
| 业务 | `apps/next/src/components/prompt-assistant/use-prompt-transform.ts` | 24 | 13 |
| 业务 | `apps/next/src/components/prompt-assistant/assistant-menu.tsx` | 3 | 1 |
| 业务 | `apps/next/src/view/settings/prompt-api-key-setting.tsx` | 18 | 7 |
| 业务 | `apps/next/src/i18n/locales/zh-CN/create.ts` | 10 | 4 |
| 业务 | `apps/next/src/i18n/locales/en/create.ts` | 10 | 4 |
| 业务 | `apps/next/src/view/create/CreateHistorySidebar.tsx` | 91 | 43 |
| 业务 | `apps/next/src/utils/promptTabs.ts` | 55 | 16 |
| 业务 | `apps/next/src/stores/useCreateFormStore.ts` | 13 | 4 |
| 业务 | `apps/next/src/stores/use-mask-prompt-store.ts` | 11 | 3 |
| 业务 | `apps/next/src/view/create/promptAssembly/PromptAssemblyPanel.tsx` | 37 | 22 |
| 业务 | `apps/next/src/i18n/locales/zh-CN/promptAssembly.ts` | 8 | 6 |
| 业务 | `apps/next/src/i18n/locales/en/promptAssembly.ts` | 8 | 6 |
| 测试 | `scripts/smoke-prompt-assistant.js` | 278 | 106 |
| 测试 | `scripts/smoke-create-layout.js` | 15 | 4 |
| 测试 | `scripts/lib/check-history-move.js` | 142 | 76 |


## 同日增量：复用现有拖拽能力

仅处理用户追加的提示词组拖拽需求，保留本轮之前的全部工作区改动。

从 `components/videoEdit/ClipPlaylist.tsx` 抽出 `components/sortable-list.tsx`，沿用已安装的 dnd-kit 和四像素指针激活阈值。视频/GIF 原片段列表与图片/蒙版提示词面板均实际引用同一容器；通过 `layout` 注入竖排或换行策略，通过 `ids` 与 `onMove` 注入业务身份和更新回调。没有新增依赖或另一套全局拖拽状态。

分类名称点击仍只切换编辑目标。打开自动排序后显示独立抓取手柄；支持跨组拖动、Esc 取消，并保留箭头作为单步调整入口。关闭排序隐藏手柄，已提交队列继续生效。库支持键盘空格提起、方向键移动、空格放下，手柄提供双语说明。

新增纯函数 `reorderPromptTab` 根据起止 id 在最新队列插入整个分类，保留正文、快捷词、工具绑定和活动组身份。图片沿用原持久化；蒙版动作另行检查任务锁，不走会裁剪正文的编辑通道，不写图片草稿。

### 本次实际验证

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过；最终 Next 构建再次完成类型检查 |
| `pnpm lint` | 0 错误、33 条既有警告 |
| Next 静态构建 | 通过，28 个页面 |
| 提示词助手 Electron 回归 | **66/66**；真实 Chromium 鼠标拖动、Esc 取消、正文拼接、活动分类、收起保留、重载恢复及蒙版/图片隔离 |
| GIF Electron 回归 | **50/50**；原片段列表、参数与真实 FFmpeg GIF 导出 |
| 视频 Electron 回归 | **58/58**；包括片段拖拽换序、首段尺寸更新和按新顺序真实导出 |
| 双语键、硬编码文案、英文基线、脚本引用 | 分别通过 |
| `pnpm check` | 类型和 Electron 模块验证通过；仍停在既有未引用键 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`，后续阶段未在该链内继续 |

回归一次只运行一个 Electron 实例，均通过最终静态构建指纹自检。第一次启动提示词专项因补充注释后产物过期退出，已重建；第一次有效拖拽回归中，第二次连续抓取读取到归位过渡中的矩形，测试超时失败。已在输入 helper 松开鼠标后增加有限稳定等待，再完整运行通过；没有靠重复重跑掩盖失败，也没有为测试改变产品拖拽逻辑。

GIF/视频旧夹具仍输出缺少主题、下载列表、账户、更新日志 handler 的诊断和开发 CSP 警告，专项业务断言通过；本次不扩展修补这些无关夹具。

### 真实运行截图与未验证项

截图取自实际 Electron 静态页面，已查看深浅主题及窄窗口布局，没有补画手柄或修改截图内容。

- [拖拽后分类与正文](C:/Users/18305/AppData/Local/Temp/ir-prompt-drag-qa/prompt-group-drag.png)
- [浅色](C:/Users/18305/AppData/Local/Temp/ir-prompt-drag-qa/prompt-group-order-light.png)
- [窄窗口](C:/Users/18305/AppData/Local/Temp/ir-prompt-drag-qa/prompt-group-order-narrow.png)
- [蒙版独立队列](C:/Users/18305/AppData/Local/Temp/ir-prompt-drag-qa/prompt-group-order-mask.png)

未人工验证触屏、触控笔和辅助阅读器播报；键盘完整提起/方向移动/放下未作为已验证项，已验证真实 Esc 取消与控件聚焦。未新增生成中途切锁的专门实机用例。未打包安装器、消费远端模型额度或运行 ComfyUI 推理。

### 本次增量注释统计

基线为本次拖拽任务编辑前快照：
`C:/Users/18305/AppData/Local/Temp/ir-prompt-drag-baseline-ptbz9_8u/baseline.json`，不使用 Git HEAD，也不把前一轮的注释借来抵扣。

只统计基线后新增/替换行；新增文件统计全文。删除、空行、定界符和上下文不计，混合行只归代码。按逐行差异扫描后核对注释与实际实现、夹具和断言边界；普通逻辑函数按 TypeScript printer 展开检查，相关动作、工具和测试 helper 均不超过 30 行。

| 范围 | 文件 | C | B |
| --- | --- | ---: | ---: |
| 业务 | `components/videoEdit/ClipPlaylist.tsx` | 15 | 7 |
| 业务 | `components/sortable-list.tsx` | 75 | 30 |
| 业务 | `utils/promptTabs.ts` | 23 | 9 |
| 业务 | `stores/useCreateFormStore.ts` | 13 | 4 |
| 业务 | `stores/use-mask-prompt-store.ts` | 12 | 5 |
| 业务 | `view/create/promptAssembly/PromptAssemblyPanel.tsx` | 54 | 27 |
| 业务 | `i18n/locales/zh-CN/promptAssembly.ts` | 6 | 2 |
| 业务 | `i18n/locales/en/promptAssembly.ts` | 6 | 2 |
| 测试 | `scripts/smoke-prompt-assistant.js` | 5 | 3 |
| 测试 | `scripts/lib/check-prompt-drag.js` | 124 | 50 |

业务 C=204、B=86，**70.34%**；测试 C=129、B=53，**70.88%**。

有效注释示例：用“号码牌与旧座位表”说明为什么放手时从最新队列按 id 取值，避免覆盖拖动期间的正文；用手柄与箱盖的区别说明抓取与编辑选择的事件边界。测试注释明确区分真实 Chromium 指针输入、界面结果断言和未覆盖的系统人工操作。
