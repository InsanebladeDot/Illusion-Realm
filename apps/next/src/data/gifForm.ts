/**
 * GIF 制作参数（任务规范：固定参数与限制规则集中到 data 配置，禁止 UI 硬编码魔法数字）
 */

/** 用户可选的每秒帧数，推荐值见 RECOMMENDED_GIF_FPS */
export const GIF_FPS_OPTIONS = [1, 5, 10, 20, 30, 60, 120] as const;

/** 帧率允许范围（可自定义输入，但不得超过 120） */
export const GIF_FPS_MIN = 1;
export const GIF_FPS_MAX = 120;

/** 推荐帧率（默认选中） */
export const RECOMMENDED_GIF_FPS = 20;

/** 默认帧率 */
export const DEFAULT_GIF_FPS = RECOMMENDED_GIF_FPS;

/** 宽度滑块的步长（GIF 尺寸取偶数更稳妥） */
export const GIF_WIDTH_STEP = 2;

/** 宽度下限（像素） */
export const GIF_MIN_WIDTH = 32;

/** 源分辨率大于该值时的默认输出宽度（避免默认生成超大 GIF，可再手动拉满） */
export const DEFAULT_GIF_MAX_WIDTH = 480;

/** 超过该帧率且宽度较大时提示体积风险 */
export const GIF_SIZE_WARNING_FPS = 60;
export const GIF_SIZE_WARNING_WIDTH = 640;

/** 目标宽度夹取：不超过源分辨率，且不小于下限、保持偶数 */
export function clampGifWidth(width: number, sourceWidth: number): number {
  const max = Math.max(GIF_MIN_WIDTH, toEven(sourceWidth || GIF_MIN_WIDTH));
  const value = Math.round(Number(width) || max);
  return Math.min(max, Math.max(GIF_MIN_WIDTH, toEven(value)));
}

/** 等比缩放后的高度（始终为偶数，与 ffmpeg `scale=W:-2` 一致） */
export function gifOutputHeight(
  width: number,
  sourceWidth: number,
  sourceHeight: number
): number {
  if (sourceWidth <= 0 || sourceHeight <= 0) return 0;
  const ratio = sourceHeight / sourceWidth;
  return Math.max(2, toEven(width * ratio));
}

function toEven(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}
