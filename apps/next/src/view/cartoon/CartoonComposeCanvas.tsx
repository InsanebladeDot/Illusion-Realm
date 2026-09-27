"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CartoonBubbleAsset,
  CartoonBubblePlacement,
  CartoonCustomFont,
  CartoonPlacedBubble,
  CartoonTextArea,
} from "@/types/cartoonBubble";
import { cn } from "@/utils/cn";
import { useTranslation } from "@/i18n";
import { PlacedBubble } from "@/view/cartoon/PlacedBubble";

type CartoonComposeCanvasProps = {
  bubbles: CartoonPlacedBubble[];
  assets: CartoonBubbleAsset[];
  selectedBubbleId: string | null;
  selectedTextId: string | null;
  brushAssetId: string;
  customFonts: CartoonCustomFont[];
  backgroundSrc: string | null;
  backgroundSize: { width: number; height: number };
  onSelectBubble: (id: string) => void;
  onAddBubble: (canvasX: number, canvasY: number) => void;
  onDoubleClickBubble: (bubbleId: string, relX: number, relY: number) => void;
  onBubblePlacementChange: (
    bubbleId: string,
    patch: Partial<CartoonBubblePlacement>
  ) => void;
  onPlacementEditStart?: () => void;
  onPlacementEditEnd?: () => void;
  onSelectText?: (bubbleId: string, textId: string) => void;
  onTextBoxEditStart?: () => void;
  onTextBoxEditEnd?: () => void;
  onTextBoxChange?: (bubbleId: string, textId: string, box: CartoonTextArea) => void;
  onDisplaySizeChange?: (size: { width: number; height: number }) => void;
};

export function CartoonComposeCanvas({
  bubbles,
  assets,
  selectedBubbleId,
  selectedTextId,
  brushAssetId,
  customFonts,
  backgroundSrc,
  backgroundSize,
  onSelectBubble,
  onAddBubble,
  onDoubleClickBubble,
  onBubblePlacementChange,
  onPlacementEditStart,
  onPlacementEditEnd,
  onSelectText,
  onTextBoxEditStart,
  onTextBoxEditEnd,
  onTextBoxChange,
  onDisplaySizeChange,
}: CartoonComposeCanvasProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // assetMap 是 assets 的纯派生值：用 useMemo 而非 ref，
  // 既避免「渲染期写 ref」，也保证同一次渲染内读到的就是本次的 assets
  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  );

  const updateDisplaySize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const ratio =
      backgroundSize.width > 0
        ? backgroundSize.width / backgroundSize.height
        : 16 / 9;

    let width = rect.width;
    let height = width / ratio;
    if (height > rect.height) {
      height = rect.height;
      width = height * ratio;
    }
    setDisplaySize({ width, height });
  }, [backgroundSize.height, backgroundSize.width]);

  useEffect(() => {
    updateDisplaySize();
    const observer = new ResizeObserver(updateDisplaySize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize, backgroundSrc]);

  const onDisplaySizeChangeRef = useRef(onDisplaySizeChange);
  const lastDisplaySizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (displaySize.width <= 0) return;
    const last = lastDisplaySizeRef.current;
    if (last.width === displaySize.width && last.height === displaySize.height) return;
    lastDisplaySizeRef.current = displaySize;
    onDisplaySizeChangeRef.current?.(displaySize);
  }, [displaySize]);

  const onBubblePlacementChangeRef = useRef(onBubblePlacementChange);
  const onSelectBubbleRef = useRef(onSelectBubble);
  const onDoubleClickBubbleRef = useRef(onDoubleClickBubble);
  const onSelectTextRef = useRef(onSelectText);
  const onTextBoxChangeRef = useRef(onTextBoxChange);

  /**
   * latest-ref：把手写回调同步到 ref，供事件处理器读取最新版本。
   * 必须在 layout effect 里赋值 —— 渲染期写 ref 属于不纯操作（react-hooks/refs 会拦），
   * 而 useLayoutEffect 在 DOM 提交后、浏览器绘制前执行，
   * 任何用户交互都晚于它，因此子组件拿到的一定是本次渲染的回调。
   */
  useLayoutEffect(() => {
    onDisplaySizeChangeRef.current = onDisplaySizeChange;
    onBubblePlacementChangeRef.current = onBubblePlacementChange;
    onSelectBubbleRef.current = onSelectBubble;
    onDoubleClickBubbleRef.current = onDoubleClickBubble;
    onSelectTextRef.current = onSelectText;
    onTextBoxChangeRef.current = onTextBoxChange;
  });

  const handleBubblePlacementChange = useCallback(
    (bubbleId: string, patch: Partial<CartoonBubblePlacement>) => {
      onBubblePlacementChangeRef.current(bubbleId, patch);
    },
    []
  );

  const canvasPointFromEvent = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-bubble-root]")) return;
    if (!backgroundSrc) return;

    const point = canvasPointFromEvent(event.clientX, event.clientY);
    if (!point) return;

    onAddBubble(point.x, point.y);
  };

  const orderedBubbles = [...bubbles].sort((a, b) => {
    if (a.id === selectedBubbleId) return 1;
    if (b.id === selectedBubbleId) return -1;
    return 0;
  });

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
    >
      <div
        ref={canvasRef}
        data-compose-canvas
        className={cn(
          "relative shrink-0 overflow-visible rounded-lg bg-muted/30 shadow-inner",
          backgroundSrc && "cursor-crosshair"
        )}
        style={{ width: displaySize.width, height: displaySize.height }}
        onPointerDown={handleCanvasPointerDown}
      >
        {backgroundSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundSrc}
            alt={t("cartoon.canvas.backgroundAlt")}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {t("cartoon.canvas.emptyBackground")}
          </div>
        )}

        {backgroundSrc && displaySize.width > 0
          ? orderedBubbles.map((bubble) => {
              const asset = assetMap.get(bubble.assetId);
              if (!asset) return null;
              const active = bubble.id === selectedBubbleId;

              return (
                <PlacedBubble
                  key={bubble.id}
                  bubbleId={bubble.id}
                  config={{ asset }}
                  textItems={bubble.textItems}
                  selectedTextId={active ? selectedTextId : null}
                  customFonts={customFonts}
                  placement={bubble.placement}
                  canvasWidth={displaySize.width}
                  canvasHeight={displaySize.height}
                  active={active}
                  onActivate={() => onSelectBubbleRef.current(bubble.id)}
                  onDoubleClickBubble={(relX, relY) =>
                    onDoubleClickBubbleRef.current(bubble.id, relX, relY)
                  }
                  onPlacementChange={(patch) =>
                    handleBubblePlacementChange(bubble.id, patch)
                  }
                  onPlacementEditStart={onPlacementEditStart}
                  onPlacementEditEnd={onPlacementEditEnd}
                  onSelectText={(textId) => onSelectTextRef.current?.(bubble.id, textId)}
                  onTextBoxEditStart={onTextBoxEditStart}
                  onTextBoxEditEnd={onTextBoxEditEnd}
                  onTextBoxChange={(textId, box) =>
                    onTextBoxChangeRef.current?.(bubble.id, textId, box)
                  }
                />
              );
            })
          : null}

        {backgroundSrc && bubbles.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg bg-background/80 px-3 py-2 text-xs text-muted-foreground shadow-sm">
              {t("cartoon.canvas.addBubbleHint")}
              {assetMap.get(brushAssetId)?.name ?? "—"}）
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
