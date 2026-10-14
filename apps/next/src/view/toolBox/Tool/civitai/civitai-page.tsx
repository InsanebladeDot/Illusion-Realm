"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useTranslation } from "@/i18n";
import { CIVITAI_SOURCES, civitaiInput, type CivitaiFilters, type CivitaiModel } from "@/utils/civitai";
import { CivitaiCard } from "./civitai-card";
import { CivitaiDetails } from "./civitai-details";
import { CivitaiFilter } from "./civitai-filter";
import { useCivitaiModels } from "./use-civitai-models";
import { LocalModelLibrary } from "./local-model-library";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { hasLocalCivitaiFile, localModelFileNames } from "@/utils/civitai-local-models";
import { ModelLibraryHeader } from "./model-library-header";
import { useCatalogScrollLoad } from "./use-catalog-scroll-load";

const INITIAL_FILTERS: CivitaiFilters = { source: CIVITAI_SOURCES[0], query: "", type: "LORA", base: "", sort: "Most Downloaded" };
const INITIAL_BASES = ["Anima", "Krea 2", "ZImageTurbo", "Illustrious", "Flux.1 D", "Pony"];
interface ToolbarProps { filters: CivitaiFilters; bases: string[]; onChange: (filters: CivitaiFilters) => void }
function ModelToolbar({ filters, bases, onChange }: ToolbarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  return <section className="mb-4 shrink-0 rounded-xl border border-border bg-background p-3">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const next = civitaiInput({ ...filters, query }); setQuery(next.query); onChange(next); }}><div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-3"><Search size={16} className="shrink-0 text-muted-foreground" /><input data-civitai-query value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("toolBox.civitai.searchPlaceholder")} aria-label={t("toolBox.civitai.search")} className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" /></div><button type="submit" className="rounded-lg bg-sky-600 px-3 py-2 text-xs text-white hover:bg-sky-700">{t("toolBox.civitai.search")}</button></form>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1">{["LORA", "Checkpoint", "TextualInversion", ""].map((type) => <button key={type} type="button" aria-pressed={filters.type === type} onClick={() => onChange({ ...filters, type })} className={`rounded-md px-2 py-1.5 text-xs ${filters.type === type ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "text-muted-foreground hover:bg-muted"}`}>{type === "LORA" ? "LoRA" : type === "TextualInversion" ? "Embedding" : type || t("toolBox.civitai.all")}</button>)}</div><CivitaiFilter filters={filters} bases={bases} onChange={onChange} /></div>
    {filters.base && <button type="button" aria-label={t("toolBox.civitai.clearBase")} onClick={() => onChange({ ...filters, base: "" })} className="mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{filters.base} ×</button>}
  </section>;
}
function ModelCatalog({ models, selected, select, status, next, load }: ReturnType<typeof useCivitaiModels> & { selected: CivitaiModel | null; select: (model: CivitaiModel) => void }) {
  const { t } = useTranslation();
  const localModels = useSettingsStore((state) => state.models);
  const localNames = useMemo(() => localModelFileNames(localModels), [localModels]);
  const container = useCatalogScrollLoad({ next, status, load });
  return <div ref={container} data-civitai-catalog aria-busy={status === "loading"} className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1"><div className="mb-3 flex justify-between gap-2 text-xs text-muted-foreground" role="status"><span>{t("toolBox.civitai.count", { count: models.length })}</span><span>{t(status === "loading" ? "toolBox.civitai.loading" : status === "ready" ? "toolBox.civitai.ready" : "toolBox.civitai.requestFailed")}</span></div>
    {models.length === 0 && status === "ready" && <p className="py-12 text-center text-sm text-muted-foreground">{t("toolBox.civitai.empty")}</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{models.map((model) => <CivitaiCard key={model.id} model={model} local={hasLocalCivitaiFile(model, localNames)} selected={selected?.id === model.id} onSelect={() => select(model)} />)}</div>
    {/* 界面：滚动到底部加载下一批，失败时保留手动重试入口 */}
    <div data-civitai-pagination role="status" className="flex min-h-12 items-center justify-center gap-2 py-4 text-xs text-muted-foreground">{status === "error" ? <button type="button" onClick={() => { void load(next); }} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">{t("toolBox.civitai.retry")}</button> : status === "loading" ? <><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />{t("toolBox.civitai.loading")}</> : next ? t("toolBox.civitai.scrollMore") : models.length > 0 ? t("toolBox.civitai.allLoaded") : null}</div>
  </div>;
}
function OnlineModelLibrary({ switcher }: { switcher: ReactNode }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selected, setSelected] = useState<CivitaiModel | null>(null);
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const catalog = useCivitaiModels(filters);
  const bases = useMemo(() => [...new Set([...INITIAL_BASES, filters.base, ...catalog.models.flatMap((model) => model.baseModels)])].filter(Boolean).sort(), [catalog.models, filters.base]);
  function updateFilters(next: CivitaiFilters) { setSelected(null); setOpen(false); setFilters(next); }
  function select(model: CivitaiModel) { setSelected(model); setOpen(true); }
  return <div data-civitai-page className="flex min-h-0 flex-1 flex-col">
    <div className="mb-4 shrink-0"><ModelLibraryHeader title={t("toolBox.civitai.title")} description={t("toolBox.civitai.description")} switcher={switcher} actions={<SimpleSelect value={filters.source} options={CIVITAI_SOURCES.map((source) => ({ value: source, label: new URL(source).hostname }))} onChange={(source) => updateFilters({ ...filters, source })} ariaLabel={t("toolBox.civitai.source")} triggerClassName="focus:!ring-sky-500" className="w-40" />} /></div>
    {/* 界面：模型列表与右侧详情；卡片仅显示封面 */}
    <div className="grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><section className="flex min-h-0 min-w-0 flex-col"><ModelToolbar filters={filters} bases={bases} onChange={updateFilters} /><ModelCatalog {...catalog} selected={selected} select={select} /></section><aside className="hidden h-full min-h-0 overflow-hidden rounded-xl border border-border bg-background xl:flex xl:flex-col">{selected && wide ? <CivitaiDetails key={selected.id} model={selected} source={filters.source} /> : <p className="px-6 py-12 text-center text-xs text-muted-foreground">{t("toolBox.civitai.choose")}</p>}</aside></div>
    {/* 弹窗：窄屏模型详情，复用资源弹窗 */}
    {!wide && selected && <ResourceDialogShell open={open} title={t("toolBox.civitai.details")} titleId="civitai-details-title" onOpenChange={setOpen} bodyPadded={false} bodyScroll={false}><CivitaiDetails key={selected.id} model={selected} source={filters.source} /></ResourceDialogShell>}
  </div>;
}

export function CivitaiPage() {
  const { t } = useTranslation();
  const [view, setView] = useState("online");
  const switcher = <div className="flex w-fit shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1">{["online", "local"].map((value) => <button key={value} type="button" data-model-library={value} aria-pressed={view === value} onClick={() => setView(value)} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs ${view === value ? "bg-background text-sky-700 shadow-sm dark:text-sky-300" : "text-muted-foreground hover:text-foreground"}`}>{t(value === "online" ? "toolBox.civitai.online" : "toolBox.civitai.local")}</button>)}</div>;
  return <div className="flex h-full min-h-0 min-w-0 flex-col">
    {/* 界面：模型库共用标题栏与切换入口 */}
    {view === "online" ? <OnlineModelLibrary switcher={switcher} /> : <LocalModelLibrary switcher={switcher} />}
  </div>;
}
