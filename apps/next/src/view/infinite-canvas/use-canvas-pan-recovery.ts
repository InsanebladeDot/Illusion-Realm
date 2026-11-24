"use client";

/** 空格临时平移与图引擎拖动状态收尾；窗外松手后不保留手掌光标。 */
import { useEffect, useState, type RefObject } from "react";
import { useStoreApi } from "@xyflow/react";

const INTERACTIVE = "input,textarea,select,button,a,video,audio,[contenteditable=true]";

export function useCanvasPanRecovery(host: RefObject<HTMLElement | null>, hand: boolean, enabled: boolean): boolean {
  const [space, setSpace] = useState(false);
  const store = useStoreApi();
  useEffect(() => {
    const stopDrag = () => {
      if (store.getState().paneDragging) store.setState({ paneDragging: false });
    };
    const reset = () => { stopDrag(); setSpace(false); };
    const down = (event: KeyboardEvent) => {
      if (event.key === "Escape") { reset(); return; }
      if (!enabled || event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!(event.target instanceof Element) || !host.current?.contains(event.target) || event.target.closest(INTERACTIVE)) return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpace(false); };
    // keyup/mouseup 可能在窗口外丢失，重新进入且无按键时清掉引擎的 dragging。
    const move = (event: PointerEvent) => { if (event.buttons === 0) stopDrag(); };
    const visibility = () => { if (document.visibilityState !== "visible") reset(); };
    return subscribePanRecovery({ down, up, stopDrag, reset, move, visibility });
  }, [enabled, host, store]);
  return enabled && (hand || space);
}

interface PanHandlers {
  down: (event: KeyboardEvent) => void;
  up: (event: KeyboardEvent) => void;
  stopDrag: () => void;
  reset: () => void;
  move: (event: PointerEvent) => void;
  visibility: () => void;
}

function subscribePanRecovery(handlers: PanHandlers): () => void {
  window.addEventListener("keydown", handlers.down);
  window.addEventListener("keyup", handlers.up, true);
  window.addEventListener("pointerup", handlers.stopDrag, true);
  window.addEventListener("mouseup", handlers.stopDrag, true);
  window.addEventListener("pointercancel", handlers.reset, true);
  window.addEventListener("pointermove", handlers.move, true);
  window.addEventListener("blur", handlers.reset);
  document.addEventListener("visibilitychange", handlers.visibility);
  return () => {
    window.removeEventListener("keydown", handlers.down);
    window.removeEventListener("keyup", handlers.up, true);
    window.removeEventListener("pointerup", handlers.stopDrag, true);
    window.removeEventListener("mouseup", handlers.stopDrag, true);
    window.removeEventListener("pointercancel", handlers.reset, true);
    window.removeEventListener("pointermove", handlers.move, true);
    window.removeEventListener("blur", handlers.reset);
    document.removeEventListener("visibilitychange", handlers.visibility);
    handlers.reset();
  };
}
