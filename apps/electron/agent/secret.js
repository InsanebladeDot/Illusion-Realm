/**
 * Agent 密钥的**主进程侧**存储 —— 渲染进程永远读不回原值。
 *
 * 为什么不放进用户数据文档（`user/illusion-realm.json`）：
 * 那份文档由渲染进程读写，密钥一进去就会**进渲染进程内存**，并明文躺在一个
 * 用户会随手备份 / 分享的 JSON 里。`docs/agent-integration.md` 的安全清单把
 * 「key 只存主进程侧（safeStorage 加密），永不进渲染进程、永不进日志」列为上线前必过项。
 * 所以密钥单独一个文件，渲染层只能**问状态**、**要求写入**、**要求清除**。
 *
 * 文件：`<默认用户数据目录>/agent-secret.json`
 *   `{ "version": 1, "protection": "safeStorage" | "plain", "value": "<base64>" }`
 * `protection` 是**刻意写进文件**的：拿不到系统加密能力时（例如 Linux 没有 keyring）
 * 会降级成明文 base64，这件事必须留在文件里可查，而不是静默发生 —— 界面据此提示用户。
 *
 * 生效顺序（与 `env.js` 的「真·环境变量优先」一致）：
 *   ① 环境变量 / `.env` 的 `ILLUSION_AGENT_API_KEY`（**只用于开发测试**）
 *   ② 本文件（用户在「设置 → Agent」里填的）
 * 环境变量优先是刻意的：临时覆盖、CI、以及"这次用另一个 key 试一下"都靠它。
 *
 * 目录一律可注入（`dir` 参数）：默认目录在用户数据旁边，但自检脚本要能在临时目录里
 * 把「写入 → 读回 → 清除」跑一遍，不许碰真实用户数据。
 */
const fs = require("fs");
const path = require("path");

const { getDefaultUserDataPath } = require("../userDataPaths");

const SECRET_FILE_NAME = "agent-secret.json";
const SECRET_VERSION = 1;
/** 与 `packages/shared/src/data/agent.ts` 的 AGENT_ENV_KEYS 同名（主进程同值副本） */
const ENV_KEY_NAME = "ILLUSION_AGENT_API_KEY";
/** 只回尾 4 位用于确认"填的是哪一把"，不回原值 */
const TAIL_LENGTH = 4;

/**
 * 默认目录：与默认用户数据文件同一层
 * （用户把数据文件搬走时密钥不跟着走，刻意如此 —— 密钥位置稳定比"跟着搬家"更重要）。
 *
 * `ILLUSION_AGENT_SECRET_DIR` 是**自检专用**的重定向开关，与 `ILLUSION_AGENT_PYTHON`
 * 同一性质：冒烟脚本靠它把密钥写进临时目录，于是「本机到底配没配 key」不再影响断言，
 * 也不会在跑测试时冲掉用户正在用的那一把。正式运行时不设这个变量。
 * @returns {string}
 */
function defaultSecretDir() {
  const override = (process.env.ILLUSION_AGENT_SECRET_DIR || "").trim();
  if (override) return override;
  return path.dirname(getDefaultUserDataPath());
}

/**
 * 密钥文件路径
 * @param {string} [dir] 目标目录（自检脚本传临时目录）
 * @returns {string}
 */
function secretFilePath(dir) {
  return path.join(dir || defaultSecretDir(), SECRET_FILE_NAME);
}

/**
 * 取 Electron 的 safeStorage（拿不到就返回 null）。
 * 懒加载 + try/catch：本模块在纯 Node 下也应该能被 require（类型/单测友好）。
 * @returns {import("electron").SafeStorage | null}
 */
function safeStorageApi() {
  try {
    const { safeStorage } = require("electron");
    return safeStorage ?? null;
  } catch {
    return null;
  }
}

/** 系统是否真的能加密（Windows=DPAPI，通常可用） */
function encryptionAvailable() {
  const api = safeStorageApi();
  if (!api) return false;
  try {
    return api.isEncryptionAvailable() === true;
  } catch {
    return false;
  }
}

/**
 * 「现在还不能加密」到底是**环境如此**还是**调用太早**。
 *
 * 实测：`safeStorage.isEncryptionAvailable()` 在 `app.whenReady()` **之前恒为 false**，
 * ready 之后才是 true（Windows/DPAPI）。两者都表现为"不能加密"，但性质完全不同 ——
 * 前者是 Linux 没 keyring 这类合法情况，后者是**代码写错了**（在启动最早期就落盘）。
 * 不分开说，就会出现「用户以为加密了、其实是明文」这种没人查得出来的状态。
 * @returns {boolean} true = 应用还没到 ready，不该在这个时机写密钥
 */
