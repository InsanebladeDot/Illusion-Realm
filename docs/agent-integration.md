# 把 `D:/Code/LLM`（Python Agent）接进 Illusion Realm —— 评估与落地方案

> 对象：`D:/Code/LLM`（`agent_demo`：MCP + OpenAI 兼容模型 + 手写工具循环，CLI / HTTP 两个入口）
> 目标：把它变成 Illusion Realm 里 `Agent` 页（`/agent`）的真实后端。
> 状态：**方案文档，未落代码**；要落的文件清单见「四、基础框架结构」。

---

## 一、结构评估：方向对，但有三处要动

### 值得保留的（这几条是这份代码最值钱的地方）

1. **一条核心 + 两个入口的切分是对的**：`core.py` 不打印、不返回 HTML，只 `yield` 事件；
   `cli.py` / `server.py` 各自决定怎么呈现。桌面端接入正是第三种消费者，**不用改核心**。
2. **事件是纯 dict、可直接 `json.dumps`**：跨进程 / 跨语言转发零成本。
3. **工具循环的四个易错点全对**：`tools` 作为请求参数（不是消息）、流式 `tool_calls` 按
   `index` 累积分片、带 `tool_calls` 的 assistant 消息原样回填、每条 `role="tool"` 带
   `tool_call_id`。这四处错了会分别表现为「模型不调工具」「参数丢一半」「下次请求 400」。
4. **`AgentSession(llm=...)` 已支持注入 LLM**：不花 token 就能做单测 / 假模型冒烟。
5. `scripts/check_tools.py`（不调模型先验 MCP）+ README 里的 SSE 四条坑（代理缓冲、
   gzip、EventSource 只能 GET、长任务心跳）—— 文档水平高于一般 demo。

### 要改的三处（都是为了「被宿主应用嵌入」）

| # | 现状 | 为什么在桌面端会出问题 | 改法 |
|---|---|---|---|
| 1 | `config.py` 在**导入期**读 `.env` 并暴露模块级常量（`API_KEY` / `MODEL` / `MAX_STEPS`） | ① 嵌入后 `.env` 的 `parents[1]` 会指向**应用安装目录**；② 配置要来自我们的用户数据（每个用户自己的 key）；③ 没法按次覆盖（比如「这次用哪个模型」） | 改成 `load_config(overrides: dict[str, Any] \| None = None) -> AgentConfig`（dataclass），`AgentSession(config=...)` 显式接收 |
| 2 | `core.py` 里硬编码 `TOOLS_SERVER = "agent_demo.tools_server"`，且 `server_params()` 用 `sys.executable` | 打包后我们要指定「用哪个解释器 / 哪个工具 server」（venv、PyInstaller、或未来的别的工具集） | 两者都进 `AgentConfig`（`tools_server_module` / `python_executable`） |
| 3 | `agent_demo` 一个包里塞了三种东西：agent 核心、**演示工具**（天气/空气质量/计算器）、HTTP 入口 | 演示工具进了产品就是噪音；而真正该暴露的是**这个应用自己的能力**（扫模型、读图片内嵌 Meta、组装提示词…） | 拆成 `agent_core/`（可复用库）+ `tools/`（我们的工具）+ `entrypoints/`（cli / server 只作开发调试） |

### 另外五个小问题（不阻塞，但迟早要还）

- **没有 `pyproject.toml`，依赖全是 `>=`**：`mcp` / `langgraph` 大版本变动快，打包前必须钉版本。
- **没有「取消 / 超时」**：`MAX_STEPS` 只限制轮数；桌面端需要「停止生成」→ 要任务取消 + 子进程回收。
- **`allow_origins=["*"]` 且无鉴权**：若以 HTTP 形态跑在 127.0.0.1，本机任何程序都能调它、
  顺带用掉你的 API Key（stdio 形态没这个问题）。
- **`calculate` 用 `eval`**：虽然做了字符白名单，进了产品建议换 AST 白名单求值，
  或直接去掉它、换成本应用的工具。
- **`web/index.html` 是独立前端**：嵌入后由 Electron 渲染层消费事件流，这个页面只剩「协议调试页」的价值。

---

