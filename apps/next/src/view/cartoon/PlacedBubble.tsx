"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import { RotateCw } from "lucide-react";
import type {
  CartoonBubblePlacement,
  CartoonComposeTextItem,
  CartoonCustomFont,
  CartoonSetupConfig,
  CartoonTextArea,
} from "@/types/cartoonBubble";
import { moveTextItemBox } from "@/utils/cartoon/composeTextLayout";
import {
  DRAG_THRESHOLD_SQ,
  ROTATE_CURSOR,
  distanceSq,
  rotationFromPointerDrag,
  pointerAngleRad,
} from "@/utils/cartoon/rotation";
import {
  applyResizeDrag,
  getBubbleDisplaySize,
  screenDeltaToLocal,
  type ResizeHandleId,
} from "@/utils/cartoon/placementTransform";
import { cn } from "@/utils/cn";
import { useTranslation } from "@/i18n";
import { CartoonFlowText } from "@/view/cartoon/CartoonFlowText";

type BubbleMode = "idle" | "pending" | "dragging" | "rotating" | "resizing";
type InteractionSource = "body" | "rotate" | "edge";

const EDGE_HANDLES: {
  id: ResizeHandleId;
  hitClass: string;
  cursor: string;
}[] = [
  {
    id: "n",
    hitClass: "left-0 right-0 top-0 -translate-y-1/2 h-2.5",
    cursor: "ns-resize",
  },
  {
    id: "s",
    hitClass: "bottom-0 left-0 right-0 translate-y-1/2 h-2.5",
    cursor: "ns-resize",
  },
  {
    id: "e",
    hitClass: "bottom-0 right-0 top-0 translate-x-1/2 w-2.5",
    cursor: "ew-resize",
  },
  {
    id: "w",
    hitClass: "bottom-0 left-0 top-0 -translate-x-1/2 w-2.5",
    cursor: "ew-resize",
  },
];

const SCALE_HANDLE: {
  id: ResizeHandleId;
  hitClass: string;
  cursor: string;
} = {
  id: "se",
  hitClass: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 h-4 w-4",
  cursor: "nwse-resize",
};

type PlacedBubbleProps = {
  bubbleId: string;
  config: CartoonSetupConfig;
  textItems: CartoonComposeTextItem[];
  selectedTextId: string | null;
  placement: CartoonBubblePlacement;
  canvasWidth: number;
  canvasHeight: number;
  active: boolean;
  onActivate: () => void;
  onDoubleClickBubble: (relX: number, relY: number) => void;
  onPlacementChange: (patch: Partial<CartoonBubblePlacement>) => void;
  onPlacementEditStart?: () => void;
  onPlacementEditEnd?: () => void;
  onSelectText?: (id: string) => void;
  onTextBoxEditStart?: () => void;
  onTextBoxEditEnd?: () => void;
  onTextBoxChange?: (id: string, box: CartoonTextArea) => void;
  customFonts?: CartoonCustomFont[];
};

