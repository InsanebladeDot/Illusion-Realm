
"""文件类工具：`list_directory`（只读，且必须在白名单目录内）。

自动发现：文件名以 `_tools` 结尾即可，规则见 `tools/registry.py`。
"""

from __future__ import annotations

from ..mcp_instance import mcp
from ..security import _require_allowed

# ---------------------------------------------------------------------------
# 工具二：列目录（只读，且必须在白名单内）
# ---------------------------------------------------------------------------


@mcp.tool()
def list_directory(path: str, limit: int = 40) -> str:
    """列出某个目录下的文件与子目录（只读）。

    用于回答「我的模型/输出目录里有什么」这类问题。只能访问被允许的目录；
    返回目录优先、其余按名称排序，超出 limit 会被截断。

    Args:
        path: 目录的绝对路径。
        limit: 最多返回多少条（默认 40）。
    """
    try:
        target = _require_allowed(path)
    except ValueError as exc:
        return f"无法访问该目录：{exc}"
    if not target.is_dir():
        return f"不是目录：{path}"

    try:
        entries = sorted(
            target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())
        )
    except OSError as exc:
        return f"读取目录失败：{exc}"

    shown = entries[: max(1, min(limit, 200))]
    lines = [f"{target}（共 {len(entries)} 项，显示 {len(shown)} 项）"]
    for entry in shown:
        try:
            if entry.is_dir():
                lines.append(f"[目录] {entry.name}/")
            else:
                lines.append(f"[文件] {entry.name}  {entry.stat().st_size} B")
        except OSError:
            lines.append(f"[未知] {entry.name}")
    return "\n".join(lines)