function calledBeforeAppReady() {
  try {
    const { app } = require("electron");
    return typeof app?.isReady === "function" && app.isReady() === false;
  } catch {
    return false;
  }
}

/**
 * 尾 4 位（太短就不给，避免"尾号"本身就是整个密钥）
 * @param {unknown} key
 * @returns {string}
 */
function tailOf(key) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed.length > TAIL_LENGTH ? trimmed.slice(-TAIL_LENGTH) : "";
}

/**
 * 读取已存密钥
 * @param {string} [dir]
 * @returns {{ key: string, protection: "safeStorage" | "plain" } | null} 没有 / 解不开都返回 null
 */
function readSecret(dir) {
  const filePath = secretFilePath(dir);
  if (!fs.existsSync(filePath)) return null;

  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn("[agent] 密钥文件解析失败：", error instanceof Error ? error.message : error);
    return null;
  }
  if (!document || typeof document.value !== "string" || !document.value) return null;

  const protection = document.protection === "plain" ? "plain" : "safeStorage";
  let buffer;
  try {
    buffer = Buffer.from(document.value, "base64");
  } catch {
    return null;
  }

  if (protection === "plain") {
    return { key: buffer.toString("utf8"), protection };
  }

  const api = safeStorageApi();
  if (!api) return null;
  try {
    return { key: api.decryptString(buffer), protection };
  } catch (error) {
    /**
     * 换机器 / 换 Windows 用户会解不开（DPAPI 是按用户加密的）—— 这不是异常情况，
     * 而是**预期内的**：提示重新填一次即可，不要让它看起来像崩溃。
     */
    console.warn(
      "[agent] 密钥解密失败（通常是换了机器或系统用户，重新填一次即可）：",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * 写入密钥（自动选 safeStorage 或明文兜底）
 * @param {string} key
 * @param {string} [dir]
 * @returns {{ configured: boolean, source: string, protection: string, tail: string }}
 */
function writeSecret(key, dir) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed) throw new Error("API Key 不能为空");

  const usable = encryptionAvailable();
  if (!usable && calledBeforeAppReady()) {
    console.warn(
      "[agent] 写入密钥时应用尚未 ready —— safeStorage 此时恒不可用，" +
        "已退化为明文保存。密钥应在窗口创建之后（IPC handler 内）才写入。"
    );
  }
  const api = safeStorageApi();
  const value = usable && api
    ? api.encryptString(trimmed).toString("base64")
    : Buffer.from(trimmed, "utf8").toString("base64");
  const filePath = secretFilePath(dir);
  const document = {
    version: SECRET_VERSION,
    protection: usable ? "safeStorage" : "plain",
    value,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return describeSecret(dir);
}

/**
 * 清除密钥
 * @param {string} [dir]
 * @returns {{ configured: boolean, source: string, protection: string, tail: string }}
 */
function clearSecret(dir) {
  const filePath = secretFilePath(dir);
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  return describeSecret(dir);
}

/**
 * 状态摘要 —— **这是渲染层能拿到的全部信息**：有没有、从哪来、怎么存的、尾 4 位。
 * @param {string} [dir]
 * @returns {{ configured: boolean, source: "stored" | "env" | "none", protection: "safeStorage" | "plain" | "", tail: string }}
 */
function describeSecret(dir) {
  const { key, source } = resolveApiKey(dir);
  if (source === "env") {
    return { configured: true, source, protection: "", tail: tailOf(key) };
  }
  if (source === "stored") {
    const stored = readSecret(dir);
    return {
      configured: true,
      source,
      protection: stored?.protection ?? "safeStorage",
      tail: tailOf(key),
    };
  }
  return { configured: false, source: "none", protection: "", tail: "" };
}

/**
 * 取这次运行要用的密钥
 * @param {string} [dir]
 * @returns {{ key: string, source: "stored" | "env" | "none" }}
 */
function resolveApiKey(dir) {
  const fromEnv = (process.env[ENV_KEY_NAME] || "").trim();
  if (fromEnv) return { key: fromEnv, source: "env" };

  const stored = readSecret(dir);
  if (stored?.key) return { key: stored.key, source: "stored" };
  return { key: "", source: "none" };
}

module.exports = {
  ENV_KEY_NAME,
  SECRET_FILE_NAME,
  secretFilePath,
  readSecret,
  writeSecret,
  clearSecret,
  describeSecret,
  resolveApiKey,
};
