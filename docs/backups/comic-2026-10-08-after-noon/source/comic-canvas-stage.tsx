"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Minus, MoveDiagonal2, MoveHorizontal, MoveVertical, Plus, Scan } from "lucide-react";
import { useTranslation } from "@/i18n";
import { MAX_COMIC_DIMENSION, MIN_COMIC_DIMENSION, type ComicPageSize } from "@/utils/comic/page-size";

interface ViewportSize { width: number; height: number }
interface ResizeGesture { pointerId: number; x: number; y: number; width: number; height: number; scale: number; axis: ResizeAxis }
type ResizeAxis = "width" | "height" | "both";
interface CanvasStageProps { size: ComicPageSize; fit: boolean; compactVisible: boolean; canvasRef: RefObject<HTMLDivElement | null>; onResize: (width: number, height: number) => void; onFitChange: (fit: boolean) => void; children: ReactNode }

function useStageViewport(ref: RefObject<HTMLDivElement | null>): ViewportSize {
  const [viewport, setViewport] = useState({ width: 640, height: 640 });
  useEffect(() => {
    const element = ref.current; if (!element) return;
    const measure = () => {
      const next = { width: element.getBoundingClientRect().width, height: element.clientHeight };
      if (!next.width || !next.height) return;
      setViewport(previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    window.addEventListener("resize", measure); document.addEventListener("visibilitychange", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("visibilitychange", measure); };
  }, [ref]);
  return viewport;
}

function limitDimension(value: number): number { return Math.max(MIN_COMIC_DIMENSION, Math.min(MAX_COMIC_DIMENSION, Math.round(value))); }

function ResizeHandles({ size, scale, onResize }: Pick<CanvasStageProps, "size" | "onResize"> & { scale: number }) {
  const { t } = useTranslation();
  const gesture = useRef<ResizeGesture | null>(null);
  function begin(event: React.PointerEvent<HTMLButtonElement>, axis: ResizeAxis) {
    if (size.locked || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: size.width, height: size.height, scale, axis };
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = gesture.current; if (!drag || size.locked || event.pointerId !== drag.pointerId) return;
    const width = drag.axis === "height" ? drag.width : limitDimension(drag.width + (event.clientX - drag.x) / drag.scale);
    const height = drag.axis === "width" ? drag.height : limitDimension(drag.height + (event.clientY - drag.y) / drag.scale);
    onResize(width, height);
  }
  if (size.locked) return null;
  return <>{(["width", "height", "both"] as const).map(axis => {
    const Icon = axis === "width" ? MoveHorizontal : axis === "height" ? MoveVertical : MoveDiagonal2;
    const position = axis === "width" ? "right-0 top-1/2 -translate-y-1/2 cursor-ew-resize" : axis === "height" ? "bottom-0 left-1/2 -translate-x-1/2 cursor-ns-resize" : "bottom-0 right-0 cursor-nwse-resize";
    return <button key={axis} type="button" data-resize-page={axis} aria-label={t(`toolBox.comic.pageSize.drag.${axis}`)} title={t(`toolBox.comic.pageSize.drag.${axis}`)}
      className={`absolute z-30 flex h-7 w-7 touch-none items-center justify-center rounded border border-emerald-700 bg-background text-emerald-800 shadow-sm ${position}`}
      onPointerDown={event => begin(event, axis)} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}><Icon size={15} /></button>;
  })}</>;
}

function ZoomControls({ scale, fit, onZoom, onFit }: { scale: number; fit: boolean; onZoom: (value: number) => void; onFit: () => void }) {
  const { t } = useTranslation();
  const buttonClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground disabled:opacity-40";
  return <div data-comic-zoom className="flex shrink-0 items-center justify-center gap-1 border-t border-border bg-background px-1 py-1">
    <span className="mr-1 text-xs text-muted-foreground">{t("toolBox.comic.zoom.title")}</span>
    <button type="button" data-zoom-out title={t("toolBox.comic.zoom.out")} aria-label={t("toolBox.comic.zoom.out")} disabled={scale <= 0.01} onClick={() => onZoom(Math.max(0.01, scale / 1.25))} className={buttonClass}><Minus size={16} /></button>
    <button type="button" data-zoom-actual title={t("toolBox.comic.zoom.actual")} aria-label={t("toolBox.comic.zoom.actual")} onClick={() => onZoom(1)} className="h-8 w-12 shrink-0 rounded text-xs tabular-nums text-foreground hover:bg-muted">{Math.round(scale * 1000) / 10}%</button>
    <button type="button" data-zoom-in title={t("toolBox.comic.zoom.in")} aria-label={t("toolBox.comic.zoom.in")} disabled={scale >= 4} onClick={() => onZoom(Math.min(4, scale * 1.25))} className={buttonClass}><Plus size={16} /></button>
    <button type="button" data-zoom-fit title={t("toolBox.comic.pageSize.fit")} aria-label={t("toolBox.comic.pageSize.fit")} aria-pressed={fit} onClick={onFit} className={`${buttonClass} ${fit ? "!border-primary !text-primary" : ""}`}><Scan size={16} /></button>
  </div>;
}

export default function ComicCanvasStage({ size, fit, compactVisible, canvasRef, onResize, onFitChange, children }: CanvasStageProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useStageViewport(viewportRef);
  const [zoom, setZoom] = useState(0.5);
  const width = Math.max(1, viewport.width - 16), height = Math.max(1, viewport.height - 16);
  const scale = fit ? Math.min(width / size.width, height / size.height, 1) : zoom;
  const changeZoom = (value: number) => { setZoom(value); onFitChange(false); };
  return (
    <div data-comic-pane="stage" className={`${compactVisible ? "flex" : "hidden xl:flex"} relative min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-muted`}>
      <div ref={viewportRef} data-canvas-viewport className={`comic-stage-dots min-h-0 min-w-0 flex-1 ${fit ? "overflow-hidden" : "overflow-auto"}`}>
        <div className={`flex min-h-full min-w-full p-2 ${fit ? "h-full items-center justify-center" : "w-max items-start justify-start"}`}>
          <div ref={canvasRef} data-comic-canvas className="relative shrink-0 bg-white shadow-lg" style={{ width: size.width * scale, height: size.height * scale, "--comic-preview-scale": scale } as CSSProperties} aria-label={t("toolBox.comic.title")}>
            {children}
            {/* 界面：画布拖拽宽度、高度与右下角控制点 */}
            <ResizeHandles size={size} scale={scale} onResize={onResize} />
          </div>
        </div>
      </div>
      {/* 界面：预览缩放，不改变画布尺寸或导出分辨率 */}
      <ZoomControls scale={scale} fit={fit} onZoom={changeZoom} onFit={() => onFitChange(true)} />
    </div>
  );
}
