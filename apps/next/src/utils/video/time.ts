/** 时间格式化与解析（视频剪辑用） */

/** 秒 → "MM:SS" 或 "HH:MM:SS"（可选毫秒） */
export function formatTime(seconds: number, withMilliseconds = false): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const base =
    hours > 0 ? `${String(hours).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;

  return withMilliseconds ? `${base}.${String(ms).padStart(3, "0")}` : base;
}

/** 解析 "12.5" / "1:23" / "0:01:23.4" 为秒；非法返回 null */
export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length === 0 || parts.length > 3) return null;
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;

  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** 把秒数夹取到 [min, max] */
export function clampSeconds(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
