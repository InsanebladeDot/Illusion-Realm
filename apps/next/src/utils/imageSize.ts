/**
 * 图片尺寸的解析与约束（宽高、宽高比、尺寸预设）。
 *
 * 怎么做：只保留有效最小边长与步进，不设置图片分辨率的业务上限。
 */
import {
  DEFAULT_ASPECT_RATIO,
  findImageSizePreset,
  type AspectRatioLabel,
} from "@/data/imageSizes";

// 图片与视频像不同尺寸的画框，视频的上限不能套到图片上。
// 图片只保留一个对齐单元，防止空输入产生零尺寸或负尺寸。
// 具体可生成多大由模型和设备决定，客户端不再截断为 1500。
export const IMAGE_SIZE_MIN = 8;
/** 对齐步进（扩散模型要求 8 的倍数） */
export const IMAGE_SIZE_STEP = 8;

export type ImageSizeMode = "preset" | "custom";

export type ImageSizeInput = {
  mode: ImageSizeMode;
  aspectRatio: AspectRatioLabel | string;
  customWidth: number;
  customHeight: number;
  /** 原始尺寸的缩放倍率；旧表单未保存时按 1 处理。 */
  scale?: number;
};

/** 图片、视频尺寸选择器统一返回这个结构；width/height 是选择器算出的最终宽高。 */
export interface ImageSizeSelection extends ImageSizeInput {
  scale: number;
  width: number;
  height: number;
}

// 倍率是尺子的刻度，像素是量出的长度；两者不能都取成整数。
// 例如 1.5 倍必须保留 1.5，实际宽高再交给各自的像素对齐函数。
// 一位小数在确认入口统一处理，不能只把界面文字四舍五入。
// 否则标签显示 1.3，提交却使用 1.26，用户会看到另一种尺寸。
// 图片允许放大，不再把合法的 2.0、3.1 倍截回 1.0。
// max 是适配层的业务约束；视频显式传 1，保持已有缩小范围。
// 不传 max 时只保留 0.1 的下界，兼容已有的小倍率和图片自由尺寸。
// 缺失字段仍是 1 倍，所以旧用户文档无需迁移或新增版本。
// 非有限值不能用来计算像素，恢复损坏草稿时同样回到默认值。
// 该函数同时用于选择器、生成参数与 store 水合，避免重启后倍率不同。
// 规范化不修改原始宽高，多次换倍率不会叠乘上次输出。
// 返回值仍是 number，不把带单位的显示文字写进用户文档。
export function clampSizeScale(value: number | undefined, max = Infinity): number {
  const scale = typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(1)) : 1;
  return Math.min(max, Math.max(0.1, scale));
}

export function createSizeSelection(input: ImageSizeInput): ImageSizeSelection {
  const scale = clampSizeScale(input.scale);
  return { ...input, scale, ...resolveImageDimensions({ ...input, scale }) };
}

export function parseAspectRatio(ratio: string): { w: number; h: number } {
  const parts = ratio.split(":").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    const fallback = findImageSizePreset(DEFAULT_ASPECT_RATIO)!;
    return { w: fallback.width, h: fallback.height };
  }
  return { w: parts[0], h: parts[1] };
}

// 只做扩散工作流需要的 8 像素对齐，不借用 H3 的 32 像素步进。
// NaN、Infinity 不是可发送的尺寸，继续回落最小有效边长。
// 大于旧上限的正常整数会保留，而不是偷偷变回 1500。
// 缩放和持久化水合共用此入口，避免输入放开但重启后又被截断。
// 调用方不能传入另一个隐藏上限，图片约束只在这里定义。
export function clampImageSide(value: number): number {
  if (!Number.isFinite(value)) return IMAGE_SIZE_MIN;
  const snapped = Math.round(value / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
  // 对齐可能略微改变用户输入，但不改变宽高比例预设或生成倍率。
  // 例如 1500 现在对齐成 1504，不再为旧上限留下非对齐特例。
  // 小于一个单元的值回到 8，避免非法 latent 尺寸进入工作流。
  return Math.max(IMAGE_SIZE_MIN, snapped);
}

/**
 * 解析最终用于生成的宽高：
 * - preset：直接取该比例的训练友好分辨率（不再等比缩放，避免偏离模型训练分布）
 * - custom：用户自定义宽高，无业务上限、对齐 8 像素
 */
function resolveBaseImageDimensions(input: ImageSizeInput): {
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

/** 两个创建模式复用同一算法；每次从原始尺寸缩放，不累计乘上次的结果。 */
export function resolveImageDimensions(input: ImageSizeInput): { width: number; height: number } {
  const base = resolveBaseImageDimensions(input);
  const scale = clampSizeScale(input.scale);
  if (scale === 1) return base;
  return { width: clampImageSide(base.width * scale), height: clampImageSide(base.height * scale) };
}
