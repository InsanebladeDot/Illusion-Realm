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
}
/** 标题栏任务浮窗：下载与生成共用主题、定位、焦点及关闭行为。 */
export function WindowTaskPanel({ id, title, description, anchor, onClose, children }: WindowTaskPanelProps) {
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
  return createPortal(<div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1} {...{ [`data-${id}`]: true }} className="window-download-center flex flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-xl outline-none">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-3"><div><h2 id={`${id}-title`} className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] text-muted-foreground" role="status">{description}</p></div><button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button></header>
    {children}
  </div>, document.body);
}
