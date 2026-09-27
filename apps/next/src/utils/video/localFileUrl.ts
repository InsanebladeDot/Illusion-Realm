/**
 * 把本地绝对路径转成 `localfile://` 只读 URL（视频预览用，支持 HTTP Range）。
 *
 * 怎么做：只需 `encodeURIComponent` 拼 URL；协议解析在主进程 `appProtocol.js`。
 */
export function buildLocalFileUrl(
  absolutePath: string | null | undefined
): string | null {
  if (!absolutePath) return null;
  return `localfile://local/?path=${encodeURIComponent(absolutePath)}`;
}
