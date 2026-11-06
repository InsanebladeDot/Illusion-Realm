/** 账户 HTTP 通道：JSON 与原始文件共用令牌刷新；并发刷新合并，切换账户后拒绝旧请求。 */
const sessionStore = require("./account-session");
const BASE_URL = (process.env.ILLUSION_REALM_API_URL || "http://127.0.0.1:8080/api/v1").replace(/\/+$/, "");
/** @typedef {import('./account-session').AccountSession} Session */
/** @typedef {import("../../../../../../packages/shared/src/types/account").AccountApiResponse} HttpResponse */
/** @typedef {{ session: Session | null, failure?: HttpResponse }} RefreshResult */
/** @type {{ token: string, promise: Promise<RefreshResult> } | null} */
let refreshing = null;

// 只有登录注册及其邮箱激活流程允许无账户调用，不按 /auth 前缀放行。
// refresh、logout 和未来新增的 auth 业务都需要已有账户会话。
// 路径必须精确匹配且方法必须为 POST，查询串或相似路径不能扩大匿名入口。
const PUBLIC_AUTH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/verify-email", "/auth/verification/resend"]);

function unauthenticated() { return { status: 401, body: { success: false, code: "UNAUTHENTICATED" } }; }
/** @param {Session} session */
function sameSession(session) { return sessionStore.readSession()?.sessionId === session.sessionId; }

/** @param {string} pathname @param {string} method @param {unknown} [body] @param {string} [token] @returns {Promise<HttpResponse>} */
async function callApi(pathname, method, body, token) {
  // 所有账户 HTTP 都在这里兜底，无凭据时连公开图库读取也不发网络请求。
  // 游客进入前已清除旧令牌，不能因遗留 accessToken 参数继续访问后端。
  // 无权限返回现有 401 契约，页面复用“请登录”提示，不影响本地游客状态。
  if (!sessionStore.readSession() && !(method === "POST" && PUBLIC_AUTH_PATHS.has(pathname))) return unauthenticated();
  const multipart = body instanceof FormData;
  const formFields = body instanceof URLSearchParams;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json", "X-Request-Id": require("crypto").randomUUID() };
  if (body !== undefined && !multipart) headers["Content-Type"] = formFields ? "application/x-www-form-urlencoded;charset=UTF-8" : "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method, headers, body: multipart || formFields ? body : body === undefined ? undefined : JSON.stringify(body),
      redirect: "error", signal: AbortSignal.timeout(multipart ? 120000 : 20000),
    });
    const parsed = await response.json().catch(() => null);
    return { status: response.status, body: parsed, retryAfter: response.headers.get("Retry-After"), requestId: response.headers.get("X-Request-Id") || undefined };
  } catch {
    return { status: 503, body: { success: false, code: "SERVICE_UNAVAILABLE" } };
  }
}

/** @param {unknown} body @returns {Session | null} */
function tokenData(body) {
  const data = body && typeof body === "object" && "data" in body ? body.data : null;
  if (!data || typeof data !== "object") return null;
  const value = /** @type {Record<string, unknown>} */ (data);
  if (!["accessToken", "refreshToken", "accessExpiresAt", "sessionExpiresAt", "sessionId"].every(key => typeof value[key] === "string")) return null;
  return { accessToken: String(value.accessToken), refreshToken: String(value.refreshToken), accessExpiresAt: String(value.accessExpiresAt), sessionExpiresAt: String(value.sessionExpiresAt), sessionId: String(value.sessionId) };
}

/** @param {Session} session @returns {Promise<RefreshResult>} */
async function refreshSession(session) {
  const current = /** @type {Session | null} */ (sessionStore.readSession());
  if (!current || current.sessionId !== session.sessionId) return { session: null };
  if (current.accessToken !== session.accessToken) return { session: current };
  if (refreshing?.token === session.refreshToken) return refreshing.promise;
  const promise = performRefresh(session);
  refreshing = { token: session.refreshToken, promise };
  try { return await promise; }
  finally { if (refreshing?.promise === promise) refreshing = null; }
}

/** @param {Session} session @returns {Promise<RefreshResult>} */
async function performRefresh(session) {
  const result = await callApi("/auth/refresh", "POST", { refreshToken: session.refreshToken });
  if (!sameSession(session)) return { session: null };
  const next = tokenData(result.body);
  if (result.status >= 200 && result.status < 300 && next) { sessionStore.writeSession(next); return { session: next }; }
  if (result.status === 401) sessionStore.clearSession();
  return { session: null, failure: result.status >= 400 ? result : { status: 502, body: { success: false, code: "INVALID_RESPONSE" } } };
}

/** @param {string} pathname @param {string} [method] @param {unknown} [body] @param {string} [expectedSessionId] */
async function authorized(pathname, method = "GET", body, expectedSessionId) {
  const session = /** @type {Session | null} */ (sessionStore.readSession());
  if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) return unauthenticated();
  let result = await callApi(pathname, method, body, session.accessToken);
  if (!sameSession(session)) return unauthenticated();
  if (result.status !== 401) return result;
  const refreshed = await refreshSession(session);
  const next = refreshed.session;
  if (!next) return refreshed.failure || unauthenticated();
  if (!sameSession(next)) return unauthenticated();
  result = await callApi(pathname, method, body, next.accessToken);
  return sameSession(next) ? result : unauthenticated();
}

/**
 * 公开指资源可见性，不再代表游客能向账户后端发请求。
 * 保留函数名兼容现有图库 handler，统一交给 authorized 检查凭据。
 * 未登录返回本地 401；正式账户仍可读取公开资源并复用令牌刷新。
 * @param {string} pathname 固定 handler 生成的图片或收藏夹路径。
 */
function optionalAccount(pathname) { return authorized(pathname); }
module.exports = { callApi, tokenData, authorized, optionalAccount, unauthenticated };