## 二、可行性：可以，推荐「子进程 + 事件流」这条路

| 方案 | 做法 | 优点 | 代价 | 结论 |
|---|---|---|---|---|
| **A. 子进程 sidecar（推荐）** | Python 侧加 stdio 入口，逐行吐 NDJSON；Electron 主进程 `spawn` 它，事件经 IPC 转发给渲染层 | 语言边界干净；保住 MCP 生态（Python 侧最全）；崩溃隔离；核心代码几乎不改 | 要分发 Python 运行时（venv ≈ 110MB 或 PyInstaller 单文件 ≈ 40–60MB） | 先做这个 |
| B. 本地 HTTP 服务 | 直接跑现成 `server.py`，主进程代理 SSE 给渲染层 | 改动最小（服务已就绪） | 开端口 = 攻击面；SSE 过 IPC 要额外设计；key 暴露风险 | 只当开发期调试 |
| C. 移植到 TypeScript | 用 `@modelcontextprotocol/sdk` 重写 `core.py`，放进 `packages/agent` | 单运行时、类型与 `shared` 打通、无需分发 Python | 重写工具循环 + 丢掉 LangGraph 那套对照实现；工作量最大 | 以后若要「零外部依赖」再考虑 |

选 A 的关键理由：**这份代码已经把「怎么接入」的接口设计好了**（事件流），
而 Electron 主进程天然是「拉起子进程 + 转发事件」的角色 —— 我们只是再加一个消费者。

> 先例：本仓库已经在用同一个套路分发 **ffmpeg 二进制**（`apps/electron/bin/ffmpeg` +
> `electron-builder.yml` 的 `extraResources`）。Agent 走一模一样的路子。

---

## 三、落地方案（分阶段，每步都有可验收产物）

### P0 · 把 Python 侧整理成「可嵌入的库」（约 0.5 天）

- 拆包：`agent_core/`（core / config / models）+ `tools/`（把天气那套换成占位工具：
  `list_local_models` / `read_image_meta`）+ `entrypoints/cli.py`（保留）。
- `config.py` → `load_config()`；`core.AgentSession(config)` 接配置。
- 新增 **stdio 入口** `entrypoints/stdio_agent.py`：从 stdin 读一行 JSON（配置 + 问题 + history），
  之后逐行吐事件（NDJSON）。
- 加 `pyproject.toml`（钉版本）+ 一条假 LLM 的单测（`AgentSession(llm=FakeLLM)`，不花 token）。

**验收**：`echo '{"question":"..."}' | python -m agent_core.entrypoints.stdio_agent` 能逐行看到事件。

### P1 · 主进程桥（约 1 天）

- `packages/shared/src/types/agent.ts`：事件与运行参数的**单一事实来源**（渲染层只读类型）。
- `packages/shared/src/ipc-channels.ts` + 主进程同值副本：新增 `agent:run` / `agent:cancel` / `agent:event`。
- `apps/electron/agent/locate.js`（找解释器 / 可执行体）、`agent/runner.js`（spawn + 逐行解析 +
  超时 + 取消 + 进程树回收）、`ipc-handlers/agent.handlers.js`（注册通道、把事件转发到 `event.sender`）。
- `electron-builder.yml`：`extraResources` 带上 agent 产物。

**验收**：主进程起一次 run，渲染层收到 `step` / `answer_delta` / `final` 三类事件。

### P2 · 渲染层接真实事件流（约 1 天）

- `useAgentStore`：把现在写死的「占位助手消息」换成事件驱动
  （`answer_delta` 追加到当前助手消息、`tool_call` / `tool_result` 作为过程步骤、`final` 收尾、`error` 红字）。
- `AgentPage`：把「界面骨架 · 未接入后端」徽标换成真实状态（空闲 / 生成中 / 失败）。
- 加「停止生成」按钮 → `agent:cancel`。

**验收**：`/agent` 页面里问一句，能看到逐字输出 + 工具调用步骤。

### P3 · 把工具换成这个应用自己的能力（真正的价值所在）

替换 `tools_server.py` 里的演示工具，按「只读优先」排序：

