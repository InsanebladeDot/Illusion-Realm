/**
 * 账户 API 客户端：Electron 通过主进程请求以避开跨域并隐藏令牌；浏览器开发预览
 * 使用同一套 JSON 契约，令牌仅留在当前内存，不写 localStorage、Cookie 或用户文档。
 */
import type { AccountApiResponse, IpcResult } from "@illusion-realm/shared";
import { unwrapIpc } from "@/utils/ipcResult";

export interface AccountEnvelope { success?: boolean; code?: string; message?: string; data?: unknown; requestId?: string }
export class AccountApiError extends Error {
  readonly code: string; readonly status: number;
  readonly retryAfter?: string | null; readonly requestId?: string;
  constructor(code: string, status: number, message?: string, response?: AccountApiResponse) {
    super(message || code); this.code = code; this.status = status;
    this.retryAfter = response?.retryAfter;
    this.requestId = response ? envelope(response).requestId || response.requestId : undefined;
  }
}

const baseUrl = (process.env.NEXT_PUBLIC_ACCOUNT_API_URL || "/api/v1").replace(/\/+$/, "");
let browserTokens: { accessToken: string; refreshToken: string } | null = null;
// 浏览器预览也区分身份操作的先后，迟到的登录不能覆盖新的游客选择。
// 与主进程的 revision 分别生效，不把 renderer 计数当服务器授权依据。
// 不落盘，刷新后只从当前进程的凭据恢复逻辑开始。
let browserEntryRevision = 0;
// 浏览器预览与 Electron 使用相同的匿名入口白名单，防止预览模式漏发业务请求。
// 邮箱验证属于注册闭环；账户刷新和注销不作为匿名接口开放。
// 仅精确路径配合 POST 放行，不允许用相同前缀绕过检查。
const PUBLIC_AUTH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/verify-email", "/auth/verification/resend"]);

/**
 * 进入和恢复游客均先撤销客户端账户凭据，全程不调用后端注销接口。
 * Electron 等待主进程完成清理，失败抛给游客 store，页面不会提前放行。
 * 普通浏览器仅清理内存中的令牌，不访问 localStorage 或用户文件。
 * 本函数不会创建账户资料，游客仍由本地 entrySession 单独表示。
 * 不接收用户参数，不能用它指定或读取任意会话文件。
 * 恢复时重复调用是幂等的，已无凭据时直接成功。
 */
export async function clearAccountForGuest(): Promise<void> {
  // 进入动作一开始就撤销旧登录意图，不等待 IPC 完成才处理迟到响应。
  // 本地清理结果仍需等待；清理失败时游客 store 会保留登录入口。
  // 不影响已经成功建立的正式账号，除非用户明确选择进入游客。
  browserEntryRevision++;
  if (typeof window !== "undefined" && window.electronAPI) unwrapIpc(await window.electronAPI.accountEnterGuest());
  browserTokens = null;
}

function envelope(response: AccountApiResponse): AccountEnvelope {
  return response.body && typeof response.body === "object" ? response.body as AccountEnvelope : {};
}
export function assertResponse(response: AccountApiResponse): AccountEnvelope {
  const body = envelope(response);
  if (response.status < 200 || response.status >= 300 || body.success !== true) throw new AccountApiError(body.code || "HTTP_ERROR", response.status, body.message, response);
  return body;
}
async function browserRequest(pathname: string, method: string, body?: unknown): Promise<AccountApiResponse> {
  // 检查发生在 fetch 前，不能通过省略 Authorization 仍然发出公开业务请求。
  // 保持已有 HTTP 响应形状，assertResponse 会生成可提示登录的 AccountApiError。
  // 本地 ComfyUI、Civitai 和用户自配生成服务不经过此账户客户端。
  if (!browserTokens && !(method === "POST" && PUBLIC_AUTH_PATHS.has(pathname))) return { status: 401, body: { success: false, code: "UNAUTHENTICATED" } };
  const headers: Record<string, string> = { Accept: "application/json", "X-Request-Id": `web-${Date.now().toString(36)}` };
  const multipart = body instanceof FormData;
  const formFields = body instanceof URLSearchParams;
  if (body !== undefined && !multipart) headers["Content-Type"] = formFields ? "application/x-www-form-urlencoded;charset=UTF-8" : "application/json";
  if (browserTokens && pathname !== "/auth/login" && pathname !== "/auth/refresh") headers.Authorization = `Bearer ${browserTokens.accessToken}`;
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: multipart || formFields ? body : body === undefined ? undefined : JSON.stringify(body), credentials: "omit", redirect: "error", signal: AbortSignal.timeout(multipart ? 120000 : 20000) });
    return { status: response.status, body: await response.json().catch(() => null), retryAfter: response.headers.get("Retry-After") };
  } catch { throw new AccountApiError("NETWORK_ERROR", 0); }
}

