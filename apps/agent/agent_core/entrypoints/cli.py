"""开发期命令行入口：把事件流打印成人看得懂的样子。

用法（在 apps/agent 下执行）：
    python -m agent_core.entrypoints.cli "帮我算 (26+18)*3-7"
    python -m agent_core.entrypoints.cli --fake-llm "帮我算 1+1"   # 不花 token
    python -m agent_core.entrypoints.cli                            # 不带问题 = 内置多轮示例

业务逻辑都在 core.py，这里只负责渲染。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from ..config import load_config
from ..core import AgentSession

DEFAULT_QUESTIONS = [
    "帮我算一下 (26+18)*3-7 等于多少？",
    "那如果再加 100 呢？",
]


class Renderer:
    """把事件流渲染到终端。

    注意一个顺序问题：模型可能先流式吐几个字，之后才给出 tool_calls，
    所以先按「模型输出」实时打印，真等来工具调用时再换行接上调用记录。
    """

    def __init__(self) -> None:
        self.streaming = False

    def _close_line(self) -> None:
        if self.streaming:
            print()
            self.streaming = False

    def __call__(self, event: dict[str, Any]) -> None:
        kind = event["type"]

        if kind == "tools":
            print(f"[MCP] 发现 {len(event['tools'])} 个工具：")
            for tool in event["tools"]:
                print(f"  • {tool['name']}: {tool['description']}")
            print()
        elif kind == "step":
            self._close_line()
            print(f"[第 {event['step']} 轮] 组装 messages + tools，发给模型…")
        elif kind == "reasoning_delta":
            if not self.streaming:
                print("  [模型思考] ", end="")
                self.streaming = True
            print(event["text"], end="", flush=True)
        elif kind == "answer_delta":
            if not self.streaming:
                print("  模型输出：", end="")
                self.streaming = True
            print(event["text"], end="", flush=True)
        elif kind == "tool_call":
            self._close_line()
            arguments = json.dumps(event["arguments"], ensure_ascii=False)
            print(f"  → 模型决定调用工具 {event['name']}({arguments})")
        elif kind == "tool_result":
            print(f"  ← 工具返回：{event['output']}")
        elif kind == "final":
            self._close_line()
        elif kind == "error":
            self._close_line()
            print(f"  [错误] {event['message']}")


async def main(args: argparse.Namespace) -> int:
    questions: list[str] = args.questions or DEFAULT_QUESTIONS
    config = load_config({"fakeLlm": True} if args.fake_llm else None)
    history: list[dict[str, str]] = []
    render = Renderer()
    failed = False

    async with AgentSession(config=config) as agent:
        for turn, question in enumerate(questions, start=1):
            print("=" * 72)
            print(f"第 {turn} 轮 | 用户：{question}")
            print("=" * 72)

            answer = ""
            steps = 0
            async for event in agent.stream(question, history):
                if event["type"] == "final":
                    answer = event["text"]
                    steps = event["steps"]
                if event["type"] == "error":
                    failed = True
                render(event)

            print(f"\n─── 本轮结束：模型共被调用 {steps} 次 ───\n")
            history.append({"role": "user", "content": question})
            history.append({"role": "assistant", "content": answer})

    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Agent 开发期命令行")
    parser.add_argument("questions", nargs="*", help="要问的问题（可多个，按顺序多轮）")
    parser.add_argument("--fake-llm", action="store_true", help="用假模型，不花 token")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