| 工具 | 底层实现（本仓库已有） |
|---|---|
| `list_local_models` | `apps/electron/modelScanner.js` |
| `read_image_meta` | `apps/next/src/utils/sdImageInspector/*`（读 PNG 内嵌 Meta） |
| `list_generated_images` | `apps/electron/generatedImages.js` |
| `assemble_prompt` | `apps/next/src/utils/promptTabs.ts`（组装逻辑） |
| 写盘类工具 | **默认不暴露**；只在权限 = 完全访问时挂载 |

**验收**：问「我本地有哪些 Anima 模型？」能真的列出 `diffusion_models/Anima` 下的文件。

#### P3 补充：两种宿主工具形态，按「能力落在哪一侧」选（2026-09-28）

宿主工具的声明与实现在 `apps/electron/agent/host-tools.js`，**加一个工具只改那一处**，
Python 侧一行都不用写 —— `agent_core/core.py` 会按名字把 `hostTools` 里的工具自动路由到
`HostBridge`，同名 MCP 工具反而会与它打架，别两边都声明。

| 形态 | 何时用 | 例子 |
|---|---|---|
| 主进程直接 `run` | 能力已经在主进程（读用户数据、扫目录…） | `list_local_models` |
| `callRenderer()` 转渲染层 | 能力只在渲染层（工作流组装、落盘、PNG Meta…） | `generate_image` |

第二种的往返是**多出来的一跳**，方向和事件流相反：

```
模型 → Python core.py（认出是宿主工具）→ HostBridge 写 stdout host_request
     → 主进程 host-tools.js → sender.send("agent:hostCall")
     → 渲染层 utils/agentHostTools.ts（跑完整条流水线）
     → agent:hostResult 回执 → 主进程写 stdin host_response → 模型
```

三条纪律：

1. **无论成败都要回执**，否则主进程要等到工具自己的超时才收场（回执失败最坏是白等，
   而静默不回会让整次 run 卡住）。
2. **慢工具在声明里带 `timeoutMs`**（生图 10 分钟）：Python 侧按工具取用，
   不被 `HOST_TOOL_TIMEOUT_S = 30` 的全局默认值掐断。
3. **回给模型的只有摘要 / 路径**：几 MB 的 data URL 进工具结果会直接灌爆上下文。

订阅端挂在 `AppShell`（整页常驻）而不是 `/agent` 页：切页后请求没人接，
主进程只能等超时。生成结果与界面点「生成」走同一批函数，因此**会进同一个图库**。

### P4 · 配置与密钥（约 0.5 天）

- 用户数据文档加 `agent` 段（`baseUrl` / `model` / `maxSteps` / `apiKeyCipher`）——
  **这是落盘格式变更**，要按项目规矩带版本标记 + 迁移。
- key 用 Electron `safeStorage` 加密后存主进程侧；**永不进渲染进程、永不进日志**。
- `/settings` 加一块「Agent」设置（复用现有 `PathSettingRow` 那套样式）。

---

## 四、基础框架结构（要落的文件）

```
apps/
├── agent/                                  ← 新增：Python agent（从 D:/Code/LLM 整理而来）
│   ├── pyproject.toml                      ←  钉版本 + 可 PyInstaller 打包
│   ├── agent_core/
│   │   ├── __init__.py
│   │   ├── config.py                       ←  load_config()（不再模块级读 .env）
│   │   ├── core.py                         ←  AgentSession / stream（几乎原样）
│   │   └── entrypoints/
│   │       ├── cli.py                      ←  开发用（原来的 cli.py）
│   │       └── stdio_agent.py              ←  桌面端入口：stdin 读配置，stdout 吐 NDJSON
│   └── tools/
│       └── server.py                       ←  MCP 工具（P3 换成应用自己的能力）
├── electron/
│   ├── agent/
│   │   ├── locate.js                       ←  找解释器 / 打包后的 agent 可执行体
│   │   └── runner.js                       ←  spawn + 逐行解析 + 超时/取消 + 进程树回收
│   └── ipc-handlers/agent.handlers.js      ←  agent:run / agent:cancel → 转发 agent:event
└── next/src/
    ├── stores/useAgentStore.ts             ←  已有：接事件流（P2）
    └── view/agent/*                        ←  已有：把占位换成真实渲染（P2）

packages/shared/src/
├── types/agent.ts                          ← 新增：事件与参数类型（两端共用）
└── ipc-channels.ts                         ← 新增 3 个通道（+ 主进程同值副本）
```

