/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** Register Civitai API-key status and mutation handlers without returning the secret value. */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const secret = require("./secret");
function registerCivitaiHandlers() {
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_STATUS, () => secret.status(), (args) => args.length ? "invalid" : null);
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_SET, (_event, key) => secret.write(key), (args) => args.length === 1 && secret.validKey(args[0]) ? null : "invalid");
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_CLEAR, () => secret.clear(), (args) => args.length ? "invalid" : null);
}
module.exports = { registerCivitaiHandlers };