let browserRefresh: Promise<void> | null = null;
/** 浏览器预览共用内存令牌；刷新轮换时并发请求等待同一个结果。 */
export async function browserAuthorizedRequest(pathname: string, method = "GET", body?: unknown): Promise<AccountApiResponse> {
  const original = browserTokens;
  let result = await browserRequest(pathname, method, body);
  if (result.status !== 401 || !original || browserTokens !== original) return result;
  if (!browserRefresh) browserRefresh = refreshBrowserSession(original).finally(() => { browserRefresh = null; });
  await browserRefresh;
  if (browserTokens) result = await browserRequest(pathname, method, body);
  return result;
}
async function refreshBrowserSession(original: NonNullable<typeof browserTokens>) {
  const result = await browserRequest("/auth/refresh", "POST", { refreshToken: original.refreshToken });
  if (browserTokens !== original) return;
  const data = envelope(result).data;
  if (result.status === 200 && data && typeof data === "object" && "accessToken" in data && "refreshToken" in data) {
    browserTokens = { accessToken: String(data.accessToken), refreshToken: String(data.refreshToken) };
  } else if (result.status === 401) browserTokens = null;
}
type AccountChannel = "accountRegister" | "accountVerifyEmail" | "accountResendVerification" | "accountLogin" | "accountMe" | "accountLogout";
async function call(channel: AccountChannel, pathname: string, method: string, body?: unknown): Promise<AccountEnvelope> {
  if (typeof window !== "undefined" && window.electronAPI?.[channel]) {
    const invoke = window.electronAPI[channel] as unknown as (value?: unknown) => Promise<IpcResult<AccountApiResponse>>;
    const result = unwrapIpc(await invoke(body));
    return assertResponse(result);
  }
  return assertResponse(await browserRequest(pathname, method, body));
}
export function registerAccount(request: { email: string; password: string; displayName: string }) { return call("accountRegister", "/auth/register", "POST", request); }
export function verifyEmail(token: string) {
  if (typeof window !== "undefined" && window.electronAPI?.accountVerifyEmail) return call("accountVerifyEmail", "/auth/verify-email", "POST", token);
  return browserRequest("/auth/verify-email", "POST", { token }).then(assertResponse);
}
export function resendVerification(email: string) {
  if (typeof window !== "undefined" && window.electronAPI?.accountResendVerification) return call("accountResendVerification", "/auth/verification/resend", "POST", email);
  return browserRequest("/auth/verification/resend", "POST", { email }).then(assertResponse);
}
export async function loginAccount(request: { email: string; password: string; deviceName: string }) {
  // 两种运行环境都记录最新显式登录，主进程另外验证自身的操作顺序。
  // 预览分支不能只在请求发出时检查，否则游客切换后迟到结果会写回 token。
  // 新的登录操作可覆盖旧意图，用户仍能从游客模式正常登录。
  const revision = ++browserEntryRevision;
  if (typeof window === "undefined" || !window.electronAPI?.accountLogin) {
    const body = await browserRequest("/auth/login", "POST", request); const result = assertResponse(body); const data = result.data;
    // 在解析成功后、写入内存令牌前验证顺序；业务失败仍按原契约显示错误。
    // 旧成功不能触发正式账户资料读取，也不能解除游客的后端访问限制。
    // 不把过期响应当作网络故障重试，避免后台再次自动登录。
    if (revision !== browserEntryRevision) throw new AccountApiError("UNAUTHENTICATED", 401);
    if (data && typeof data === "object" && "accessToken" in data && "refreshToken" in data) browserTokens = { accessToken: String(data.accessToken), refreshToken: String(data.refreshToken) };
    return result;
  }
  return call("accountLogin", "/auth/login", "POST", request);
}
export function getAccountProfile() { return call("accountMe", "/account/me", "GET"); }
export async function logoutAccount() { const result = await call("accountLogout", "/auth/logout", "POST"); browserTokens = null; return result; }
