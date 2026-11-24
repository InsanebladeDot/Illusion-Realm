"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import { useTranslation } from "@/i18n";
import { buildLocalFileUrl } from "@/utils/localFileUrl";
import { cn } from "@/utils/cn";
import { pickerRgb } from "@/utils/color-picker";
import { adjustRectangle, clamp, MIN_REGION_SIZE, rectangleFromPoints, type CompositionDraft, type CompositionPoint, type CompositionRect, type CompositionRegion, type CompositionSize } from "./composition-draft";

const ARROWS: Partial<Record<string, CompositionPoint>> = {
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
};
interface Gesture { pointer: number; start: CompositionPoint; mode: "draw" | "move" | "resize"; region?: CompositionRegion }
interface Props {
  draft: CompositionDraft;
  size: CompositionSize;
  selectedId: string | null;
  drawing: boolean;
  grid: boolean;
  onSelect: (id: string) => void;
  onAdd: (rect: CompositionRect) => void;
  onChange: (id: string, rect: CompositionRect) => void;
}

/** 按底色亮度在黑白之间选择反差更大的文字，手动选深色时标签也看得清。 */
function labelForeground(color: string): string {
  const [red, green, blue] = pickerRgb(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.179 ? "#000" : "#fff";
}

function position(rect: CompositionRect): CSSProperties {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` };
}

/** Pointer Capture 像按住一根绳，拖出画布仍能收尾，取消手势时不会交付预览框。 */
function readPoint(event: PointerEvent<HTMLDivElement>): CompositionPoint {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  return { x: clamp((event.clientX - left) / width), y: clamp((event.clientY - top) / height) };
}

function gestureRect(gesture: Gesture, point: CompositionPoint) {
  if (!gesture.region) return rectangleFromPoints(gesture.start, point);
  return adjustRectangle(gesture.region, { x: point.x - gesture.start.x, y: point.y - gesture.start.y }, gesture.mode === "resize");
}

export function CompositionCanvas({ draft, size, selectedId, drawing, grid, onSelect, onAdd, onChange }: Props) {
  const { t } = useTranslation();
  const gesture = useRef<Gesture | undefined>(undefined);
  const [preview, setPreview] = useState<{ rect: CompositionRect; regionId?: string }>();
  const image = draft.base && buildLocalFileUrl(draft.base.path);
  const [failedImage, setFailedImage] = useState<string>();

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-composition-box]") : null;
    const region = drawing ? undefined : draft.regions.find(item => item.id === target?.dataset.compositionBox);
    if (!drawing && !region) return;
    if (region) onSelect(region.id);
    const resize = event.target instanceof Element && event.target.hasAttribute("data-composition-resize");
    gesture.current = { pointer: event.pointerId, start: readPoint(event), region, mode: drawing ? "draw" : resize ? "resize" : "move" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    gesture.current = undefined;
    setPreview(undefined);
    if (event.type !== "pointerup") return;
    const rect = gestureRect(active, readPoint(event));
    if (active.region) onChange(active.region.id, rect);
    else if (rect.width >= MIN_REGION_SIZE && rect.height >= MIN_REGION_SIZE) onAdd(rect);
  }

  function nudge(event: KeyboardEvent<HTMLButtonElement>, region: CompositionRegion) {
    const step = ARROWS[event.key];
    if (!step) return;
    event.preventDefault();
    onSelect(region.id);
    onChange(region.id, adjustRectangle(region, { x: step.x * .01, y: step.y * .01 }, event.shiftKey));
  }

  const widthAtFullHeight = 100 * size.width / size.height;
  return <div className="min-h-0 min-w-0 overflow-hidden bg-background/60 p-4 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px]">
    <div className="grid h-full min-w-0 place-items-center [container-type:size]">
      {/* 画板像相片装进相框，按宽高里先碰到边的一侧等比缩放。 */}
      <div data-moss-artboard role="group" aria-label={t("create.mossComposition.canvas")}
        className={cn("relative max-w-full touch-none overflow-hidden rounded-sm bg-muted ring-1 ring-border", drawing && "cursor-crosshair")}
        style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100cqw, ${widthAtFullHeight}cqh)` }}
        onPointerDown={start} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onPointerMove={event => { const active = gesture.current; if (active?.pointer === event.pointerId) setPreview({ rect: gestureRect(active, readPoint(event)), regionId: active.region?.id }); }}>
        {image && failedImage !== image && <Image key={image} src={image} alt="" fill unoptimized draggable={false} onError={() => setFailedImage(image)} className="pointer-events-none absolute inset-0 size-full object-contain opacity-75" />}
        {image && failedImage === image && <p role="status" className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">{t("create.mossComposition.missingBase")}</p>}
        {grid && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ab9bdf38_1px,transparent_1px),linear-gradient(to_bottom,#ab9bdf38_1px,transparent_1px)] bg-size-[12.5%_12.5%]" />}
        {draft.regions.map((region, index) => {
          const selected = selectedId === region.id;
          const name = region.kind === "text" && region.text.trim() ? region.text.trim() : `${t(`create.mossComposition.${region.kind}`)} ${index + 1}`;
          return <button key={region.id} type="button" data-composition-box={region.id} aria-pressed={selected} title={name} tabIndex={drawing ? -1 : 0}
            onClick={() => onSelect(region.id)} onKeyDown={event => nudge(event, region)}
            className={cn("absolute cursor-move overflow-hidden rounded-sm border focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-[-3px]", selected ? "z-20 border-2 border-solid" : "z-10 border-dashed", drawing && "pointer-events-none")}
            style={{ ...position(preview?.regionId === region.id ? preview.rect : region), borderColor: region.color, backgroundColor: `${region.color}${selected ? "29" : "12"}` }}>
            <span className="pointer-events-none absolute left-0.5 top-0.5 max-w-full truncate rounded px-1 text-[11px] font-semibold" style={{ backgroundColor: region.color, color: labelForeground(region.color) }}>{name}</span>
            {selected && <span aria-hidden data-composition-resize className="absolute bottom-0 right-0 size-3 cursor-nwse-resize rounded-tl" style={{ backgroundColor: region.color }} />}
          </button>;
        })}
        {preview && drawing && <div aria-hidden className="pointer-events-none absolute z-30 border border-dashed border-accent-fill bg-accent/30" style={position(preview.rect)} />}
      </div>
    </div>
  </div>;
}
