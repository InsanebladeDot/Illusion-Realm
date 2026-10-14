"use client";

/** Load another page only on downward input at the catalog bottom; lock each request until state changes. */
import { useEffect, useRef } from "react";

interface ScrollLoadOptions {
  next: string | null;
  status: "loading" | "ready" | "error";
  load: (page: string | null) => Promise<void>;
}
export function useCatalogScrollLoad({ next, status, load }: ScrollLoadOptions) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element || !next || status !== "ready") return;
    let requested = false;
    let previousTop = element.scrollTop;
    const request = () => {
      if (requested || element.scrollHeight - element.clientHeight - element.scrollTop > 2) return;
      requested = true;
      void load(next).catch(() => { /* The catalog request hook displays errors and an explicit retry. */ });
    };
    const scroll = () => { const top = element.scrollTop; if (top > previousTop) request(); previousTop = top; };
    const wheel = (event: WheelEvent) => { if (event.deltaY > 0 && !event.ctrlKey) request(); };
    element.addEventListener("scroll", scroll, { passive: true });
    element.addEventListener("wheel", wheel, { passive: true });
    return () => { element.removeEventListener("scroll", scroll); element.removeEventListener("wheel", wheel); };
  }, [next, status, load]);
  return container;
}
