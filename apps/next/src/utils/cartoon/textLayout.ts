/**
 * 文字块的 CSS 样式与溢出测量（编辑态用 DOM 呈现，导出走 canvas）。
 *
 * 怎么做：把字体 / 对齐 / 行高换算成 `CSSProperties`；另提供溢出检测与
 * 「竖排 / 横排」的展示文案（词条 key）。
 */
import type { CSSProperties } from "react";
import { t } from "@/i18n";
import type { CartoonTextBlock, CartoonTextDirection } from "@/types/cartoonBubble";

export function getTextBlockStyle(
  block: CartoonTextBlock,
  areaWidthPx: number,
  areaHeightPx: number
): CSSProperties {
  const left = block.x * areaWidthPx;
  const top = block.y * areaHeightPx;
  const maxWidth = Math.max(8, areaWidthPx - left);
  const maxHeight = Math.max(8, areaHeightPx - top);

  const base: CSSProperties = {
    position: "absolute",
    left,
    top,
    fontSize: block.fontSize,
    lineHeight: block.direction === "vertical" ? 1.15 : 1.35,
    maxWidth,
    maxHeight,
    overflow: "hidden",
    wordBreak: block.direction === "vertical" ? "normal" : "break-word",
    whiteSpace: block.direction === "vertical" ? "normal" : "pre-wrap",
    writingMode: block.direction === "vertical" ? "vertical-rl" : "horizontal-tb",
    textOrientation: block.direction === "vertical" ? "upright" : "mixed",
  };

  return base;
}

export function measureTextOverflow(
  element: HTMLElement,
  maxWidth: number,
  maxHeight: number
): boolean {
  return element.scrollWidth > maxWidth + 1 || element.scrollHeight > maxHeight + 1;
}

/** 文字方向按钮文案：utils 里没有 React 上下文，用 i18n 的模块级 t（调用时求值） */
export function directionLabel(direction: CartoonTextDirection): string {
  return direction === "horizontal"
    ? t("cartoon.compose.directionHorizontal")
    : t("cartoon.compose.directionVertical");
}
