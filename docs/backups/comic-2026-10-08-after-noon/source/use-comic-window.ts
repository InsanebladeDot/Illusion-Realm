"use client";

// 长按 350ms 后启动拖动；共享停靠目标允许换边和排序，取消手势恢复原位置。
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { ComicWindowId, DockTarget, WindowLayout } from "./use-comic-workbench";

interface WindowGesture { pointerId: number; x: number; y: number; offsetX: number; offsetY: number; initial: WindowLayout; armed: boolean; moved: boolean }
interface WindowOptions {
  id: ComicWindowId; layout: WindowLayout; hostRef: RefObject<HTMLDivElement | null>; panelRef: RefObject<HTMLDivElement | null>;
  update: (layout: WindowLayout) => void; dock: (target: DockTarget) => void;
}

function constrain(layout: WindowLayout, host: HTMLElement, panel: HTMLElement): WindowLayout {
  const h = host.getBoundingClientRect(), p = panel.getBoundingClientRect();
  const pinWidth = window.matchMedia("(max-width: 1279px)").matches ? 40 : 0;
  return { ...layout, left: Math.max(0, Math.min(layout.left, h.width - pinWidth - p.width)), top: Math.max(0, Math.min(layout.top, h.height - p.height)) };
}

function dockingTarget(event: PointerEvent, host: HTMLElement, id: ComicWindowId): DockTarget | null {
  const r = host.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) return null;
  for (const panel of host.querySelectorAll<HTMLElement>('[data-comic-window][data-window-floating="false"]')) {
    if (panel.dataset.comicWindow === id) continue;
    const p = panel.getBoundingClientRect();
    if (!p.width || event.clientX < p.left || event.clientX > p.right || event.clientY < p.top || event.clientY > p.bottom) continue;
    const zone = panel.dataset.windowZone as DockTarget["zone"];
    return { zone, beside: panel.dataset.comicWindow as ComicWindowId, after: zone === "bottom" ? event.clientX > p.left + p.width / 2 : event.clientY > p.top + p.height / 2 };
  }
  if (r.bottom - event.clientY <= 36) return { zone: "bottom" };
  if (event.clientX - r.left <= 36) return { zone: "left" };
  return r.right - event.clientX <= 36 ? { zone: "right" } : null;
}

function useWindowBounds(options: WindowOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  useEffect(() => {
    const host = options.hostRef.current, panel = options.panelRef.current; if (!host || !panel) return;
    const measure = () => {
      const { layout, update } = latest.current; if (!layout.floating) return;
      const next = constrain(layout, host, panel);
      if (next.left !== layout.left || next.top !== layout.top) update(next);
    };
    const observer = new ResizeObserver(measure); observer.observe(host); observer.observe(panel);
    window.addEventListener("resize", measure); document.addEventListener("visibilitychange", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("visibilitychange", measure); };
  }, [options.hostRef, options.panelRef]);
}

interface SnapPreview { target: DockTarget; host: HTMLDivElement }
interface GestureControls {
  gesture: RefObject<WindowGesture | null>; timer: RefObject<number | undefined>; target: RefObject<DockTarget | null>;
  setPreview: (preview: SnapPreview | null) => void; setArmed: (armed: boolean) => void;
}

function startPress(event: PointerEvent<HTMLDivElement>, options: WindowOptions, controls: GestureControls) {
  const surface = event.target instanceof Element ? event.target.closest("[data-comic-drag-surface]") : null;
  if (!surface || event.button !== 0 || (event.target instanceof Element && event.target.closest("button,input,textarea,summary,label,a"))) return;
  const panel = options.panelRef.current; if (!panel) return;
  const r = panel.getBoundingClientRect(); event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
  controls.gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - r.left, offsetY: event.clientY - r.top, initial: options.layout, armed: false, moved: false };
  controls.timer.current = window.setTimeout(() => { if (controls.gesture.current) { controls.gesture.current.armed = true; controls.setArmed(true); } }, 350);
}

function moveWindow(event: PointerEvent<HTMLDivElement>, options: WindowOptions, controls: GestureControls) {
  const g = controls.gesture.current, host = options.hostRef.current, panel = options.panelRef.current;
  if (!g || !host || !panel || g.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - g.x, event.clientY - g.y);
  if (!g.armed) { if (distance > 6) { window.clearTimeout(controls.timer.current); controls.gesture.current = null; } return; }
  if (distance < 5 && !g.moved) return;
  g.moved = true; const h = host.getBoundingClientRect();
  options.update(constrain({ ...g.initial, floating: true, left: event.clientX - h.left - Math.min(g.offsetX, 260), top: event.clientY - h.top - Math.min(g.offsetY, 24) }, host, panel));
  controls.target.current = dockingTarget(event, host, options.id);
  controls.setPreview(controls.target.current ? { target: controls.target.current, host } : null);
}

function finishGesture(cancel: boolean, options: WindowOptions, controls: GestureControls) {
  window.clearTimeout(controls.timer.current); const g = controls.gesture.current;
  if (g && cancel) options.update(g.initial);
  else if (g?.moved && controls.target.current) options.dock(controls.target.current);
  controls.gesture.current = null; controls.target.current = null; controls.setArmed(false); controls.setPreview(null);
}

export default function useComicWindow(options: WindowOptions) {
  const gesture = useRef<WindowGesture | null>(null), timer = useRef<number | undefined>(undefined), target = useRef<DockTarget | null>(null);
  const [preview, setPreview] = useState<SnapPreview | null>(null), [armed, setArmed] = useState(false);
  const controls = { gesture, timer, target, setPreview, setArmed };
  useWindowBounds(options);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { start: (event: PointerEvent<HTMLDivElement>) => startPress(event, options, controls),
    move: (event: PointerEvent<HTMLDivElement>) => moveWindow(event, options, controls),
    end: () => finishGesture(false, options, controls), cancel: () => finishGesture(true, options, controls), preview, armed };
}

