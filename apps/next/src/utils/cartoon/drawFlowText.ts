/**
 * 把文字按竖排 / 横排画到 canvas 上（导出图片时的绘制实现）。
 *
 * 怎么做：先由 `flowTextLayout` 算出行 / 列结构，再逐字 `fillText`
 * （支持描边、颜色、对齐、行高），保证导出图与编辑态排版一致。
 */
import type { CartoonTextAlign, CartoonTextDirection } from "@/types/cartoonBubble";
import {
  getFlowColumnWidth,
  getFlowLineHeight,
  layoutVerticalColumns,
  measureHorizontalLines,
} from "@/utils/cartoon/flowTextLayout";

export type FlowTextStyle = {
  fontFamily: string;
  color: string;
  textAlign: CartoonTextAlign;
  lineHeightScale: number;
  letterSpacing: number;
  strokeWidth: number;
  strokeColor: string;
};

function paintText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: FlowTextStyle
): void {
  if (style.strokeWidth > 0) {
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = style.strokeWidth;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, x, y);
}

export function drawFlowTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  direction: CartoonTextDirection,
  boxWidth: number,
  boxHeight: number,
  anchorX: number,
  anchorY: number,
  textRotation: number,
  style: FlowTextStyle
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  const maxWidth = Math.max(0, boxWidth - anchorX);
  const maxHeight = Math.max(0, boxHeight - anchorY);
  if (maxWidth <= 0 || maxHeight <= 0) return;

  const centerX = maxWidth / 2;
  const centerY = maxHeight / 2;

  ctx.save();
  ctx.translate(anchorX + centerX, anchorY + centerY);
  ctx.rotate((textRotation * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);
  ctx.font = `${fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = style.textAlign;

  const lineHeight = getFlowLineHeight(direction, fontSize, style.lineHeightScale);

  if (direction === "horizontal") {
    const lines = measureHorizontalLines(
      trimmed,
      fontSize,
      maxWidth,
      maxHeight,
      style.fontFamily
    );
    let lineY = 0;
    for (const line of lines) {
      if (lineY + fontSize > maxHeight) break;
      let x = 0;
      if (style.textAlign === "center") x = maxWidth / 2;
      if (style.textAlign === "right") x = maxWidth;
      paintText(ctx, line, x, lineY, style);
      lineY += lineHeight;
    }
  } else {
    const columns = layoutVerticalColumns(trimmed, fontSize, maxHeight, maxWidth);
    const columnWidth = getFlowColumnWidth(fontSize);
    let colRight = maxWidth;

    for (const column of columns) {
      colRight -= columnWidth;
      if (colRight < 0) break;
      let rowY = 0;
      for (const char of column.chars) {
        if (rowY + fontSize > maxHeight) break;
        paintText(ctx, char, colRight + columnWidth * 0.15, rowY, style);
        rowY += lineHeight;
      }
    }
  }

  ctx.restore();
}
