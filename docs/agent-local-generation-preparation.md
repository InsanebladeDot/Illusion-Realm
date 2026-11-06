# Agent 本地生成准备：第一批实施记录

本次只修改本地角色检索、Agent 工具摘要与查询完成后的执行指引。沿用创建页本地角色资料、现有模型扫描和工作流构建器，保留工作区先前修改。

## 实现行为

- 名称按「完整标准名 → 已登记别名 → 多词片段 → 单处英文拼写差异」逐层匹配，上一层有结果就不继续扩展。名称规范化结果按资料数组缓存，不是倒排索引；不缓存跨提问的查询结果。
- 首批明确别名为 `莉音 → rio (blue archive)`、`塞尔达公主 → princess zelda`。这不是完整中文角色词典，也不做自动翻译或拼音猜测；别名登记在 `apps/electron/src/main/modules/animadex/character-matcher.js`。
- 创建页与 Agent 共用匹配器。创建页四属性筛选保持严格交集；Agent 带姓名和作品却无结果时，只在本地忽略作品补查一次。补查命中会标记作品冲突，要求用户确认。英文纠错结果同样必须确认，即使只有一个候选。
- Agent 按名最多返回 3 项、分类浏览最多 8 项；保留真实 total、匹配层级、缺失属性、trigger/tags 和 needsConfirmation，不附整库分类与长段重复说明。Agent 新工具声明只允许 local，旧内部显式 online 调用保留兼容，不是失败回退。
- `list_local_models`、`list_loras` 增加 `summary: true`，缺省仍返回详细结果。摘要保留完整相对名称和扩展名、分类/系列、可用性或兼容结论，失败保留原因，LoRA 保留触发词。total/offset/nextOffset 不变，执行前原有路径和兼容校验不变。
- 新 Agent 工具声明要求 `generate_image` 提供主模型；旧内部调用仍保留模板模型回落，未改变其历史契约。未指定模型时，建议只取 Anima 主模型小页摘要，选到可用项即停止比较其他版本。
- 当前明确要求生成、角色确定且主模型可用后，系统提示词与工具回执后的固定阶段提醒要求直接提交。当前只列清单、参数或解释时不得生成，旧的只列清单要求不限制新的明确生成请求。
- LoRA 是可选增强。只有需求有明确动作、风格或质感线索时才定向查询，用途匹配且系列兼容才使用；无匹配跳过。没有角色 LoRA 仍可使用主模型与角色描述。关键词匹配仍基于名称/路径，未新增 LoRA 语义索引。
- 阶段提醒在同批全部 tool 回执之后追加，避免破坏严格中转站的消息配对。只使用固定应用文字，不把外部角色名或模型路径插进 system；不增加模型预算，不自行发起用户未要求的生成。

## 推荐的最短调用流程

1. 用户指定角色时，本地 `search_characters({query: 用户原名})`；已知作品可附 copyright。若工具要求确认，立即询问用户。
2. 未指定主模型时，`list_local_models({kind: diffusion, series: anima, summary: true, limit: 3})`，复制 usable=true 的完整 name。已有本轮可用结果就复用。
3. 仅有明确增强需求时，小范围 `list_loras({model: name, query: 需求关键词, summary: true, limit: 5})`。查不到则跳过；如确需续页，使用 nextOffset。
4. 当前请求是生成时，`generate_image({model: name, prompt: 已确认角色触发词与场景描述})`；LoRA 可不传，未指定采样参数沿用真实工作流默认值。

## 实际验证

