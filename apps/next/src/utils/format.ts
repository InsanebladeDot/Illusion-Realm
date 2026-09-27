/** 通用格式化工具（跨模块复用，勿放业务专有逻辑） */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k))
  );
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${units[index]}`;
}
