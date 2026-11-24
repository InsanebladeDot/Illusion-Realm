/**
 * 验证 Windows 安装版的 Agent 在清空 Python 外部配置后仍能完整调用工具。
 * 从客户端 app.asar 加载真实主进程代码，使用假模型，避免依赖网络或 API 密钥。
 * 先运行 pnpm pack，再运行 pnpm check:packaged-agent。
 */
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "apps", "electron", "release", "win-unpacked");
const RESOURCES = path.join(APP_DIR, "resources");
const AGENT_DIR = path.join(RESOURCES, "agent");
const ASAR = path.join(RESOURCES, "app.asar");

if (!fs.existsSync(ASAR) || !fs.existsSync(AGENT_DIR)) {
  console.error(
    `[打包版 Agent 冒烟] 前置条件不满足：找不到 ${ASAR} 或 ${AGENT_DIR}。\n` +
      "先在仓库根跑 `pnpm run pack`（只出 win-unpacked，不出安装包）。"
  );
  process.exit(2);
}

// 排除本机安装的 Python。再用无效的 Python 配置检验包内解释器是否真的隔离。
delete process.env.ILLUSION_AGENT_PYTHON;
process.env.PATH = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
process.env.PYTHONHOME = path.join(AGENT_DIR, "missing-python-home");
process.env.PYTHONPATH = path.join(AGENT_DIR, "missing-python-path");

const locate = require(path.join(ASAR, "src/main/modules/agent/locate.js"));
const runner = require(path.join(ASAR, "src/main/modules/agent/runner.js"));

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---- 1. 静态：这棵树该在的东西在不在（filter 写错时先红在这里）----
for (const relative of [
  "python/python.exe",
  "python/LICENSE.txt",
  "agent_core/entrypoints/stdio_agent.py",
  // 工具那三层：入口 / 唯一的 mcp 实例 / 自动发现，以及至少一个具体工具模块
  "tools/server.py",
  "tools/mcp_instance.py",
  "tools/registry.py",
  "tools/math/math_tools.py",
  // mcp 在 Windows 上 import 这四个，缺一个就是打包版一跑就 ModuleNotFoundError
  "python/Lib/site-packages/pywin32.pth",
  "python/Lib/site-packages/pywin32_system32/pywintypes313.dll",
  "python/Lib/site-packages/win32/win32job.pyd",
  "python/Lib/site-packages/mcp/os/win32/utilities.py",
]) {
  check(`resources/agent 里有 ${relative}`, fs.existsSync(path.join(AGENT_DIR, relative)));
}

// ---- 2. 解析出来的运行时必须来自随包分发的这棵树 ----
const runtime = locate.resolveAgentRuntime();
check("解析到了运行时", Boolean(runtime), runtime ? `${runtime.kind} / ${runtime.source}` : "null");
if (runtime) {
  const expectedPython = path.join(AGENT_DIR, "python", "python.exe");
  check(
    "默认解释器来自当前客户端的 resources/agent/python",
    runtime.command === expectedPython && runtime.source === "bundled:windows",
    runtime.command
  );
  check("运行时文件真实存在", fs.existsSync(runtime.command), runtime.command);
  check("cwd 指向随包的 agent 目录", path.resolve(runtime.cwd) === path.resolve(AGENT_DIR), runtime.cwd);
}

// ---- 3. 真跑一次（假模型）：事件流要完整 ----
const events = [];
const sender = { send: (_channel, payload) => events.push(payload) };
const seen = () => new Set(events.map((event) => event.type));
const finished = () => events.some((event) => event.type === "final" || event.type === "error");

const started = runner.startAgentRun({
  sender,
  options: { question: "算一下 (26+18)*3-7", config: { fakeLlm: true } },
});

if (!started.ok) {
  check("启动一次运行", false, started.error);
  report();
} else {
  const deadline = Date.now() + 60_000;
  const timer = setInterval(() => {
    if (!finished() && Date.now() < deadline) return;
    clearInterval(timer);
    if (!finished()) {
      runner.cancelAgentRun(started.runId);
      check("假模型运行在 60 秒内结束", false, `已收到 ${[...seen()].join(", ") || "无事件"}`);
    } else {
      const types = seen();
      for (const type of ["tools", "step", "tool_call", "tool_result", "answer_delta", "final"]) {
        check(`事件流包含 ${type}`, types.has(type), `实收：${[...types].join(", ")}`);
      }
      const final = events.find((event) => event.type === "final");
      check(
        "final 里带着工具的真实返回值（工具循环真的闭合了）",
        Boolean(final) && String(final.text).includes("125"),
        final ? String(final.text).slice(0, 80) : "没有 final"
      );
    }
    report();
  }, 200);
}

/** 汇总并决定退出码 */
function report() {
  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? "ALL PASS ✓" : `${failed} FAILED ✗`);
  process.exit(failed === 0 ? 0 : 1);
}
