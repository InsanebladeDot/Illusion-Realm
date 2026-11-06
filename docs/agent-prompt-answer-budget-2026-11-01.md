# Agent 提示词咨询与回答预算修复

日期：2026-11-01。范围仅为提示词咨询的技能读取路径和最后一轮回答，不扩展视频执行能力。

## 问题与实现

“若我要一个酷炫的5s动作，你怎么帮我写提示词？”原先受“所有视频问题先发现并读取技能”要求影响，可能经过搜索、列目录、读入口、读长手册后耗尽四轮，根本没有回答机会。通用上限文案还误带了角色查询建议。

- `apps/agent/agent_core/config.py`：加入应用维护的 H3 基础速记和五秒示例；普通写法咨询直接回答。准确资料确有需要时，允许直接读取已知 `h3-prompt-writing` 的对应参考文件；未知技能才查询目录。
- `apps/electron/src/main/modules/agent/host-tools.js`：同步两个技能工具的描述，去除与短流程冲突的强制发现要求。读取白名单、资源摘要和原始技能文件保持既有实现。
- `apps/agent/agent_core/core.py`、`run_limits.py`：默认四轮、硬上限六轮保持原值，最后一次请求包含固定收尾指令并使用 `tool_choice=none`。即使供应商仍返回工具调用，也在实际执行及 `tool_call` 事件之前拦截。没有额外第五轮或第七轮总结请求。
- `apps/agent/agent_core/fake_llm.py`：假模型同步支持禁用工具，已有工具回执仍可用于回答。
- `apps/electron/src/main/modules/agent/skills/minimax-h3/INTEGRATION.md`：同步项目接入说明，不改写上游 41 个资源。

咨询分类及“简单示例最多两次资料工具”属于系统提示指导，不是依据用户句子硬编码的运行时分类器。执行器保证总预算和最后一轮不执行新工具，不能保证真实 Grok 一定零工具或两次内完成。重复调用预算、超时和长推理保护仍独立生效，触发时直接交付中性停止说明，不增加总结请求。

最后一轮不能再执行生成；低档两轮相应只留第一轮执行工具，一轮配置只能回答。实际生成应在前面的可用轮次完成，未提交的任务不能宣称已完成。禁用新工具也不撤销早先已提交的 ComfyUI 任务。

## 实际验证

| 检查 | 结果与证明范围 |
| --- | --- |
| `python scripts/fixtures/agent-controls-check.py` | 7 项通过；覆盖直接回答、一次读取后回答、API 工具模式、六轮边界、供应商违规返回调用的本机拦截、重复预算和资源清理 |
| `node scripts/verify-agent-controls.js` | 通过；角色确认与取消后事件隔离等既有控制回归 |
| `node scripts/verify-agent-skills.js` | 14 组通过；含 41 个上游文件摘要、10 个技能、分页、安全边界、ASAR，以及真实 Python/MCP/宿主桥的两轮短流程 |
| `pnpm --filter @illusion-realm/electron check` | 通过；主进程类型检查与零 `@ts-nocheck` 逃逸 |
| `pnpm verify` | ALL PASS；模块、通道及注册检查 |
| `scripts/verify-agent-events.js`（Electron ready 包装） | 11/11 通过；真实 Python/MCP 进程、数学工具、宿主模型扫描、取消与产物事件分流，模型使用无网络夹具 |

技能短流程用本机 HTTP SSE 夹具代替语言模型服务，用户问题保持原句：第一次请求直接读真实基础指南，第二次 `tool_choice=none`，最终交付五秒动作示例及三个字段；实际只执行一次 `read_agent_skill`。这证明生产链路能完成短流程，不代表真实模型自主选择了同样路径。

事件脚本直接用 Node 启动时因缺少 Electron `app` 失败；直接启动 Electron 又遇到就绪前读取系统能力的环境问题。最终通过临时入口等待 `app.whenReady()`，使用独立临时用户目录和夹具密钥运行原脚本。仅终止本轮残留测试进程，未关闭用户应用。包装入口位于临时目录，未改写产品路径解析或旧事件脚本。

## 未验证与生效方式

- 未使用用户真实密钥、真实 Grok 或收费模型，未验证真实供应商的语义遵循率、响应时间及视频效果。
- 本轮无渲染改动，未运行 Next 构建、UI 截图、完整 `pnpm check` 或安装包构建。
- 开发客户端需完整重启以加载主进程工具描述；安装版需下次重新构建更新。本轮没有生成新 EXE。

## 增量注释审计

基线为本轮操作前八个源文件的快照 `C:/Users/18305/AppData/Local/Temp/ir-agent-answer-budget-beca9kfo/baseline.json`，不是包含大量既有修改的 Git HEAD。逐文件用 `difflib.SequenceMatcher` 统计新增及替换后的行，排除删除、上下文、空行和纯注释定界符；混合行只计代码。中文说明人工核对职责、边界、类比与测试证明范围，文档不计入源码注释。

| 类别 | 文件 | 有效注释 C | 代码 B |
| --- | --- | ---: | ---: |
| 业务 | `config.py` | 21 | 12 |
| 业务 | `core.py` | 24 | 7 |
| 业务 | `run_limits.py` | 5 | 3 |
| 业务 | `host-tools.js` | 6 | 2 |
| 业务 | `fake_llm.py` | 5 | 2 |
| 测试 | `agent-controls-check.py` | 72 | 36 |
| 测试 | `check-agent-skill-session.js` | 36 | 11 |
| 测试 | `verify-agent-skills.js` | 4 | 1 |

业务合计 `61 / (61 + 26) = 70.11%`；测试合计 `112 / (112 + 48) = 70.00%`。新测试普通逻辑方法未超过 30 行；既有 `AgentSession.stream` 大函数未作任务外重构。

有效注释示例：“像给常用菜准备一张做法卡：普通咨询不必每次翻整本菜谱”，对应应用内速记与完整技能资料的分工；“像会议结束前留下最后一分钟汇报，不能把全部时间都用来分派新任务”，对应最后请求禁用新工具、保留已有回执。
