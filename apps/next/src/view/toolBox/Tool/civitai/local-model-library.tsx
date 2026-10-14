"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Eye, FolderInput, ImagePlus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { LocalModelBatchResult } from "@illusion-realm/shared";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { LocalModel } from "@/types/localModel";
import { useTranslation } from "@/i18n";
import { ModelLibraryHeader } from "./model-library-header";
import { modelDownloadApi, downloadErrorMessage } from "@/utils/model-downloads";
import { unwrapIpc } from "@/utils/ipcResult";
import { invalidateLocalImageSrc } from "@/utils/localImageSrcCache";
import { useToastStore } from "@/stores/useToastStore";
import { localLibraryCategory } from "@/utils/civitai-local-models";
import { LocalModelCategoryEditor } from "./local-model-category-editor";
import { LocalModelBatchDialog } from "./local-model-batch-dialog";

const LOCAL_MODEL_TYPES = [{ value: "lora", label: "LoRA" }, { value: "checkpoint", label: "Checkpoint" }, { value: "embedding", label: "Embedding" }] as const;
function localType(model: LocalModel) { return LOCAL_MODEL_TYPES.find((item) => item.value === model.type)?.label; }
function placeholderName(model: LocalModel) { return model.versions[0]?.filePath.split(/[/\\]/).pop() || model.name; }
type LocalLibraryModel = LocalModel & { rootCategory: string };

