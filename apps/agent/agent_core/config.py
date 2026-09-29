"""配置的**唯一**读取入口。

和原项目（`D:/Code/LLM/agent_demo/config.py`）的区别：
- 不再在导入期读 `.env`、不再暴露模块级常量 —— 嵌入应用后「安装目录下的 .env」
  没有意义，而且同一进程要能按次覆盖（比如这次换模型）。
- 所有取值都收进 `AgentConfig`，由 `load_config(overrides)` 决定优先级：
  **stdin 传进来的 overrides > 环境变量 > 同目录 .env 兜底 > 内置默认值**。

密钥：优先来自 overrides（主进程经 stdin 传，不进命令行、不进日志），
其次 `ILLUSION_AGENT_API_KEY` / `SILICONFLOW_API_KEY` 环境变量。
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(__file__).resolve().parents[1]

DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Flash"
DEFAULT_MAX_STEPS = 8
DEFAULT_TOOLS_MODULE = "tools.server"

SYSTEM_PROMPT = (
    "你是 Illusion Realm 桌面应用里的助手，用户主要在做 AI 绘图（Stable Diffusion / ComfyUI）。"
    "需要本地文件、模型清单或精确计算时，必须先调用工具，再严格依据工具返回的内容作答；"
    "工具没有给出的信息不要编造。回答用中文，简洁直接。"
)


@dataclass(frozen=True)
class AgentConfig:
    """一次运行的全部配置（不可变，按次构造）。"""

    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    max_steps: int = DEFAULT_MAX_STEPS
    api_key: str = ""
    tools_module: str = DEFAULT_TOOLS_MODULE
    python_executable: str = field(default_factory=lambda: sys.executable)
    permission: str = "readonly"
    """只读 / 完全访问：只读档不挂写盘类工具（P3 落地，目前只透传给工具 server）。"""
    allowed_roots: tuple[str, ...] = ()
    """只读工具允许访问的目录白名单（空 = 不允许访问文件系统）。"""
    fake_llm: bool = False
    """True 时用 `fake_llm` 里的假模型：不花 token 跑通整条链路。"""
    fake_delay_ms: int = 0
    """假模型每帧之间的延迟（毫秒）：给「取消」这类时序断言留出可观测的窗口。"""
    host_tools: tuple[Any, ...] = ()
    """宿主声明的工具（由主进程经 payload 传入，见 `host_tools.parse_host_tools`）。"""


def _parse_roots(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, (list, tuple)):
        items = [str(item) for item in value]
    else:
        return ()
    return tuple(item.strip() for item in items if item and item.strip())


def _load_dotenv_once() -> None:
    """读开发期的 `.env`：**优先工作区根那一份**（与主进程共用同一个文件）。

    查找顺序：`ILLUSION_AGENT_ENV_FILE` → 本包目录 `apps/agent/.env` → **工作区根 `.env`**。
    桌面端其实不需要走到这里：主进程已经把生效配置经 stdin 传进来了
    （见 `apps/electron/agent/runner.js`）——这里只是开发期直接跑 CLI / stdio 时的兜底。
    """
    try:
        from dotenv import load_dotenv  # 运行期可选依赖
    except Exception:  # pragma: no cover - 生产环境没装也要能跑
        return
    env_file = os.getenv("ILLUSION_AGENT_ENV_FILE")
    candidates = (
        [Path(env_file)]
        if env_file
        else [PACKAGE_ROOT / ".env", PACKAGE_ROOT.parents[1] / ".env"]
    )
    for candidate in candidates:
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            return


def load_config(overrides: dict[str, Any] | None = None) -> AgentConfig:
    """把「stdin overrides + 环境变量 + .env + 默认值」合成一份 AgentConfig。

    overrides 的键用 camelCase（与 TypeScript 侧的 `AgentRunOptions` 一致），
    环境变量用 UPPER_SNAKE（与 `.env.example` 一致）。
    """
    _load_dotenv_once()
    data = overrides or {}

    def pick(camel: str, env_name: str, fallback: Any) -> Any:
        if camel in data and data[camel] not in (None, ""):
            return data[camel]
        env_value = os.getenv(env_name)
        return env_value if env_value not in (None, "") else fallback

    api_key = str(
        pick(
            "apiKey",
            "ILLUSION_AGENT_API_KEY",
            os.getenv("SILICONFLOW_API_KEY", ""),
        )
    )
    max_steps_raw = pick("maxSteps", "AGENT_MAX_STEPS", DEFAULT_MAX_STEPS)
    try:
        max_steps = max(1, int(max_steps_raw))
    except (TypeError, ValueError):
        max_steps = DEFAULT_MAX_STEPS

    permission = str(pick("permission", "ILLUSION_AGENT_PERMISSION", "readonly"))
    if permission not in ("readonly", "full"):
        permission = "readonly"

    fake_raw = pick("fakeLlm", "ILLUSION_AGENT_FAKE_LLM", "")
    fake_llm = str(fake_raw).lower() in ("1", "true", "yes")

    try:
        fake_delay_ms = max(0, int(pick("fakeDelayMs", "ILLUSION_AGENT_FAKE_DELAY_MS", 0)))
    except (TypeError, ValueError):
        fake_delay_ms = 0

    return AgentConfig(
        base_url=str(pick("baseUrl", "ILLUSION_AGENT_BASE_URL", os.getenv("SILICONFLOW_BASE_URL", DEFAULT_BASE_URL))),
        model=str(pick("model", "ILLUSION_AGENT_MODEL", os.getenv("MODEL_NAME", DEFAULT_MODEL))),
        max_steps=max_steps,
        api_key=api_key,
        tools_module=str(pick("toolsModule", "ILLUSION_AGENT_TOOLS_MODULE", DEFAULT_TOOLS_MODULE)),
        python_executable=str(pick("pythonExecutable", "ILLUSION_AGENT_PYTHON", sys.executable)),
        permission=permission,
        allowed_roots=_parse_roots(pick("allowedRoots", "ILLUSION_AGENT_ALLOWED_ROOTS", None)),
        fake_llm=fake_llm,
        fake_delay_ms=fake_delay_ms,
        host_tools=tuple(data.get("hostTools") or ()),
    )
