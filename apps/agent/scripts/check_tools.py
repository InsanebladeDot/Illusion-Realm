"""问 MCP server 一句「你现在有哪些工具」—— 不花 token、不启 Electron、两秒钟出结果。

为什么值得单独有一个：`@mcp.tool()` 是**导入时**执行的装饰器，所以"工具没挂上"这件事
在日志里完全看不出来（server 照样起得来）。2026-09-28 就踩过两次：
先是 server.py 忘了 import 工具模块（空清单），再是 `from tools.server import mcp`
的循环导入（直接 ImportError）。这两种都不是"跑一次真模型"才发现的问题 ——
这个脚本就是为此把发现时间从"点开应用提问"缩到两秒。

用法（用 venv 里的解释器跑；从哪个目录跑都行）：

    apps\\agent\\.venv\\Scripts\\python.exe apps\\agent\\scripts\\check_tools.py

退出码：0 = 期望的工具都在；1 = 缺工具 / 空清单 / 连不上。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[1]
EXPECTED_TOOLS = ("calculate", "get_context", "list_directory")
HANDSHAKE_FRAMES = (
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "check_tools", "version": "1"},
        },
    },
    {"jsonrpc": "2.0", "method": "notifications/initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
)


def ask_server(timeout: float = 30.0) -> tuple[list[str], str]:
    """起一次真实 server 做最小握手，返回（工具名，stderr 全文）。

    `PYTHONIOENCODING=utf-8` 不能省：server 侧的中文日志在中文 Windows 上会按 ANSI
    代码页输出，读回来解码失败会让"看不出真实错误"（这里踩过一次）。
    """
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    process = subprocess.Popen(
        [sys.executable, "-m", "tools.server"],
        cwd=str(AGENT_DIR),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    payload = "".join(json.dumps(frame, ensure_ascii=False) + "\n" for frame in HANDSHAKE_FRAMES)
    try:
        out, err = process.communicate(payload, timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        return [], "（握手上限 %.0f 秒内没有回应）" % timeout

    names: list[str] = []
    for line in out.splitlines():
        try:
            frame = json.loads(line)
        except json.JSONDecodeError:
            continue
        if frame.get("id") == 2:
            names = [tool["name"] for tool in frame.get("result", {}).get("tools", [])]
    return names, err


def main() -> int:
    names, err = ask_server()
    print(f"解释器：{sys.executable}")
    print(f"工具：{names or '[]（一个都没有）'}")

    missing = [tool for tool in EXPECTED_TOOLS if tool not in names]
    extra = [tool for tool in names if tool not in EXPECTED_TOOLS]
    if missing:
        print(f"FAIL  缺这些工具：{'、'.join(missing)}")
    if extra:
        print(f"注意  多出未在预期清单里的工具：{'、'.join(extra)}（记得同步 EXPECTED_TOOLS）")

    if names and not missing:
        print("OK  三个内置工具都挂上了 ✓")
        return 0

    # 失败时把 server 的 stderr 原样带出来：循环导入 / 语法错误都在那里
    print("--- server stderr（原样）---")
    for line in err.strip().splitlines()[-25:]:
        print("  " + line)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