function useLocalLibraryFilters(models: LocalLibraryModel[]) {
  const roots = useMemo(() => [...new Set(models.map((model) => model.rootCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [models]);
  const [rootCategory, setRootCategory] = useState("");
  const activeRoot = roots.includes(rootCategory) ? rootCategory : "";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const rootModels = useMemo(() => activeRoot ? models.filter((model) => model.rootCategory === activeRoot) : models, [models, activeRoot]);
  const categories = useMemo(() => [...new Set(rootModels.map((model) => model.category).filter((value): value is string => Boolean(value)))].sort(), [rootModels]);
  const activeCategory = categories.includes(category) ? category : "";
  const filtered = rootModels.filter((model) => (!activeCategory || activeCategory === model.category) && `${model.name} ${model.category || ""} ${model.versions.map((version) => version.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  function changeRoot(value: string) { setRootCategory(value); setCategory(""); }
  return { roots, rootCategory: activeRoot, query, category: activeCategory, categories, filtered, changeRoot, setQuery, setCategory };
}

interface LocalLibraryFiltersProps {
  filters: ReturnType<typeof useLocalLibraryFilters>;
  onRootChange: (root: string) => void;
}
function LocalLibraryFilters({ filters, onRootChange }: LocalLibraryFiltersProps) {
  const { t } = useTranslation();
  return <div className="space-y-3 rounded-xl border border-border bg-background p-3">
    {/* 界面：先切换模型大分类，再查看当前分类下的全部模型或小分类 */}
    <div role="group" aria-label={t("toolBox.civitai.localType")} className="flex flex-wrap gap-1"><button type="button" data-local-model-root="" aria-pressed={!filters.rootCategory} onClick={() => onRootChange("")} className={`rounded-md px-3 py-2 text-xs ${!filters.rootCategory ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "text-muted-foreground hover:bg-muted"}`}>{t("toolBox.civitai.all")}</button>{filters.roots.map((root) => <button key={root} type="button" data-local-model-root={root} aria-pressed={filters.rootCategory === root} onClick={() => onRootChange(root)} className={`rounded-md px-3 py-2 text-xs ${filters.rootCategory === root ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "text-muted-foreground hover:bg-muted"}`}>{root}</button>)}</div>
    <div className="flex flex-wrap gap-3"><label className="flex min-w-0 basis-60 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3"><Search size={16} className="shrink-0 text-muted-foreground" /><input value={filters.query} onChange={(event) => filters.setQuery(event.target.value)} aria-label={t("toolBox.civitai.localSearch")} placeholder={t("toolBox.civitai.localSearch")} className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" /></label><div data-local-model-category className="w-full sm:w-40"><SimpleSelect value={filters.category} onChange={filters.setCategory} ariaLabel={t("toolBox.civitai.localCategory")} options={[{ value: "", label: t("toolBox.civitai.all") }, ...filters.categories.map((value) => ({ value, label: value }))]} /></div></div>
  </div>;
}

function LocalModelDetails({ model, onMoved }: { model: LocalLibraryModel; onMoved: (folder: string, category: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changeLogo() {
    setBusy(true); setError("");
    try {
      const logo = unwrapIpc(await modelDownloadApi().changeModelLogo(model.filePath));
      if (logo) {
        await invalidateLocalImageSrc(logo);
        await useSettingsStore.getState().scanAllModels();
        useToastStore.getState().show(t("toolBox.civitai.transfer.logoChanged"), "success");
      }
    } catch (reason) { setError(downloadErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 p-4" data-local-model-details>
    <h3 className="break-words font-semibold">{model.name}</h3>
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"><ResourceCoverImage cover={model.iconPath || ""} alt={model.name} placeholder={placeholderName(model)} fill className="object-contain" /></div>
    {/* 界面：更换本地模型 logo，复用原生文件选择器 */}
    <button data-local-change-logo type="button" disabled={busy} onClick={() => { void changeLogo(); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"><ImagePlus size={14} />{t("toolBox.civitai.transfer.changeLogo")}</button>
    {/* 界面：切换模型分类，移动整个文件夹；跨大分类只提供资源管理器入口 */}
    <LocalModelCategoryEditor folderPath={model.filePath} disabled={busy} onBusyChange={setBusy} onMoved={onMoved} />
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    <div data-local-model-tags className="flex flex-wrap gap-1"><span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">{model.rootCategory}</span>{model.category && model.category !== model.rootCategory && <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{model.category}</span>}</div>
    <h4 className="text-xs font-medium">{t("toolBox.civitai.localFiles")}</h4>
    <ul className="space-y-2">{model.versions.map((version) => <li key={version.filePath} className="rounded-lg border border-border bg-muted/30 p-3"><p className="break-all text-xs">{version.name}</p><p className="mt-1 break-all text-[10px] text-muted-foreground">{version.filePath}</p></li>)}</ul>
  </div>;
}

function LocalModelCard({ model, selected, selecting, onSelect, onDetails }: { model: LocalLibraryModel; selected: boolean; selecting: boolean; onSelect: () => void; onDetails: () => void }) {
  const { t } = useTranslation();
  return <div className={`relative min-w-0 overflow-hidden rounded-xl border bg-background hover:border-sky-500 ${selected ? "border-sky-500 ring-1 ring-sky-500" : "border-border"}`}><button type="button" data-local-model-card onClick={selecting ? onSelect : onDetails} aria-pressed={selecting ? selected : undefined} aria-label={selecting ? t("toolBox.civitai.batch.select", { name: model.name }) : `${t("toolBox.civitai.batch.details")} · ${model.name}`} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-sky-500">
    <div className="relative aspect-[7/9] bg-muted"><ResourceCoverImage cover={model.iconPath || ""} alt={model.name} placeholder={placeholderName(model)} fill /><div data-local-model-tags className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1"><span className="rounded-full bg-slate-900/70 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md">{model.rootCategory}</span>{model.category && model.category !== model.rootCategory && <span className="rounded-full bg-slate-900/70 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md">{model.category}</span>}</div></div>
    <div className="p-3 pb-10"><p className="truncate text-sm font-semibold">{model.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{localType(model)} · {model.category}</p><p className="mt-1 text-[10px] text-muted-foreground">{t("toolBox.civitai.version")} · {model.versions.length}</p></div>
  </button>{selecting ? <input data-local-model-checkbox type="checkbox" checked={selected} onChange={onSelect} aria-label={t("toolBox.civitai.batch.select", { name: model.name })} className="absolute right-2 top-2 h-4 w-4 accent-sky-600" /> : <button data-local-model-details-open type="button" onClick={onDetails} className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><Eye size={12} />{t("toolBox.civitai.batch.details")}</button>}</div>;
}

function LocalModelBatchToolbar({ count, disabled, mode, onAll, onClear, onExit, onAction }: { count: number; disabled: boolean; mode: "move" | "delete" | null; onAll: () => void; onClear: () => void; onExit: () => void; onAction: (action: "move" | "delete") => void }) {
  const { t } = useTranslation();
  return <div data-local-batch-toolbar data-local-selection-mode={mode || "browse"} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 text-xs">
    <p className="mr-auto px-1 text-muted-foreground">{mode ? t("toolBox.civitai.batch.selected", { count }) : t("toolBox.civitai.batch.browseHint")}</p>
    {mode && <><button type="button" data-local-select-all disabled={disabled} onClick={onAll} className="rounded-md px-2 py-2 hover:bg-muted disabled:opacity-50">{t("toolBox.civitai.batch.selectAll")}</button><button type="button" data-local-select-clear disabled={!count || disabled} onClick={onClear} className="rounded-md px-2 py-2 hover:bg-muted disabled:opacity-50">{t("toolBox.civitai.batch.clear")}</button><button type="button" data-local-select-exit disabled={disabled} onClick={onExit} className="rounded-md px-2 py-2 hover:bg-muted disabled:opacity-50">{t("toolBox.civitai.batch.exit")}</button></>}
    {(!mode || mode === "move") && <button type="button" data-local-batch-move disabled={disabled || (mode === "move" && !count)} onClick={() => onAction("move")} className="flex items-center gap-1 rounded-md border border-border px-3 py-2 hover:bg-muted disabled:opacity-50"><FolderInput size={14} />{t(mode ? "toolBox.civitai.batch.continueMove" : "toolBox.civitai.batch.move")}</button>}
    {(!mode || mode === "delete") && <button type="button" data-local-batch-delete disabled={disabled || (mode === "delete" && !count)} onClick={() => onAction("delete")} className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"><Trash2 size={14} />{t(mode ? "toolBox.civitai.batch.continueDelete" : "toolBox.civitai.batch.delete")}</button>}
  </div>;
}

function useLocalModelSelection(filtered: LocalLibraryModel[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; paths: string[]; mode: "move" | "delete" | null }>({ scope, paths: [], mode: null });
  const [batch, setBatch] = useState<{ action: "move" | "delete"; models: LocalLibraryModel[] } | null>(null);
  const mode = selection.scope === scope ? selection.mode : null;
  const checked = filtered.filter((model) => !!mode && selection.paths.includes(model.filePath));
  function toggle(folder: string) { if (mode) setSelection({ scope, mode, paths: checked.some((model) => model.filePath === folder) ? checked.filter((model) => model.filePath !== folder).map((model) => model.filePath) : [...checked.map((model) => model.filePath), folder] }); }
  function finish(result: LocalModelBatchResult) {
    const failed = result.items.filter((item) => !item.success).map((item) => item.folderPath);
    setSelection({ scope, paths: failed, mode: failed.length ? mode : null });
  }
  function open(action: "move" | "delete") {
    if (mode !== action) setSelection({ scope, mode: action, paths: [] });
    else if (checked.length) setBatch({ action, models: checked });
  }
  return { mode, checked, toggle, batch, finish, open, close: () => setBatch(null), all: () => { if (mode) setSelection({ scope, mode, paths: filtered.map((model) => model.filePath) }); }, clear: () => setSelection({ scope, mode, paths: [] }), exit: () => setSelection({ scope, mode: null, paths: [] }) };
}

function useLocalLibraryData() {
  const scannedModels = useSettingsStore((state) => state.models);
  const paths = useSettingsStore((state) => state.paths);
  const models = useMemo(() => scannedModels.map((model) => ({ ...model, rootCategory: model.category || model.type, category: localLibraryCategory(model, paths) })), [scannedModels, paths]);
  const scanning = useSettingsStore((state) => state.scanning);
  const scan = useSettingsStore((state) => state.scanAllModels);
  return { models, scanning, scan };
}
export function LocalModelLibrary({ switcher }: { switcher: ReactNode }) {
  const { t } = useTranslation();
  const { models, scanning, scan } = useLocalLibraryData();
  const filters = useLocalLibraryFilters(models);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const { filtered } = filters;
  const selection = useLocalModelSelection(filtered, JSON.stringify([filters.rootCategory, filters.category, filters.query]));
  const selected = filtered.find((model) => model.filePath === selectedPath);
  async function rescan() { setError(false); try { await scan(); } catch { setError(true); } }
  async function modelMoved(folder: string, category: string) { await scan(); filters.setCategory(category); setSelectedPath(folder); }
  async function batchFinished(result: LocalModelBatchResult) { selection.finish(result); setSelectedPath(null); await scan(); }
  return <section data-local-model-library className="min-w-0 space-y-4">
    <ModelLibraryHeader title={t("toolBox.civitai.localTitle")} description={t("toolBox.civitai.localDescription")} switcher={switcher} actions={<><Link href="/settings" className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.configure")}</Link><button type="button" onClick={() => { void rescan(); }} disabled={scanning} className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs text-white hover:bg-sky-700 disabled:opacity-50"><RefreshCw size={14} className={scanning ? "animate-spin" : ""} />{t(scanning ? "toolBox.civitai.scanning" : "toolBox.civitai.scan")}</button></>} />
    {/* 界面：本地模型搜索、分类和扫描结果 */}
    <LocalLibraryFilters filters={filters} onRootChange={(root) => { filters.changeRoot(root); setSelectedPath(null); }} />
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t("toolBox.civitai.scanFailed")}</p>}
    <p role="status" className="text-xs text-muted-foreground">{t("toolBox.civitai.count", { count: filtered.length })}</p>
    {/* 界面：默认查看详情；点击移动或删除进入多选，再继续操作进入已知晓确认 */}
    <LocalModelBatchToolbar count={selection.checked.length} mode={selection.mode} disabled={scanning} onAll={selection.all} onClear={selection.clear} onExit={selection.exit} onAction={(action) => { setSelectedPath(null); selection.open(action); }} />
    {filtered.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t(models.length ? "toolBox.civitai.empty" : "toolBox.civitai.localEmpty")}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{filtered.map((model) => <LocalModelCard key={model.filePath} model={model} selecting={!!selection.mode} selected={selection.checked.some((item) => item.filePath === model.filePath)} onSelect={() => selection.toggle(model.filePath)} onDetails={() => setSelectedPath(model.filePath)} />)}</div><aside className="sticky top-0 hidden max-h-[calc(100dvh-160px)] overflow-auto rounded-xl border border-border bg-background xl:block">{selected && wide ? <LocalModelDetails key={selected.filePath} model={selected} onMoved={modelMoved} /> : <p className="px-6 py-12 text-center text-xs text-muted-foreground">{t("toolBox.civitai.localChoose")}</p>}</aside></div>
    {/* 弹窗：窄屏本地模型详情 */}
    {!wide && selected && <ResourceDialogShell open title={t("toolBox.civitai.details")} titleId="local-model-details-title" onOpenChange={(open) => { if (!open) setSelectedPath(null); }}><LocalModelDetails key={selected.filePath} model={selected} onMoved={modelMoved} /></ResourceDialogShell>}
    {selection.batch && <LocalModelBatchDialog {...selection.batch} onClose={selection.close} onFinished={batchFinished} />}
  </section>;
}
