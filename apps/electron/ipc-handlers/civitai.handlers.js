/** Register Civitai API-key status and mutation handlers without returning the secret value. */
const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const secret = require("../civitai-secret");
function registerCivitaiHandlers() {
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_STATUS, () => secret.status(), (args) => args.length ? "invalid" : null);
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_SET, (_event, key) => secret.write(key), (args) => args.length === 1 && secret.validKey(args[0]) ? null : "invalid");
  registerHandle(IPC_CHANNELS.CIVITAI_KEY_CLEAR, () => secret.clear(), (args) => args.length ? "invalid" : null);
}
module.exports = { registerCivitaiHandlers };
