"use client";

/** 常驻宿主像保留打开的工作台：隐藏只停交互和试听，生成任务与撤销历史继续留在原实例。 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useCanvasSessionsStore } from "@/stores/use-canvas-sessions-store";
import { useToastStore } from "@/stores/useToastStore";
import { t } from "@/i18n";

const Canvas = dynamic(() => import("./infinite-canvas-page").then(module => module.InfiniteCanvasPage), { ssr: false });
export interface CanvasSessionControl { close: () => Promise<boolean> }
export interface CanvasSessionProps {
  projectId?: string;
  active?: boolean;
  onControl?: (id: string, control: CanvasSessionControl | null) => void;
  onLeave?: (mode: "suspend" | "close" | "delete") => void;
}

export function CanvasSessionHost() {
  const { sessions, activeId, target, closeRequested } = useCanvasSessionsStore();
  const controls = useRef(new Map<string, CanvasSessionControl>());
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!target) return;
    const measure = () => setRect(target.getBoundingClientRect());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [target]);
  useEffect(() => {
    if (!closeRequested) return;
    void controls.current.get(closeRequested)?.close().then(ok => {
      if (ok) useCanvasSessionsStore.getState().remove(closeRequested);
      else useToastStore.getState().show(t("canvas.sessionBusy"), "error");
    }).catch(() => useToastStore.getState().show(t("canvas.persistenceError"), "error"))
      .finally(() => useCanvasSessionsStore.setState({ closeRequested: null }));
  }, [closeRequested]);
  const visible = Boolean(target && rect && activeId);
  return <div data-canvas-session-host style={{ position: "fixed", zIndex: 30, display: visible ? "block" : "none",
    left: rect?.left, top: rect?.top, width: rect?.width, height: rect?.height }}>
    {sessions.map(session => <div key={session.id} data-canvas-session={session.id} hidden={!visible || activeId !== session.id} inert={!visible || activeId !== session.id} style={{ width: "100%", height: "100%" }}>
      <Canvas projectId={session.id} active={visible && activeId === session.id}
        onControl={(id, control) => { if (control) controls.current.set(id, control); else controls.current.delete(id); }}
        onLeave={mode => {
          if (mode === "suspend") useCanvasSessionsStore.getState().showLibrary();
          else useCanvasSessionsStore.getState().remove(session.id);
        }} />
    </div>)}
  </div>;
}
