/** Register validated prompt transformations and endpoint-scoped credential operations. */
const { IPC_CHANNELS: C } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const assistant = require("../services/prompt-assistant");
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').PromptConnection} */
function validConnection(value) {
  if (!value || typeof value !== "object" || !("provider" in value) || !("baseUrl" in value)) return false;
  if (!["glm", "custom"].includes(String(value.provider)) || typeof value.baseUrl !== "string" || value.baseUrl.length > 2048) return false;
  try { assistant.endpoint(/** @type {import('@illusion-realm/shared').PromptConnection} */ (value)); return true; } catch { return false; }
}
/** @param {unknown} value @param {number} limit */
const validText = (value, limit) => typeof value === "string" && Boolean(value.trim()) && value.trim().length <= limit;
/** @param {unknown[]} args */
function validRequest(args) {
  const value = args[0];
  return args.length === 1 && validConnection(value) && "model" in value && "text" in value && "instruction" in value
    && validText(value.model, 200) && validText(value.text, 16000) && validText(value.instruction, 8000) ? null : "invalid";
}
/** @param {unknown[]} args */
const connectionArgs = (args) => args.length === 1 && validConnection(args[0]) ? null : "invalid";
function registerPromptAssistantHandlers() {
  registerHandle(C.PROMPT_TRANSFORM, (_event, request) => assistant.transform(request), validRequest);
  registerHandle(C.PROMPT_SECRET_STATUS, (_event, connection) => assistant.status(connection), connectionArgs);
  registerHandle(C.PROMPT_SECRET_SET, (_event, connection, key) => assistant.setSecret(connection, key), args => args.length === 2 && validConnection(args[0]) && validText(args[1], 4096) && /^[\x21-\x7e]+$/.test(String(args[1]).trim()) ? null : "invalid");
  registerHandle(C.PROMPT_SECRET_CLEAR, (_event, connection) => assistant.clearSecret(connection), connectionArgs);
}
module.exports = { registerPromptAssistantHandlers };