export function PlacedBubble({
  bubbleId,
  config,
  textItems,
  selectedTextId,
  placement,
  canvasWidth,
  canvasHeight,
  active,
  onActivate,
  onDoubleClickBubble,
  onPlacementChange,
  onPlacementEditStart,
  onPlacementEditEnd,
  onSelectText,
  onTextBoxEditStart,
  onTextBoxEditEnd,
  onTextBoxChange,
  customFonts = [],
}: PlacedBubbleProps) {
  const { t } = useTranslation();
  const bubbleRootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);
  const modeRef = useRef<BubbleMode>("idle");
  const sourceRef = useRef<InteractionSource>("body");
  const edgeRef = useRef<ResizeHandleId | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const captureElRef = useRef<HTMLElement | null>(null);
  const placementStartRef = useRef(placement);
  const rotatePointerStartRadRef = useRef(0);
  const rotateCenterRef = useRef({ x: 0, y: 0 });
  const onPlacementChangeRef = useRef(onPlacementChange);
  const onDoubleClickRef = useRef(onDoubleClickBubble);
  const canvasSizeRef = useRef({ width: canvasWidth, height: canvasHeight });

  useEffect(() => {
    onPlacementChangeRef.current = onPlacementChange;
  }, [onPlacementChange]);

  const onPlacementEditStartRef = useRef(onPlacementEditStart);
  const onPlacementEditEndRef = useRef(onPlacementEditEnd);
  const onTextBoxChangeRef = useRef(onTextBoxChange);
  const onTextBoxEditStartRef = useRef(onTextBoxEditStart);
  const onTextBoxEditEndRef = useRef(onTextBoxEditEnd);
  const onSelectTextRef = useRef(onSelectText);
  const textDragIdRef = useRef<string | null>(null);
  const textBoxStartRef = useRef<CartoonTextArea | null>(null);
  const textPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    onPlacementEditStartRef.current = onPlacementEditStart;
  }, [onPlacementEditStart]);

  useEffect(() => {
    onPlacementEditEndRef.current = onPlacementEditEnd;
  }, [onPlacementEditEnd]);

  useEffect(() => {
    onTextBoxChangeRef.current = onTextBoxChange;
  }, [onTextBoxChange]);

  useEffect(() => {
    onTextBoxEditStartRef.current = onTextBoxEditStart;
  }, [onTextBoxEditStart]);

  useEffect(() => {
    onTextBoxEditEndRef.current = onTextBoxEditEnd;
  }, [onTextBoxEditEnd]);

  useEffect(() => {
    onSelectTextRef.current = onSelectText;
  }, [onSelectText]);

  useEffect(() => {
    onDoubleClickRef.current = onDoubleClickBubble;
  }, [onDoubleClickBubble]);

  useEffect(() => {
    canvasSizeRef.current = { width: canvasWidth, height: canvasHeight };
  }, [canvasWidth, canvasHeight]);

  const { asset } = config;
  const { width: displayW, height: displayH } = getBubbleDisplaySize(
    asset,
    placement,
    canvasWidth
  );
  const centerX = placement.x * canvasWidth;
  const centerY = placement.y * canvasHeight;

  const getBubbleCenterScreen = () => {
    const el = bubbleRootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    const { width, height } = canvasSizeRef.current;
    const start = placementStartRef.current;
    if (!parent) {
      return { x: start.x * width, y: start.y * height };
    }
    const parentRect = parent.getBoundingClientRect();
    return {
      x: parentRect.left + start.x * width,
      y: parentRect.top + start.y * height,
    };
  };

  useEffect(() => {
    const releaseCapture = () => {
      if (captureElRef.current && pointerIdRef.current !== null) {
        try {
          captureElRef.current.releasePointerCapture(pointerIdRef.current);
        } catch {
          /* already released */
        }
      }
      captureElRef.current = null;
      pointerIdRef.current = null;
    };

    const onMove = (event: PointerEvent) => {
      let mode = modeRef.current;
      if (mode === "idle") return;
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) {
        return;
      }

      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;
      const start = placementStartRef.current;
      const { width: cw, height: ch } = canvasSizeRef.current;

      if (mode === "pending") {
        if (
          distanceSq(
            pointerStartRef.current.x,
            pointerStartRef.current.y,
            event.clientX,
            event.clientY
          ) < DRAG_THRESHOLD_SQ
        ) {
          return;
        }
        if (sourceRef.current === "rotate") {
          modeRef.current = "rotating";
          setRotating(true);
          onPlacementEditStartRef.current?.();
        } else if (sourceRef.current === "body") {
          modeRef.current = "dragging";
          setDragging(true);
          onPlacementEditStartRef.current?.();
        }
        mode = modeRef.current;
      }

      if (mode === "dragging") {
        onPlacementChangeRef.current({
          x: Math.min(1, Math.max(0, start.x + dx / cw)),
          y: Math.min(1, Math.max(0, start.y + dy / ch)),
        });
        return;
      }

      if (mode === "rotating") {
        const center = rotateCenterRef.current;
        onPlacementChangeRef.current({
          rotation: rotationFromPointerDrag(
            start.rotation,
            rotatePointerStartRadRef.current,
            center.x,
            center.y,
            event.clientX,
            event.clientY
          ),
        });
        return;
      }

      if (mode === "resizing" && edgeRef.current) {
        const { localDx, localDy } = screenDeltaToLocal(dx, dy, start.rotation);
        onPlacementChangeRef.current(
          applyResizeDrag(edgeRef.current, start, localDx, localDy, cw)
        );
      }
    };

    const onUp = (event: PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) {
        return;
      }
      releaseCapture();
      const wasBubbleEdit = modeRef.current !== "idle";
      modeRef.current = "idle";
      edgeRef.current = null;
      sourceRef.current = "body";
      setDragging(false);
      setRotating(false);
      if (wasBubbleEdit) onPlacementEditEndRef.current?.();
    };

    const onTextMove = (event: PointerEvent) => {
      if (!textDragIdRef.current || textPointerIdRef.current !== event.pointerId) return;
      const start = textBoxStartRef.current;
      if (!start) return;
      // 读 DOM 实测尺寸而非闭包里的 displayW/displayH：
      // 二者等价，但这样事件订阅 effect 无需依赖尺寸，窗口缩放后也不会用到旧值
      const rect = bubbleRootRef.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 1;
      const height = rect && rect.height > 0 ? rect.height : 1;
      const dx = (event.clientX - pointerStartRef.current.x) / width;
      const dy = (event.clientY - pointerStartRef.current.y) / height;
      onTextBoxChangeRef.current?.(
        textDragIdRef.current,
        moveTextItemBox(start, dx, dy)
      );
    };

    const onTextUp = (event: PointerEvent) => {
      if (textPointerIdRef.current !== event.pointerId) return;
      textDragIdRef.current = null;
      textBoxStartRef.current = null;
      textPointerIdRef.current = null;
      onTextBoxEditEndRef.current?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("pointermove", onTextMove);
    window.addEventListener("pointerup", onTextUp);
    window.addEventListener("pointercancel", onTextUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointermove", onTextMove);
      window.removeEventListener("pointerup", onTextUp);
      window.removeEventListener("pointercancel", onTextUp);
    };
  }, []);

  const beginInteraction = (
    event: ReactPointerEvent,
    source: InteractionSource,
    nextMode: BubbleMode = "pending"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();

    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    captureElRef.current = el;
    pointerIdRef.current = event.pointerId;

    sourceRef.current = source;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    placementStartRef.current = { ...placement };
    modeRef.current = nextMode;

    if (nextMode === "dragging") setDragging(true);
    if (nextMode === "rotating") {
      setRotating(true);
      onPlacementEditStartRef.current?.();
    }
    if (nextMode === "resizing") onPlacementEditStartRef.current?.();
  };

  const handleTextBoxPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    item: CartoonComposeTextItem
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
    onSelectTextRef.current?.(item.id);
    onTextBoxEditStartRef.current?.();
    textDragIdRef.current = item.id;
    textBoxStartRef.current = { ...item.box };
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    textPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBodyPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-edge-handle]")) return;
    if ((event.target as HTMLElement).closest("[data-scale-handle]")) return;
    if ((event.target as HTMLElement).closest("[data-rotate-handle]")) return;
    if ((event.target as HTMLElement).closest("[data-text-box]")) return;
    beginInteraction(event, "body");
  };

  const handleRotatePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    placementStartRef.current = { ...placement };
    const center = getBubbleCenterScreen();
    rotateCenterRef.current = center;
    rotatePointerStartRadRef.current = pointerAngleRad(
      center.x,
      center.y,
      event.clientX,
      event.clientY
    );
    beginInteraction(event, "rotate", "rotating");
  };

  const handleEdgeDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    edge: ResizeHandleId
  ) => {
    beginInteraction(event, "edge", "resizing");
    edgeRef.current = edge;
  };

  const handleScaleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    beginInteraction(event, "edge", "resizing");
    edgeRef.current = SCALE_HANDLE.id;
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const rad = (-placement.rotation * Math.PI) / 180;
    const cx = displayW / 2;
    const cy = displayH / 2;
    const dx = localX - cx;
    const dy = localY - cy;
    const unrotX = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    const unrotY = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
    onDoubleClickRef.current(unrotX / displayW, unrotY / displayH);
  };

  return (
    <div
      ref={bubbleRootRef}
      data-bubble-root={bubbleId}
      className={cn(
        "absolute touch-none select-none",
        active &&
          !rotating &&
          (dragging ? "cursor-grabbing" : "cursor-grab")
      )}
      style={{
        left: centerX,
        top: centerY,
        width: displayW,
        height: displayH,
        transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
        opacity: placement.opacity,
        cursor: rotating ? ROTATE_CURSOR : undefined,
      }}
      onPointerDown={handleBodyPointerDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="relative h-full w-full">
        <div
          className="absolute inset-0"
          style={{
            transform: `scaleX(${placement.flipX ? -1 : 1}) scaleY(${placement.flipY ? -1 : 1})`,
          }}
        >
          <Image
            src={asset.src}
            alt={asset.name}
            fill
            unoptimized
            draggable={false}
            className="pointer-events-none object-fill"
            sizes="400px"
          />
        </div>

        {textItems.map((item) => {
          const boxPx = {
            x: item.box.x * displayW,
            y: item.box.y * displayH,
            width: item.box.width * displayW,
            height: item.box.height * displayH,
          };
          const selected = item.id === selectedTextId;

          return (
            <div
              key={item.id}
              data-text-box={item.id}
              className={cn(
                "absolute touch-none",
                item.textRotation === 0 ? "overflow-hidden" : "overflow-visible",
                selected ? "cursor-move" : "cursor-pointer"
              )}
              style={{
                left: boxPx.x,
                top: boxPx.y,
                width: boxPx.width,
                height: boxPx.height,
              }}
              onPointerDown={(event) => handleTextBoxPointerDown(event, item)}
            >
              {selected ? (
                <div
                  className="pointer-events-none absolute inset-0 border border-dashed border-sky-500/90"
                  aria-hidden
                />
              ) : null}
              <CartoonFlowText
                text={item.text}
                fontSize={item.fontSize}
                fontFamilyId={item.fontFamilyId}
                color={item.color}
                direction={item.direction}
                boxWidthPx={boxPx.width}
                boxHeightPx={boxPx.height}
                anchorXPx={0}
                anchorYPx={0}
                textRotation={item.textRotation}
                textAlign={item.textAlign}
                lineHeightScale={item.lineHeightScale}
                letterSpacing={item.letterSpacing}
                strokeWidth={item.strokeWidth}
                strokeColor={item.strokeColor}
                customFonts={customFonts}
              />
            </div>
          );
        })}

        {active ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 border border-dashed border-sky-500/80"
              aria-hidden
            />

            {EDGE_HANDLES.map((edge) => (
              <div
                key={edge.id}
                data-edge-handle={edge.id}
                role="presentation"
                onPointerDown={(event) => handleEdgeDown(event, edge.id)}
                className={cn("absolute z-20", edge.hitClass)}
                style={{ cursor: edge.cursor }}
              />
            ))}

            <div
              data-scale-handle={SCALE_HANDLE.id}
              role="presentation"
              onPointerDown={handleScaleDown}
              className={cn(
                "absolute z-30 rounded-sm border border-sky-500 bg-background shadow-sm",
                SCALE_HANDLE.hitClass
              )}
              style={{ cursor: SCALE_HANDLE.cursor }}
            />

            <button
              type="button"
              data-rotate-handle
              aria-label={t("cartoon.bubble.rotateHandle")}
              onPointerDown={handleRotatePointerDown}
              className="absolute -right-2 -top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-background/95 shadow-sm transition-colors hover:bg-muted"
              style={{ cursor: rotating ? ROTATE_CURSOR : ROTATE_CURSOR }}
            >
              <RotateCw className="pointer-events-none h-3 w-3 text-muted-foreground" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
