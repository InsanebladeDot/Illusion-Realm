"""工具模块的自动发现：把 `tools` 包里所有 `*_tools.py` 导入一遍 —— **导入即注册**。

约定（这就是"方便的方式"）：**加一个工具 = 在 `tools/<分类>/` 下写一个 `<名字>_tools.py`**，
文件里 `from ..mcp_instance import mcp` + `@mcp.tool()`，**不用改任何登记表**。

四条纪律，每条都对应一次真实的坑：

1. **只认 `*_tools` 后缀**：文件名不合约定就不会被导入。为了让这件事可发现，
   启动时把「导入了哪些模块 / 注册了哪些工具」打到 stderr（主进程会转发成
   `[AGENT:stderr]`），一眼能确认，不用去猜。
2. **导入失败当场抛**：宁可 server 起不来，也不要静默少几个工具 ——
   P0 那次正是"少三个工具还一切正常"，最后靠自检才抓出来。
3. **一个工具都没注册也抛**：空清单的 server 对本项目永远是 bug，不是配置。
4. **不用 `pkgutil.walk_packages` 的默认行为**：它会把子包的 `ImportError`
   静默吞掉（只回调一个包名、连 traceback 都不打）。这里显式收下来，最后一起报。

注意：发现依赖子包里有 `__init__.py` —— 没有的话 `pkgutil` 会**整个目录跳过**
（实测：只有 `tools.security` / `tools.server` 被看见，三个子目录全消失）。
"""

from __future__ import annotations

import importlib
import pkgutil
import sys

from .mcp_instance import mcp

# 工具模块的命名约定：只有以它结尾的文件才会被导入
TOOL_MODULE_SUFFIX = "_tools"


def _discover_tool_modules() -> tuple[list[str], list[str]]:
    """扫一遍 `tools` 包。返回（工具模块名，导入子包时失败的包名）。"""
    package = importlib.import_module(__package__ or "tools")
    failed_packages: list[str] = []
    modules: list[str] = []

    for info in pkgutil.walk_packages(
        package.__path__, prefix=f"{package.__name__}.", onerror=failed_packages.append
    ):
        if info.name.rsplit(".", 1)[-1].endswith(TOOL_MODULE_SUFFIX):
            modules.append(info.name)
    return modules, failed_packages


def registered_tool_names() -> list[str]:
    """已注册的工具名（升序）。

    FastMCP 对外只有**异步**的 `list_tools()`，而这里是启动期的同步代码，
    所以直接读内部 manager。读不到就返回空表：**拿不到名单不该让 server 起不来**
    （真正的兜底是 `load_all_tools` 里那条"空清单就抛"）。
    """
    try:
        return sorted(tool.name for tool in mcp._tool_manager.list_tools())  # noqa: SLF001
    except Exception:  # 内部结构变了也不该影响启动
        return []


def load_all_tools() -> list[str]:
    """导入所有工具模块并返回已注册的工具名；任何异常都往上抛。"""
    modules, failed_packages = _discover_tool_modules()
    if failed_packages:
        raise RuntimeError(
            "这些工具子包导入失败，工具会被漏掉（修好再启动）："
            + "、".join(failed_packages)
        )

    for name in modules:
        importlib.import_module(name)  # 导入即注册；失败带着完整 traceback 冒出去

    registered = registered_tool_names()
    print(
        f"[tools] 工具模块 {len(modules)} 个：{'、'.join(modules) or '（无）'}",
        file=sys.stderr,
        flush=True,
    )
    print(
        f"[tools] 已注册工具 {len(registered)} 个：{'、'.join(registered) or '（无）'}",
        file=sys.stderr,
        flush=True,
    )

    if not registered:
        raise RuntimeError(
            "一个工具都没注册上。检查：① tools/<分类>/ 下有 *_tools.py 吗；"
            "② 子包里有 __init__.py 吗（没有的话 pkgutil 会跳过整个目录）；"
            "③ 工具模块里是不是 `from ..mcp_instance import mcp` + @mcp.tool()。"
        )
    return registered