### 关键接口 1：事件与参数（`packages/shared/src/types/agent.ts`）

```ts
/** 一次 run 的入参：配置 + 这一轮的问题 + 多轮上下文 */
export interface AgentRunOptions {
  question: string;
  /** 之前的问答（桌面端由会话 store 维护） */
  history: { role: "user" | "assistant"; content: string }[];
  config: {
    baseUrl: string;
    model: string;
    maxSteps: number;
    /** 只读档不挂写盘类工具 */
    permission: "readonly" | "full";
  };
}

/** Python 侧事件流的一帧（字段名与 core.py 逐个对齐） */
export type AgentEvent =
  | { type: "tools"; tools: { name: string; description: string }[] }
  | { type: "step"; step: number }
  | { type: "reasoning_delta"; step: number; text: string }
  | { type: "answer_delta"; step: number; text: string }
  | { type: "tool_call"; step: number; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; step: number; id: string; name: string; output: string }
  | { type: "final"; text: string; steps: number }
  | { type: "error"; message: string };
```

### 关键接口 2：Python stdio 入口（`entrypoints/stdio_agent.py` 骨架）

```python
"""桌面端入口：stdin 收一行 JSON（配置 + 问题），stdout 逐行吐事件。

为什么用「一行 JSON」而不是 SSE：stdio 本来就是逐行的，NDJSON 解析更简单，
也不会踩代理缓冲那类坑（那是 HTTP 才有的问题）。
注意：**配置走 stdin，不走命令行参数** —— 命令行会进进程列表与日志。
"""
import asyncio, json, sys

async def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    payload = json.loads(sys.stdin.readline() or "{}")
    config = load_config(payload.get("config"))
    async with AgentSession(config=config) as agent:
        async for event in agent.stream(payload["question"], payload.get("history")):
            print(json.dumps(event, ensure_ascii=False), flush=True)   # 每帧一行

asyncio.run(main())
```

### 关键接口 3：主进程 runner（`apps/electron/agent/runner.js` 骨架）

```js
/**
 * 拉起 Python agent 并把事件逐行转给渲染层。
 * 三条硬要求：① 密钥只经 stdin 传（不进命令行）；② 有超时与取消（kill 进程树）；
 * ③ 解析失败只记录并跳过该行，不让半行 JSON 打断整次运行。
 */
function runAgent({ win, options, onDone }) {
  const child = spawn(locateAgentExecutable(), [], { cwd: agentCwd(), windowsHide: true });
  child.stdin.end(`${JSON.stringify(options)}\n`);
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        win.webContents.send(IPC_CHANNELS.AGENT_EVENT, JSON.parse(line));
      } catch { /* 半行 / 坏行：跳过，不打断 */ }
    }
  });
  return () => killProcessTree(child);   // ← agent:cancel 用
}
```

### 关键接口 4：新增 IPC 通道

| 通道 | 方向 | 形状 |
|---|---|---|
| `agent:run` | invoke | 入 `AgentRunOptions` → 出 `IpcResult<{ runId: string }>`（启动成功即返回，结果走事件流） |
| `agent:cancel` | invoke | 入 `{ runId }` → 出 `IpcResult<null>`（kill 进程树） |
| `agent:event` | main → renderer | 单向推送 `AgentEvent & { runId }`（与 `video:progress` 同款做法） |

### 关键验收：不花 token 的冒烟

```powershell
# Python 侧：假 LLM（AgentSession(llm=...) 已支持注入）
python -m agent_core.entrypoints.stdio_agent --fake-llm < examples/fake-run.json

# 桌面侧：环境变量注入假 LLM，断言事件顺序与「取消」生效
$env:SMOKE_AGENT_FAKE_LLM="1"; npx electron scripts/smoke-agent.js
```

断言建议（4 条，与仓库既有冒烟风格一致）：

