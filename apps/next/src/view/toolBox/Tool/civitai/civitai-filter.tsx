"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import type { CivitaiFilters } from "@/utils/civitai";

interface FilterProps { filters: CivitaiFilters; bases: string[]; onChange: (filters: CivitaiFilters) => void }
function FilterOptions({ filters, bases, onChange }: FilterProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const matches = bases.filter((base) => base.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="mx-auto w-full max-w-2xl space-y-5 py-2">
    <label className="block space-y-2"><span className="text-xs text-muted-foreground">{t("toolBox.civitai.sort")}</span><SimpleSelect value={filters.sort} onChange={(sort) => onChange({ ...filters, sort })} ariaLabel={t("toolBox.civitai.sort")} options={[{ value: "Most Downloaded", label: t("toolBox.civitai.popular") }, { value: "Newest", label: t("toolBox.civitai.newest") }, { value: "Highest Rated", label: t("toolBox.civitai.rated") }]} triggerClassName="focus:!ring-sky-500" /></label>
    <div className="space-y-2"><label className="block text-xs text-muted-foreground" htmlFor="civitai-base-search">{t("toolBox.civitai.base")}</label><input id="civitai-base-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("toolBox.civitai.baseSearch")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-sky-500" /></div>
    <div role="group" aria-label={t("toolBox.civitai.base")} className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">{["", ...matches].map((base) => <button key={base} type="button" data-civitai-base={base} aria-pressed={filters.base === base} onClick={() => onChange({ ...filters, base })} className={`rounded-lg border px-3 py-2 text-left text-xs ${filters.base === base ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-border hover:bg-muted"}`}>{base || t("toolBox.civitai.baseAll")}</button>)}</div>
    {!matches.length && <p className="text-xs text-muted-foreground">{t("toolBox.civitai.baseEmpty")}</p>}
    <button type="button" onClick={() => onChange({ ...filters, base: "", sort: "Most Downloaded" })} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.reset")}</button>
  </div>;
}
export function CivitaiFilter(props: FilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = Number(Boolean(props.filters.base)) + Number(props.filters.sort !== "Most Downloaded");
  return <>
    <button type="button" data-civitai-filter onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"><SlidersHorizontal size={14} />{t("toolBox.civitai.filter")}{count > 0 && <span className="rounded bg-sky-500/10 px-1 text-sky-700 dark:text-sky-300">{count}</span>}</button>
    {/* 弹窗：模型筛选；复用项目弹窗外壳 */}
    <ResourceDialogShell open={open} title={t("toolBox.civitai.filter")} titleId="civitai-filter-title" onOpenChange={setOpen}><FilterOptions {...props} onChange={(filters) => { props.onChange(filters); setOpen(false); }} /></ResourceDialogShell>
  </>;
}
