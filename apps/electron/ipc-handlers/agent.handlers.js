const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { startAgentRun, cancelAgentRun } = require("../agent/runner");
const { settleHostCall } = require("../agent/host-tools");
const { describeSecret, writeSecret, clearSecret } = require("../agent/secret");

/**
 * 入参校验：Agent 的入参里**不允许**出现密钥字段。
 * 显式拒绝（而不是静默忽略）——渲染层若哪天开始传 apiKey，那是设计走偏了，
 * 让它当场失败比留一个「看起来能用」的口子安全。
 * @param {unknown[]} args
 * @returns {string | null}
 */
function validateRunArgs(args) {
  const options = args[0];
  if (!options || typeof options !== "object") return "options 必须是对象";
  const { question, config } = /** @type {{ question?: unknown, config?: unknown }} */ (options);
  if (typeof question !== "string" || !question.trim()) return "question 必须是非空字符串";
  if (config && typeof config === "object" && "apiKey" in config) {
    return "config 里不允许出现 apiKey：密钥由主进程侧注入";
  }
  return null;
}

/**
 * Agent 域：
 * - `agent:run` 启动一次运行（立刻返回 runId，结果走 `agent:event`）；
 * - `agent:cancel` 把整棵进程树收掉；
 * - `agent:hostResult` 收渲染层对宿主工具调用的回执（请求方向相反，走 `agent:hostCall`）；
 * - `agent:secretStatus` / `agent:secretSet` / `agent:secretClear` 管密钥。
 *
 * 密钥这三个通道**只回状态摘要**（有没有 / 从哪来 / 怎么存的 / 尾 4 位）：
 * 原值进了渲染进程就等于进了日志与崩溃报告，见 `agent/secret.js` 的文件头。
 * @returns {void}
 */
function registerAgentHandlers() {
  registerHandle(
    IPC_CHANNELS.AGENT_RUN,
    /**
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {import("@illusion-realm/shared").AgentRunOptions} options
     * @returns {Promise<import("@illusion-realm/shared").AgentRunHandle>}
     */
    async (event, options) => {
      const result = startAgentRun({ sender: event.sender, options });
      if (!result.ok) throw new Error(result.error);
      return { runId: result.runId };
    },
    validateRunArgs
  );

  registerHandle(
    IPC_CHANNELS.AGENT_CANCEL,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string} runId */
    async (_event, runId) => cancelAgentRun(runId),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => (typeof args[0] === "string" && args[0] ? null : "runId 必须是非空字符串")
  );

  registerHandle(
    IPC_CHANNELS.AGENT_HOST_RESULT,
    /**
     * 渲染层执行完宿主工具后的回执。**无论成败都要回** —— 不回的话主进程那边要等到
     * 工具自己的超时才收场（生图那条是 10 分钟）。
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {import("@illusion-realm/shared").AgentHostCallResult} payload
     * @returns {Promise<boolean>} 是否认领到了一次在等的调用
     */
    async (_event, payload) => settleHostCall(payload),
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const payload = args[0];
      if (!payload || typeof payload !== "object") return "回执必须是对象";
      const { callId } = /** @type {{ callId?: unknown }} */ (payload);
      return typeof callId === "string" && callId
        ? null
        : "callId 必须是非空字符串";
    }
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_STATUS,
    async () => describeSecret()
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_SET,
    /** @param {Electron.IpcMainInvokeEvent} _event @param {string} apiKey */
    async (_event, apiKey) => writeSecret(apiKey),
    /**
     * 只校验"是非空字符串"：密钥形态由服务商决定，这里不该猜。
     * **不回显入参**（校验失败信息里也不能带 key 片段）。
     * @param {unknown[]} args
     * @returns {string | null}
     */
    (args) =>
      typeof args[0] === "string" && args[0].trim() ? null : "apiKey 必须是非空字符串"
  );

  registerHandle(
    IPC_CHANNELS.AGENT_SECRET_CLEAR,
    async () => clearSecret()
  );
}

module.exports = { registerAgentHandlers };
