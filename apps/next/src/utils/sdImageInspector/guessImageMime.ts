/**
 * 按扩展名猜 MIME（解析 / 预览前用）。
 *
 * 怎么做：扩展名 → MIME 映射表，并导出「可解析的扩展名清单」供文件选择框与校验共用。
 */
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};

export function guessImageMimeType(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_MIME[ext] ?? null;
}

export const INSPECTABLE_IMAGE_EXTENSIONS = Object.keys(EXT_MIME);
