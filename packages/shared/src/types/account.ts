/** 主进程转发账户 API 的脱敏 HTTP 响应；令牌不会回到渲染进程。 */
export interface AccountApiResponse {
  status: number;
  body: unknown;
  retryAfter?: string | null;
  requestId?: string;
}
