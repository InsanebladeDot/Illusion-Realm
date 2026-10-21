/** 后端账户 API 适配层：主进程完成网络请求并隐藏访问/刷新令牌。 */
const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const sessionStore = require("../account-session");
const { callApi, tokenData, authorized } = require("../account-client");

/** @param {unknown} value @param {number} [max] */
function validText(value, max = 2048) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
/** @param {unknown} value */
function validObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

function registerAccountHandlers() {
  registerHandle(IPC_CHANNELS.ACCOUNT_REGISTER, async (_event, body) => callApi("/auth/register", "POST", body), (args) => validObject(args[0]) ? null : "注册参数必须是对象");
  registerHandle(IPC_CHANNELS.ACCOUNT_VERIFY_EMAIL, async (_event, token) => callApi("/auth/verify-email", "POST", { token }), (args) => validText(args[0], 64) ? null : "验证凭据无效");
  registerHandle(IPC_CHANNELS.ACCOUNT_RESEND_VERIFICATION, async (_event, email) => callApi("/auth/verification/resend", "POST", { email }), (args) => validText(args[0], 254) ? null : "邮箱无效");
  registerHandle(IPC_CHANNELS.ACCOUNT_LOGIN, async (_event, body) => {
    const result = await callApi("/auth/login", "POST", body);
    const tokens = tokenData(result.body);
    if (result.status < 300 && tokens) sessionStore.writeSession(tokens);
    if (tokens && result.body && typeof result.body === "object") {
      return { ...result, body: { ...result.body, data: { sessionId: tokens.sessionId, sessionExpiresAt: tokens.sessionExpiresAt } } };
    }
    return result;
  }, (args) => validObject(args[0]) ? null : "登录参数必须是对象");
  registerHandle(IPC_CHANNELS.ACCOUNT_ME, async () => authorized("/account/me"), (args) => args.length ? "不需要参数" : null);
  registerHandle(IPC_CHANNELS.ACCOUNT_LOGOUT, async () => {
    const result = await authorized("/auth/logout", "POST");
    sessionStore.clearSession();
    return result;
  }, (args) => args.length ? "不需要参数" : null);
}

module.exports = { registerAccountHandlers };
