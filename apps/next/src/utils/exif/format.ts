/** 通用格式化与命名工具 */
import { formatBytes } from "@/utils/format";

export { formatBytes };

export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex + 1) : "png";
}

/** 按「前缀 + 数字 + 原扩展名」生成重命名后的文件名 */
export function buildRenamedName(
  originalName: string,
  prefix: string,
  sequence: number
): string {
  const safeSequence = sequence > 0 ? sequence : 1;
  return `${prefix}${safeSequence}.${getFileExtension(originalName)}`;
}
