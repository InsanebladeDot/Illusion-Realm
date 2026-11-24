/**
 * 定位 Agent 的解释器并组装启动命令。安装版默认使用随包 Python，开发态继续支持 .venv。
 * 手动指定的解释器或自带入口的可执行体优先。
 */
const fs = require("fs");
const path = require("path");

/**
 * Python sidecar 不属于主进程源码树，不可跟随当前模块层级推导打包路径。
 * asar 中只存宿主 JS；Agent 源码和独立 Python 由 extraResources 放到 resources/agent。
 * Node 契约测试没有 Electron app 对象，因此以模块实际所在的 asar 路径区分两态。
 * 开发态仍指向工作区 apps/agent，不能因分类迁移而改动用户的运行时选择。
 * 测试也会用开发版 Electron 加载另一份 app.asar，此时 resourcesPath 属于测试宿主。
 * 从实际 asar 的父目录定位 resources，才能测到待验证包而非宿主安装目录。
 * Windows 与 POSIX 都按平台分隔符切段，避免把名称含 asar 的普通目录误判成归档。
 */
const asarIndex = __dirname.split(path.sep).findIndex(part => part.endsWith(".asar"));
const AGENT_DIR = asarIndex >= 0
  ? path.join(__dirname.split(path.sep).slice(0, asarIndex).join(path.sep) || path.sep, "agent")
  : path.join(__dirname, "../../../../../agent");
const BUNDLED_PYTHON = path.join(AGENT_DIR, "python", "python.exe");
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

  // 安装版只查当前归档旁的 Python。缺失时向用户报错，避免借用环境里碰巧存在的解释器。
  if (asarIndex >= 0 && process.platform === "win32") {
    return fs.existsSync(BUNDLED_PYTHON)
      ? toRuntime(BUNDLED_PYTHON, "python", "bundled:windows")
      : null;
  }

  // 保留开发态自行构建的 Agent 可执行体。
  const executable = firstExisting(packagedExecutables());
  if (executable) {
    return toRuntime(executable.path, "executable", executable.source);
  }

  // 开发态虚拟环境
  const interpreter = firstExisting(venvInterpreters());
  if (interpreter) {
    return toRuntime(interpreter.path, "python", interpreter.source);
  }

  /**
   * 系统 PATH 兜底：这里只**返回命令名**（不自己解析 PATH），
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
  if (asarIndex >= 0 && process.platform === "win32") {
    return `安装版 Agent 解释器缺失：${BUNDLED_PYTHON}
请重新安装完整客户端，或手动指定 Agent 解释器。`;
  }
  const lines = [
    "Agent 运行时解析顺序：",
    "  1) 手动指定（设置页 / options.manualPath）",
    "  2) 环境变量 ILLUSION_AGENT_PYTHON",
    `  3) Agent 可执行体 ${path.join(AGENT_DIR, "dist")}`,
    `  4) 开发态虚拟环境 ${path.join(AGENT_DIR, ".venv")}`,
    "  5) 系统 PATH 里的 python / python3",
    `项目目录：${AGENT_DIR}`,
  ];
  return lines.join("\n");
}

module.exports = { AGENT_DIR, ENTRY_MODULE, resolveAgentRuntime, describeAgentRuntime };
