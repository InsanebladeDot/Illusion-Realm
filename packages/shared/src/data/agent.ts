/**
 * Agent 的**默认配置**（多模块共用的那一份）。
 *
 * 谁在用：
 * - 主进程：`apps/electron/agent/defaults.js` 是**同值副本**（主进程运行期解析不到本包，
 *   与 `ipcChannels.js` 同一套做法），由 `scripts/verify-electron-modules.js` 断言两边一致；
 * - 渲染层：设置页 / 文案可以引用它，别把默认值再写一遍；
 * - Python sidecar：不直接读它 —— 主进程每次运行都会把生效值经 stdin 传下去，
 *   `apps/agent/agent_core/config.py` 里的同名常量只是**最后的兜底**。
 *
 * 生效优先级（从高到低）：
 *   1. 运行参数（`agent:run` 的 config）
 *   2. 仓库根 `.env`（见 `AGENT_ENV_KEYS`，**一份文件全工作区共用**）
 *   3. 这里的默认值
 */

/** 共用配置文件的名字：放在应用根目录（dev = 工作区根，打包 = exe 同目录） */
export const AGENT_ENV_FILE = ".env";

/**
 * 仓库根 `.env` 里认识的键。
 * 改这里要**同时**改根目录的 `.env.example`（那是给人看的模板）。
 */
export const AGENT_ENV_KEYS = {
  /** 密钥：只有主进程读它，再经 stdin 传给 sidecar */
  apiKey: "ILLUSION_AGENT_API_KEY",
  baseUrl: "ILLUSION_AGENT_BASE_URL",
  model: "ILLUSION_AGENT_MODEL",
  maxSteps: "AGENT_MAX_STEPS",
  permission: "ILLUSION_AGENT_PERMISSION",
  allowedRoots: "ILLUSION_AGENT_ALLOWED_ROOTS",
  timeoutMs: "ILLUSION_AGENT_TIMEOUT_MS",
  /** 指定解释器 / 打包产物（覆盖自动探测） */
  python: "ILLUSION_AGENT_PYTHON",
} as const;

/** 默认值：与 `apps/electron/agent/defaults.js`、`apps/agent/agent_core/config.py` 三处保持一致 */
export const AGENT_DEFAULTS = {
  baseUrl: "https://api.siliconflow.cn/v1",
  model: "deepseek-ai/DeepSeek-V4-Flash",
  maxSteps: 8,
  permission: "readonly",
} as const;
