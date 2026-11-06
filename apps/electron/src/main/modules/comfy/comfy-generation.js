/**
 * 可取消生成仍委托同域 proxy 执行提交、轮询和下载，不复制另一份请求流程。
 * 会话表与代理的 AbortSignal 链路保持不变，停止动作不能只改变页面状态。
 */
/** 管理可取消的 ComfyUI 请求：按窗口与请求 ID 隔离，停止时只删除/中断本请求的服务端任务。 */
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { generateWithComfy } = require("./proxy");
const { comfyError, normalizeComfyError, readComfyJson, requestComfy } = require("./comfy-request");

/** @typedef {{ server: string, controller: AbortController, promptId: string, cancelled: boolean, finished: Promise<void>, finish: () => void, stopError: unknown }} Session */
/** @type {Map<string, Session>} */
const sessions = new Map();

/** @param {string} server */
async function readQueue(server) {
  const value = await readComfyJson(server, "/queue");
  if (!value || typeof value !== "object" || !("queue_running" in value) || !("queue_pending" in value)
    || !Array.isArray(value.queue_running) || !Array.isArray(value.queue_pending)) {
    throw comfyError("COMFY_STOP_FAILED", "Cannot confirm ComfyUI queue state");
  }
  return { running: value.queue_running, pending: value.queue_pending };
}

/** @param {unknown[]} entries @param {string} id */
function contains(entries, id) {
  return entries.some((entry) => Array.isArray(entry) && entry[1] === id);
}

/** @param {Session} session @param {string} route @param {object} body */
async function post(session, route, body) {
  const response = await requestComfy(session.server, route, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) throw comfyError("COMFY_STOP_FAILED", "ComfyUI rejected the stop request");
  await response.body?.cancel();
}

/** @param {Session} session */
async function stopRemote(session) {
  if (!session.promptId) throw comfyError("COMFY_STOP_FAILED", "Submission ended without a task ID; remote state is unknown");
  await post(session, "/queue", { delete: [session.promptId] });
  const queue = await readQueue(session.server);
  if (contains(queue.running, session.promptId)) {
    // 先核对当前任务；新版本支持 prompt_id，旧版本也不对已确认的其它任务调用全局 interrupt。
    await post(session, "/interrupt", { prompt_id: session.promptId });
  }
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const current = await readQueue(session.server);
    if (!contains(current.running, session.promptId) && !contains(current.pending, session.promptId)) return;
    await delay(100);
  }
  throw comfyError("COMFY_STOP_FAILED", "ComfyUI has not confirmed stopping this task");
}

/** @param {number} owner @param {object} prompt @param {string} server @param {string} [requestId] */
async function generate(owner, prompt, server, requestId = randomUUID()) {
  const key = `${owner}:${requestId}`;
  if (sessions.has(key)) throw new Error("Duplicate ComfyUI request ID");
  let finish = () => {};
  const finished = new Promise(/** @param {(value: void) => void} resolve */ (resolve) => { finish = () => resolve(); });
  const session = { server, controller: new AbortController(), promptId: "", cancelled: false, finished, finish, stopError: null };
  sessions.set(key, session);
  try { return await run(session, prompt); }
  finally { sessions.delete(key); session.finish(); }
}

/** @param {Session} session @param {object} prompt */
async function run(session, prompt) {
  try {
    return await generateWithComfy(session.server, prompt, {
      signal: session.controller.signal, onQueued: (id) => { session.promptId = id; },
    });
  } catch (error) {
    if (session.cancelled) {
      try { await stopRemote(session); }
      catch { session.stopError = comfyError("COMFY_STOP_FAILED", "Unable to confirm ComfyUI stopped; pending tasks were cancelled"); }
      throw session.stopError ?? comfyError("COMFY_CANCELLED", "Generation cancelled");
    }
    throw normalizeComfyError(error, session.controller.signal);
  }
}

/** @param {number} owner @param {string} requestId */
async function cancel(owner, requestId) {
  const session = sessions.get(`${owner}:${requestId}`);
  if (!session) return false;
  session.cancelled = true;
  session.controller.abort(comfyError("COMFY_CANCELLED", "Generation cancelled"));
  await session.finished;
  if (session.stopError) throw session.stopError;
  return true;
}

module.exports = { generate, cancel };
