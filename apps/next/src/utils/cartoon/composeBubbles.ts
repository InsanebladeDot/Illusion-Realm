/**
 * 合成台里「已放置气泡」的创建、克隆与归一化（背景 + 多个气泡 + 文字）。
 *
 * 怎么做：纯函数 —— 新建时补齐素材默认值，读盘时把旧数据补全成当前结构，
 * 克隆时深拷贝并换新 id（用于复制 / 撤销快照）。
 */
import type {
  CartoonBubblePlacement,
  CartoonPlacedBubble,
} from "@/types/cartoonBubble";
import { normalizeBubblePlacement } from "@/types/cartoonBubble";
import { createPlacedBubbleId } from "@/utils/cartoon/cartoonIds";
import { normalizeTextItems } from "@/utils/cartoon/normalizeTextItem";

export function createPlacedBubble(
  assetId: string,
  canvasX: number,
  canvasY: number,
  defaults?: Partial<CartoonBubblePlacement>
): CartoonPlacedBubble {
  return {
    id: createPlacedBubbleId(),
    assetId,
    placement: normalizeBubblePlacement({
      x: canvasX,
      y: canvasY,
      scaleX: defaults?.scaleX ?? 0.32,
      scaleY: defaults?.scaleY ?? 0.32,
      rotation: defaults?.rotation ?? 0,
      flipX: defaults?.flipX ?? false,
      flipY: defaults?.flipY ?? false,
      opacity: defaults?.opacity ?? 1,
    }),
    textItems: [],
  };
}

export function clonePlacedBubble(bubble: CartoonPlacedBubble): CartoonPlacedBubble {
  return {
    id: bubble.id,
    assetId: bubble.assetId,
    placement: normalizeBubblePlacement(bubble.placement),
    textItems: normalizeTextItems(bubble.textItems).map((item) => ({
      ...item,
      box: { ...item.box },
    })),
  };
}

export function clonePlacedBubbles(bubbles: CartoonPlacedBubble[]): CartoonPlacedBubble[] {
  return bubbles.map(clonePlacedBubble);
}

export function normalizePlacedBubble(
  bubble: Partial<CartoonPlacedBubble> & { id: string; assetId: string }
): CartoonPlacedBubble {
  return {
    id: bubble.id,
    assetId: bubble.assetId,
    placement: normalizeBubblePlacement(bubble.placement ?? {}),
    textItems: normalizeTextItems(bubble.textItems ?? []),
  };
}

export function normalizePlacedBubbles(
  bubbles: (Partial<CartoonPlacedBubble> & { id: string; assetId: string })[]
): CartoonPlacedBubble[] {
  return bubbles.map(normalizePlacedBubble);
}
