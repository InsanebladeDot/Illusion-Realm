/**
 * 图片尺寸预设（任务要求：按模型训练时常见分辨率给比例，而不是单纯按比例算长边）
 *
 * 取值来自 SDXL 系列模型的训练分桶（1024² 面积、长边 ≤ 1344），
 * 这一组分辨率与模型训练分布最接近，出图质量与稳定性明显优于任意等比缩放：
 * https://stablediffusionxl.com/sdxl-resolutions-and-aspect-ratios/
 * https://github.com/utopic-dev/ostris_ai-toolkit/blob/main/toolkit/buckets.py
 */

export type ImageSizePreset = {
  /** 比例标签，同时用作持久化标识（如 "2:3"） */
  id: string;
  label: string;
  width: number;
  height: number;
  /** 适用场景说明（帮助用户理解为什么是这组数值） */
  note: string;
};

export const IMAGE_SIZE_PRESETS: readonly ImageSizePreset[] = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024, note: "头像 / 方图" },
  { id: "2:3", label: "2:3", width: 832, height: 1216, note: "竖版插画" },
  { id: "3:2", label: "3:2", width: 1216, height: 832, note: "横版插画" },
  { id: "3:4", label: "3:4", width: 896, height: 1152, note: "竖版人像 · Anima 默认" },
  { id: "4:3", label: "4:3", width: 1152, height: 896, note: "横版人像" },
  { id: "5:6", label: "5:6", width: 1000, height: 1200, note: "竖版人像 · SDXL 默认" },
  { id: "9:16", label: "9:16", width: 768, height: 1344, note: "手机竖屏" },
  { id: "16:9", label: "16:9", width: 1344, height: 768, note: "宽屏横图" },
] as const;

export type AspectRatioLabel = (typeof IMAGE_SIZE_PRESETS)[number]["id"];

export const DEFAULT_ASPECT_RATIO: AspectRatioLabel = "2:3";

export function findImageSizePreset(
  id: string | null | undefined
): ImageSizePreset | undefined {
  return IMAGE_SIZE_PRESETS.find((preset) => preset.id === id);
}

/** 按尺寸反查预设（切换模型系列时用来套用该系列基础工作流的默认尺寸） */
export function findImageSizePresetBySize(
  width: number,
  height: number
): ImageSizePreset | undefined {
  return IMAGE_SIZE_PRESETS.find(
    (preset) => preset.width === width && preset.height === height
  );
}

export function isAspectRatioLabel(value: unknown): value is AspectRatioLabel {
  return typeof value === "string" && IMAGE_SIZE_PRESETS.some((p) => p.id === value);
}

/** 新增比例时只需改 IMAGE_SIZE_PRESETS；旧的持久化值由这里兜底 */
export function sanitizeAspectRatio(value: unknown): AspectRatioLabel {
  return isAspectRatioLabel(value) ? value : DEFAULT_ASPECT_RATIO;
}
