/** 云端图片与收藏夹入口：校验原始 PNG 和业务操作，不改写元数据，也不向页面暴露令牌。 */
const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { authorized, optionalAccount, unauthenticated } = require("../account-client");
const sessionStore = require("../account-session");
const { executeLibraryRequest, validateLibraryRequest } = require("../cloud-library-request");
const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];
/** @param {unknown} id */
function validId(id) { return typeof id === "string" && /^[1-9][0-9]{0,19}$/.test(id); }

/** 等价于 shared CloudImageUploadSchema，另外核对 PNG 文件签名。 @param {unknown[]} args */
function validateUpload(args) {
  if (args.length !== 1 || !args[0] || typeof args[0] !== "object") return "Invalid upload";
  const value = /** @type {Record<string, unknown>} */ (args[0]);
  if (!validId(value.ownerId) || typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) return "Invalid request ID";
  if (typeof value.title !== "string" || !value.title.trim() || [...value.title.trim()].length > 100) return "Invalid title";
  if (!["private", "public"].includes(String(value.visibility)) || !["imageOnly", "withGenerationInfo"].includes(String(value.presentationMode))) return "Invalid image options";
  if (typeof value.fileName !== "string" || !value.fileName || value.fileName.length > 255 || /[\\/\u0000-\u001f]/.test(value.fileName)) return "Invalid filename";
  const bytes = value.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 16 * 1024 * 1024 || bytes.byteLength < 8 || !PNG_HEADER.every((byte, index) => bytes[index] === byte)) return "Invalid PNG (maximum 16 MiB)";
  return null;
}

/** @param {import('../../../packages/shared/src/schemas/cloud-image.schema').CloudImageUpload} input */
async function upload(input) {
  const sessionId = sessionStore.readSession()?.sessionId;
  if (!sessionId) return unauthenticated();
  const profile = await authorized("/account/me", "GET", undefined, sessionId);
  const owner = profile.body && typeof profile.body === "object" && "data" in profile.body ? profile.body.data : null;
  if (profile.status !== 200) return profile;
  if (!owner || typeof owner !== "object" || !("id" in owner) || owner.id !== input.ownerId) return unauthenticated();
  const form = new FormData();
  form.set("requestId", input.requestId); form.set("title", input.title.trim());
  form.set("visibility", input.visibility); form.set("presentationMode", input.presentationMode);
  form.set("file", new Blob([new Uint8Array(input.bytes)], { type: "image/png" }), input.fileName);
  return authorized("/images", "POST", form, sessionId);
}

function registerCloudImageHandlers() {
  registerHandle(IPC_CHANNELS.CLOUD_LIBRARY_REQUEST, (_event, input) => executeLibraryRequest(input), validateLibraryRequest);
  registerHandle(IPC_CHANNELS.CLOUD_IMAGE_UPLOAD, (_event, input) => upload(input), validateUpload);
  registerHandle(IPC_CHANNELS.CLOUD_IMAGE_GET, (_event, id) => optionalAccount(`/images/${id}`), args => args.length === 1 && validId(args[0]) ? null : "Invalid image ID");
  registerHandle(IPC_CHANNELS.CLOUD_COLLECTION_GET, (_event, id) => optionalAccount(`/collections/${id}`), args => args.length === 1 && validId(args[0]) ? null : "Invalid collection ID");
  registerHandle(IPC_CHANNELS.CLOUD_COLLECTION_ITEMS, (_event, input) => {
    const query = new URLSearchParams({ size: "24" });
    if (input.cursor) query.set("cursor", input.cursor);
    return optionalAccount(`/collections/${input.id}/items?${query}`);
  }, validateItems);
}

/** @param {unknown[]} args */
function validateItems(args) {
  if (args.length !== 1 || !args[0] || typeof args[0] !== "object") return "Invalid collection";
  const input = /** @type {Record<string, unknown>} */ (args[0]);
  return validId(input.id) && (input.cursor === undefined || typeof input.cursor === "string" && input.cursor.length <= 256) ? null : "Invalid collection cursor";
}
module.exports = { registerCloudImageHandlers };
