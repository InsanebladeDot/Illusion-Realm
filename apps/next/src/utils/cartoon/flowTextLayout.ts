/**
 * 竖排 / 横排文本的排版计算（换行、列宽、行高）。
 *
 * 怎么做：纯计算 —— 横排按宽度断行，竖排按列切分并处理标点 / 省略号等特例，
 * 输出行列结构供绘制与测量复用。
 */
import type { CartoonTextDirection } from "@/types/cartoonBubble";

export type VerticalColumn = { chars: string[] };

const HORIZONTAL_LINE_HEIGHT = 1.35;
const VERTICAL_LINE_HEIGHT = 1.15;
const VERTICAL_COLUMN_WIDTH = 1.2;

/** 竖排时用于替代横向省略号 glyph 的单字点 */
const VERTICAL_ELLIPSIS_DOT = "．";

/**
 * 竖排布局前预处理：将横向省略号（… / ……）展开为可逐字堆叠的全角点。
 * 否则 U+2026 等字符会以横向三连点 glyph 渲染，破坏竖排效果。
 */
export function prepareVerticalText(text: string): string {
  const flat = text.replace(/\n/g, "");
  let result = "";
  for (const char of flat) {
    if (char === "…" || char === "\u2026") {
      result += VERTICAL_ELLIPSIS_DOT.repeat(3);
    } else if (char === "‥" || char === "\u2025") {
      result += VERTICAL_ELLIPSIS_DOT.repeat(2);
    } else {
      result += char;
    }
  }
  return result;
}

export function verticalLayoutChars(text: string): string[] {
  return [...prepareVerticalText(text)];
}

export function measureHorizontalLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxHeight: number,
  fontFamily = "sans-serif"
): string[] {
  if (maxWidth <= 0 || maxHeight <= 0) return [];
  const lines: string[] = [];
  const lineHeightPx = fontSize * HORIZONTAL_LINE_HEIGHT;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeightPx));

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${fontSize}px ${fontFamily}`;
      for (const paragraph of text.split("\n")) {
        if (lines.length >= maxLines) break;
        if (!paragraph) {
          lines.push("");
          continue;
        }
        let current = "";
        for (const char of paragraph) {
          const next = current + char;
          if (ctx.measureText(next).width > maxWidth && current) {
            lines.push(current);
            current = char;
            if (lines.length >= maxLines) break;
          } else {
            current = next;
          }
        }
        if (lines.length < maxLines && current) lines.push(current);
      }
      return lines.slice(0, maxLines);
    }
  }

  const approxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.6)));
  for (const paragraph of text.split("\n")) {
    if (lines.length >= maxLines) break;
    if (!paragraph) {
      lines.push("");
      continue;
    }
    for (let i = 0; i < paragraph.length; i += approxChars) {
      lines.push(paragraph.slice(i, i + approxChars));
      if (lines.length >= maxLines) break;
    }
  }
  return lines.slice(0, maxLines);
}

export function layoutVerticalColumns(
  text: string,
  fontSize: number,
  maxColumnHeight: number,
  maxTotalWidth: number
): VerticalColumn[] {
  if (maxColumnHeight <= 0 || maxTotalWidth <= 0) return [];

  const charHeight = fontSize * VERTICAL_LINE_HEIGHT;
  const columnWidth = fontSize * VERTICAL_COLUMN_WIDTH;
  const maxColumns = Math.max(1, Math.floor(maxTotalWidth / columnWidth));
  const maxCharsPerColumn = Math.max(1, Math.floor(maxColumnHeight / charHeight));

  const columns: VerticalColumn[] = [{ chars: [] }];
  const chars = verticalLayoutChars(text);

  for (const char of chars) {
    const current = columns[columns.length - 1];
    if (current.chars.length >= maxCharsPerColumn) {
      if (columns.length >= maxColumns) break;
      columns.push({ chars: [] });
    }
    columns[columns.length - 1].chars.push(char);
  }

  return columns;
}

export function getFlowLineHeight(
  direction: CartoonTextDirection,
  fontSize: number,
  lineHeightScale = 1
): number {
  const base =
    fontSize * (direction === "horizontal" ? HORIZONTAL_LINE_HEIGHT : VERTICAL_LINE_HEIGHT);
  return base * lineHeightScale;
}

export function getFlowColumnWidth(fontSize: number): number {
  return fontSize * VERTICAL_COLUMN_WIDTH;
}
