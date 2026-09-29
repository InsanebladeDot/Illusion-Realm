"""假模型：**不花 token** 也能把「事件流 + 工具循环」整条链路跑通。

为什么要它：真实的工具循环要跑两次模型调用（第一次给 tool_calls、第二次给最终回答），
没有它就只能靠真实 key + 真花钱来验证。它模拟 `AsyncOpenAI.chat.completions.create`
的最小表面（只实现本项目用到的那几个参数）。

行为刻意做成确定的，便于断言：
1. 还没拿到工具结果时：若工具清单里有 `calculate` 且问题里能抠出算式 → 发 tool_call；
   否则直接给最终回答。
2. 已经拿到工具结果（messages 里出现 role="tool"）→ 输出一句话，内含工具返回的原文。
"""

from __future__ import annotations

import json
import re
import asyncio
from dataclasses import dataclass, field
from typing import Any, AsyncIterator


@dataclass
class _Function:
    name: str | None = None
    arguments: str = ""


@dataclass
class _ToolCallPiece:
    index: int = 0
    id: str | None = None
    function: _Function | None = None


@dataclass
class _Delta:
    content: str | None = None
    reasoning_content: str | None = None
    tool_calls: list[_ToolCallPiece] = field(default_factory=list)


@dataclass
class _Choice:
    delta: _Delta


@dataclass
class _Chunk:
    choices: list[_Choice]


def _chunk(**delta_kwargs: Any) -> _Chunk:
    return _Chunk(choices=[_Choice(delta=_Delta(**delta_kwargs))])


# 允许以 ( 或数字开头（否则 "(26+18)*3-7" 会被抠成 "26+18)*3-7"）
_EXPRESSION_RE = re.compile(r"[0-9(][0-9\s+\-*/%().]*[0-9)]")
# 路径：盘符 + 分隔符开头。允许**路径里带空格**（本仓库路径就带），
# 遇到中日韩字符 / 引号 / 标点才停 —— 否则 "…/Illusion Realm/apps/agent 里有什么"
# 会被抠成半截路径。
_PATH_RE = re.compile(r"[A-Za-z]:[\\/][A-Za-z0-9_\-./\\ :]*")


def _has_tool_result(messages: list[dict[str, Any]]) -> bool:
    return any(message.get("role") == "tool" for message in messages)


def _last_tool_output(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "tool":
            return str(message.get("content") or "")
    return ""


def _extract_expression(messages: list[dict[str, Any]]) -> str | None:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        matched = _EXPRESSION_RE.search(str(message.get("content") or ""))
        if matched:
            return matched.group(0).strip()
    return None


def _extract_path(messages: list[dict[str, Any]]) -> str | None:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        matched = _PATH_RE.search(str(message.get("content") or ""))
        if matched:
            return matched.group(0).strip().rstrip(" \\/:")
    return None


def _last_user_text(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content") or "")
    return ""


def _wants_model_list(messages: list[dict[str, Any]]) -> bool:
    """问题里提到模型/清单就走 `list_local_models`（宿主工具）那条路。"""
    text = _last_user_text(messages).lower()
    return any(keyword in text for keyword in ("模型", "清单", "checkpoint", "lora"))


def _wants_image(messages: list[dict[str, Any]]) -> bool:
    """问题里明确要求出图时走 `generate_image` 宿主工具。"""
    text = _last_user_text(messages).lower()
    return any(keyword in text for keyword in ("生成图片", "画一张", "generate image"))


def _has_calculate(tools: list[dict[str, Any]]) -> bool:
    return _has_tool(tools, "calculate")


def _has_tool(tools: list[dict[str, Any]], name: str) -> bool:
    for tool in tools:
        function = tool.get("function") or {}
        if function.get("name") == name:
            return True
    return False


async def _stream_text(text: str, delay_ms: int = 0) -> AsyncIterator[_Chunk]:
    """按字符切分输出，模拟真实模型的逐字流；`delay_ms` 用于给取消留观测窗口。"""
    for char in text:
        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)
        yield _chunk(content=char)


class _FakeCompletions:
    def __init__(self, delay_ms: int = 0) -> None:
        self.delay_ms = delay_ms

    async def create(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | None = None,
        temperature: float | None = None,
        stream: bool = False,
    ) -> AsyncIterator[_Chunk]:
        _ = (model, tool_choice, temperature, stream)
        return self._stream(messages, tools or [])

    async def _stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[_Chunk]:
        if _has_tool_result(messages):
            answer = f"（假模型）按工具返回：{_last_tool_output(messages)}"
            async for chunk in _stream_text(answer, self.delay_ms):
                yield chunk
            return

        path = _extract_path(messages)
        if path and _has_tool(tools, "list_directory"):
            yield _chunk(reasoning_content="问的是目录内容，用列目录工具")
            yield _chunk(
                tool_calls=[
                    _ToolCallPiece(
                        index=0,
                        id="call_fake_list",
                        function=_Function(
                            name="list_directory",
                            arguments=json.dumps({"path": path}, ensure_ascii=False),
                        ),
                    )
                ]
            )
            return

        expression = _extract_expression(messages)
        if _wants_image(messages) and _has_tool(tools, "generate_image"):
            yield _chunk(reasoning_content="用户要生成图片，用生图工具")
            yield _chunk(
                tool_calls=[
                    _ToolCallPiece(
                        index=0,
                        id="call_fake_image",
                        function=_Function(
                            name="generate_image",
                            arguments=json.dumps(
                                {"prompt": "a test image"}, ensure_ascii=False
                            ),
                        ),
                    )
                ]
            )
            return

        if _wants_model_list(messages) and _has_tool(tools, "list_local_models"):
            arguments: dict[str, Any] = {}
            if "lora" in _last_user_text(messages).lower():
                arguments["kind"] = "lora"
            yield _chunk(reasoning_content="问的是本地模型，用模型清单工具")
            yield _chunk(
                tool_calls=[
                    _ToolCallPiece(
                        index=0,
                        id="call_fake_models",
                        function=_Function(
                            name="list_local_models",
                            arguments=json.dumps(arguments, ensure_ascii=False),
                        ),
                    )
                ]
            )
            return

        if expression and _has_calculate(tools):
            # 先给一小段思考，再决定调工具 —— 顺便覆盖 reasoning_delta 这条事件
            yield _chunk(reasoning_content="这道题要精算，用工具")
            yield _chunk(
                tool_calls=[
                    _ToolCallPiece(
                        index=0,
                        id="call_fake_1",
                        function=_Function(
                            name="calculate",
                            arguments=f'{{"expression": "{expression}"}}',
                        ),
                    )
                ]
            )
            return

        question = _last_user_text(messages)
        async for chunk in _stream_text(
            f"（假模型）未调用工具，直接回答：{question}", self.delay_ms
        ):
            yield chunk


class _FakeChat:
    def __init__(self, delay_ms: int = 0) -> None:
        self.completions = _FakeCompletions(delay_ms=delay_ms)


class FakeAsyncOpenAI:
    """只实现 `chat.completions.create` 的假客户端（其余成员没有，用到会直接报错）。"""

    def __init__(self, delay_ms: int = 0) -> None:
        self.chat = _FakeChat(delay_ms=delay_ms)
