"use client";

/** 通用右键菜单容器：复用点击外部/Esc 关闭规则，以 Portal 避免裁切，并按实测尺寸限制在视口内。 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ContextMenuShellProps {
  x: number; y: number; label: string; onClose: () => void; children: ReactNode;
  role?: "menu" | "dialog";
  className?: string;
}

export function ContextMenuShell({ x, y, label, onClose, children, role = "menu", className = "w-64 p-2" }: ContextMenuShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = ref.current;
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
    // role 的入场动画带 scale；用未缩放的布局尺寸，避免动画结束后越过窗口边缘。
    if (menu) setPosition({ left: Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)),
      top: Math.max(chrome + 8, Math.min(y, innerHeight - menu.offsetHeight - 8)) });
    ref.current?.querySelector<HTMLElement>("button:not(:disabled), input, select")?.focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const scroll = (event: Event) => { if (event.target instanceof Node && ref.current?.contains(event.target)) return; onClose(); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true); window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return createPortal(<div ref={ref} role={role} aria-label={label} style={position}
    className={`fixed z-[120] max-h-[calc(100dvh-var(--window-chrome-height,0px)-16px)] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-border bg-background text-foreground shadow-xl ${className}`}
    onContextMenu={event => event.preventDefault()}>{children}</div>, document.body);
}
