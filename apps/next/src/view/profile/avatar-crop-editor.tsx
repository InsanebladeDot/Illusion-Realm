"use client";

// 界面：编辑资料弹窗内的头像裁剪步骤，鼠标 / 触摸拖动图片，圆框预览正方形裁剪结果。
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cropAvatar, getAvatarCenter, getAvatarCrop, type AvatarPoint, type AvatarSize } from "@/utils/avatar-crop";

interface Props { source: string; onCancel: () => void; onConfirm: (dataUrl: string) => void }
interface Drag { id: number; x: number; y: number; center: AvatarPoint }

/** 只管理预览坐标；导出函数仍使用同一套原图像素坐标，避免窗口缩放后裁错位置。 */
function useAvatarCrop() {
  const [size, setSize] = useState<AvatarSize>({ width: 0, height: 0 });
  const [center, setCenter] = useState<AvatarPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<Drag | null>(null);
  const crop = getAvatarCrop(size, center, zoom);
  const move = (point: AvatarPoint, scale = zoom) => setCenter(getAvatarCenter(getAvatarCrop(size, point, scale)));
  const reset = () => { setZoom(1); setCenter({ x: size.width / 2, y: size.height / 2 }); };
  const load = (image: HTMLImageElement) => {
    setSize({ width: image.naturalWidth, height: image.naturalHeight });
    setCenter({ x: image.naturalWidth / 2, y: image.naturalHeight / 2 });
  };
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop.size || !event.isPrimary || event.button !== 0) return;
    event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, center: getAvatarCenter(crop) };
  };
  const pan = (event: PointerEvent<HTMLDivElement>) => {
    const previous = drag.current;
    if (!previous || previous.id !== event.pointerId) return;
    const ratio = crop.size / event.currentTarget.getBoundingClientRect().width;
    move({ x: previous.center.x - (event.clientX - previous.x) * ratio, y: previous.center.y - (event.clientY - previous.y) * ratio });
  };
  return { size, crop, zoom, load, reset, start, pan, stop: () => { drag.current = null; },
    scale: (next: number) => { const bounded = Math.max(1, Math.min(4, next)); drag.current = null; move(getAvatarCenter(crop), bounded); setZoom(bounded); },
    moveBy: (x: number, y: number) => move({ x: crop.x + crop.size / 2 + x * crop.size / 40, y: crop.y + crop.size / 2 + y * crop.size / 40 }) };
}

/** 原生非被动监听才能阻止滚轮带动外层弹窗；只在取景区域内接管滚动。 */
function useAvatarWheel(zoom: number, ready: boolean, scale: (next: number) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !ready) return;
    let nextZoom = zoom;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault(); event.stopPropagation();
      // 鼠标按行、触控板按像素、部分设备按页上报，先换算再限制单次缩放幅度。
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
      nextZoom = Math.max(1, Math.min(4, nextZoom * Math.exp(-delta * 0.0015)));
      scale(nextZoom);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoom, ready, scale]);
  return viewport;
}

function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>, move: (x: number, y: number) => void) {
  const direction: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const delta = direction[event.key];
  if (!delta) return;
  event.preventDefault(); move(...delta);
}

export function AvatarCropEditor({ source, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const image = useRef<HTMLImageElement>(null);
  const editor = useAvatarCrop();
  const [error, setError] = useState("");
  const { crop, size } = editor;
  const viewport = useAvatarWheel(editor.zoom, Boolean(crop.size), editor.scale);
  const confirm = () => {
    if (!image.current || !crop.size || error) return;
    try { onConfirm(cropAvatar(image.current, crop)); }
    catch { setError(t("profile.crop.failed")); }
  };
  return <>
    <div className="shrink-0 space-y-1.5"><h2 id="avatar-crop-title" className="text-lg font-semibold">{t("profile.crop.title")}</h2><p className="text-sm text-muted-foreground">{t("profile.crop.hint")}</p></div>
    <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain py-1">
      {/* 界面：圆形取景框，框外变暗；实际裁出的四个角仍保留在正方形文件中。 */}
      <div ref={viewport} data-avatar-crop tabIndex={0} role="group" aria-label={t("profile.crop.dragHint")} onKeyDown={event => moveWithKeyboard(event, editor.moveBy)} onPointerDown={editor.start} onPointerMove={editor.pan} onPointerUp={editor.stop} onPointerCancel={editor.stop} onLostPointerCapture={editor.stop} className="relative mx-auto aspect-square w-full max-w-[320px] touch-none select-none overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke cursor-grab active:cursor-grabbing">
        <img ref={image} src={source} alt={t("profile.edit.avatarPreviewAlt")} draggable={false} onLoad={event => editor.load(event.currentTarget)} onError={() => setError(t("profile.errors.readFailed"))} className="pointer-events-none absolute max-w-none" style={crop.size ? { width: `${size.width / crop.size * 100}%`, height: `${size.height / crop.size * 100}%`, left: `${-crop.x / crop.size * 100}%`, top: `${-crop.y / crop.size * 100}%` } : { visibility: "hidden" }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.55)]" />
      </div>
      <label className="mx-auto flex max-w-[320px] items-center gap-3 text-xs"><span>{t("profile.crop.zoom")}</span><input type="range" min={1} max={4} step={0.01} value={editor.zoom} disabled={!crop.size} onChange={event => editor.scale(Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--accent-stroke)]" /><span className="w-10 text-right tabular-nums">{Math.round(editor.zoom * 100)}%</span></label>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><button type="button" onClick={editor.reset} className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs hover:bg-muted"><RotateCcw size={14} />{t("profile.crop.reset")}</button><button type="button" onClick={onCancel} className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">{t("common.cancel")}</button><button type="button" data-avatar-crop-confirm disabled={!crop.size || Boolean(error)} onClick={confirm} className="h-9 rounded-md bg-accent-fill px-4 text-sm text-accent-fill-foreground disabled:opacity-50">{t("profile.crop.confirm")}</button></div>
  </>;
}
