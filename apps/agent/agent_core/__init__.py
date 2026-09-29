"""Illusion Realm Agent 核心包。

对外只暴露两样东西：`AgentSession`（一次提问 → 一条事件流）与 `load_config`。
"""

from .config import AgentConfig, load_config
from .core import AgentSession, collect_answer

__all__ = ["AgentConfig", "AgentSession", "collect_answer", "load_config"]
