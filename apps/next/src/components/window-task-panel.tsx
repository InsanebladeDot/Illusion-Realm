"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";

export interface WindowTaskPanelProps {
  id: string;
  title: string;
  description: string;
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
  variant?: "default" | "generation";
}
/** 标题栏任务浮窗：下载与生成共用主题、定位、焦点及关闭行为。 */
export function WindowTaskPanel({ id, title, description, anchor, onClose, children, variant = "default" }: WindowTaskPanelProps) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [anchor, onClose]);
  return createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1} {...{ [`data-${id}`]: true }} className={`window-download-center flex flex-col overflow-hidden border border-border bg-background text-foreground outline-none ${variant === "generation" ? "generation-task-panel rounded-2xl shadow-lg" : "rounded-xl shadow-xl"}`}>
    <header className={`flex shrink-0 items-start justify-between gap-3 border-b border-border ${variant === "generation" ? "px-5 py-4" : "p-3"}`}><div><h2 id={`${id}-title`} className={variant === "generation" ? "text-base font-semibold leading-6" : "text-sm font-semibold"}>{title}</h2><p className={`mt-1 text-muted-foreground ${variant === "generation" ? "text-xs leading-5" : "text-[10px]"}`} role="status">{description}</p></div><button type="button" onClick={onClose} aria-label={t("common.close")} className={`text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-stroke ${variant === "generation" ? "grid size-8 shrink-0 place-items-center rounded-lg transition-colors" : "rounded-md p-1"}`}><X size={16} strokeWidth={variant === "generation" ? 1.5 : 2} /></button></header>
    {children}
  </div>, document.body);
}
