/**
 * 校验本地游客有效期：期限固定为开始后的 1 小时，刷新和路由切换不能续期。
 * 同时拒绝非法数值、未来开始时间及被延长的截止时间；此记录只控制界面入口。
 */
import { GUEST_SESSION_DURATION_MS, type GuestSession } from "@/types/guest-session";

export function readGuestSession(value: unknown): GuestSession | null {
  if (!value || typeof value !== "object" || !("startedAt" in value) || !("expiresAt" in value)) return null;
  const { startedAt, expiresAt } = value;
  if (typeof startedAt !== "number" || typeof expiresAt !== "number" || !Number.isSafeInteger(startedAt) || !Number.isSafeInteger(expiresAt)
    || startedAt < 0 || expiresAt !== startedAt + GUEST_SESSION_DURATION_MS) return null;
  return { startedAt, expiresAt };
}

export function isGuestSessionActive(session: GuestSession | null, now = Date.now()): session is GuestSession {
  return Boolean(session && now >= session.startedAt && now < session.expiresAt);
}

export function createGuestSession(now = Date.now()): GuestSession {
  return { startedAt: now, expiresAt: now + GUEST_SESSION_DURATION_MS };
}
