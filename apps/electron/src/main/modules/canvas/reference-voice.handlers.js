/** 角色音色只从所属窗口挑文件，IPC 输入只包含分类和台词。 */
const { BrowserWindow, dialog } = require("electron");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { listReferenceVoices, saveReferenceVoice } = require("./reference-voices");
const { EXTENSIONS } = require("./project-validation");

/** @param {unknown} value */
function validRequest(value) {
  // 与共享 schema 同步：先检查去掉首尾空白后的内容，再允许请求打开系统框。
  if (!value || typeof value !== "object" || Object.keys(value).length !== 3) return false;
  const { role, tone, transcript } = /** @type {Partial<Record<"role" | "tone" | "transcript", unknown>>} */ (value);
  return validFolder(role) && validFolder(tone) && validText(transcript, 80);
}

/** @param {unknown} value @param {number} limit @returns {value is string} */
function validText(value, limit) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return !!text && text.length <= limit && ![...text].some(char => char.charCodeAt(0) < 32);
}

/** @param {unknown} value */
function validFolder(value) {
  if (!validText(value, 60)) return false;
  const name = value.trim();
  return !/[<>:"/\\|?*]/u.test(name) && !name.endsWith(".") && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$)/iu.test(name);
}

/** @param {string} base */
function registerReferenceVoiceHandlers(base) {
  registerHandle(IPC_CHANNELS.CANVAS_REFERENCE_VOICES, () => listReferenceVoices(base), args => args.length ? "Unexpected voice catalog arguments" : null);
  registerHandle(IPC_CHANNELS.CANVAS_ADD_REFERENCE_VOICE, async (event, request) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw Error("voice-window-unavailable");
    let picked;
    try {
      picked = await dialog.showOpenDialog(owner, { properties: ["openFile"], filters: [{ name: "Audio", extensions: EXTENSIONS.audio }] });
    } catch { throw Error("voice-picker-failed"); }
    if (picked.canceled || !picked.filePaths[0] || owner.isDestroyed()) return null;
    return saveReferenceVoice(base, request, picked.filePaths[0]);
  }, args => args.length === 1 && validRequest(args[0]) ? null : "voice-invalid-request");
}

module.exports = { registerReferenceVoiceHandlers, validRequest };
