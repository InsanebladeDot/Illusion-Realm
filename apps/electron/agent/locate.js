/**
 * 解析「用哪个运行时跑 Agent」—— 与 `ffmpeg/locate.js` 同一个套路：
 * 先找随包分发的可执行体，再退到开发态虚拟环境，最后才用系统 Python。
 *
 * 顺序（先专后通用）：
 *   1. 调用方显式给的路径（设置页里用户手动指定的解释器 / exe）
 *   2. 环境变量 `ILLUSION_AGENT_PYTHON`
 *   3. 开发态：`apps/agent/.venv/{Scripts/python.exe | bin/python}`
 *   4. 打包态：`resources/agent/iris-agent(.exe)`（PyInstaller 单文件）
 *   5. 系统 PATH 里的 `python` / `python3`（兜底；可能没装 mcp，见返回值 kind）
 *
 * @returns {{ kind: "executable" | "python", command: string, args: string[], cwd: string, source: string } | null}
 *   `kind === "executable"` 表示可执行体自带入口（args 为空）；
 *   `kind === "python"` 需要补 `-m agent_core.entrypoints.stdio_agent`。
 */
const fs = require("fs");
const path = require("path");

/** apps/electron/agent → apps/agent */
const AGENT_DIR = path.join(__dirname, "..", "..", "agent");
const ENTRY_MODULE = "agent_core.entrypoints.stdio_agent";
const EXECUTABLE_NAMES = ["iris-agent.exe", "iris-agent"];

/**
 * 按候选顺序找第一个存在的文件/命令
 * @param {Array<{ path: string, source: string }>} candidates
 * @returns {{ path: string, source: string } | null}
 */
function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate.path && fs.existsSync(candidate.path)) return candidate;
  }
  return null;
}

/**
 * 判断一个路径是「Python 解释器」还是「自带入口的可执行体」。
 *
 * 这一步不能省：两者都可能是 .exe，但执行方式完全不同 ——
 * 解释器要补 `-m agent_core.entrypoints.stdio_agent`，可执行体一个参数都不要。
 * 猜错的症状很隐蔽：python.exe 拿到 `args=[]` 会把 stdin 里的 JSON **当脚本执行**
 * （报 `NameError: name 'true' is not defined`），看起来像协议问题其实是启动方式问题。
 *
 * @param {string} candidatePath
 * @returns {"python" | "executable"}
 */
function classifyRuntime(candidatePath) {
  const base = path.basename(candidatePath).toLowerCase();
  const looksLikePython =
    base.startsWith("python") || base === "py" || base === "py.exe" || base === "pyw.exe";
  return looksLikePython ? "python" : "executable";
}

/**
 * 把「命令 + 类型」组装成最终返回形状
 * @param {string} command
 * @param {"python" | "executable"} kind
 * @param {string} source
 */
function toRuntime(command, kind, source) {
  return {
    kind,
    command,
    args: kind === "python" ? ["-m", ENTRY_MODULE] : [],
    cwd: AGENT_DIR,
    source,
  };
}

/**
 * 打包态可执行体的位置（extraResources 的目标目录）
 * @returns {Array<{ path: string, source: string }>}
 */
function packagedExecutables() {
  const roots = [];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, "agent"));
  roots.push(path.join(AGENT_DIR, "dist"));
  const candidates = [];
  for (const root of roots) {
    for (const name of EXECUTABLE_NAMES) {
      candidates.push({ path: path.join(root, name), source: `packaged:${name}` });
    }
  }
  return candidates;
}

/**
 * 开发态虚拟环境里的解释器
 * @returns {Array<{ path: string, source: string }>}
 */
function venvInterpreters() {
  return [
    { path: path.join(AGENT_DIR, ".venv", "Scripts", "python.exe"), source: "venv:windows" },
    { path: path.join(AGENT_DIR, ".venv", "bin", "python"), source: "venv:posix" },
  ];
}

/**
 * 解析运行时
 * @param {{ manualPath?: string | null }} [options] 用户手动指定的路径优先
 * @returns {{ kind: "executable" | "python", command: string, args: string[], cwd: string, source: string } | null}
 */
function resolveAgentRuntime(options = {}) {
  const manualPath = (options.manualPath || process.env.ILLUSION_AGENT_PYTHON || "").trim();

  // 1) 显式指定：按文件名判断是解释器还是可执行体
  if (manualPath && fs.existsSync(manualPath)) {
    return toRuntime(manualPath, classifyRuntime(manualPath), "manual");
  }

  // 2) 随包分发的可执行体
  const executable = firstExisting(packagedExecutables());
  if (executable) {
    return toRuntime(executable.path, "executable", executable.source);
  }

  // 3) 开发态虚拟环境
  const interpreter = firstExisting(venvInterpreters());
  if (interpreter) {
    return toRuntime(interpreter.path, "python", interpreter.source);
  }

  /**
   * 4) 系统 PATH 兜底：这里只**返回命令名**（不自己解析 PATH），
   * 真正的可用性由 spawn 的 error 事件判定 —— 猜错路径会让报错更难懂。
   */
  const systemPython = process.platform === "win32" ? "python" : "python3";
  return toRuntime(systemPython, "python", "system-path");
}

/**
 * 给「找不到运行时」这类错误用的说明文案（列出所有找过的位置）
 * @returns {string}
 */
function describeAgentRuntime() {
  const lines = [
    "Agent 运行时解析顺序：",
    "  1) 手动指定（设置页 / options.manualPath）",
    "  2) 环境变量 ILLUSION_AGENT_PYTHON",
    `  3) 开发态虚拟环境 ${path.join(AGENT_DIR, ".venv")}`,
    `  4) 打包产物 ${path.join(process.resourcesPath || "<resources>", "agent", "iris-agent.exe")}`,
    "  5) 系统 PATH 里的 python / python3",
    `项目目录：${AGENT_DIR}`,
  ];
  return lines.join("\n");
}

module.exports = { AGENT_DIR, ENTRY_MODULE, resolveAgentRuntime, describeAgentRuntime };
