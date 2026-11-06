/**
 * 账户模块的两个相对依赖现在都在当前域，不能回退读取旧目录的会话副本。
 * 跨边界结果仍由 ipc/result 包装，身份切换失败不抛出包含堆栈的对象。
 * common 只提供通道名；它不读取凭据，也不参与账户生命周期。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
/** 后端账户 API 适配层：主进程完成网络请求并隐藏访问/刷新令牌。 */
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const sessionStore = require("./account-session");
const { callApi, tokenData, authorized } = require("./account-client");
// 每次登录或进入游客都代表新的身份意图；旧登录响应不得覆盖后来的游客选择。
// 计数只存在本进程，不是令牌或落盘格式，不允许页面自行指定。
// clearSession 保护已存在凭据，revision 额外保护尚未返回的登录请求。
let entryRevision = 0;

/** @param {unknown} value @param {number} [max] */
function validText(value, max = 2048) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
/** @param {unknown} value */
function validObject(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

function registerAccountHandlers() {
  // 与 shared AccountEnterGuestArgsSchema 等价：该入口不允许任何参数。
  // 本地清除先于游客页面放行，不能复用会发起 /auth/logout 的退出流程。
  // clearSession 的历史实现会吞掉文件删除错误，所以必须复读确认凭据已撤销。
  // 清理失败返回统一 IPC 失败，让页面停留入口，不带着旧凭据进入游客模式。
  // 不删除用户设置、生成记录、模型或下载队列，仅处理账户令牌文件。
  // 正在刷新的旧请求由 account-client 的 sameSession 检查阻止重新写回。
  // 成功没有返回数据，也不会对服务器进行任何登录、注销或刷新调用。
  registerHandle(IPC_CHANNELS.ACCOUNT_ENTER_GUEST, () => {
    // 先使正在等待网络的登录失效，再清除已有令牌，两类来源均必须撤销。
    // 即使本地清理失败，也不能让旧登录响应继续自动写入凭据。
    // 新的显式登录会取得新 revision，正常的游客转正式账号不会被永久阻止。
    entryRevision++;
    sessionStore.clearSession();
    if (sessionStore.readSession()) throw new Error("Could not clear local account credentials");
  }, (args) => args.length ? "Guest entry takes no arguments" : null);
  registerHandle(IPC_CHANNELS.ACCOUNT_REGISTER, async (_event, body) => callApi("/auth/register", "POST", body), (args) => validObject(args[0]) ? null : "注册参数必须是对象");
  registerHandle(IPC_CHANNELS.ACCOUNT_VERIFY_EMAIL, async (_event, token) => callApi("/auth/verify-email", "POST", { token }), (args) => validText(args[0], 64) ? null : "验证凭据无效");
  registerHandle(IPC_CHANNELS.ACCOUNT_RESEND_VERIFICATION, async (_event, email) => callApi("/auth/verification/resend", "POST", { email }), (args) => validText(args[0], 254) ? null : "邮箱无效");
  registerHandle(IPC_CHANNELS.ACCOUNT_LOGIN, async (_event, body) => {
    // 捕获本次意图，避免用户在登录未返回时通过另一个入口进入游客。
    // 只有最后一次显式身份操作能写入凭据，不按 HTTP 完成顺序决定身份。
    // 这也防止较慢的第一份登录覆盖用户随后提交的另一份登录。
    const revision = ++entryRevision;
    const result = await callApi("/auth/login", "POST", body);
    // 响应内容不得回传成功，否则 renderer 随后会再次读取资料并误认为正式账号。
    // 使用既有本地 401 契约；旧响应里的访问令牌不会写盘或发送给页面。
    // 不发送额外的后端退出请求，保持游客切换本身完全离线。
    if (revision !== entryRevision) return { status: 401, body: { success: false, code: "UNAUTHENTICATED" } };
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
