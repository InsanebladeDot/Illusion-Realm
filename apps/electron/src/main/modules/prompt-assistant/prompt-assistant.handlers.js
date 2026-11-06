/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** Register validated prompt transformations and endpoint-scoped credential operations. */
const { IPC_CHANNELS: C } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const assistant = require("./service");
/** @param {unknown} value @returns {value is import('@illusion-realm/shared').PromptConnection} */
function validConnection(value) {
  if (!value || typeof value !== "object" || !("provider" in value) || !("baseUrl" in value)) return false;
  // 与 shared 允许集同步，未知供应商不能被当作自定义地址获得凭据。
  // endpoint 继续核对地址协议；命名 Euzhi 只会返回固定官方中转地址。
  // 不新增可传入任意 Agent 配置的接口，转换仍是一个文本请求。
  if (!["glm", "custom", "euzhi"].includes(String(value.provider)) || typeof value.baseUrl !== "string" || value.baseUrl.length > 2048) return false;
  try { assistant.endpoint(/** @type {import('@illusion-realm/shared').PromptConnection} */ (value)); return true; } catch { return false; }
}
/** @param {unknown} value @param {number} limit */
const validText = (value, limit) => typeof value === "string" && Boolean(value.trim()) && value.trim().length <= limit;
/** @param {unknown[]} args */
function validRequest(args) {
  const value = args[0];
  return args.length === 1 && validConnection(value) && "model" in value && "text" in value && "instruction" in value
    // 先确认 model 是文本再执行正则，不让任意 IPC 值触发类型异常。
    // Grok 图片、视频和音频模型不能作为提示词翻译聊天模型提交。
    // 形状与系列校验失败统一由 registerHandle 返回 INVALID_ARGUMENT。
    && validText(value.model, 200) && (value.provider !== "euzhi" || /^grok-/i.test(String(value.model)) && !/image|imagine|video|audio/i.test(String(value.model)))
    && validText(value.text, 16000) && validText(value.instruction, 8000) ? null : "invalid";
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
