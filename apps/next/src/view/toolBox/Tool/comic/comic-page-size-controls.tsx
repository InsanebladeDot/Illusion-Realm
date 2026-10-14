"use client";

import { useState } from "react";
import { LockKeyhole, Scan, UnlockKeyhole } from "lucide-react";
import { useTranslation } from "@/i18n";
import { MAX_COMIC_DIMENSION, MIN_COMIC_DIMENSION, type ComicPageSize } from "@/utils/comic/page-size";

interface SizeControlsProps { size: ComicPageSize; fit: boolean; onChange: (axis: "width" | "height", value: number) => void; onToggleLock: () => void; onToggleFit: () => void }
interface DimensionInputProps { axis: "width" | "height"; value: number; locked: boolean; onCommit: (value: number) => void }

function DimensionInput({ axis, value, locked, onCommit }: DimensionInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  function commit() {
    if (locked) return;
    const numeric = draft.trim() ? Number(draft) : NaN;
    const next = Number.isFinite(numeric) ? Math.max(MIN_COMIC_DIMENSION, Math.min(MAX_COMIC_DIMENSION, Math.round(numeric))) : value;
    setDraft(String(next)); onCommit(next);
  }
  return (
    <label className="min-w-0 text-xs text-muted-foreground">
      <span className="sr-only">{t(`toolBox.comic.pageSize.${axis}`)}</span>
      <input type="number" data-canvas-dimension={axis} aria-label={t(`toolBox.comic.pageSize.${axis}`)} min={MIN_COMIC_DIMENSION} max={MAX_COMIC_DIMENSION} step={1}
        value={draft} disabled={locked} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
        className="h-9 min-w-0 w-full rounded border border-border bg-background px-1 text-center text-xs tabular-nums text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" />
    </label>
  );
}

export default function ComicPageSizeControls({ size, fit, onChange, onToggleLock, onToggleFit }: SizeControlsProps) {
  const { t } = useTranslation();
  const lockLabel = t(size.locked ? "toolBox.comic.pageSize.unlock" : "toolBox.comic.pageSize.lock");
  return (
    <div data-canvas-controls className="w-full max-w-[360px] justify-self-center xl:col-start-2">
      <output data-canvas-size className="sr-only" aria-live="polite">{t("toolBox.comic.pageSize.current", { width: size.width, height: size.height })}</output>
      <div className="grid grid-cols-[minmax(0,1fr)_10px_minmax(0,1fr)_16px_32px_32px] items-center gap-1">
        <DimensionInput key={`width-${size.width}-${size.locked}`} axis="width" value={size.width} locked={size.locked} onCommit={value => onChange("width", value)} />
        <span aria-hidden="true" className="text-center text-xs">×</span>
        <DimensionInput key={`height-${size.height}-${size.locked}`} axis="height" value={size.height} locked={size.locked} onCommit={value => onChange("height", value)} />
        <span className="text-xs text-muted-foreground">px</span>
        <button type="button" data-lock-canvas aria-pressed={size.locked} onClick={onToggleLock} title={lockLabel} aria-label={lockLabel}
          className={`flex h-9 w-8 items-center justify-center rounded border ${size.locked ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>
          {size.locked ? <LockKeyhole size={17} /> : <UnlockKeyhole size={17} />}
        </button>
        <button type="button" data-fit-canvas aria-pressed={fit} aria-label={t("toolBox.comic.pageSize.fit")} onClick={onToggleFit} title={t("toolBox.comic.pageSize.fit")}
          className={`inline-flex h-9 w-8 items-center justify-center rounded border ${fit ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}><Scan size={16} /></button>
      </div>
    </div>
  );
}
