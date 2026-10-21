/** 账户 HTTP 通道：JSON 与原始文件共用令牌刷新；并发刷新合并，切换账户后拒绝旧请求。 */
const sessionStore = require("./account-session");
const BASE_URL = (process.env.ILLUSION_REALM_API_URL || "http://127.0.0.1:8080/api/v1").replace(/\/+$/, "");
/** @typedef {import('./account-session').AccountSession} Session */
/** @typedef {import('../../packages/shared/src/types/account').AccountApiResponse} HttpResponse */
/** @typedef {{ session: Session | null, failure?: HttpResponse }} RefreshResult */
/** @type {{ token: string, promise: Promise<RefreshResult> } | null} */
let refreshing = null;

function unauthenticated() { return { status: 401, body: { success: false, code: "UNAUTHENTICATED" } }; }
/** @param {Session} session */
function sameSession(session) { return sessionStore.readSession()?.sessionId === session.sessionId; }

/** @param {string} pathname @param {string} method @param {unknown} [body] @param {string} [token] @returns {Promise<HttpResponse>} */
async function callApi(pathname, method, body, token) {
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

/** 公开图片和公开收藏夹允许游客读取；有会话时复用刷新逻辑。 @param {string} pathname */
function optionalAccount(pathname) { return sessionStore.readSession() ? authorized(pathname) : callApi(pathname, "GET"); }
module.exports = { callApi, tokenData, authorized, optionalAccount, unauthenticated };
