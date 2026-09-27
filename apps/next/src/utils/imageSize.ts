/**
 * 图片尺寸的解析与约束（宽高、宽高比、尺寸预设）。
 *
 * 怎么做：常量（上下限 / 步进）+ 纯函数 `parseAspectRatio` / `resolveImageDimensions`
 * / `findImageSizePreset`。
 */
import {
  DEFAULT_ASPECT_RATIO,
  findImageSizePreset,
  type AspectRatioLabel,
} from "@/data/imageSizes";

/** 宽高上限：创建页开放到 1500（此前为 1000） */
export const IMAGE_SIZE_MAX = 1500;
/** 宽高下限 */
export const IMAGE_SIZE_MIN = 64;
/** 对齐步进（扩散模型要求 8 的倍数） */
export const IMAGE_SIZE_STEP = 8;

export type ImageSizeMode = "preset" | "custom";

export type ImageSizeInput = {
  mode: ImageSizeMode;
  aspectRatio: AspectRatioLabel | string;
  customWidth: number;
  customHeight: number;
};

export function parseAspectRatio(ratio: string): { w: number; h: number } {
  const parts = ratio.split(":").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    const fallback = findImageSizePreset(DEFAULT_ASPECT_RATIO)!;
    return { w: fallback.width, h: fallback.height };
  }
  return { w: parts[0], h: parts[1] };
}

/** 把数值夹取到 [MIN, MAX]；不足上限时对齐 8 像素，达到上限则保留上限值（1500） */
export function clampImageSide(value: number, max = IMAGE_SIZE_MAX): number {
  if (!Number.isFinite(value)) return IMAGE_SIZE_MIN;
  if (value >= max) return max;
  const snapped = Math.round(value / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
  return Math.max(IMAGE_SIZE_MIN, Math.min(max, snapped));
}

/**
 * 解析最终用于生成的宽高：
 * - preset：直接取该比例的训练友好分辨率（不再等比缩放，避免偏离模型训练分布）
 * - custom：用户自定义宽高，64–1500、对齐 8 像素
 */
export function resolveImageDimensions(input: ImageSizeInput): {
  width: number;
  height: number;
} {
  if (input.mode === "custom") {
    return {
      width: clampImageSide(input.customWidth),
      height: clampImageSide(input.customHeight),
    };
  }

  const preset = findImageSizePreset(input.aspectRatio);
  if (preset) {
    return { width: preset.width, height: preset.height };
  }

  const { w, h } = parseAspectRatio(String(input.aspectRatio));
  const presetFallback = findImageSizePreset(DEFAULT_ASPECT_RATIO)!;
  const scale = presetFallback.width / w;
  return {
    width: clampImageSide(presetFallback.width),
    height: clampImageSide(h * scale),
  };
}
