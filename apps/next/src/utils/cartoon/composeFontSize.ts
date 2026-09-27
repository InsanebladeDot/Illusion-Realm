/**
 * 合成页字号：编辑预览与导出之间的换算。
 * fontSize 表示预览画布上的 CSS 像素，不随对话框素材缩放变化。
 */
export function resolveComposeFontSize(
  fontSize: number,
  exportCanvasWidth: number,
  previewCanvasWidth?: number
): number {
  if (!previewCanvasWidth || previewCanvasWidth <= 0) return fontSize;
  return fontSize * (exportCanvasWidth / previewCanvasWidth);
}
