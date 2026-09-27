"use client";

import { useMemo } from "react";
import { resolveCartoonFont } from "@/data/cartoonFonts";
import type { CartoonCustomFont, CartoonTextDirection } from "@/types/cartoonBubble";
import {
  getFlowColumnWidth,
  getFlowLineHeight,
  layoutVerticalColumns,
  measureHorizontalLines,
} from "@/utils/cartoon/flowTextLayout";
import { normalizeTextItem } from "@/utils/cartoon/normalizeTextItem";
import { cn } from "@/utils/cn";

type CartoonFlowTextProps = {
  text: string;
  fontSize: number;
  fontFamilyId: string;
  color: string;
  direction: CartoonTextDirection;
  boxWidthPx: number;
  boxHeightPx: number;
  anchorXPx: number;
  anchorYPx: number;
  textRotation: number;
  textAlign?: "left" | "center" | "right";
  lineHeightScale?: number;
  letterSpacing?: number;
  strokeWidth?: number;
  strokeColor?: string;
  customFonts?: CartoonCustomFont[];
};

export function CartoonFlowText(props: CartoonFlowTextProps) {
  const item = normalizeTextItem({
    id: "preview",
    box: { x: 0, y: 0, width: 1, height: 1 },
    text: props.text,
    fontSize: props.fontSize,
    fontFamilyId: props.fontFamilyId,
    color: props.color,
    direction: props.direction,
    textRotation: props.textRotation,
    textAlign: props.textAlign,
    lineHeightScale: props.lineHeightScale,
    letterSpacing: props.letterSpacing,
    strokeWidth: props.strokeWidth,
    strokeColor: props.strokeColor,
  });

  const fontFamily = resolveCartoonFont(
    item.fontFamilyId,
    props.customFonts ?? []
  ).family;
  const maxWidth = Math.max(0, props.boxWidthPx - props.anchorXPx);
  const maxHeight = Math.max(0, props.boxHeightPx - props.anchorYPx);

  const horizontalLines = useMemo(
    () =>
      item.direction === "horizontal"
        ? measureHorizontalLines(
            item.text,
            item.fontSize,
            maxWidth,
            maxHeight,
            fontFamily
          )
        : [],
    [fontFamily, item.direction, item.fontSize, item.text, maxHeight, maxWidth]
  );

  const verticalColumns = useMemo(
    () =>
      item.direction === "vertical"
        ? layoutVerticalColumns(item.text, item.fontSize, maxHeight, maxWidth)
        : [],
    [item.direction, item.fontSize, item.text, maxHeight, maxWidth]
  );

  const lineHeight = getFlowLineHeight(
    item.direction,
    item.fontSize,
    item.lineHeightScale
  );
  const columnWidth = getFlowColumnWidth(item.fontSize);
  const clipOverflow = item.textRotation === 0;
  const strokeStyle =
    item.strokeWidth > 0
      ? {
          WebkitTextStroke: `${item.strokeWidth}px ${item.strokeColor}`,
          paintOrder: "stroke fill" as const,
        }
      : undefined;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: props.anchorXPx,
        top: props.anchorYPx,
        width: maxWidth,
        height: maxHeight,
        overflow: clipOverflow ? "hidden" : "visible",
      }}
    >
      <div
        style={{
          width: maxWidth,
          height: maxHeight,
          transform: `rotate(${item.textRotation}deg)`,
          transformOrigin: "center center",
          overflow: clipOverflow ? "hidden" : "visible",
        }}
      >
        {item.direction === "horizontal" ? (
          <div
            className={cn("text-foreground")}
            style={{
              fontFamily,
              fontSize: item.fontSize,
              color: item.color,
              lineHeight: `${lineHeight}px`,
              letterSpacing: item.letterSpacing,
              textAlign: item.textAlign,
              width: maxWidth,
              maxHeight,
              overflow: clipOverflow ? "hidden" : "visible",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              ...strokeStyle,
            }}
          >
            {horizontalLines.map((line, index) => (
              <div key={index} style={{ minHeight: lineHeight }}>
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="flex h-full flex-row-reverse items-start justify-end"
            style={{
              fontFamily,
              color: item.color,
              letterSpacing: item.letterSpacing,
              maxWidth,
              maxHeight,
              overflow: clipOverflow ? "hidden" : "visible",
              ...strokeStyle,
            }}
          >
            {verticalColumns.map((column, colIndex) => (
              <div
                key={colIndex}
                className="flex flex-col items-center tracking-wide"
                style={{
                  width: columnWidth,
                  fontSize: item.fontSize,
                  lineHeight: `${lineHeight}px`,
                  maxHeight,
                }}
              >
                {column.chars.map((char, charIndex) => (
                  <span
                    key={charIndex}
                    className="inline-block"
                    style={{ textOrientation: "upright" }}
                  >
                    {char}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
