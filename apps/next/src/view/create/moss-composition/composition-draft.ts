/** Moss 构图草稿保存相对位置，预览与提交都在输出前换算成像素。 */
import { ANNOTATION_COLORS } from "@/view/infinite-canvas/canvas-annotations";

export interface CompositionRect { x: number; y: number; width: number; height: number }
export interface CompositionSize { width: number; height: number }
export interface CompositionPoint { x: number; y: number }
export const REGION_TYPES = ["character", "object", "text"] as const;
export type CompositionRegionType = typeof REGION_TYPES[number];
export interface CompositionRegion extends CompositionRect {
  id: string;
  kind: CompositionRegionType;
  caption: string;
  text: string;
  color: string;
}
export interface CompositionDraft {
  summary: string;
  regions: CompositionRegion[];
  base?: { path: string; name: string };
}

// 新框先分配彩色，黑白灰仍可手动选，也会在彩色用完后补上。
const REGION_COLORS = [...ANNOTATION_COLORS.slice(3), ...ANNOTATION_COLORS.slice(0, 3)];

/** 优先用画幅中还没用过的颜色。颜色跟着区域存，删除其他框时不会变。 */
export function nextRegionColor(regions: readonly CompositionRegion[]): string {
  const used = new Set(regions.map(region => region.color.toLowerCase()));
  return REGION_COLORS.find(color => !used.has(color)) ?? REGION_COLORS[regions.length % REGION_COLORS.length];
}

export const MIN_REGION_SIZE = 0.02;
export const clamp = (number: number, min = 0, max = 1) => Math.max(min, Math.min(max, number));

export function rectangleFromPoints(start: CompositionPoint, end: CompositionPoint): CompositionRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

/** 像把贴纸留在纸面上：拖动或拉伸时，框的边始终留在画幅范围内。 */
export function adjustRectangle(rect: CompositionRect, delta: CompositionPoint, resize: boolean): CompositionRect {
  if (resize) return {
    ...rect,
    width: clamp(rect.width + delta.x, MIN_REGION_SIZE, 1 - rect.x),
    height: clamp(rect.height + delta.y, MIN_REGION_SIZE, 1 - rect.y),
  };
  return { ...rect, x: clamp(rect.x + delta.x, 0, 1 - rect.width), y: clamp(rect.y + delta.y, 0, 1 - rect.height) };
}

/** 和画框原型的顺序一致：从画面中心算上、左、下、右，外侧取整保留边缘。 */
export function serializeMossComposition(draft: CompositionDraft, size: CompositionSize): string {
  const offset = (value: number, length: number, round: (value: number) => number) => {
    const pixels = value * length;
    const integer = Math.round(pixels);
    // 导入再导出时消除小数误差，避免整数边缘被 floor 或 ceil 多算一像素。
    return (Math.abs(pixels - integer) < 1e-7 ? integer : round(pixels)) - Math.floor(length / 2);
  };
  const items = draft.regions.map(region => ({
    label: region.kind,
    caption: region.caption.trim(),
    ...(region.kind === "text" ? { text: region.text } : {}),
    bbox: [
      offset(region.y, size.height, Math.floor),
      offset(region.x, size.width, Math.floor),
      offset(region.y + region.height, size.height, Math.ceil),
      offset(region.x + region.width, size.width, Math.ceil),
    ],
  }));
  // 底图只负责描框，提交的 Moss 正向提示词只包含模型支持的字段。
  return JSON.stringify({ summary: { caption: draft.summary.trim() }, items, bbox_coord_space: "abs_centralized", bbox_format: "yxyx" });
}