1. 事件顺序 `tools → step → (tool_call → tool_result)* → final`；
2. `answer_delta` 拼起来等于 `final.text`；
3. `agent:cancel` 后 3 秒内不再有新事件、进程已回收；
4. 取消后渲染层状态回到「空闲」（不是卡在「生成中」）。

---

## 五、安全清单（接之前必须过一遍）

- [ ] **先吊销并重签 SiliconFlow 的 key**（README 自己写了「此前多次明文出现在代码与对话中」）；
- [x] key 只存主进程侧（`safeStorage` 加密），**永不进渲染进程、永不进日志、永不进命令行参数**
      —— 2026-09-27 落地：`apps/electron/agent/secret.js` + 设置页「Agent」区块，
      渲染层只能拿状态摘要（有没有 / 来源 / 落盘方式 / 尾 4 位）；见决策 6。
- [ ] 事件流经 IPC 不夹带隐私字段；主进程对 `sender` 做校验（沿用现有 handler 约定）；
- [ ] 权限档位落地：`readonly` 不挂写盘类工具（现在只是 UI 状态）；
- [ ] 去掉 `calculate` 的 `eval`，或直接换成本应用的工具；
- [ ] 若保留 HTTP 形态：绑 `127.0.0.1` + 随机 token + 关掉 CORS 通配。

---

## 六、已定的决策（2026-09-27）

1. **✅ 走 A（子进程 sidecar）** —— P0 + P1 已落地并验证（`scripts/verify-agent-events.js` 6/6）。
2. **✅ Python 用 venv 分发 —— 已随包（2026-09-27 落地并验证）**：
   `electron-builder.yml` 的 `extraResources` 已启用 `from: ../agent, to: agent`，
   filter 剔掉运行期用不到的约 24MB（pip、pywin32 的文档与 COM 家族、`win32/{Demos,include,libs,scripts,test}`），
   **实测 `resources/agent` = 51.3 MB / 4976 文件**（裁前 75.8 MB / 6774）。
   三条踩过的坑：
   - **`to: agent` 不能改名**：`agent/locate.js` 把 AGENT_DIR 算成 `<resources>/agent`，
     改名 / 漏收不会报错，而是**静默回退到系统 PATH 的 python**（那台机器多半没装 mcp）；
   - **pywin32 不能删**：`mcp/os/win32/utilities.py` 在 Windows 上直接 import
     `pywintypes` / `win32api` / `win32con` / `win32job`，删掉就是打包版一跑即
     `ModuleNotFoundError: pywintypes`（实测踩过）；
   - **venv 不可搬迁**：`pyvenv.cfg` 的 `home=` 指向基础 Python（本机 `E:\Tool\modules\python\python_3.13`），
     目标机要么有同版本 Python 3.13，要么改走 PyInstaller / embeddable。
   验证：`pnpm run pack` 后跑 `pnpm check:packaged-agent`（假模型，不花 token，
   断言运行时落在 `resources/agent` 之内 + 事件流走完 tools→step→tool_call→tool_result→final）。
   注：打包版的 `.env` 读的是 **exe 同目录**（`getAppRootDir()` = 安装目录），
   所以装完要在 `<安装目录>\.env` 里放 key，不然只会看到「缺少 API Key」。
3. **✅ 配置文件放**「**工作区根一份 `.env`**，多模块共用」：主进程启动最早期读它
   （`apps/electron/agent/env.js`，只报键名不报值），Python 侧兜底也指向同一份；
   模板是仓库根的 `.env.example`。密钥目前只来自这里（环境变量可覆盖）；
   要进用户数据文档是 P4 的事（**格式变更**，需版本 + 迁移）。
4. **✅ 默认值单一事实来源**：`packages/shared/src/data/agent.ts`，主进程保留同值副本
   （`apps/electron/agent/defaults.js`），由 `scripts/verify-electron-modules.js` 断言一致。
