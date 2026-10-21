/** 云端图库操作白名单：等价校验 shared schema，把业务参数转为后端固定路径及 form 字段。 */
const { authorized, optionalAccount, unauthenticated } = require("./account-client");
const sessionStore = require("./account-session");
const ACTION_FIELDS = {
  listImages: ["scope", "size", "offset"], listCollections: ["scope", "size", "offset"],
  updateImage: ["ownerId", "id", "expectedRevision", "title", "visibility", "presentationMode"], deleteImage: ["ownerId", "id"],
  createCollection: ["ownerId", "requestId", "name", "description", "visibility"],
  updateCollection: ["ownerId", "id", "revision", "name", "description", "visibility"], deleteCollection: ["ownerId", "id"],
  addItem: ["ownerId", "id", "imageId", "sortOrder"], removeItem: ["ownerId", "id", "imageId"],
};
/** @param {unknown} value */
function validId(value) { return typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value); }
/** @param {unknown} value @param {number} maximum */
function validName(value, maximum) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum; }
/** @param {Record<string, unknown>} value */
function validFields(value) {
  for (const key of ["id", "ownerId", "imageId", "revision", "expectedRevision"]) if (key in value && !validId(value[key])) return false;
  if ("visibility" in value && !["private", "public"].includes(String(value.visibility))) return false;
  if ("presentationMode" in value && !["imageOnly", "withGenerationInfo"].includes(String(value.presentationMode))) return false;
  if ("title" in value && !validName(value.title, 100) || "name" in value && !validName(value.name, 100)) return false;
  if ("description" in value && (typeof value.description !== "string" || value.description.length > 1000)) return false;
  if ("requestId" in value && (typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId))) return false;
  if (value.sortOrder !== undefined) {
    if (typeof value.sortOrder !== "string" || !/^-?(0|[1-9][0-9]{0,18})$/.test(value.sortOrder)) return false;
    const order = BigInt(value.sortOrder); if (order < BigInt("-9223372036854775808") || order > BigInt("9223372036854775807")) return false;
  }
  return true;
}
/** @param {unknown[]} args */
function validateLibraryRequest(args) {
  if (args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0])) return "Invalid library request";
  const value = /** @type {Record<string, unknown>} */ (args[0]);
  if (typeof value.action !== "string" || !Object.hasOwn(ACTION_FIELDS, value.action)) return "Unknown library operation";
  const fields = /** @type {Record<string, string[]>} */ (ACTION_FIELDS)[value.action];
  if (!fields || Object.keys(value).some(key => key !== "action" && !fields.includes(key))) return "Unknown library operation";
  if (fields.some(key => key !== "sortOrder" && value[key] === undefined) || !validFields(value)) return "Invalid library fields";
  if (value.action === "listImages" || value.action === "listCollections") {
    if (!["mine", "public"].includes(String(value.scope)) || !Number.isInteger(value.size) || Number(value.size) < 1 || Number(value.size) > 100 || !Number.isInteger(value.offset) || Number(value.offset) < 0 || Number(value.offset) > 2147483647) return "Invalid pagination";
  }
  return null;
}
/** @param {import('../../packages/shared/src/schemas/cloud-image.schema').CloudLibraryRequest} input */
function requestParts(input) {
  if (input.action === "listImages" || input.action === "listCollections") {
    const resource = input.action === "listImages" ? "images" : "collections";
    return { path: `/${resource}/${input.scope}?size=${input.size}&offset=${input.offset}`, method: "GET", body: undefined };
  }
  const image = input.action === "updateImage" || input.action === "deleteImage";
  let target = input.action === "createCollection" ? "/collections" : `/${image ? "images" : "collections"}/${"id" in input ? input.id : ""}`;
  if (input.action === "addItem") target += "/items";
  if (input.action === "removeItem") target += `/items/${input.imageId}`;
  const method = input.action.startsWith("delete") || input.action === "removeItem" ? "DELETE" : input.action.startsWith("update") ? "PATCH" : "POST";
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (!["action", "ownerId", "id"].includes(key) && value !== undefined) body.set(key, String(value));
  return { path: target, method, body: method === "DELETE" ? undefined : body };
}
/** @param {import('../../packages/shared/src/schemas/cloud-image.schema').CloudLibraryRequest} input */
async function executeLibraryRequest(input) {
  const parts = requestParts(input);
  if (input.action === "listImages" || input.action === "listCollections") return input.scope === "public" ? optionalAccount(parts.path) : authorized(parts.path);
  // 绑定提交时账户，防止旧页面的异步操作落到切换后的账户。
  const sessionId = sessionStore.readSession()?.sessionId;
  if (!sessionId) return unauthenticated();
  const profile = await authorized("/account/me", "GET", undefined, sessionId);
  if (profile.status !== 200) return profile;
  const body = profile.body;
  const data = body && typeof body === "object" && "data" in body ? body.data : null;
  if (!data || typeof data !== "object" || !("id" in data) || data.id !== input.ownerId) return unauthenticated();
  return authorized(parts.path, parts.method, parts.body, sessionId);
}
module.exports = { executeLibraryRequest, validateLibraryRequest };
