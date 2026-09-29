"""上下文类工具：`get_context`（把权限档位与可访问目录报给模型，便于排查）。

自动发现：文件名以 `_tools` 结尾即可，规则见 `tools/registry.py`。
"""

from __future__ import annotations

from ..mcp_instance import mcp
from ..security import _allowed_roots, _permission



# ---------------------------------------------------------------------------
# 工具三：自报上下文（让「权限 / 白名单」这件事对模型可见，便于排查）
# ---------------------------------------------------------------------------


@mcp.tool()
def get_context() -> str:
    """报告当前运行上下文：权限档位、允许访问的目录、Python 版本。

    当用户问「你能看到哪些目录」「你现在有哪些权限」时调用它；
    排查「工具报无权访问」时也先调它。
    """
    import sys

    roots = _allowed_roots()
    root_text = "、".join(str(root) for root in roots) if roots else "（未配置）"
    return (
        f"权限：{_permission()}\n"
        f"允许访问的目录：{root_text}\n"
        f"运行环境：Python {sys.version.split()[0]}"
    )

