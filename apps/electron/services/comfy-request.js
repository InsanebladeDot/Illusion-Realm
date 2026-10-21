/** ComfyUI 有界 HTTP 请求：取消信号与单次超时共同约束连接及响应体读取。 */
const REQUEST_TIMEOUT_MS = 8000;

/** @param {string} code @param {string} message */
function comfyError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** @param {unknown} error @param {AbortSignal} [signal] */
function normalizeComfyError(error, signal) {
  if (signal?.aborted && signal.reason instanceof Error && "code" in signal.reason
    && typeof signal.reason.code === "string" && signal.reason.code.startsWith("COMFY_")) return signal.reason;
  if (signal?.aborted && signal.reason instanceof Error && signal.reason.name === "TimeoutError") {
    return comfyError("COMFY_TIMEOUT", "ComfyUI generation timed out");
  }
  if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("COMFY_")) return error;
  return comfyError("COMFY_DISCONNECTED", "ComfyUI connection lost or request timed out");
}

/** @param {string} server @param {string} route @param {RequestInit} [init] @param {AbortSignal} [signal] */
async function requestComfy(server, route, init = {}, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`http://${server}${route}`, {
      ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) { throw normalizeComfyError(error, signal); }
}

/** @param {string} server @param {string} route @param {RequestInit} [init] @param {AbortSignal} [signal] @returns {Promise<unknown>} */
async function readComfyJson(server, route, init = {}, signal) {
  try {
    const response = await requestComfy(server, route, init, signal);
    if (!response.ok) throw comfyError("COMFY_EXECUTION_FAILED", `ComfyUI request rejected (${response.status})`);
    return await response.json();
  } catch (error) { throw normalizeComfyError(error, signal); }
}

module.exports = { comfyError, normalizeComfyError, requestComfy, readComfyJson };
