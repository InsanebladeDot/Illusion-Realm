/**
 * 读**应用根目录**那一份 `.env`（不引第三方依赖，二十行足够）。
 *
 * 为什么共用一份而不是每个模块一个：Agent 的 key / baseUrl / 模型名不止一个模块要用
 * （主进程要拿去起 sidecar，开发期的 Python CLI 也要读同一份，将来别的模块还会加键）——
 * 各带一个 `.env` 迟早出现「改了 A 忘了 B」。
 * 位置：dev = 工作区根（`pnpm-workspace.yaml` 那一层），打包 = exe 同目录。
 *
 * 三条约定：
 * 1. **不覆盖**已存在的环境变量（真·环境变量优先级最高：临时覆盖 / CI 都靠它）；
 * 2. 解析失败只 warn，不让应用起不来；
 * 3. 这个文件必须在**其它模块 require 之前**加载 —— 有模块在 require 期就读环境变量
 *    （例如 `agent/runner.js` 的 `ILLUSION_AGENT_TIMEOUT_MS`），晚一步它就永远拿不到。
 */
const fs = require("fs");
const path = require("path");

const { AGENT_DEFAULTS } = require("./defaults");

/**
 * 解析 `.env` 文本：忽略空行与 `#` 注释，支持可选的 `export ` 前缀与成对引号。
 * 刻意**不做变量展开**（`$HOME` 之类）—— 那是另一个语义，误用比不支持更危险。
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * 把工作区根 `.env` 载入 `process.env`（已存在的键不动）
 * @param {{ root?: string, quiet?: boolean }} [options]
 * @returns {{ loaded: boolean, path: string, keys: string[] }}
 */
function loadWorkspaceEnv(options = {}) {
  // 懒加载：appPaths 依赖 electron 的 `app`，放在模块顶层会让本文件在纯 Node 里
  // （例如自检脚本）无法 require —— 而 parseEnvFile 本身是纯函数，值得能单独测。
  const { getAppRootDir } = require("../appPaths");
  const root = options.root || getAppRootDir();
  const filePath = path.join(root, ".env");
  const result = { loaded: false, path: filePath, keys: /** @type {string[]} */ ([]) };

  let text;
  try {
    if (!fs.existsSync(filePath)) return result;
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (!options.quiet) {
      console.warn(`[env] 读取 ${filePath} 失败：`, error instanceof Error ? error.message : error);
    }
    return result;
  }

  let values;
  try {
    values = parseEnvFile(text);
  } catch (error) {
    if (!options.quiet) {
      console.warn(`[env] 解析 ${filePath} 失败：`, error instanceof Error ? error.message : error);
    }
    return result;
  }

  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      result.keys.push(key);
    }
  }
  result.loaded = result.keys.length > 0;
  if (!options.quiet && result.keys.length > 0) {
    // 只报键名，**不报值**（里面可能有密钥）
    console.log(`[env] 已从 ${filePath} 载入：${result.keys.join(", ")}`);
  }
  return result;
}

module.exports = { parseEnvFile, loadWorkspaceEnv, AGENT_DEFAULTS };
