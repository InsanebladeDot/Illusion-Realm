/** 读取 Moss 工作流 JSON。校验边界后，把像素位置还原成画幅内的比例。 */
import { nextRegionColor, REGION_TYPES, type CompositionDraft, type CompositionRegionType, type CompositionSize } from "./composition-draft";

type BoundingBox = [top: number, left: number, bottom: number, right: number];
interface MossItem {
  label: CompositionRegionType;
  caption: string;
  bbox: BoundingBox;
  text?: string;
}
interface MossComposition {
  summary: { caption: string };
  items: MossItem[];
  bbox_coord_space: "abs_centralized";
  bbox_format: "yxyx";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isValidBox(value: unknown, { width, height }: CompositionSize): value is BoundingBox {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isInteger)) return false;
  const [top, left, bottom, right] = value;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  return top < bottom && left < right && top >= -centerY && left >= -centerX
    && bottom <= height - centerY && right <= width - centerX;
}

function parseItem(value: unknown, size: CompositionSize): MossItem | null {
  const item = asRecord(value);
  if (!item || typeof item.caption !== "string" || !isValidBox(item.bbox, size)) return null;
  const label = REGION_TYPES.find(type => type === item.label);
  if (!label) return null;
  const { caption, bbox, text } = item;
  if (label === "text") {
    return typeof text === "string" && text.trim() && Object.keys(item).length === 4
      ? { label, caption, text, bbox }
      : null;
  }
  return Object.keys(item).length === 3 ? { label, caption, bbox } : null;
}

/** 不裁剪越界的框，避免把错误坐标当成用户选好的位置。 */
export function parseMossComposition(text: string, size: CompositionSize): MossComposition | null {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return null; }
  const result = asRecord(value);
  if (!result || Object.keys(result).length !== 4
    || result.bbox_coord_space !== "abs_centralized" || result.bbox_format !== "yxyx") return null;
  const summary = asRecord(result.summary);
  if (!summary || Object.keys(summary).length !== 1 || typeof summary.caption !== "string" || !Array.isArray(result.items)) return null;
  const items: MossItem[] = [];
  for (const value of result.items) {
    const item = parseItem(value, size);
    if (!item) return null;
    items.push(item);
  }
  return { summary: { caption: summary.caption }, items, bbox_coord_space: "abs_centralized", bbox_format: "yxyx" };
}

/** 像把原点从纸中心移回左上角，再除以纸的宽高，画框随预览尺寸缩放。 */
export function deserializeMossComposition(text: string, size: CompositionSize): CompositionDraft | null {
  const parsed = parseMossComposition(text, size);
  if (!parsed) return null;
  const { width, height } = size;
  const regions: CompositionDraft["regions"] = [];
  for (const item of parsed.items) {
    const [top, left, bottom, right] = item.bbox;
    regions.push({
      id: crypto.randomUUID(),
      kind: item.label,
      caption: item.caption,
      text: item.text ?? "",
      color: nextRegionColor(regions),
      x: (left + Math.floor(width / 2)) / width,
      y: (top + Math.floor(height / 2)) / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    });
  }
  return { summary: parsed.summary.caption, regions };
}
