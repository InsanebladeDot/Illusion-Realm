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

function envelope(response: AccountApiResponse): AccountEnvelope {
  return response.body && typeof response.body === "object" ? response.body as AccountEnvelope : {};
}
export function assertResponse(response: AccountApiResponse): AccountEnvelope {
  const body = envelope(response);
  if (response.status < 200 || response.status >= 300 || body.success !== true) throw new AccountApiError(body.code || "HTTP_ERROR", response.status, body.message, response);
  return body;
}
async function browserRequest(pathname: string, method: string, body?: unknown): Promise<AccountApiResponse> {
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
  if (typeof window === "undefined" || !window.electronAPI?.accountLogin) {
    const body = await browserRequest("/auth/login", "POST", request); const result = assertResponse(body); const data = result.data;
    if (data && typeof data === "object" && "accessToken" in data && "refreshToken" in data) browserTokens = { accessToken: String(data.accessToken), refreshToken: String(data.refreshToken) };
    return result;
  }
  return call("accountLogin", "/auth/login", "POST", request);
}
export function getAccountProfile() { return call("accountMe", "/account/me", "GET"); }
export async function logoutAccount() { const result = await call("accountLogout", "/auth/logout", "POST"); browserTokens = null; return result; }
