"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

export type ComicToolDockMode = "floating" | "left" | "right";
interface ToolLayout { mode: ComicToolDockMode; collapsed: boolean; left: number; top: number }
interface DockViewport { width: number; height: number }
interface DockGesture { pointerId: number; x: number; y: number; offsetX: number; offsetY: number; initial: ToolLayout; moved: boolean }
export interface ComicToolDock {
  layout: ToolLayout; compact: boolean; preview: "left" | "right" | null;
  position: { left: number; top: number }; reserved: number; dragging: boolean;
  start: (event: PointerEvent<HTMLButtonElement>) => void; move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: () => void; cancel: () => void; dock: (mode: ComicToolDockMode) => void; toggleCollapsed: () => void;
}
const STORAGE_KEY = "illusion-realm-comic-tool-dock-v1";
const DEFAULT_LAYOUT: ToolLayout = { mode: "floating", collapsed: false, left: 8, top: 8 };

function readLayout(): ToolLayout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_LAYOUT;
    const layout = value as Record<string, unknown>;
    if (layout.version !== 1 || !["floating", "left", "right"].includes(String(layout.mode))) return DEFAULT_LAYOUT;
    return { mode: layout.mode as ComicToolDockMode, collapsed: layout.collapsed === true,
      left: typeof layout.left === "number" && Number.isFinite(layout.left) ? Math.max(8, layout.left) : 8,
      top: typeof layout.top === "number" && Number.isFinite(layout.top) ? Math.max(8, layout.top) : 8 };
  } catch { return DEFAULT_LAYOUT; }
}

function useDockViewport(hostRef: RefObject<HTMLElement | null>): DockViewport {
  const [viewport, setViewport] = useState({ width: 640, height: 640 });
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const measure = () => {
      const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(measure); observer.observe(host); measure();
    window.addEventListener("resize", measure); document.addEventListener("visibilitychange", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("visibilitychange", measure); };
  }, [hostRef]);
  return viewport;
}

function constrain(left: number, top: number, viewport: DockViewport) {
  return { left: Math.max(8, Math.min(left, viewport.width - 224)), top: Math.max(8, Math.min(top, viewport.height - 180)) };
}

function dockingTarget(event: PointerEvent<HTMLButtonElement>, host: HTMLElement): "left" | "right" | null {
  const rect = host.getBoundingClientRect();
  if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left - 16 || event.clientX > rect.right + 16) return null;
  if (event.clientX - rect.left <= 28) return "left";
  return rect.right - event.clientX <= 28 ? "right" : null;
}

function useDockPersistence(layout: ToolLayout, dragging: boolean, setLayout: (layout: ToolLayout) => void) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { setLayout(readLayout()); setReady(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [setLayout]);
  useEffect(() => {
    if (!ready || dragging) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...layout })); } catch { /* Layout preferences must not interrupt editing. */ }
  }, [layout, dragging, ready]);
}

function beginGesture(event: PointerEvent<HTMLButtonElement>, layout: ToolLayout): DockGesture | null {
  if (event.button !== 0) return null;
  const rect = event.currentTarget.closest("[data-image-tools]")?.getBoundingClientRect(); if (!rect) return null;
  event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, initial: layout, moved: false };
}

function useDockGesture(hostRef: RefObject<HTMLElement | null>, layout: ToolLayout, setLayout: React.Dispatch<React.SetStateAction<ToolLayout>>, viewport: DockViewport) {
  const gesture = useRef<DockGesture | null>(null);
  const target = useRef<"left" | "right" | null>(null);
  const [dragging, setDragging] = useState(false), [preview, setPreview] = useState<"left" | "right" | null>(null);
  const start = (event: PointerEvent<HTMLButtonElement>) => { gesture.current = beginGesture(event, layout); };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current, host = hostRef.current; if (!current || !host || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    current.moved = true; setDragging(true);
    const rect = host.getBoundingClientRect();
    const position = constrain(event.clientX - rect.left - current.offsetX, event.clientY - rect.top - current.offsetY, viewport);
    setLayout(previous => ({ ...previous, mode: "floating", ...position }));
    target.current = dockingTarget(event, host); setPreview(target.current);
  };
  const finish = (cancelled: boolean) => {
    const current = gesture.current; if (!current) return;
    const nextMode = target.current;
    gesture.current = null;
    if (cancelled) setLayout(current.initial);
    else if (current.moved && nextMode) setLayout(previous => ({ ...previous, mode: nextMode, left: current.initial.left, top: current.initial.top }));
    target.current = null; setDragging(false); setPreview(null);
  };
  return { start, move, end: () => finish(false), cancel: () => finish(true), preview, dragging };
}

export default function useComicToolDock(hostRef: RefObject<HTMLElement | null>): ComicToolDock {
  const [layout, setLayout] = useState<ToolLayout>(DEFAULT_LAYOUT);
  const viewport = useDockViewport(hostRef);
  const gesture = useDockGesture(hostRef, layout, setLayout, viewport);
  useDockPersistence(layout, gesture.dragging, setLayout);
  const compact = viewport.width < 480 || layout.collapsed;
  return { layout, compact, ...gesture, position: constrain(layout.left, layout.top, viewport),
    reserved: layout.mode === "floating" ? 0 : compact ? 48 : 216,
    dock: mode => setLayout(previous => ({ ...previous, mode })),
    toggleCollapsed: () => setLayout(previous => ({ ...previous, collapsed: !previous.collapsed })) };
}
