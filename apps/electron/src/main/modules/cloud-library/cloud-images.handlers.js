/**
 * 云端图片请求继续引用 account 的唯一会话存储，不在 cloud-library 再存一份令牌。
 * 上传与读取的账户变更检查保持在网络动作之前。
 * 共享 schema 的类型引用只影响检查，运行时仍使用现有等价校验器。
 * 该模块的字节上传不重编码图片，因此嵌入的工作流信息保持原样。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** 云端图片与收藏夹入口：校验原始 PNG 和业务操作，不改写元数据，也不向页面暴露令牌。 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { authorized, optionalAccount, unauthenticated } = require("../account/account-client");
const sessionStore = require("../account/account-session");
const { executeLibraryRequest, validateLibraryRequest } = require("./request");
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

/** @param {import("../../../../../../packages/shared/src/schemas/cloud-image.schema").CloudImageUpload} input */
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
