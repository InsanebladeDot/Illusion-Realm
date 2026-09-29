"""桌面端入口：stdin 收一行 JSON（配置 + 问题 + 历史），stdout 逐行吐事件（NDJSON）。

为什么是 NDJSON 而不是 SSE：stdio 本来就是逐行的，NDJSON 解析更简单，
也不会踩代理缓冲 / gzip 那类「HTTP 才有」的坑。

两条硬约定：
1. **配置走 stdin，不走命令行参数** —— 命令行会进进程列表与日志（密钥尤其）。
2. **每帧一行、立即 flush** —— 父进程（Electron 主进程）靠这个做实时转发，
   攒着不发在桌面上就是「点了没反应」。

退出码：0 = 跑到了 final；1 = 出错过早结束（stderr / `error` 帧里有原因）。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    # **stdin 也必须显式设成 UTF-8**：Windows 上 Python 默认按 ANSI 代码页解码管道，
    # 而 Node 写进来的是 UTF-8 JSON —— 中文会被解成乱码，遇到代码页里没有的字节序列
    # 还会留下代理字符（`\udcac`），然后在写 stdout 时抛 UnicodeEncodeError。
    # 症状极具误导性：报的是"编码错误"，根因却在读取侧。
    sys.stdin.reconfigure(encoding="utf-8")

try:  # python -m agent_core.entrypoints.stdio_agent
    from ..config import load_config
    from ..core import AgentSession
    from ..host_tools import HostBridge, parse_host_tools
except ImportError:  # 直接 `python stdio_agent.py`：没有包上下文时退回绝对导入
    sys.path.insert(0, str(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
    from agent_core.config import load_config
    from agent_core.core import AgentSession
    from agent_core.host_tools import HostBridge, parse_host_tools


def emit(event: dict[str, Any]) -> None:
    """一帧一行 + 立即 flush。"""
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def read_payload(payload_file: str | None) -> dict[str, Any]:
    """默认读 stdin 的一行；`--payload <file>` 只是调试便利（不含密钥时才好用）。"""
    if payload_file:
        with open(payload_file, encoding="utf-8") as handle:
            return json.load(handle)
    raw = sys.stdin.readline()
    if not raw.strip():
        return {}
    return json.loads(raw)


async def run(payload: dict[str, Any], fake_llm: bool) -> int:
    question = str(payload.get("question") or "").strip()
    if not question:
        emit({"type": "error", "message": "缺少 question"})
        return 1

    overrides = dict(payload.get("config") or {})
    if fake_llm:
        overrides["fakeLlm"] = True
    config = load_config(overrides)
    history = payload.get("history") or []

    # 有宿主工具才起桥：没有的话 stdin 上不会有响应，白起一个线程
    bridge = HostBridge() if parse_host_tools(config.host_tools) else None
    if bridge is not None:
        bridge.start(asyncio.get_running_loop())

    reached_final = False
    try:
        async with AgentSession(config=config, bridge=bridge) as agent:
            async for event in agent.stream(question, history):
                emit(event)
                if event["type"] == "final":
                    reached_final = True
    except Exception as exc:  # 任何异常都要变成一帧 error，父进程才知道发生了什么
        emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
        return 1
    return 0 if reached_final else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 桌面端 stdio 入口（NDJSON 事件流）")
    parser.add_argument("--fake-llm", action="store_true", help="用假模型跑通链路（不花 token）")
    parser.add_argument("--payload", help="从文件读 payload（调试用；默认读 stdin 一行）")
    args = parser.parse_args()

    try:
        payload = read_payload(args.payload)
    except (OSError, json.JSONDecodeError) as exc:
        emit({"type": "error", "message": f"payload 解析失败：{exc}"})
        return 1

    return asyncio.run(run(payload, args.fake_llm))


if __name__ == "__main__":
    raise SystemExit(main())
