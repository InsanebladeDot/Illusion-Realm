/**
 * 合成台文字框的几何计算：拖动、边手柄拉伸、命中判定。
 *
 * 怎么做：纯几何 —— 边界 clamp、按边 id 改宽高、点是否落在框内 / 命中哪个条目，
 * 不碰 DOM，便于交互层复用。
 */
import {
  DEFAULT_CARTOON_FONT,
  DEFAULT_COMPOSE_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
} from "@/data/cartoonFonts";
import type {
  CartoonComposeTextItem,
  CartoonTextArea,
  CartoonTextDirection,
} from "@/types/cartoonBubble";
import { normalizeTextItem } from "@/utils/cartoon/normalizeTextItem";
import { createCartoonTextBlockId } from "@/utils/cartoon/cartoonIds";
import { clamp01, normalizeTextArea } from "@/utils/cartoon/textArea";

const DEFAULT_BOX_W = 0.36;
const DEFAULT_BOX_H = 0.18;

export function clampTextBoxArea(area: CartoonTextArea): CartoonTextArea {
  return normalizeTextArea({
    x: area.x,
    y: area.y,
    width: Math.max(0.06, area.width),
    height: Math.max(0.06, area.height),
  });
}

export type TextBoxEdgeId = "n" | "s" | "e" | "w";

export function applyTextBoxEdgeResize(
  handle: TextBoxEdgeId,
  start: CartoonTextArea,
  localDx: number,
  localDy: number,
  bubbleW: number,
  bubbleH: number
): CartoonTextArea {
  const dx = localDx / bubbleW;
  const dy = localDy / bubbleH;

  if (handle === "e") return clampTextBoxArea({ ...start, width: start.width + dx });
  if (handle === "w")
    return clampTextBoxArea({
      x: start.x + dx,
      y: start.y,
      width: start.width - dx,
      height: start.height,
    });
  if (handle === "s") return clampTextBoxArea({ ...start, height: start.height + dy });
  return clampTextBoxArea({
    x: start.x,
    y: start.y + dy,
    width: start.width,
    height: start.height - dy,
  });
}

export function pointInTextBox(
  box: CartoonTextArea,
  relX: number,
  relY: number
): boolean {
  return (
    relX >= box.x &&
    relX <= box.x + box.width &&
    relY >= box.y &&
    relY <= box.y + box.height
  );
}

export function findTextItemAt(
  items: CartoonComposeTextItem[],
  relX: number,
  relY: number
): CartoonComposeTextItem | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (pointInTextBox(items[i].box, relX, relY)) return items[i];
  }
  return null;
}

export function moveTextItemBox(
  box: CartoonTextArea,
  dx: number,
  dy: number
): CartoonTextArea {
  return clampTextBoxArea({
    ...box,
    x: Math.min(1 - box.width, Math.max(0, box.x + dx)),
    y: Math.min(1 - box.height, Math.max(0, box.y + dy)),
  });
}

export function createTextItemAt(
  relX: number,
  relY: number,
  fontSize: number = DEFAULT_COMPOSE_FONT_SIZE
): CartoonComposeTextItem {
  const width = DEFAULT_BOX_W;
  const height = DEFAULT_BOX_H;
  return normalizeTextItem({
    id: createCartoonTextBlockId(),
    box: clampTextBoxArea({
      x: clamp01(relX - width / 2),
      y: clamp01(relY - height / 2),
      width,
      height,
    }),
    text: "",
    direction: "horizontal" as CartoonTextDirection,
    fontSize,
    fontFamilyId: DEFAULT_CARTOON_FONT.id,
    color: DEFAULT_TEXT_COLOR,
  });
}

export function patchTextItemBoxSize(
  box: CartoonTextArea,
  widthPercent: number,
  heightPercent: number
): CartoonTextArea {
  return clampTextBoxArea({
    ...box,
    width: Math.min(1 - box.x, widthPercent / 100),
    height: Math.min(1 - box.y, heightPercent / 100),
  });
}

export function boxSizePercent(box: CartoonTextArea): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(box.width * 100),
    height: Math.round(box.height * 100),
  };
}
