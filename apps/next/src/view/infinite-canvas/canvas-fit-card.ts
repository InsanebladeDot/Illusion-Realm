/** 只调整相框，不改源文件和生成分辨率；极端长图用完整显示兜底。 */
export function fitCanvasCard(width: number, height: number, currentWidth = 502) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  const ratio = width / height;
  const fittedWidth = Math.max(160, Math.min(1200, currentWidth, 900 * ratio));
  return { style: "fit" as const, width: Math.round(fittedWidth), height: Math.max(100, Math.min(900, Math.round(fittedWidth / ratio))) };
}

/** 音频没有画面比例，按波形和播放栏所需高度收起留白；宽度保留用户选择。 */
export function fitCanvasAudioCard(currentWidth = 284) {
  return { style: "fit" as const, width: Math.max(284, Math.min(1200, currentWidth)), height: 184 };
}
