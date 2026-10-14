"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { COMIC_CATEGORIES, COMIC_TEMPLATES, type ComicCategory, type ComicTemplate } from "@/data/comic-templates";
import { useTranslation } from "@/i18n";
import { templateThumbnail } from "@/utils/comic/template-thumbnail";

interface TemplateDialogProps { panelCount: number; onApply: (template: ComicTemplate) => void; onClose: () => void }
type CategoryFilter = ComicCategory | "all";

function TemplateCard({ template, active, onSelect }: { template: ComicTemplate; active: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const src = useMemo(() => templateThumbnail(template), [template]);
  return (
    <button type="button" data-template-id={template.id} aria-pressed={active} onClick={onSelect}
      className={`min-w-0 overflow-hidden rounded-md border text-left transition-colors ${active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-muted-foreground"}`}>
      <img src={src} alt={t(template.nameKey)} width={240} height={320} className="aspect-[3/4] w-full object-contain" />
      <span className="block px-2 py-2"><span className="block text-xs font-medium leading-5 text-foreground">{t(template.nameKey)}</span>
        <span className="text-xs text-muted-foreground">{t("toolBox.comic.panelCount", { count: template.frames.length })}</span></span>
    </button>
  );
}

function DialogHeader({ onClose }: Pick<TemplateDialogProps, "onClose">) {
  const { t } = useTranslation();
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div><h3 id="comic-template-library-title" className="text-base font-semibold">{t("toolBox.comic.templates.title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("toolBox.comic.templates.total", { count: COMIC_TEMPLATES.length })}</p></div>
          <button type="button" onClick={onClose} title={t("common.close")} aria-label={t("common.close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-muted"><X size={18} /></button>
    </header>
  );
}

function CategoryStrip({ category, onChange }: { category: CategoryFilter; onChange: (value: CategoryFilter) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2" aria-label={t("toolBox.comic.templates.category")}>
          {(["all", ...COMIC_CATEGORIES] as const).map(value => <button key={value} type="button" data-template-category={value} aria-pressed={category === value}
            onClick={() => onChange(value)} className={`shrink-0 whitespace-nowrap rounded px-3 py-2 text-xs ${category === value ? "bg-emerald-700 text-white" : "text-muted-foreground hover:bg-muted"}`}>
            {t(`toolBox.comic.templates.categories.${value}`)} <span className="opacity-70">{value === "all" ? COMIC_TEMPLATES.length : COMIC_TEMPLATES.filter(item => item.category === value).length}</span>
          </button>)}
    </div>
  );
}

interface TemplateFooterProps { selected: ComicTemplate; removedCount: number; confirming: boolean; onApply: () => void; onCancel: () => void }
function TemplateFooter({ selected, removedCount, confirming, onApply, onCancel }: TemplateFooterProps) {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-border px-4 py-3">
          {confirming && <p role="alert" className="mb-3 text-sm leading-5 text-rose-600 dark:text-rose-400">{t("toolBox.comic.templates.shrinkWarning", { count: removedCount })}</p>}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-xs leading-5"><p className="font-medium">{t(selected.nameKey)}</p><p className="text-muted-foreground">{t("toolBox.comic.panelCount", { count: selected.frames.length })}</p></div>
            <div className="flex shrink-0 gap-2">
              {confirming && <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-2 text-sm">{t("common.cancel")}</button>}
              <button type="button" data-apply-template onClick={onApply} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-3 py-2 text-sm text-white"><Check size={16} />{t(confirming ? "toolBox.comic.templates.confirmApply" : "toolBox.comic.templates.apply")}</button>
            </div>
          </div>
    </footer>
  );
}

export default function ComicTemplateDialog({ panelCount, onApply, onClose }: TemplateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selected, setSelected] = useState(COMIC_TEMPLATES[0]);
  const [confirming, setConfirming] = useState(false);
  const visible = category === "all" ? COMIC_TEMPLATES : COMIC_TEMPLATES.filter(item => item.category === category);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  function applySelection() {
    if (selected.frames.length < panelCount && !confirming) { setConfirming(true); return; }
    onApply(selected);
  }
  function selectCategory(value: CategoryFilter) {
    setCategory(value); setConfirming(false);
    if (value !== "all" && selected.category !== value) setSelected(COMIC_TEMPLATES.find(item => item.category === value) ?? COMIC_TEMPLATES[0]);
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="comic-template-library-title" onCancel={onClose}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto w-[min(940px,calc(100%-24px))] max-w-none overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
      {/* 弹窗：漫画分镜模板库 */}
      <section className="flex max-h-[min(820px,calc(100dvh-32px))] flex-col">
        <DialogHeader onClose={onClose} /><CategoryStrip category={category} onChange={selectCategory} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/50 p-3 sm:p-4"><div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-5">
          {visible.map(template => <TemplateCard key={template.id} template={template} active={selected.id === template.id} onSelect={() => { setSelected(template); setConfirming(false); }} />)}
        </div></div>
        <TemplateFooter selected={selected} removedCount={panelCount - selected.frames.length} confirming={confirming} onApply={applySelection} onCancel={() => setConfirming(false)} />
      </section>
    </dialog>
  );
}
