"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { COMIC_CATEGORIES } from "@/data/comic-templates";
interface SaveTemplateProps { categories: string[]; onSave: (name: string, category: string) => Promise<void>; onClose: () => void }

export default function ComicSaveTemplateDialog({ categories, onSave, onClose }: SaveTemplateProps) {
  const { t } = useTranslation(), ref = useRef<HTMLDialogElement>(null), busy = useRef(false);
  const [name, setName] = useState(""), [category, setCategory] = useState<string>("polygon"), [customCategory, setCustomCategory] = useState("");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  const options = [...new Set([...COMIC_CATEGORIES, ...categories])];
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return;
    const chosen = category === "new" ? `custom:${customCategory.trim()}` : category;
    if (!name.trim() || (category === "new" && !customCategory.trim())) return;
    busy.current = true; setSaving(true); setError("");
    try { await onSave(name.trim(), chosen); } catch { setError(t("toolBox.comic.templates.saveFailed")); }
    finally { busy.current = false; setSaving(false); }
  }
  return <dialog ref={ref} data-save-template-dialog aria-labelledby="comic-save-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }}
    className="m-auto w-[min(420px,calc(100%-24px))] rounded-lg border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
    {/* 弹窗：保存自定义排版到模板库，分类支持新建。 */}
    <form onSubmit={event => { void submit(event); }} className="space-y-4 p-4">
      <h3 id="comic-save-title" className="font-semibold">{t("toolBox.comic.templates.saveTitle")}</h3>
      <p className="text-xs text-muted-foreground">{t("toolBox.comic.templates.geometryHint")}</p>
      <label className="block text-sm">{t("toolBox.comic.templates.nameLabel")}<input data-template-name autoFocus required maxLength={80} value={name} disabled={saving} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded border border-border bg-background px-2 py-2" /></label>
      <label className="block text-sm">{t("toolBox.comic.templates.category")}<select data-save-template-category value={category} disabled={saving} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded border border-border bg-background px-2 py-2">
        {options.map(value => <option key={value} value={value}>{value.startsWith("custom:") ? value.slice(7) : t(`toolBox.comic.templates.categories.${value as typeof COMIC_CATEGORIES[number]}`)}</option>)}
        <option value="new">{t("toolBox.comic.templates.newCategory")}</option>
      </select></label>
      {category === "new" && <label className="block text-sm">{t("toolBox.comic.templates.categoryName")}<input data-custom-category required maxLength={73} disabled={saving} value={customCategory} onChange={event => setCustomCategory(event.target.value)} className="mt-1 w-full rounded border border-border bg-background px-2 py-2" /></label>}
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <footer className="flex justify-end gap-2 border-t border-border pt-3">
        <button type="button" onClick={onClose} disabled={saving} className="rounded border border-border px-3 py-2 text-sm">{t("common.cancel")}</button>
        <button data-confirm-save-template type="submit" disabled={saving || !name.trim() || (category === "new" && !customCategory.trim())} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40">{t(saving ? "toolBox.comic.templates.saving" : "common.save")}</button>
      </footer>
    </form>
  </dialog>;
}
