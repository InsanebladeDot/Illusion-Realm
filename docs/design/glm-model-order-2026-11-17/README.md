# GLM 免费型号与模型排序

直接修改原 `AgentModelDialog`，Agent 与转译继续使用同一窗口、同一 `AgentModelCard` 和目录服务。排序直接复用 `SimpleSelect`，没有复制模型窗口或新建选择组件。

## 使用

打开模型窗口，选择 GLM。默认按免费、低价、高价排列；搜索栏旁可切换“免费优先”“价格从低到高”“价格从高到低”“官网顺序”。价格以输入、输出各一百万 token 的基础价相加比较，不等于实际账单。同价保留官网顺序；未知或缺一项价格的型号放在已知价格后面，不当免费。

排序只改变显示，不改变推荐算法、暂选或已保存模型。卡片仍需点“应用”才保存，Agent 与转译各自的模型选择仍独立。排序在本次窗口内保持，重新打开恢复免费优先。

截图中的 `glm-4.7-flash`、`glm-4.5-flash`、`glm-4-flash-250414`、`glm-4-flash` 已加入；还保留官网明确免费的 `glm-z1-flash`。免费仅指官网公布的输入、输出费用；当前 Key 权限仍按原账户接口另行核对。

修改涉及主进程。正常退出并重新打开软件，再在模型窗口点“刷新列表”可立即更新旧目录；登录刷新与六小时缓存规则保持不变。

## 数据来源与边界

2026-11-17 实际读取以下官方文档，合并后共 25 个聊天型号，其中 5 个免费。免费文本型号并非全部出现在价目表中，因此合并资料，不能只取“最新模型”的首屏。

| 官网资料 | 用途 | 本次原文存档 |
| --- | --- | --- |
| [API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing.md) | 输入输出价格及多档条件，优先于补充资料 | [pricing.md](evidence/pricing.md) |
| [模型概览](https://docs.bigmodel.cn/cn/guide/start/model-overview.md) | 仅补明确写着“免费文本模型”的缺项，包括 4.5-Flash | [model-overview.md](evidence/model-overview.md) |
| [GLM-4 说明](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.md) | 补充原文称为“免费语言模型”的旧版 GLM-4-Flash | [glm-4.md](evidence/glm-4.md) |

没有按名称含 Flash 就判为免费；FlashX 的收费保留。不混入图片生成、视频生成、语音、向量或独立视觉理解目录。补项按 ID 去重，不覆盖价目表的收费记录。GLM 随包参考目录同步更新，其他供应商快照未更改。

三份官方资料并发读取；请求失败时保留原完整缓存及成功时间，并显示原刷新失败提示。缓存仍不存 Key，也不保留某次 Key 的可用性结论。没有引入新 IPC、偏好字段或数据库结构。

## 验证

- `pnpm typecheck`、完整 `pnpm lint` 通过；lint 为 0 错误、38 个已有警告。本轮组件与排序工具定向 ESLint 无警告。
- Next 静态导出通过，29 页，1213 个指纹输入；最终指纹 `f97668c74fe2b3c1be6cbc7b252dd381e449e1eba0a59e43306de9cf86e398b9`。
- `node scripts/verify-agent-model-order.js` 通过：免费、未知及缺项价格、升降序、同价稳定、空列表、不改原目录。
- `pnpm exec electron scripts/verify-agent-providers.js` 通过：真实目录解析、四个目标免费型号、去重、收费优先、资料页失败后保留完整缓存，同时保留原凭据与请求回归。
- Agent 静态页面 31/31、转译静态页面 102/102 通过：两处真实入口复用同一组排序交互断言，验证四种排序、选中不变、Escape 先关下拉；原搜索、应用保存、重开、权限错误和窄窗回归仍通过。
- 双语键、硬编码文案、英文基线、逐字文案、脚本引用与冒烟约定检查通过。新增普通逻辑函数均不超过 30 行有效代码。

官网获取是真实联网；界面回归的价格请求采用本次官方存档作为替身，使用隔离用户目录，不读取真实用户 Key，不执行付费聊天或转译。未验证真实账户额度、账单及所有型号的推理能力。

完整 `pnpm check` 未全绿，停在既有的 `auth.verifySuccess`、`canvas.fullscreenFailed`、`canvas.reference` 三个未引用词条；本轮新增排序词条已全部被识别。另行执行 Meta 检查，仍在未修改的 `MetaFieldRow.tsx` 中文注释处失败。本轮没有为消除既有问题修改无关功能。

## 实际截图

- [Agent：免费优先](screenshots/agent/free-first.png)
- [Agent：高价优先](screenshots/agent/high-price-first.png)
- [转译：免费优先](screenshots/transcreation/glm-free-first.png)
- [转译：高价优先](screenshots/transcreation/glm-high-price-first.png)
- [转译：原窗口应用选择](screenshots/transcreation/transcreation-models-glm.png)

## 注释核查

本次基线为 `ir-glm-sort-baseline-841cb6bc60e94eda9f95f8b69727fda7`，保留任务前已有修改。只统计新增及替换行，新文件统计全文；纯数据快照、证据与文档不计。TypeScript 语法树定位注释，混合行计代码，逐项人工复核后记录于 [comment-audit.json](comment-audit.json)。业务 C=9、B=51，15.00%；测试 C=6、B=104，5.45%。补项的来源边界、排序的价格口径、未知值处理、缓存回落与测试替身范围均有说明，其余主要为组件接线和直接断言，不为达到参考比例补重复注释。
