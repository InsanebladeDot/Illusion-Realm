/**
 * 文字条目的默认值与归一化（字体 / 字号 / 行高 / 描边 / 对齐…）。
 *
 * 怎么做：纯函数补默认值 + 常量集中定义，读写盘两侧共用同一套规则。
 */
import {
  DEFAULT_CARTOON_FONT,
  DEFAULT_COMPOSE_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
} from "@/data/cartoonFonts";
import type {
  CartoonComposeTextItem,
  CartoonTextAlign,
  CartoonTextDirection,
} from "@/types/cartoonBubble";

export const DEFAULT_LINE_HEIGHT_SCALE = 1;
export const DEFAULT_LETTER_SPACING = 0;
export const DEFAULT_STROKE_WIDTH = 0;
export const DEFAULT_STROKE_COLOR = "#000000";

export function normalizeTextItem(
  item: Partial<CartoonComposeTextItem> & Pick<CartoonComposeTextItem, "id" | "box">
): CartoonComposeTextItem {
  return {
    id: item.id,
    box: item.box,
    text: item.text ?? "",
    direction: (item.direction ?? "horizontal") as CartoonTextDirection,
    textRotation: item.textRotation ?? 0,
    fontSize: item.fontSize ?? DEFAULT_COMPOSE_FONT_SIZE,
    fontFamilyId: item.fontFamilyId ?? DEFAULT_CARTOON_FONT.id,
    color: item.color ?? DEFAULT_TEXT_COLOR,
    textAlign: (item.textAlign ?? "left") as CartoonTextAlign,
    lineHeightScale: item.lineHeightScale ?? DEFAULT_LINE_HEIGHT_SCALE,
    letterSpacing: item.letterSpacing ?? DEFAULT_LETTER_SPACING,
    strokeWidth: item.strokeWidth ?? DEFAULT_STROKE_WIDTH,
    strokeColor: item.strokeColor ?? DEFAULT_STROKE_COLOR,
  };
}

export function normalizeTextItems(
  items: Partial<CartoonComposeTextItem>[]
): CartoonComposeTextItem[] {
  return items
    .filter((item): item is Partial<CartoonComposeTextItem> & { id: string; box: CartoonComposeTextItem["box"] } =>
      Boolean(item.id && item.box)
    )
    .map((item) => normalizeTextItem(item as CartoonComposeTextItem));
}

/** 统计可见字符数（不含换行），用于超长台词提示 */
export function countDialogueChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function dialogueLengthHint(text: string): {
  count: number;
  level: "ok" | "warn" | "over";
} {
  const count = countDialogueChars(text);
  if (count <= 20) return { count, level: "ok" };
  if (count <= 30) return { count, level: "warn" };
  return { count, level: "over" };
}
