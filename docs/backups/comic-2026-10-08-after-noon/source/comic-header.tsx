"use client";

import { useEffect, useRef } from "react";
import { Check, Download, LayoutTemplate, MoreHorizontal, RotateCcw, Undo2 } from "lucide-react";
import { useTranslation } from "@/i18n";

interface ComicHeaderProps {
  saved: boolean; exporting: boolean; canUndo: boolean;
  onSave: () => void; onExportPng: () => void; onExportJson: () => void;
  onReset: () => void; onTemplates: () => void; onUndo: () => void;
}

function MoreActions({ onExportJson, onReset, onTemplates, onUndo, canUndo }: ComicHeaderProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current?.open) { ref.current.removeAttribute("open"); ref.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", escape); };
  }, []);
  const actions = [
    { key: "toolBox.comic.templates.open", Icon: LayoutTemplate, run: onTemplates },
    { key: "toolBox.comic.templates.undo", Icon: Undo2, run: onUndo, disabled: !canUndo },
    { key: "toolBox.comic.exportJson", Icon: Download, run: onExportJson },
    { key: "toolBox.comic.reset", Icon: RotateCcw, run: onReset },
  ] as const;
  return <details ref={ref} data-comic-more className="relative">
    <summary aria-label={t("toolBox.comic.more")} title={t("toolBox.comic.more")} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} /></summary>
    <div className="absolute right-0 top-full z-50 mt-1 w-44 max-w-[calc(100vw-80px)] rounded-md border border-border bg-background p-1 shadow-lg">
      {actions.map(({ key, Icon, run, ...option }) => <button key={key} type="button" disabled={"disabled" in option && option.disabled} onClick={() => { ref.current?.removeAttribute("open"); run(); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted disabled:opacity-40"><Icon size={15} className="shrink-0" />{t(key)}</button>)}
    </div>
  </details>;
}

export default function ComicHeader(props: ComicHeaderProps) {
  const { t } = useTranslation();
  return <header data-comic-header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
    <h2 className="text-lg font-semibold text-foreground">{t("toolBox.comic.title")}</h2>
    <div className="flex items-center gap-1.5">
      <button type="button" data-save-comic title={t("common.save")} aria-label={t("common.save")} onClick={props.onSave} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2 text-xs"><Check size={16} /><span>{t("common.save")}</span><span className="sr-only" aria-live="polite">{props.saved ? t("toolBox.comic.saved") : ""}</span></button>
      <button type="button" data-export-comic-png title={t("toolBox.comic.exportPng")} aria-label={t("toolBox.comic.exportPng")} onClick={props.onExportPng} disabled={props.exporting} aria-busy={props.exporting} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-700 px-2 text-xs text-white disabled:cursor-wait disabled:opacity-60"><Download size={16} /><span>{props.exporting ? t("toolBox.comic.exportingPng") : t("toolBox.comic.exportPng")}</span></button>
      {/* 界面：更多操作，包含模板、撤销、JSON 导出与恢复 */}
      <MoreActions {...props} />
    </div>
  </header>;
}
