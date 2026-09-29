/**
 * 把本地绝对路径转成 `localfile://` 只读 URL，供媒体元素按需读取文件。
 * 路径只放在查询参数里并整体编码，实际文件读取与 MIME 判定由 Electron 协议处理。
 */
export function buildLocalFileUrl(
  absolutePath: string | null | undefined
): string | null {
  if (!absolutePath) return null;
  return `localfile://local/?path=${encodeURIComponent(absolutePath)}`;
}
