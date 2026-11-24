/** 分批超分的受限 IPC；原有视频导出不变，取消和目录清理均按窗口身份隔离。 */
const { registerHandle } = require("../../ipc/result");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { validateUpscale } = require("./upscale-validation");
const { createSession, prepareSession, mergeSession, getSession, releaseSession } = require("./upscale-sessions");

/** @param {Electron.IpcMainInvokeEvent} event @param {import("@illusion-realm/shared").VideoUpscaleRequest} payload @returns {Promise<import("@illusion-realm/shared").VideoUpscaleResult>} */
async function handleUpscale(event, payload) {
  const owner = event.sender;
  if (!["app://app/", "http://localhost:3000/", "http://127.0.0.1:3000/"].some(origin => owner.getURL().startsWith(origin))) throw Error("Video upscale caller denied");
  if (payload.action === "release") { await releaseSession(owner, payload.requestId); return {}; }
  if (payload.action === "cancel") {
    try { getSession(owner, payload.requestId).controller.abort(); } catch { /* 已完成的任务无需再次停止。 */ }
    return {};
  }
  const session = payload.action === "prepare" ? createSession(owner, payload.requestId, payload.inputPath) : getSession(owner, payload.requestId);
  if (payload.action === "merge") {
    if (session.phase !== "ready") throw Error("Video upscale session busy");
    session.phase = "merging";
  }
  session.pending = payload.action === "prepare" ? prepareSession(session, payload.fps) : mergeSession(session, payload.paths, payload.outputPath);
  try { return /** @type {import("@illusion-realm/shared").VideoUpscaleResult} */ (await session.pending); }
  catch {
    const cancelled = session.controller.signal.aborted;
    await releaseSession(owner, payload.requestId);
    throw Error(cancelled ? "Video upscale stopped" : "Video upscale processing failed");
  }
}

function registerUpscaleIpc() { registerHandle(IPC_CHANNELS.VIDEO_UPSCALE, handleUpscale, validateUpscale); }
module.exports = { registerUpscaleIpc, handleUpscale };
