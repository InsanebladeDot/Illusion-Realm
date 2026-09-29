"""全局唯一的 FastMCP 实例 —— 所有工具模块都从这里取 `mcp`。

**为什么单独一个模块**：`@mcp.tool()` 注册到哪个实例，取决于工具模块从哪里 import 它。
如果工具模块写 `from tools.server import mcp`，那么在 `python -m tools.server` 下会
**再执行一遍 server.py**（`__main__` 与 `tools.server` 是两个模块对象、各自一个 FastMCP），
工具于是注册到"不跑的那个"实例上。两种表现都很难查：

1. 静默版：server 起得来、`tools/list` 返回空清单 → 模型看不到工具，一个都不调；
2. 响亮版：`ImportError: cannot import name 'mcp' from partially initialized module
   'tools.server' (most likely due to a circular import)` → 整条链路直接报错。

两种都在 2026-09-28 实测复现过。把实例放在这里之后，**谁也不 import server**，循环就没了。

工具模块的写法（约定）—— 注意示例里用单引号三连，避免在本文档字符串里嵌套三连引号：

    from ..mcp_instance import mcp

    @mcp.tool()
    def 我的工具(...) -> str:
        '''一句话说明**什么场景该用**（这句会发给模型）。'''
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("illusion-realm-tools")
