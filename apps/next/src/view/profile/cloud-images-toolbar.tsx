"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { CloudImage } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";

export type ImageFilter = "all" | "private" | "public";
interface ToolbarProps { query: string; filter: ImageFilter; busy: boolean; onQuery: (value: string) => void; onFilter: (value: ImageFilter) => void; onLookup: (id: string) => void }

/** 名称与 ID 在已加载数据中匹配；完整数字 ID 可提交到现有详情接口，避免把本地搜索当成全库搜索。 */
export function matchesCloudImage(image: CloudImage, query: string, filter: ImageFilter) {
  const needle = query.trim().toLocaleLowerCase();
  return (filter === "all" || image.visibility === filter) && (!needle || image.title.toLocaleLowerCase().includes(needle) || image.id.includes(needle));
}

export function CloudImagesToolbar({ query, filter, busy, onQuery, onFilter, onLookup }: ToolbarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isId = /^[1-9][0-9]{0,19}$/.test(query.trim());
  return <div className="space-y-3">
    <form role="search" onSubmit={event => { event.preventDefault(); if (isId && !busy) onLookup(query.trim()); }} className="flex min-w-0 items-center gap-3">
      <label className="relative min-w-0 flex-1"><span className="sr-only">{t("profile.cloud.searchPlaceholder")}</span><Search size={19} strokeWidth={1.7} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-cloud-search type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder={t("profile.cloud.searchPlaceholder")} className="h-12 w-full min-w-0 rounded-xl border border-border bg-transparent pl-11 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
      {isId && <button type="submit" disabled={busy} className="h-12 shrink-0 rounded-xl border border-border px-3 text-sm hover:bg-muted disabled:opacity-50">{t(busy ? "profile.cloud.loading" : "profile.cloud.lookup")}</button>}
      <button type="button" data-cloud-filter aria-label={t("profile.cloud.filter")} aria-expanded={open} aria-controls="cloud-image-filters" onClick={() => setOpen(value => !value)} className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border transition-colors focus-visible:ring-2 focus-visible:ring-ring ${open || filter !== "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}><SlidersHorizontal size={21} strokeWidth={1.7} /></button>
    </form>
    {open && <div id="cloud-image-filters" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><span className="mr-1 text-muted-foreground">{t("profile.cloud.visibility")}</span>{(["all", "private", "public"] as const).map(value => <button key={value} type="button" data-cloud-visibility={value} aria-pressed={filter === value} onClick={() => onFilter(value)} className={`rounded-full border px-3 py-1.5 focus-visible:ring-2 focus-visible:ring-ring ${filter === value ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}>{t(value === "all" ? "profile.cloud.all" : value === "private" ? "profile.cloud.private" : "profile.cloud.public")}</button>)}</div>}
  </div>;
}
