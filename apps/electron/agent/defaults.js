/**
 * Agent 默认值的**主进程副本**。
 *
 * 为什么要有副本：主进程是手写 CommonJS，运行期解析不到 `@illusion-realm/shared`
 * （那个包只有 TS 源码）。所以与 `ipcChannels.js` 同一套做法：保留同值副本，
 * 由 `scripts/verify-electron-modules.js` 断言两边取值一致 —— 漂移会当场失败。
 *
 * 真值来源：`packages/shared/src/data/agent.ts`（改那边就要改这里）。
 */
const AGENT_DEFAULTS = {
  baseUrl: "https://api.siliconflow.cn/v1",
  model: "deepseek-ai/DeepSeek-V4-Flash",
  maxSteps: 8,
  permission: "readonly",
};

module.exports = { AGENT_DEFAULTS };
