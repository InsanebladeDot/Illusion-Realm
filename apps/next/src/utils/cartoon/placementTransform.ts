/**
 * 气泡在画布上的尺寸 / 位移 / 缩放 / 旋转换算（拖拽与手柄交互用）。
 *
 * 怎么做：屏幕坐标 ↔ 本地坐标换算 + 缩放夹取，纯函数；
 * 交互层只负责喂指针位置。
 */
import type { CartoonBubbleAsset, CartoonBubblePlacement } from "@/types/cartoonBubble";

export function getBubbleDisplaySize(
  asset: CartoonBubbleAsset,
  placement: CartoonBubblePlacement,
  canvasWidth: number
): { width: number; height: number } {
  const width = canvasWidth * placement.scaleX;
  const height = canvasWidth * placement.scaleY * (asset.height / asset.width);
  return { width, height };
}

/** 将屏幕坐标增量转换到素材本地坐标（未旋转前的 x/y） */
export function screenDeltaToLocal(
  dx: number,
  dy: number,
  rotationDeg: number
): { localDx: number; localDy: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    localDx: dx * cos + dy * sin,
    localDy: -dx * sin + dy * cos,
  };
}

export function clampScale(value: number): number {
  return Math.min(1.2, Math.max(0.06, value));
}

export const ROTATION_DEG_PER_PX = 0.6;

export type ResizeHandleId =
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export const RESIZE_HANDLES: {
  id: ResizeHandleId;
  className: string;
  cursor: string;
}[] = [
  { id: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { id: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
  { id: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { id: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { id: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { id: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { id: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
];

export function applyResizeDrag(
  handle: ResizeHandleId,
  start: CartoonBubblePlacement,
  localDx: number,
  localDy: number,
  canvasWidth: number
): Pick<CartoonBubblePlacement, "scaleX" | "scaleY"> {
  const scaleDeltaX = localDx / canvasWidth;
  const scaleDeltaY = localDy / canvasWidth;

  const isCorner = handle.length === 2;
  if (isCorner) {
    const uniform = (scaleDeltaX + scaleDeltaY) / 2;
    return {
      scaleX: clampScale(start.scaleX + uniform),
      scaleY: clampScale(start.scaleY + uniform),
    };
  }

  if (handle === "e" || handle === "w") {
    const sign = handle === "e" ? 1 : -1;
    return {
      scaleX: clampScale(start.scaleX + sign * scaleDeltaX),
      scaleY: start.scaleY,
    };
  }

  const sign = handle === "s" ? 1 : -1;
  return {
    scaleX: start.scaleX,
    scaleY: clampScale(start.scaleY + sign * scaleDeltaY),
  };
}
