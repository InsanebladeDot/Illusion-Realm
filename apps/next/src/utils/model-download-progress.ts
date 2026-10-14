/** Format streamed download byte counts and estimate remaining time from the main-process speed sample. */
import type { ModelDownloadTask } from "@illusion-realm/shared";
export function downloadBytes(value: number): string {
  const bytes = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
export function downloadRemainingSeconds(task: ModelDownloadTask): number | null {
  const speed = task.bytesPerSecond ?? 0;
  return speed > 0 && task.total > task.received ? Math.ceil((task.total - task.received) / speed) : null;
}
