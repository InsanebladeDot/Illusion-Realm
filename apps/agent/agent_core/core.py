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
from .fake_llm import FakeAsyncOpenAI
from .host_tools import HostBridge, parse_host_tools


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
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """跑完一次提问，把过程拆成事件逐条吐出来。"""
        messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        for item in history or []:
            messages.append({"role": item["role"], "content": item["content"]})
        messages.append({"role": "user", "content": question})

        yield {"type": "tools", "tools": self.tool_cards}

        for step in range(1, self.config.max_steps + 1):
            yield {"type": "step", "step": step}

            content_parts: list[str] = []
            calls: dict[int, dict[str, Any]] = {}

            stream = await self.llm.chat.completions.create(
                model=self.config.model,
                messages=messages,
                tools=self.tools,        # 工具是请求参数，不是消息
                tool_choice="auto",
                temperature=0,
                stream=True,             # 流式拿 token，桌面端才能逐字显示
            )

            async for chunk in stream:
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

            for call in ordered:
                try:
                    arguments = json.loads(call["arguments"] or "{}")
                except json.JSONDecodeError:
                    arguments = {}

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

        yield {
            "type": "error",
            "message": f"已达最大轮数 {self.config.max_steps}，模型仍在请求工具",
        }


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