5. **✅ 宿主工具桥已落地**（2026-09-27）：应用侧能力不再往 Python 里搬，而是由主进程
   声明 + 实现（`apps/electron/agent/host-tools.js`），sidecar 通过 `host_request` /
   `host_response` 一对帧调用它。加一个新工具 = 在注册表里加一条，**Python 一行都不用改**。
   - 第一个工具 **`list_local_models`** 已完成：用**应用同一个扫描器** + 设置里的模型路径，
     支持 `kind`（all/search/checkpoint/lora/diffusion）与 `query` 过滤，结果带体积、超长截断。
   - 待补的两个：`read_image_meta`（图片内嵌 Meta）、`list_generated_images`（图库列表）。
   - 自检：`scripts/verify-agent-events.js` 的后三段就是这条链路（现造目录 + 现造用户数据，
     断言"模型调用 → 主进程扫描 → 结果回到最终回答"）。

### venv 与 PyInstaller 的差别（实测 + 取舍）

| | 随包带 venv | PyInstaller 单文件 |
|---|---|---|
| 体积 | **实测 51.3 MB**（裁掉 pip / pywin32 文档与 COM 家族后；裁前 75.8 MB） | 约 40–60 MB（需实测；构建时才展开） |
| 启动 | 快，解释器直接跑源码 | 首启稍慢（自解压/校验） |
| 构建步骤 | 无（`pip install -e .` 就完） | 每次改代码要重新打包（几分钟） |
| 调试 | 直接改 `apps/agent/*.py` 生效 | 要重新构建 |
| 依赖形态 | 依赖目录里的 `.pyd`/`.dll` 必须随包齐全；**绑基础解释器路径**（`pyvenv.cfg` 的 `home=`），换机器/换 Python 版本要重建 | 自带解释器，不依赖目标机 Python |
| 抗杀软 | 好 | 单文件自解压常被误报 |
| 适合 | 开发期 + 内部分发 | 对外分发、目标机没有 Python |

---

## 七、密钥：填在设置里，不靠 `.env`（2026-09-27）

`.env` 与 `ILLUSION_AGENT_API_KEY` 环境变量**只用于开发测试**；面向用户的唯一入口是
设置页的「Agent」区块（`/settings#agent`）。

1. **存储位置**：`<默认用户数据目录>/agent-secret.json`，`safeStorage` 加密
   （拿不到加密能力时降级为 base64 并把 `protection: "plain"` 写进文件、界面据此提示）。
   **不放** `user/illusion-realm.json`：那份文档由渲染进程读写，密钥进去就等于进了渲染进程内存。
2. **渲染层能拿到的只有状态摘要**：`{ configured, source, protection, tail }`
   （`agent:secretStatus` / `agent:secretSet` / `agent:secretClear` 三条通道，见 `packages/shared/types/agent.ts`）。
   原值永不回传 —— 于是它不可能出现在界面、日志或崩溃报告里。
3. **生效顺序**：环境变量 / `.env` → 设置页存的那把。前者优先是刻意的（临时覆盖、CI、换 key 试）。
4. **没配就直接拦住**：Agent 页按发送时先在渲染层判断（`useAgentStore.sendDraft`），
   不拉起 sidecar，并在输入区上方给出「去设置里填写」的可点提示（`AgentKeyNotice`，链接指向 `/settings#agent`）。
   理由：让 Python 侧抛「缺少 API Key」会把交互问题伪装成"Agent 坏了"。
5. **自检**：
   - `pnpm verify` 里的 `auditAgentSecret`（源文件级：加密落盘 / 明文必须带标记 / 环境变量优先 / 清除真的删文件）；
   - `npx electron scripts/smoke-ipc-result.js`（跨进程那一趟：preload → IPC → 落盘 → 清除）；
   - `npx electron scripts/smoke-agent-key.js`（用户可见行为：拦截 → 提示 → 点链接 → 设置页填写 → 状态翻转）。
   两条冒烟都用 `ILLUSION_AGENT_SECRET_DIR` 把密钥重定向到临时目录，**不碰真实用户数据**。

---

## 八、延伸阅读

- **`docs/agent-message-flow.md`**：一条消息从按下回车到最后一帧，**经过谁、以什么形状传递**。
  含完整时序图（含取消路径）、每一帧的字段表、工具循环流程图、失败时每一层各自的表现、
  以及一张「改这块代码前先看的不变量」清单。想知道某个字段是谁发的、某个错误是哪一层报的，
  看那份。
- `docs/testing-gates.md`：这些断言各自属于哪道门禁。