- `pnpm typecheck`：通过。
- `pnpm lint`：通过，0 错误、33 个现有警告，本次未修改渲染文件。
- `pnpm --filter @illusion-realm/electron check`：通过，主进程无 @ts-nocheck 逃逸。
- `pnpm check`：类型和 Electron 模块/通道检查通过，在门禁自检处失败，未引用词条为 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。本次未修改词条或引用调用方。
- 单独补跑统一链后续的 outputpath、foldercount、locale、smoke 规则、脚本引用、首帧语言参数、中文/英文基线、双语键检查：通过。
- 单独补跑 `pnpm check:meta`：失败，静态检查把未修改的 `apps/next/src/view/inspect/MetaFieldRow.tsx` 内 JSX 中文注释判为字段标识中文；该项不属于本次改动。进程内格式往返与分档断言通过，真实语料不存在而跳过 golden baseline；不将整套检查写为通过。
- `pnpm exec electron scripts/verify-character-reference.js`：通过，真实本地数据覆盖标准名、别名、多词、错字、作品冲突、页面严格过滤、多候选截断及无网络。纠错只比较括号外姓名，不把作品里的词当作人名纠错。
- `node scripts/verify-agent-loras.js`：通过，真实临时目录覆盖摘要与详细契约、错误原因、完整相对路径、兼容性、触发词、分页和原有工作流参数转发。
- `python scripts/fixtures/agent-controls-check.py`：5 个测试通过。正式 AgentSession 加脚本化 SDK 流，三轮完成两项准备查询、生成工具调用、正常答复；不查询 LoRA。反向任务、待确认角色、非法结果和批次消息顺序均覆盖。
- `node scripts/verify-agent-controls.js`：通过，角色查询与取消边界未回归。
- `node scripts/verify-agent-vision.js`：通过，实际本机 HTTP 请求里的图片字节与历史图片保留。
- `node scripts/verify-agent-skills.js`：14 组通过，技能发现、读取、ASAR 访问及本机模拟模型会话未回归。

未使用真实 Grok/中转站密钥、GPU 或 ComfyUI 生图实测。脚本化模型证明执行链与消息正确，不证明真实模型总能遵从指引，也没有测得可承诺的提速倍数。本次不构建安装包；开发客户端需重启主进程加载新工具，已安装 EXE 需后续重新打包更新。

## 注释与函数长度审计

基线：本轮修改前原始快照 `C:/Users/18305/AppData/Local/Temp/ir-local-character-batch1/baseline`，没有把此前工作区修改计入本轮。新增文件统计全文，修改文件只统计新增/替换行；删除、未变上下文、空行和纯定界符不计。JS 使用 TypeScript AST 注释范围，Python 使用 tokenize 与 AST 识别注释/docstring，混合行只计代码，并人工复核职责、边界和类比说明。额外剔除两行纯 typedef 与两行只列类型的 param，不把它们计为有效解释。

业务 C=299、B=127，注释率 **70.19%**；测试 C=206、B=87，注释率 **70.31%**。普通新增逻辑函数及本次新增测试函数均不超过 30 行有效代码；已有较长函数未借本轮扩展为全局重构。

| 本轮文件 | C | B | 注释率 |
| --- | ---: | ---: | ---: |
| `apps/electron/src/main/modules/animadex/character-matcher.js` | 127 | 55 | 69.78% |
| `apps/electron/src/main/modules/animadex/local-catalog.js` | 47 | 21 | 69.12% |
| `apps/electron/src/main/modules/agent/character-tools.js` | 12 | 5 | 70.59% |
| `apps/electron/src/main/modules/agent/model-query.js` | 7 | 3 | 70.00% |
| `apps/electron/src/main/modules/agent/model-catalog.js` | 5 | 2 | 71.43% |
| `apps/electron/src/main/modules/agent/lora-tools.js` | 5 | 2 | 71.43% |
| `apps/electron/src/main/modules/agent/host-tools.js` | 20 | 8 | 71.43% |
| `apps/agent/agent_core/config.py` | 20 | 8 | 71.43% |
| `apps/agent/agent_core/core.py` | 18 | 7 | 72.00% |
| `apps/agent/agent_core/generation_guidance.py` | 38 | 16 | 70.37% |
| `scripts/verify-character-reference.js` | 40 | 17 | 70.18% |
| `scripts/verify-agent-loras.js` | 53 | 22 | 70.67% |
| `scripts/fixtures/agent-controls-check.py` | 113 | 48 | 70.19% |

有效注释示例：

- 「像先按身份证找人，再看登记昵称，最后才给相近名字的候选名单」解释分层查找为何不让热门近似结果覆盖精确身份。
- 「不把系统提示插进尚未回齐的 tool_calls 中间」解释批次回执的协议边界，回归测试核对实际请求末尾的 tool、tool、system 顺序。
