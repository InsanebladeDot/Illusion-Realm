/**
 * 打包版 Agent 冒烟：验证 **asar 里的 locate/runner + `resources/agent` 那棵树**能真正跑通一次。
 *
 * 为什么需要它：今天已经连踩两次「打包后才炸」——
 *   ① `files:` 白名单漏收 `agent/` → 双击 exe 弹 `Cannot find module './agent/env'`；
 *   ② `extraResources` 的 filter 把 pywin32 剔了 → `mcp/os/win32/utilities.py` 直接
 *      `ModuleNotFoundError: pywintypes`。两次在 dev 下都是全绿。
 * 这两类的共同点是「**dev 全对、打包才错**」，所以只能在打包产物上断言，而且要用
 * 假模型跑（`fakeLlm: true`，不花 token）。
 *
 * 断言的是**这两条不变量**（而不是"跑完就完事"）：
 *   1. 解析出来的运行时必须落在 `<安装目录>/resources/agent/**` 之内 ——
 *      否则就是静默降级到系统 PATH 的 python（那台机器多半没装 mcp），
 *      表现是打包版"能跑"但工具一个都调不动；
 *   2. 一次假模型运行必须走完 tools → step → tool_call → tool_result → final。
 *
 * 运行：`npx electron scripts/verify-packaged-agent.js`（**需要先 `pnpm run pack`**）
 * 退出码：0 通过 / 1 断言失败 / 2 前置条件不满足（没打包目录）—— 与仓库既有约定一致。
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

// 手动指定的解释器会盖过打包产物，这里必须清掉，否则测的是别的东西
delete process.env.ILLUSION_AGENT_PYTHON;

const locate = require(path.join(ASAR, "agent", "locate.js"));
const runner = require(path.join(ASAR, "agent", "runner.js"));

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// ---- 1. 静态：这棵树该在的东西在不在（filter 写错时先红在这里）----
for (const relative of [
  ".venv/Scripts/python.exe",
  "agent_core/entrypoints/stdio_agent.py",
  // 工具那三层：入口 / 唯一的 mcp 实例 / 自动发现，以及至少一个具体工具模块
  "tools/server.py",
  "tools/mcp_instance.py",
  "tools/registry.py",
  "tools/math/math_tools.py",
  // mcp 在 Windows 上 import 这四个，缺一个就是打包版一跑就 ModuleNotFoundError
  ".venv/Lib/site-packages/pywin32.pth",
  ".venv/Lib/site-packages/pywin32_system32/pywintypes313.dll",
  ".venv/Lib/site-packages/win32/win32job.pyd",
  ".venv/Lib/site-packages/mcp/os/win32/utilities.py",
]) {
  check(`resources/agent 里有 ${relative}`, fs.existsSync(path.join(AGENT_DIR, relative)));
}

// ---- 2. 解析出来的运行时必须来自随包分发的这棵树 ----
const runtime = locate.resolveAgentRuntime();
check("解析到了运行时", Boolean(runtime), runtime ? `${runtime.kind} / ${runtime.source}` : "null");
if (runtime) {
  const expectedPrefix = path.join(RESOURCES, "agent") + path.sep;
  const insidePack = path.resolve(runtime.command).startsWith(expectedPrefix);
  check(
    "运行时落在 resources/agent 之内（没有静默降级到系统 Python）",
    insidePack,
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
