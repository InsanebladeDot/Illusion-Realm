"""MCP 工具 server：把本地能力封装成「工具」，暴露给任意 Agent 使用。

Agent 会以子进程方式自动拉起它（`python -m tools.server`，stdio 传输），
通常不需要手动运行；想单独验证是否能起来就执行它（Ctrl+C 退出）。

运行期上下文由 `agent_core` 经**环境变量**传进来（stdio 留给 MCP 协议本身）：
    ILLUSION_AGENT_ALLOWED_ROOTS  只读工具允许访问的目录白名单（os.pathsep 分隔）
    ILLUSION_AGENT_PERMISSION     readonly | full（写盘类工具只在 full 时挂载）

现状（P0/P1）：这里只有**纯本地、只读**的能力。应用专属能力（本地模型清单 /
图片内嵌 Meta / 图库列表）在 P3 接 —— 见 `docs/agent-integration.md`：
那些能力在 Electron 侧已经有了实现，接的时候走「宿主桥」或复用同一份判据，
**不要在 Python 里重写一份**，否则两边解析结果会悄悄分叉。

写工具的经验：函数的**名字 / docstring / 类型注解**会被自动转成工具 schema 发给模型，
docstring 里写清「什么场景该用」比写清「参数是什么」更能提升选工具的准确率。

## 加一个工具（**不用改这个文件**）

在 `tools/<分类>/` 下写一个 `<名字>_tools.py`，文件里：

    from ..mcp_instance import mcp

    @mcp.tool()
    def 我的工具(...) -> str:
        '''一句话说明什么场景该用。'''

启动时 `registry.load_all_tools()` 会自动发现并导入它（文件名以 `_tools` 结尾即可）。
（示例里用单引号三连：本文档字符串本身是三连双引号，嵌套会提前结束它。）

**只能这样启动：`python -m tools.server`（cwd = 包根）。**
不要直接 `python tools/server.py` —— 相对导入需要包上下文，直接执行会拿不到包名；
两种启动方式行为不同正是这个仓库踩过的坑，所以这里只保留一种。
"""

from __future__ import annotations

from .mcp_instance import mcp
from .registry import load_all_tools


if __name__ == "__main__":
    # 先把工具模块都导入一遍（导入即注册），再开始说 MCP 协议
    load_all_tools()
    # stdio 传输：Agent 通过标准输入输出和这个进程通信，无需端口、无需鉴权
    mcp.run(transport="stdio")
