/** 从 ComfyUI 历史消息读取服务端执行耗时；不把轮询、下载和本地保存算进去。 */
"use strict";

/**
 * 只接受同一 prompt 的完整起止记录，旧服务缺少时间时返回 undefined。
 * @param {Record<string, unknown>} entry
 * @param {string} promptId
 * @returns {number | undefined} 毫秒
 */
function readExecutionMs(entry, promptId) {
  const status = /** @type {{ messages?: unknown } | undefined} */ (entry.status);
  if (!Array.isArray(status?.messages)) return undefined;
  let start;
  for (const message of status.messages) {
    if (!Array.isArray(message) || message.length !== 2) continue;
    const [event, data] = message;
    if (!data || typeof data !== "object" || data.prompt_id !== promptId) continue;
    const timestamp = data.timestamp;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) continue;
    if (event === "execution_start") start = timestamp;
    if (event === "execution_success" && start !== undefined && timestamp >= start) return timestamp - start;
  }
  return undefined;
}

module.exports = { readExecutionMs };
