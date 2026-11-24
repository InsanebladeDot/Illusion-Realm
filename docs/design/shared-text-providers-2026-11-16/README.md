# Agent、转译与提示卡片统一（2026-11-16）

本轮直接复用原有组件。Agent 和转译使用硅基流动、Euzhi、GLM 三家供应商，共用目录、价格卡片和所属供应商的加密密钥；两个业务的模型选择各自保存。转译按钮的提示改为“转译”。

## 如何使用

1. 在设置的 API 密钥分类中，用原 Agent 配置区选择供应商并保存 Key。同一家供应商只配置一次，Agent 与转译都可使用。
2. Agent 从原模型按钮打开模型窗口。转译从“供应商”菜单选择一家，打开同一个模型窗口。
3. 浏览、搜索和点击卡片只改暂选；点击“应用”才保存。关闭丢弃暂选，保存失败保留窗口。
4. 卡片分别显示输入、输出的每百万 token 参考费用。Euzhi 还显示官网提供的分组参考价，并说明 Key 的分组、模型权限、余额与倍率会影响实际调用。
5. 价格未取得时显示“未公布”；未核实权限与明确无权限分别展示。模型可见不等于已经验证过付费推理。

Euzhi 图片生成仍使用原来的专用 Key，与聊天／转译 Key 分开，避免改变原有图片接口契约。已有自定义转译端点保留兼容；新的供应商菜单仅提供上述三家。旧 GLM Key 首次使用时复制到共享加密分区，原件保留；显式清除 GLM 时两处一起清，防止旧 Key 自动恢复。

## 复用位置

| 内容 | 实际实现与调用方 |
| --- | --- |
| 黑色小提示卡片 | `apps/next/src/components/hover-tip.tsx`、原 `hover-tip.module.css`；导航、标题栏、Agent、创建页、设置和工具组件共用 |
| 模型窗口 | 原 `agent-model-dialog.tsx`、`AgentModelCard`、`AgentProviderTabs`；转译只注入选择映射和 `onApply` |
| 供应商显示资料 | `apps/next/src/data/agent-providers.ts` |
| 固定请求地址与凭据 | `apps/electron/src/main/modules/agent/provider-secrets.js`；Agent 与转译服务都调用这里 |
| 共享目录与官网价格 | `provider-catalog.js`、`provider-catalog-parser.js`、新增 `glm-catalog-parser.js` |
| 登录后更新 | `AppShell` 中唯一的 `useAgentProviders` 订阅 |
| 各自模型选择 | `agentPreferences.models` 与 `promptAssistant.models`；转译不会覆盖 Agent 的选择 |

应用自身源码中另外 191 处原生 `title` 提示已接入同一个 `HoverTip`，并移除原生提示，避免出现两种外观。`asChild` 把事件加在原控件上，不新增会挤压布局的 DOM 包装；保留原来的事件、ref 和列表 key。全页同时只显示一张提示卡片，父子控件不会叠出两张。第三方嵌入网页、系统对话框不在这次组件替换范围内。

蒙版工具按钮也直接使用 `HoverTip`，删除原来的私有提示实现。模型系列的多段说明保留原级联定位和窄屏展示，表面复用同一份黑色卡片 CSS；不是另做一套浅色提示框。

## 官网、缓存和实际费用的边界

| 供应商 | 目录／价格来源 | 本轮实际联网结果 |
| --- | --- | --- |
| 硅基流动 | <https://www.siliconflow.cn/models>，解析网页内的 JSON 数据，不运行网页脚本 | 读取到 51 个支持工具的聊天型号，按原有分档策略展示 11 个精选型号 |
| GLM | <https://docs.bigmodel.cn/cn/guide/start/pricing.md> | 读取到 23 个聊天型号；按长度、输出条件分档的价格保留原条件。官网原文见 [存档](evidence/glm-official-pricing.md) |
| Euzhi | <https://euzhi.vip/api/pricing> 与当前 API Key 的 `/v1/models` | 公开价格接口实际返回 HTTP 401。保留最近参考价；模型可见性由用户 Key 查询，不再限制只列 Grok |

Euzhi 的 GPT、Claude 等聊天型号可从当前 Key 的模型列表补入，未取得价格的新增型号明确留空。它的网站登录态与 API Key 不是同一套凭据；没有用 API Key 尝试绕过网站价格接口的登录限制。官网说明见 <https://euzhi.vip/docs>，其中 Claude 指引涉及 Kiro 分组。不能把公开最低分组价格当成当前用户 Key 的结算价。

目录缓存沿用现有位置，位于默认用户数据目录旁的 `agent-catalog-{provider}.json`，三站各一份。它只存公开型号、价格、来源和核实时间，不含 Key，也不持久化“这个 Key 可以使用”的结论。第一次取到目录后落盘；下一次登录／进入会话强制更新，登录中每六小时更新，也可手动刷新。断网或官网改版时保留最近目录和旧核实时间，显示失败原因，不把失败尝试的时间当成新价格。

