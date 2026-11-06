"""Agent 核心：一次提问 → 一条事件流。

谁消费这条流，谁决定怎么展示（cli.py 打印、stdio_agent.py 转成 NDJSON 给桌面端）。
事件字段与 `packages/shared/src/types/agent.ts` 一一对应，改一边必须改另一边。

事件类型：
    tools           工具清单（一次）yyy
    step            进入第 n 轮
    reasoning_delta 模型返回的推理文本（模型支持才有）
    answer_delta    最终回答的增量文本
    tool_call       决定调用某个工具
    tool_result     工具执行结果
    final           最终回答全文
    error           出错或超过最大轮数
"""

from __future__ import annotations

import json
import os
from contextlib import AsyncExitStack
from typing import Any, AsyncIterator

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import AsyncOpenAI

from .config import PACKAGE_ROOT, AgentConfig, SYSTEM_PROMPT, load_config
# 图像输入使用独立协议构造器，不在工具执行和 token 解析分支里拼接 base64。
# 同一个构造器保留纯文本历史兼容，并拒绝远端无法读取的本机地址。
# 正式模型请求直接使用返回的 messages，不能只把图片留在 UI 里。
from .input_messages import build_messages
# 所有服务商共用执行预算，不依赖模型自律或某个供应商的 reasoning 参数。
# 限额返回正常的澄清问题，既不伪造工具成功，也不再次请求模型。
# 每次提问独立计数；同一会话下一次由用户明确继续时重新获得预算。
from .run_limits import ToolBudget, TurnLimit, bounded_completion, character_question
from .fake_llm import FakeAsyncOpenAI
from .host_tools import HostBridge, parse_host_tools
# 工具阶段提示只使用固定规则，不能把资料中的任意文字当作系统命令。
# 提示在本轮全部工具回执之后追加，保持 assistant/tool 配对的连续顺序。
# 角色已确定时提醒进入后续流程，最新用户请求仍决定是否执行生成。
from .generation_guidance import generation_hint


def build_llm(config: AgentConfig) -> Any:
    """按配置建 LLM 客户端；`fake_llm=True` 时用假模型（冒烟/单测，不花 token）。"""
    if config.fake_llm:
        return FakeAsyncOpenAI(delay_ms=config.fake_delay_ms)
    if not config.api_key:
        raise RuntimeError(
            "缺少 API Key：桌面端由主进程经 stdin 注入，开发期可写 apps/agent/.env"
            "（ILLUSION_AGENT_API_KEY=...）"
        )
    return AsyncOpenAI(api_key=config.api_key, base_url=config.base_url)


def server_params(config: AgentConfig) -> StdioServerParameters:
    """怎么把 MCP 工具 server 拉起来：同一个解释器 + 包根目录 + 模块方式启动。

    工具 server 需要的运行期上下文（允许访问的目录、权限档位）用**环境变量**传：
    stdio 通道留给 MCP 协议本身，不混业务数据。
    """
    return StdioServerParameters(
        command=config.python_executable,
        args=["-m", config.tools_module],
        cwd=str(PACKAGE_ROOT),
        env={
            **os.environ,
            "ILLUSION_AGENT_ALLOWED_ROOTS": os.pathsep.join(config.allowed_roots),
            "ILLUSION_AGENT_PERMISSION": config.permission,
        },
    )


