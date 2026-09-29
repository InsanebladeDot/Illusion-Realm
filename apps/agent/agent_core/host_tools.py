"""宿主工具桥：让 Agent 调用**宿主应用**（Electron 主进程）的能力。

为什么需要它：应用自己的能力（本地模型索引、图片内嵌 Meta、图库列表…）在 Electron 侧
已经有实现，在 Python 里重写一份必然与那边分叉（同一件事两个判据）。所以这里只做转发：

    agent → stdout   {"type":"host_request","id":…,"name":…,"arguments":…}
    host  → stdin    {"type":"host_response","id":…,"ok":true,"result":"…"}

三条纪律：
1. **只有宿主声明的工具才可调用**：`hostTools` 来自 payload（主进程写），模型看不到别的名字；
2. **等响应有超时**（默认 30 秒）：超时/失败都变成一段「工具执行失败」文本交给模型兜底，
   不让整次 run 挂死 —— 模型拿到失败信息通常能自己换个说法继续答。
   慢工具（例如生图）由宿主在声明里带 `timeoutMs` 单独放宽，见 `HostTool.timeout_s`；
3. **stdout 只走协议**：请求也是 stdout 上的一帧，所以宿主端必须先识别 `host_request`
   再决定是否转发给 UI（见 `apps/electron/agent/runner.js`）。
"""

from __future__ import annotations

import asyncio
import json
import sys
import threading
import uuid
from dataclasses import dataclass
from typing import Any

# 等宿主响应的上限（秒）：本地 IPC 慢到这个量级说明对面卡住了
HOST_TOOL_TIMEOUT_S = 30.0


@dataclass(frozen=True)
class HostTool:
    """宿主声明的工具（只带声明，实现留在宿主侧）。"""

    name: str
    description: str
    parameters: dict[str, Any]
    timeout_s: float | None = None
    """本工具单独的等待上限（秒）；None = 用 `HostBridge` 的默认值。

    生图这类几十分钟级别的慢工具不该被 30 秒的全局默认值掐断，于是把上限做成
    声明的一部分（宿主在 `hostTools[].timeoutMs` 里给）。
    """

    def to_openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def to_card(self) -> dict[str, str]:
        """给 UI 的简介（只取描述首行，与 MCP 工具一致）。"""
        first_line = (self.description or "").strip().splitlines() or [""]
        return {"name": self.name, "description": first_line[0]}


def parse_host_tools(raw: Any) -> list[HostTool]:
    """把 payload 里的 `hostTools` 解析成声明列表；坏条目跳过而不是让 run 崩。"""
    # 接受 list / tuple：config.py 存成 tuple（不可变），直接传进来的可能是 list ——
    # 只认 list 会让整份声明静默变成空表（踩过一次：工具没进清单，模型当然不会调）
    if not isinstance(raw, (list, tuple)):
        return []
    tools: list[HostTool] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        parameters = item.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {"type": "object", "properties": {}}
        tools.append(
            HostTool(
                name=name.strip(),
                description=str(item.get("description") or ""),
                parameters=parameters,
                timeout_s=_parse_timeout_ms(item.get("timeoutMs")),
            )
        )
    return tools


def _parse_timeout_ms(value: Any) -> float | None:
    """`timeoutMs` → 秒；非法 / 非正数一律当「没给」，回落到默认上限。"""
    try:
        milliseconds = float(value)
    except (TypeError, ValueError):
        return None
    return milliseconds / 1000.0 if milliseconds > 0 else None


class HostBridge:
    """stdin 上的响应读取器 + stdout 上的请求写出。

    为什么用后台线程读 stdin：Windows 上 asyncio 的 `connect_read_pipe` 对 stdin
    支持很差（Proactor 事件循环下直接报错）。读线程 + `call_soon_threadsafe`
    是最省事又跨平台的做法；行解析仍然是纯文本，没有额外依赖。
    """

    def __init__(self, *, timeout: float = HOST_TOOL_TIMEOUT_S) -> None:
        self._timeout = timeout
        self._loop: asyncio.AbstractEventLoop | None = None
        self._pending: dict[str, asyncio.Future[str]] = {}
        self._closed = False

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """绑定事件循环并开始读 stdin（幂等：重复调用只起一个线程）。"""
        if self._loop is not None:
            return
        self._loop = loop
        reader = threading.Thread(
            target=self._read_lines, name="host-bridge-reader", daemon=True
        )
        reader.start()

    def _read_lines(self) -> None:
        stream = sys.stdin
        while not self._closed:
            line = stream.readline()
            if not line:
                self._closed = True
                break
            self._deliver(line)
        # 宿主那边关掉了 stdin：把还在等的调用全部判失败，别让它们等到超时
        loop = self._loop
        if loop is not None:
            for request_id in list(self._pending):
                loop.call_soon_threadsafe(
                    self._resolve, request_id, None, "宿主连接已关闭"
                )

    def _deliver(self, line: str) -> None:
        text = line.strip()
        if not text:
            return
        try:
            frame = json.loads(text)
        except json.JSONDecodeError:
            # stdin 上只应出现宿主响应；坏行忽略（stdout 才走协议主干）
            return
        if not isinstance(frame, dict) or frame.get("type") != "host_response":
            return
        request_id = frame.get("id")
        if not isinstance(request_id, str):
            return
        error = None if frame.get("ok") else str(frame.get("error") or "宿主工具执行失败")
        result = "" if error else str(frame.get("result") or "")
        loop = self._loop
        if loop is None:
            return
        loop.call_soon_threadsafe(self._resolve, request_id, result, error)

    def _resolve(self, request_id: str, result: str, error: str | None) -> None:
        future = self._pending.pop(request_id, None)
        if future is None or future.done():
            return
        if error:
            future.set_result(f"工具执行失败：{error}")
        else:
            future.set_result(result)

    async def call(
        self, name: str, arguments: dict[str, Any], timeout: float | None = None
    ) -> str:
        """请求宿主执行一个工具，返回给模型看的文本结果。

        `timeout` 为 None 时用本桥的默认上限；生图之类慢工具由调用方传自己那份
        （来自宿主声明的 `timeoutMs`，见 `HostTool.timeout_s`）。
        """
        loop = asyncio.get_running_loop()
        self.start(loop)
        request_id = uuid.uuid4().hex
        future: asyncio.Future[str] = loop.create_future()
        self._pending[request_id] = future
        effective_timeout = timeout if timeout is not None else self._timeout

        sys.stdout.write(
            json.dumps(
                {
                    "type": "host_request",
                    "id": request_id,
                    "name": name,
                    "arguments": arguments,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        sys.stdout.flush()

        try:
            return await asyncio.wait_for(future, effective_timeout)
        except asyncio.TimeoutError:
            self._pending.pop(request_id, None)
            return f"工具执行失败：宿主在 {effective_timeout:.0f} 秒内没有响应（{name}）"
