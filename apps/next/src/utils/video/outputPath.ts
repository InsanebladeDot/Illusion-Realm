/**
 * 输出路径拼接：导出改为「选择输出文件夹 + 自动命名」后，
 * 页面只需要把文件夹与自动生成的文件名拼起来。
 */

/** 拼接输出文件夹与文件名（兼容 Windows 反斜杠与 POSIX 斜杠） */
export function joinOutputPath(folder: string | null | undefined, fileName: string): string {
  const safeName = fileName.trim();
  const base = (folder ?? "").trim();
  if (!base) return safeName;

  const separator = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${separator}${safeName}`;
}

/** Windows 文件名非法字符 */
const ILLEGAL_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * 规范化用户自定义的文件名：
 * - 去掉 Windows 非法字符与首尾空白
 * - 为空时回退到自动生成的名字
 * - 指定 requiredExtension 时强制该扩展名（如 GIF 必须是 .gif）
 * - 未写扩展名时补上默认扩展名
 */
export function normalizeOutputFileName(
  name: string,
  fallbackName: string,
  requiredExtension?: ".gif" | ".mp4" | ".mkv"
): string {
  const cleaned = (name ?? "").replace(ILLEGAL_FILE_NAME_CHARS, "_").trim();
  if (!cleaned) return fallbackName;

  const defaultExt = fallbackName.slice(fallbackName.lastIndexOf("."));
  const lower = cleaned.toLowerCase();

  if (requiredExtension) {
    if (!lower.endsWith(requiredExtension)) {
      const withoutExt = cleaned.replace(/\.[^./\\]{1,6}$/, "");
      return `${withoutExt || fallbackName.replace(/\.[^.]+$/, "")}${requiredExtension}`;
    }
    return cleaned;
  }

  return /\.[^./\\]{1,6}$/.test(cleaned) ? cleaned : `${cleaned}${defaultExt}`;
}
