/**
 * 素材「可写文字区域」的解析与命中判定。
 *
 * 怎么做：内置素材按尺寸比例给默认内边距（12%），自定义素材读自身 `textArea`；
 * 命中 / 归一化 / 换算全是纯函数。
 */
import type { CartoonBubbleAsset, CartoonTextArea } from "@/types/cartoonBubble";

/** 内置素材默认文字区域内边距（相对素材尺寸） */
const BUILTIN_TEXT_INSET = 0.12;

export function getAssetTextArea(asset: CartoonBubbleAsset): CartoonTextArea {
  if (asset.textArea) return asset.textArea;

  return {
    x: BUILTIN_TEXT_INSET,
    y: BUILTIN_TEXT_INSET,
    width: 1 - BUILTIN_TEXT_INSET * 2,
    height: 1 - BUILTIN_TEXT_INSET * 2,
  };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeTextArea(area: CartoonTextArea): CartoonTextArea {
  const x = clamp01(area.x);
  const y = clamp01(area.y);
  const width = clamp01(Math.min(area.width, 1 - x));
  const height = clamp01(Math.min(area.height, 1 - y));
  return { x, y, width, height };
}

export function pointInTextArea(
  area: CartoonTextArea,
  relX: number,
  relY: number
): boolean {
  return (
    relX >= area.x &&
    relX <= area.x + area.width &&
    relY >= area.y &&
    relY <= area.y + area.height
  );
}

/** 将点击坐标（相对素材 0–1）转换为文字块在文字区域内的相对坐标 */
export function toTextBlockPosition(
  asset: CartoonBubbleAsset,
  relX: number,
  relY: number
): { x: number; y: number } {
  const area = getAssetTextArea(asset);
  const localX = clamp01((relX - area.x) / Math.max(area.width, 0.001));
  const localY = clamp01((relY - area.y) / Math.max(area.height, 0.001));
  return { x: localX, y: localY };
}