强制刷新若撞上旧请求，会在旧请求结束后重新查询，避免换 Key 或重新登录仍拿到旧权限结果。模型列表 API 失败时权限保持“尚未核对”，不会假报成功。没有执行真实付费聊天或转译，实际账单、额度及模型工具调用能力仍以供应商响应为准。

## 运行验证

最终静态导出指纹：`f2a117f52eb037a4dae4a1f6031697098996548df68a5ca35f6f744822399b39`，1185 个构建输入。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 通过，包含渲染层和主进程 |
| `pnpm lint` | 通过，0 错误、37 个已有警告 |
| `pnpm --filter @illusion-realm/next build` | 通过，29 个静态页面 |
| `pnpm exec electron scripts/verify-agent-providers.js` | 通过：密钥隔离、旧 GLM 迁入、三站转译请求路由、GPT／Claude 纳入、各分组价、GLM 多档价、离线缓存、权限失效、强制刷新排队、独立模块从磁盘恢复 |
| `pnpm exec electron scripts/smoke-agent-providers.js` | 25/25；真实静态页面、选择与应用、缺钥拦截、重新进入刷新、断网保留目录、窄窗及键盘提示卡片 |
| `pnpm exec electron scripts/smoke-prompt-assistant.js --qa-dir=docs/design/shared-text-providers-2026-11-16/screenshots` | 84/84；同窗口复用、转译、冲突保护、撤销、历史、旧自定义端点、深浅主题、窄屏、预设编辑与删除、提示词组装 |
| `pnpm exec electron scripts/smoke-create-layout.js --model-series-only` | 20/20；黑色说明卡片、双主题、级联越界定位、窄窗口和键盘聚焦 |
| `SMOKE_MASK_STUDIO_ONLY=1` 运行 `smoke-create-layout.js` | 134/134；工具名称复用黑卡片、不挤压画布、移出收起；同时回归原绘画、选区、导出与生成参数 |
| 新增复用调用方定向 ESLint | 通过，覆盖 `HoverTip`、蒙版工具按钮和模型系列选项 |

界面冒烟各用隔离目录并顺序执行，最终四套共 263 项通过。外部推理、令牌目录与部分价格接口使用明确的测试替身，不读取用户真实密钥；GLM、硅基官网读取与 Euzhi 401 结果另外通过实际联网核对。UI 截图中的 Euzhi 示例报价是夹具数据，不应视为官网当前价格。创建布局套件未注册 Agent 目录夹具，会输出缺少对应 handler 的日志；上述 Agent 与转译专项套件覆盖正式服务接线。没有把全部页面的交互都宣称为已回归。

完整 `pnpm check` 未全绿：它在门禁自检发现 `auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference` 三个未引用词条。使用任务前文件覆盖读取的独立对照也包含这三项。后续检查已单独执行：输出路径、文件夹计数、语言决议、冒烟规则、脚本引用、初始语言、i18n、英文基线和双语键一致性通过；Meta 检查仍把未改动的 `MetaFieldRow.tsx` 中已有 JSX 中文注释当成中文字段字面量而失败。本轮没有为了全绿删除无关词条或修改这些检查器。

## 截图

以下均来自幻域实际运行的静态页面，不是参考图：

- [转译黑色提示卡片](screenshots/transcreate-tooltip.png)
- [Agent 模型窗口（宽屏）](screenshots/agent-models-wide.png)
- [Agent 模型窗口（窄屏）](screenshots/agent-models-narrow.png)
- [转译复用模型窗口：GLM](screenshots/transcreation-models-glm.png)
- [转译复用模型窗口：Euzhi](screenshots/transcreation-models-euzhi.png)
- [共享 Key 配置](screenshots/shared-key-settings.png)
- [导航／标题栏同一提示组件](screenshots/agent-shared-tooltip.png)
- [模型系列黑色说明卡片](screenshots/model-series-light-anima.png)

## 注释审计

以任务开始时的 `ir-shared-provider-baseline-r4sxa6pm` 快照为基线；保留进入任务前的工作区修改。151 个变更源码文件仅统计本次新增或替换后的行，新增 GLM 解析器统计全文。使用 TypeScript 语法树定位注释；纯数据 JSON、截图、文档与纯类型 JSDoc 不计，混合代码行计入代码，纯注释去除空白与装饰符，并人工复核说明是否准确。逐文件记录见 [comment-audit.json](comment-audit.json)。业务 C=59、B=660，注释率 8.21%；测试 C=11、B=146，注释率 7.01%。

多数改动是把原控件传入已有提示组件，只补一句机制说明；不为每个按钮重复写同样注释。供应商价格、权限、密钥迁入、并发刷新、失败回退和测试替身范围已说明。比例低于 20%–30% 参考区间是这批复用接线占比大的结果，没有为达标硬凑注释。

主进程有修改，需要正常退出并重新打开软件后才会使用新凭据和目录服务；只刷新页面不足以重载主进程。上一项“清空节点后删除资源”的修复与 27 项验证记录保留在 [对应说明](../canvas-resource-delete-fix-2026-11-16/README.md)。
