# Illusion Realm Agent（Python 侧）

从 `D:/Code/LLM` 整理而来：**一份核心 + 三个入口**。桌面端只走 `stdio_agent`，
其余入口只在开发期用。设计与取舍见 [`docs/agent-integration.md`](../../docs/agent-integration.md)。

```
agent_core/
  config.py            配置的唯一读取入口（load_config，不再有模块级 .env）
  core.py              Agent 核心：MCP 连接 + 工具循环，只 yield 事件
  fake_llm.py          假模型：不花 token 跑通整条链路（冒烟/单测用）
  host_tools.py        宿主工具桥：把「应用侧能力」的调用转发给 Electron 主进程
  entrypoints/
    cli.py             开发期命令行
    stdio_agent.py     ★桌面端入口：stdin 收一行 JSON，stdout 逐行吐事件（NDJSON）
tools/
  mcp_instance.py      唯一的 FastMCP 实例（工具模块都从这里取 mcp）
  registry.py          自动发现 tools/<分类>/*_tools.py 并导入（**导入即注册**）
  server.py            入口：load_all_tools() → mcp.run(stdio)
  security.py          只读白名单 / 权限档位
  math/math_tools.py          calculate
  file/file_tools.py          list_directory
  context/context_tools.py    get_context
```

## 两类工具（别搞混）

| | **内置 MCP 工具**（`tools/**`） | **宿主工具**（`apps/electron/agent/host-tools.js`） |
|---|---|---|
| 跑在哪 | 本包拉起的 MCP 子进程（stdio） | Electron 主进程 |
| 适合 | 纯本地、与桌面端无关的能力（算数、列目录） | **应用自己的能力**（本地模型索引、图片 Meta、图库） |
| 数据来源 | 环境变量传进来的白名单目录 | 应用设置（用户数据文档）与主进程已有实现 |
| 加一个要改哪 | 在 `tools/<分类>/` 下加一个 `*_tools.py`（`from ..mcp_instance import mcp` + `@mcp.tool()`）；**不用改任何登记表** | 只在 `host-tools.js` 加一条声明 + run；**Python 一行都不用改** |

内置工具的**唯一启动方式**是 `python -m tools.server`（cwd = 包根）：
相对导入需要包上下文，直接 `python tools/server.py` 拿不到包名。
工具实例放在 `mcp_instance.py` 而不是 `server.py`，正是为了让工具模块**不必 import server**
—— `python -m tools.server` 下 `__main__` 与 `tools.server` 是两个模块对象，
工具模块若 `from tools.server import mcp` 会注册到"不跑的那个"实例上（空清单或循环导入，两种都踩过）。

宿主工具的协议（双向都走 stdio，行分隔 JSON）：

```
sidecar → stdout   {"type":"host_request","id":…,"name":"list_local_models","arguments":{…}}
主进程  → stdin    {"type":"host_response","id":…,"ok":true,"result":"…"}
```

注意：`host_request` 是**内部协议帧**，主进程不会把它转发给渲染层（见 `agent/runner.js`）；
`stdin` 也不能在写完 payload 后就 `end()` —— 那等于把桥关掉，工具会一直等到超时。

## 现在的状态（已就绪）

```powershell
# 这个 venv 已经建好并装好了运行期依赖（实测 76 MB；不含 langgraph/langsmith/fastapi 那些
# 开发期才用的包 —— 别直接拷 D:/Code/LLM/.venv，那是 110 MB 且绑着它的基础解释器路径）
.\.venv\Scripts\python.exe -V

# 重建（换机器 / 升依赖时）：
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
```

## 配置写在哪（**一份，全工作区共用**）

`<工作区根>/.env`（模板见仓库根的 `.env.example`；dev = 工作区根，打包 = exe 同目录）。
主进程在启动最早期读它、只报键名不报值；**密钥永不进渲染进程、日志与命令行**。
Python 侧的查找顺序：`ILLUSION_AGENT_ENV_FILE` → `apps/agent/.env` → **工作区根 `.env`**。
默认值（baseUrl / model / maxSteps）以 `packages/shared/src/data/agent.ts` 为准，
主进程每次运行都会把生效值经 stdin 传下来，本包 `config.py` 里的同名常量只是兜底。

## 三个入口

```powershell
# 1) 开发期命令行（支持 --fake-llm）
python -m agent_core.entrypoints.cli "上海的天气怎么样？"
python -m agent_core.entrypoints.cli --fake-llm "帮我算 1+1"

# 2) 桌面端入口（主进程就是这么拉起的）：stdin 一行 JSON → stdout 逐行事件
'{"question":"帮我算 1+1"}' | python -m agent_core.entrypoints.stdio_agent --fake-llm

# 3) 真实模型：需要 key（env 或 .env），key 由主进程注入，不进命令行
$env:ILLUSION_AGENT_API_KEY="sk-..."
python -m agent_core.entrypoints.cli "帮我算 (26+18)*3-7"
```

## 不花 token 的自检

```powershell
# Python 侧（两秒钟，不用 Electron）：问 server 一句「你现在有哪些工具」
.\.venv\Scripts\python.exe scripts\check_tools.py

# Node 侧（会真的 spawn 这个进程）：
npx electron scripts/verify-agent-events.js
```

## 约定

- **事件形状是契约**：字段名与 `packages/shared/src/types/agent.ts` 一一对应，
  改一边必须改另一边（`scripts/verify-agent-events.js` 会断言序列与字段）。
- **配置走 stdin**：命令行参数会进进程列表与日志，密钥一律不走 argv。
- **不要在这里写应用专属能力**：能复用的读盘/扫描逻辑在 Electron 侧已经有了，
  P3 的做法是把它们挂成工具（或走宿主桥），而不是在 Python 里重写一遍。