class AgentSession:
    """一条 MCP 连接 + 一份工具清单，可被多次提问复用。

    用法：
        async with AgentSession(config) as agent:
            async for event in agent.stream("帮我算 1+1"):
                ...
    """

    def __init__(
        self,
        config: AgentConfig | None = None,
        llm: Any | None = None,
        bridge: HostBridge | None = None,
    ) -> None:
        self.config = config or load_config()
        self.llm = llm or build_llm(self.config)
        self.host_tools = parse_host_tools(self.config.host_tools)
        self.host_tool_names = {tool.name for tool in self.host_tools}
        # 每个宿主工具自己的等待上限（None = 用桥的默认值）：生图这类慢工具靠它放宽
        self.host_tool_timeouts = {
            tool.name: tool.timeout_s for tool in self.host_tools
        }
        self.bridge = bridge
        self.session: ClientSession | None = None
        self.tools: list[dict[str, Any]] = []
        self.tool_cards: list[dict[str, str]] = []
        self._stack: AsyncExitStack | None = None

    async def __aenter__(self) -> "AgentSession":
        self._stack = AsyncExitStack()
        read, write = await self._stack.enter_async_context(
            stdio_client(server_params(self.config))
        )
        self.session = await self._stack.enter_async_context(ClientSession(read, write))
        await self.session.initialize()

        listed = (await self.session.list_tools()).tools
        self.tool_cards = [
            {"name": t.name, "description": (t.description or "").strip().splitlines()[0]}
            for t in listed
        ]
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.inputSchema,
                },
            }
            for t in listed
        ]
        # 宿主工具与 MCP 工具拼在同一份清单里发给模型：对模型来说它们没有区别
        self.tools.extend(tool.to_openai_tool() for tool in self.host_tools)
        self.tool_cards.extend(tool.to_card() for tool in self.host_tools)
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        if self._stack is not None:
            await self._stack.aclose()

    async def stream(
        self,
        question: str,
        # 历史可包含用户图片数组，原纯文本字典仍然合法。
        # role/content 校验由消息构造器统一完成，不扩展系统角色入口。
        # object 表示动态输入，构造阶段显式收窄为字符串和图片列表。
        history: list[dict[str, object]] | None = None,
        # 第三个参数可选，原 CLI 和 collect_answer 的调用方式无需修改。
        # 当前图片与历史图片分开传入，防止把本轮问题重复放进上下文。
        # 不在 stream 读取磁盘，图片由桌面端显式选取后作为字节传入。
        images: list[str] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """跑完一次提问，把过程拆成事件逐条吐出来。"""
        # 有附件的 user content 使用 image_url 块，纯文本继续保持字符串。
        # 消息数组在后续工具循环中保留，不在每次 tool_result 后丢掉图片。
        # 服务商 endpoint 和 key 仍由既有 config 决定，本次不增加其他上传服务。
        messages = build_messages(SYSTEM_PROMPT, question, history, images)

        yield {"type": "tools", "tools": self.tool_cards}

        # 直接构造 AgentConfig 的 CLI/测试也必须受六轮硬上限约束。
        # 默认四轮，桌面低档两轮；环境变量不能绕过上限。
        # 每一轮是一次模型请求，工具调用另有总量与重复限制。
        # 新预算在 stream 内创建，不沿用上次提问的计数。
        # 最后一次专用于基于现有结果回答，不增加额外付费总结请求。
        # 不同工具共享本次预算，不能换工具名继续无界调用。
        # 回答轮也计入原预算，默认四轮不会暗中变成五轮。
        # 工具超时不在此段模型等待内，生图等慢工具继续遵守自己的期限。
        # 所有收尾沿用 final 事件形状，CLI 和桌面共用相同停止语义。
        # 当前 history 仅包含用户与助手消息，工具重复计数不从历史倒推。
        # 此处限制请求数量，并不保证供应商内部只执行相同数量的推理步骤。
        # 角色查询的确认标记稍后单独处理，通常不用耗尽总轮数才询问。
        # 一轮里串行执行多个工具时仍先检查每一次实际调用。
        # 模型改换查询参数可避开同参限制，但绕不过总体六轮和十二调用。
        # 用户新提问才会创建新预算，不让模型自己重置计数。
        # final 的 steps 记录实际模型请求次数，不把每个工具算成一轮。
        # 预算停止不会把已完成工具回执从过程列表删除。
        budget = ToolBudget()
        max_steps = min(6, max(1, self.config.max_steps))
        for step in range(1, max_steps + 1):
            yield {"type": "step", "step": step}
            # 最后一轮保留原始问题与真实回执，不再开启新一轮资料查询。
            # 使用固定系统说明，不能将手册中的任意命令提升为收尾指令。
            # 资料不足就说明缺失，不让模型把未执行工具说成成功。
            # 一轮配置意味着只能直接回答，不存在先执行一次工具再自动追加总结。
            # 默认四轮仍是最多四次 API 请求，保留回答机会不增加预算。
            # 提示追加在上轮完整回执之后，不能插在一批 tool_call 与 tool_result 之间。
            # 用户原问题、历史图片和资料正文保持原消息，不为收尾重新构造纯文本历史。
            # 禁用新调用不会取消早先已提交的 ComfyUI 任务，其生命周期仍由宿主管理。
            # 普通准备轮仍允许合法生成，限制只作用于明确保留的最后回答轮。
            # system 只使用应用固定文字，不采纳外部文档要求扩大预算的命令。
            final_answer = step == max_steps
            if final_answer:
                messages.append({"role": "system", "content": "这是本轮最后一次回答机会。不要再调用工具。依据当前用户请求和已有真实资料直接回答；提示词咨询应提供可复制示例。信息不足则明确说明缺失并提出一个具体问题，不编造查询或生成成功。"})

            content_parts: list[str] = []
            calls: dict[int, dict[str, Any]] = {}

            # 流式预算同时约束建立连接和持续返回的思考，避免只限制首 token。
            # 保留既有 chunk 解析，不改变图像消息或工具参数的协议格式。
            # 超限消息由本地直接发出，终止循环，不把它交给模型自我判断。
            # final 仍沿用原事件形状，桌面端可以正常解除生成状态。
            # 清理通过异步上下文完成，防止正常回答后悬挂远端连接。
            # 最终轮同时使用 tool_choice=none，供应商忽略限制时还有下方执行拦截。
            # 不删除历史工具结果，模型仍能用刚读到的资料组织正文。
            # 两层限制分别约束 API 决策与本机副作用，不能只保留其中一层。
            async for chunk in bounded_completion(self.llm, self.config, messages, self.tools, final_answer=final_answer):
                if isinstance(chunk, TurnLimit):
                    yield {"type": "final", "text": chunk.text, "steps": step}
                    return
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta

                # 有的模型会把思考过程放在 reasoning_content 里
                reasoning = getattr(delta, "reasoning_content", None)
                if reasoning:
                    yield {"type": "reasoning_delta", "step": step, "text": reasoning}

                if delta.content:
                    content_parts.append(delta.content)
                    yield {"type": "answer_delta", "step": step, "text": delta.content}

                # 流式 tool_calls 是分片拼出来的：按 index 累积 id / name / arguments
                for piece in delta.tool_calls or []:
                    slot = calls.setdefault(
                        piece.index, {"id": None, "name": None, "arguments": ""}
                    )
                    if piece.id:
                        slot["id"] = piece.id
                    if piece.function and piece.function.name:
                        slot["name"] = piece.function.name
                    if piece.function and piece.function.arguments:
                        slot["arguments"] += piece.function.arguments

            text = "".join(content_parts)

            # 某些中转接口可能仍返回工具调用；回答轮不能再真正执行它。
            # 有正文就保留已返回的正文，无正文才使用明确的预算停止说明。
            # 不伪造 tool_call/tool_result，未执行的查询不会出现在已完成过程里。
            # 工具流已经消费结束并关闭，拒绝执行不会留下仍在下载的 SDK 响应。
            # 本轮马上 final，不会把未配对的调用消息带到另一次模型请求。
            # 有正文的接口仍可交付其解释，但程序不因此认定正文所述动作已经执行。
            # 是否实际生成必须继续以真实工具回执为准，不能从模型文字反推成功。
            # 收尾事件沿用原 steps，前端不会把被拒绝的调用多算成一个执行步骤。
            # 用户下一次明确提问会新建预算，本分支不在后台自动创建继续任务。
            if final_answer and calls:
                yield {"type": "final", "text": text or TurnLimit().text, "steps": step}
                return

            # 没有 tool_calls → 这一轮就是最终回答，循环结束
            if not calls:
                messages.append({"role": "assistant", "content": text})
                yield {"type": "final", "text": text, "steps": step}
                return

            # 有 tool_calls → 先把带 tool_calls 的 assistant 消息原样回填
            ordered = [calls[index] for index in sorted(calls)]
            messages.append(
                {
                    "role": "assistant",
                    "content": text or None,
                    "tool_calls": [
                        {
                            "id": call["id"],
                            "type": "function",
                            "function": {
                                "name": call["name"],
                                "arguments": call["arguments"],
                            },
                        }
                        for call in ordered
                    ],
                }
            )

            # 同轮多个查询可以各自完成，阶段提示统一放在全部回执之后。
            # 不把系统提示插进尚未回齐的 tool_calls 中间，兼容严格的中转接口。
            # 列表仅属于当前模型请求，不跨用户提问保留旧的完成阶段。
            # 原始工具结果先完整保留，提示只是下一次决策的固定提醒。
            # 无需新模型请求或额外工具来总结阶段，避免为省轮数反而增加轮次。
            # 若随后出现待确认角色，直接 final，不把前面的就绪提示当成允许生成。
            hints = []
            for call in ordered:
                try:
                    arguments = json.loads(call["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = {}

                # 同名同参数查询至多两次；生成具有副作用，仅放行一次。
                # 在发送 tool_call 之前拦截，界面不会遗留无法完成的工具项。
                # 同轮多个调用也共享预算，不能通过批量请求绕过限制。
                # 参数键顺序由预算器规范化，不以原始字符串判断重复。
                # 不给拒绝调用编造 tool_result，直接结束当前回答询问用户。
                if not budget.allow(call["name"], arguments):
                    yield {"type": "final", "text": TurnLimit().text, "steps": step}
                    return

                yield {
                    "type": "tool_call",
                    "step": step,
                    "id": call["id"],
                    "name": call["name"],
                    "arguments": arguments,
                }

                if call["name"] in self.host_tool_names:
                    # 宿主工具：实现留在应用侧，这里只转发（见 host_tools.HostBridge）
                    if self.bridge is None:
                        output = (
                            f"工具执行失败：{call['name']} 需要宿主桥，但当前进程没有连接宿主"
                        )
                    else:
                        try:
                            output = await self.bridge.call(
                                call["name"],
                                arguments,
                                self.host_tool_timeouts.get(call["name"]),
                            )
                        except Exception as exc:  # 桥本身出错也要回填
                            output = f"工具执行失败：{exc}"
                else:
                    try:
                        result = await self.session.call_tool(call["name"], arguments)
                        output = (
                            "\n".join(
                                b.text
                                for b in result.content
                                if getattr(b, "type", None) == "text"
                            )
                            or "(工具没有返回文本内容)"
                        )
                    except Exception as exc:  # 工具失败也要回填，让模型自己兜底
                        output = f"工具执行失败：{exc}"

                yield {
                    "type": "tool_result",
                    "step": step,
                    "id": call["id"],
                    "name": call["name"],
                    "output": output,
                }
                # 一条调用配一条结果，tool_call_id 必须对得上
                messages.append(
                    {"role": "tool", "tool_call_id": call["id"], "content": output}
                )
                # 角色身份有歧义时硬性结束，不再让模型连猜译名。
                # 先发送实际工具结果，用户仍能展开过程核对候选。
                # 仅信任工具的结构化标记，其他工具输出不会触发此规则。
                # 多候选不默认选择首项，更不会自动排队生成错误角色。
                # 用户补充信息后的新提问重新获得查询预算。
                # 这一步不额外调用云端，所以确认问题可以立即显示。
                clarification = character_question(call["name"], output)
                if clarification:
                    yield {"type": "final", "text": clarification, "steps": step}
                    return
                # 查询成功只减少重复查找，不自动执行用户未要求的副作用。
                # 非正式结果不会产生提示，工具失败仍交由现有错误路径处理。
                # 不把外部返回的角色名或模型路径拼进 system 消息。
                hint = generation_hint(call["name"], output)
                if hint:
                    hints.append(hint)

            # 最新问题持续保留在原 user 消息中，此处不重新插入历史任务。
            # 同一批重复阶段提示合并，避免多个工具制造多份相同规则。
            # 只有需要下一次模型请求时才使用它们，不额外消耗一轮总结请求。
            # dict 保留首次出现顺序，去重不会随机颠倒角色与主模型的阶段说明。
            # 每一轮重新收集，旧查询的提示不会复制成新的查询成功证据。
            # 外部回执不参与拼装系统文字，角色名中的特殊文本仍留在 tool 层。
            if hints:
                messages.append({"role": "system", "content": "\n".join(dict.fromkeys(hints))})


        # 查询已经消耗预算，继续需要用户提供新信息或明确下一步。
        # 不把预算耗尽标成程序崩溃，也不再增加一次付费模型请求。
        # 已完成的工具结果保留在过程区供用户查看。
        yield {"type": "final", "text": TurnLimit().text, "steps": max_steps}


async def collect_answer(
    question: str,
    history: list[dict[str, str]] | None = None,
    config: AgentConfig | None = None,
) -> dict[str, Any]:
    """非流式用法：跑完，只取最终结果（顺便把过程也带回去，方便排查）。"""
    events: list[dict[str, Any]] = []
    async with AgentSession(config or load_config()) as agent:
        async for event in agent.stream(question, history):
            events.append(event)
            if event["type"] == "final":
                return {"answer": event["text"], "steps": event["steps"], "events": events}
            if event["type"] == "error":
                return {"answer": None, "error": event["message"], "events": events}
    return {"answer": None, "error": "没有拿到最终回答", "events": events}
