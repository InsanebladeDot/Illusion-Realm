"use client";

import { useEffect, useId, useRef } from "react";
import { Copy, Maximize2, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

export type MetaFieldViewMode = "raw" | "json";
interface MetaFieldActionsProps {
  mode: MetaFieldViewMode;
  hasJson: boolean;
  label: string;
  onModeChange: (mode: MetaFieldViewMode) => void;
  onCopy: () => void;
  onExpand?: () => void;
}

export function MetaFieldActions({ mode, hasJson, label, onModeChange, onCopy, onExpand }: MetaFieldActionsProps) {
  const { t } = useTranslation();
  const buttonClass = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";
  return <div className="flex flex-wrap items-center gap-1">
    <div role="group" aria-label={t("inspect.metaField.viewMode")} className="inline-flex rounded-md border border-border p-0.5">
      {(["raw", "json"] as const).map(value => <button key={value} type="button" data-meta-view={value} aria-pressed={mode === value}
        disabled={value === "json" && !hasJson} title={value === "json" && !hasJson ? t("inspect.metaField.notJsonHint") : undefined}
        onClick={() => onModeChange(value)} className={cn("rounded px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40", mode === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
        {t(value === "raw" ? "inspect.metaField.rawView" : "inspect.metaField.jsonView")}
      </button>)}
    </div>
    <button type="button" data-meta-copy title={t("inspect.metaField.copyLabel", { key: label })} aria-label={t("inspect.metaField.copyLabel", { key: label })} onClick={onCopy} className={buttonClass}><Copy className="h-3.5 w-3.5" /></button>
    {onExpand && <button type="button" data-meta-expand title={t("inspect.metaField.expandLabel", { key: label })} aria-label={t("inspect.metaField.expandLabel", { key: label })} onClick={onExpand} className={buttonClass}><Maximize2 className="h-3.5 w-3.5" /></button>}
  </div>;
}

interface MetaFieldContentProps { text: string; mode: MetaFieldViewMode; compact?: boolean }
export function MetaFieldContent({ text, mode, compact }: MetaFieldContentProps) {
  return <div data-meta-content data-meta-mode={mode} tabIndex={0}
    className={cn("min-h-0 min-w-0 overflow-auto rounded-md focus-visible:outline-2 focus-visible:outline-primary", compact ? "max-h-64" : "flex-1")}>
    {mode === "json" ? <pre className="min-w-full w-max bg-background/60 p-2 font-mono text-xs leading-relaxed">{text}</pre>
      : <p className="whitespace-pre-wrap break-all text-sm leading-relaxed text-foreground/90">{text}</p>}
  </div>;
}

interface MetaFieldDialogProps extends Omit<MetaFieldActionsProps, "onExpand"> { text: string; onClose: () => void }
export function MetaFieldDialog({ text, onClose, ...actions }: MetaFieldDialogProps) {
  const { t } = useTranslation(), id = useId(), dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialogRef} data-meta-dialog aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
    className="m-auto h-[min(800px,calc(100dvh-32px))] w-[min(1120px,calc(100%-32px))] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50">
    {/* 弹窗：完整 Meta 文本，切换与复制复用卡片的当前查看方式。 */}
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border p-3 sm:p-4">
        <h2 id={id} className="min-w-0 break-all text-sm font-medium">{actions.label}</h2>
        <div className="flex flex-wrap items-center gap-2"><MetaFieldActions {...actions} />
          <button type="button" data-meta-close aria-label={t("common.close")} title={t("common.close")} onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4"><MetaFieldContent text={text} mode={actions.mode} /></div>
    </section>
  </dialog>;
}
