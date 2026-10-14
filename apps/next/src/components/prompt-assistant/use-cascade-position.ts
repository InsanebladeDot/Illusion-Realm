"use client";

/** Keep the root menu anchored independently; place scrolling child menus on the side with room. */
import { useEffect, useRef, useState, type RefObject } from "react";
export function useCascadePosition(anchor: RefObject<HTMLDivElement | null>, levels: number) {
  const panel = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(2);
  useEffect(() => {
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect(); const element = panel.current;
      if (!rect || !element) return;
      const inset = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
      const width = element.offsetWidth; const height = element.offsetHeight;
      const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
      const top = Math.max(inset + 8, Math.min(rect.top - height - 6, innerHeight - height - 8));
      const rightSpace = innerWidth - left - width - 8; const leftSpace = left - 8;
      const direction = rightSpace >= levels * width || rightSpace >= leftSpace ? 1 : -1;
      setCapacity(Math.max(0, Math.floor(Math.max(rightSpace, leftSpace) / width)));
      element.style.left = `${left}px`; element.style.top = `${top}px`;
      element.style.setProperty("--assistant-cascade-offset", `${direction * width}px`);
      element.style.setProperty("--assistant-cascade-arrow", direction === 1 ? "0deg" : "180deg");
      element.style.setProperty("--assistant-cascade-height", `${Math.max(60, innerHeight - top - 8)}px`);
      element.dataset.submenuDirection = direction === 1 ? "right" : "left";
    };
    position(); const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current); if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true); document.addEventListener("visibilitychange", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); document.removeEventListener("visibilitychange", position); };
  }, [anchor, levels]);
  return { panel, capacity };
}
