// 标注更新只生成新数组，不改原对象；复制节点和撤销快照因此可以安全共用旧值。
import type { CanvasData } from "./canvas-model";

export type CanvasAnnotation = NonNullable<CanvasData["annotations"]>[number];
export const MAX_CANVAS_ANNOTATIONS = 8;
export const ANNOTATION_COLORS = ["#27272a", "#f4f4f5", "#71717a", "#ef4444", "#f97316", "#fde047", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899"] as const;

/** 满额只阻止新建；原有标注仍能改字、换色，不通过截断数组丢掉第八项。 */
export function saveCanvasAnnotation(values: CanvasData["annotations"], annotation: CanvasAnnotation) {
  const list = values ?? [];
  if (!annotation.text.trim() || annotation.text.length > 80 || !/^#[0-9a-f]{6}$/i.test(annotation.color)) return null;
  const exists = list.some(item => item.id === annotation.id);
  if (!exists && list.length >= MAX_CANVAS_ANNOTATIONS) return null;
  const value = { ...annotation, text: annotation.text.trim() };
  return exists ? list.map(item => item.id === annotation.id ? value : item) : [...list, value];
}

/** 根据实际纸色选黑或白字，不能让用户选白色牌子后得到白字。 */
export function annotationInk(color: string) {
  const rgb = color.slice(1).match(/.{2}/g)?.map(value => Number.parseInt(value, 16) / 255) ?? [];
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 > 0.179 ? "#18181b" : "#ffffff";
}
