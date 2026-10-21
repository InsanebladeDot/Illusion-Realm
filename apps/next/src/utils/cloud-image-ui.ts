/** 云端图片页面的错误提示与重试时间：只显示已知错误文案，不把后端内部异常直接展示给用户。 */
import { AccountApiError } from "@/api/account";
import type { MessageKey } from "@/i18n";
import { INPUT_BORDER_CLASS, PRIMARY_BUTTON_CLASS } from "./layout";

export const CLOUD_INPUT_CLASS = `${INPUT_BORDER_CLASS} min-w-0 w-full rounded-md bg-background px-3 py-2 text-sm disabled:opacity-50`;
export const CLOUD_BUTTON_CLASS = `${PRIMARY_BUTTON_CLASS} inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50`;
const ERROR_KEYS: Record<string, MessageKey> = {
  INVALID_PNG: "profile.cloud.error.invalidPng", INVALID_ARGUMENT: "profile.cloud.error.invalid",
  UNAUTHENTICATED: "profile.cloud.error.unauthenticated", QUOTA_EXCEEDED: "profile.cloud.error.quota",
  REVISION_CONFLICT: "profile.cloud.error.conflict", RATE_LIMITED: "profile.cloud.error.rate",
  STORAGE_REJECTED: "profile.cloud.error.storage", SERVICE_UNAVAILABLE: "profile.cloud.error.service",
  NETWORK_ERROR: "profile.cloud.error.service", NOT_FOUND: "profile.cloud.error.notFound", INVALID_RESPONSE: "profile.cloud.error.response",
};
export function cloudErrorKey(error: unknown): MessageKey {
  if (error instanceof Error && "code" in error && typeof error.code === "string") return ERROR_KEYS[error.code] || "profile.cloud.error.generic";
  return "profile.cloud.error.generic";
}
export function cloudRetrySeconds(error: unknown): number {
  if (!(error instanceof AccountApiError)) return 0;
  const value = error.retryAfter;
  if (!value) return error.status === 429 ? 60 : 0;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 86400)) : 0;
}
