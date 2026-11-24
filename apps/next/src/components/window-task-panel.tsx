"use client";
import { HoverTip } from "@/components/hover-tip";


import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useTranslation } from "@/i18n";

export interface WindowTaskPanelProps {
  id: string;
  title: string;
  description: string;
  anchor: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
  variant?: "default" | "generation";
  suspended?: boolean;
  expanded?: boolean;
  expandLabel?: string;
  onToggleExpand?: () => void;
}
/** 标题栏任务浮窗：下载与生成共用主题、定位、焦点及关闭行为。 */
export function WindowTaskPanel({ id, title, description, anchor, onClose, children, variant = "default", suspended = false, expanded = false, expandLabel, onToggleExpand }: WindowTaskPanelProps) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 看大图时像把书暂时合上：保留正文 DOM 和阅读位置，但不再抢焦点或处理 Escape。
    if (suspended) return;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [anchor, onClose, suspended]);
  return createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1} hidden={suspended} inert={suspended} data-expanded={expanded || undefined} style={{ ...(expanded ? { top: "var(--window-chrome-height)", right: 0, bottom: 0, left: 0, width: "auto", maxHeight: "none", borderRadius: 0 } : {}), ...(suspended ? { display: "none" } : {}) }} {...{ [`data-${id}`]: true }} className={`window-download-center flex flex-col overflow-hidden border border-border bg-background text-foreground outline-none ${variant === "generation" ? "generation-task-panel rounded-2xl shadow-lg" : "rounded-xl shadow-xl"}`}>
    <header className={`flex shrink-0 items-start justify-between gap-3 border-b border-border ${variant === "generation" ? "px-5 py-4" : "p-3"}`}><div><h2 id={`${id}-title`} className={variant === "generation" ? "text-base font-semibold leading-6" : "text-sm font-semibold"}>{title}</h2><p className={`mt-1 text-muted-foreground ${variant === "generation" ? "text-xs leading-5" : "text-[10px]"}`} role="status">{description}</p></div><div className="flex shrink-0 items-center gap-1">{onToggleExpand && <HoverTip asChild layer="window" label={(expandLabel) ?? ""}><button type="button" data-task-panel-expand aria-label={expandLabel} aria-pressed={expanded} onClick={onToggleExpand} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></HoverTip>}<button type="button" onClick={onClose} aria-label={t("common.close")} className={`text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-stroke ${variant === "generation" ? "grid size-8 shrink-0 place-items-center rounded-lg transition-colors" : "rounded-md p-1"}`}><X size={16} strokeWidth={variant === "generation" ? 1.5 : 2} /></button></div></header>
    {children}
  </div>, document.body);
}
