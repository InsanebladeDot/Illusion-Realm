"use client";

import { useEffect, useId, useState } from "react";
import { FolderInput } from "lucide-react";
import { ModelCategorySchema, type LocalModelCategoryTarget } from "@illusion-realm/shared";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { openPathInExplorer } from "@/utils/electronBridge";
import { getLocalModelCategoryTarget, modelCategoryError, moveLocalModelCategory } from "@/utils/model-categories";
import { useToastStore } from "@/stores/useToastStore";
import { ModelCategoryPicker } from "./model-category-picker";

interface EditorProps {
  folderPath: string; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onMoved: (folderPath: string, category: string) => Promise<void>;
}
function useCategoryTarget(folderPath: string) {
  const [target, setTarget] = useState<LocalModelCategoryTarget | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getLocalModelCategoryTarget(folderPath).then((value) => { if (active) setTarget(value); }).catch((reason: unknown) => { if (active) setError(modelCategoryError(reason)); });
    return () => { active = false; };
  }, [folderPath]);
  return { target, error };
}
function ExplorerButtons({ source, destination }: { source: string; destination?: string }) {
  const { t } = useTranslation();
  async function open(folder: string) {
    if (!await openPathInExplorer(folder)) useToastStore.getState().show(t("toolBox.civitai.categoryMove.openFailed"), "error");
  }
  return <div className="flex flex-wrap gap-2">
    <button data-model-category-source type="button" onClick={() => { void open(source); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.categoryMove.openSource")}</button>
    {destination && <button data-model-category-target type="button" onClick={() => { void open(destination); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.categoryMove.openTarget")}</button>}
  </div>;
}
function useCategoryMove(props: EditorProps & { target: LocalModelCategoryTarget }) {
  const { t } = useTranslation();
  const { target } = props;
  const [root, setRoot] = useState(target.rootPath);
  const [category, setCategory] = useState(target.currentCategory);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const crossRoot = root !== target.rootPath;
  const [acknowledged, setAcknowledged] = useState(false);
  function changeCategory(value: string) { setCategory(value); setAcknowledged(false); }
  function changeRoot(value: string) { setRoot(value); setAcknowledged(false); }
  const valid = ModelCategorySchema.safeParse(category).success;
  const destination = `${target.categoryRootPath}/${category.trim() || "Uncategorized"}/${props.folderPath.split(/[/\\]/).pop()}`;
  async function move() {
    if (busy || !valid || crossRoot || !acknowledged) return;
    setBusy(true); props.onBusyChange(true); setError("");
    try {
      const folder = await moveLocalModelCategory({ folderPath: props.folderPath, targetRootPath: root, category });
      useToastStore.getState().show(t("toolBox.civitai.categoryMove.done"), "success");
      await props.onMoved(folder, category.trim() || "Uncategorized").catch(() => useToastStore.getState().show(t("toolBox.civitai.scanFailed"), "error"));
    } catch (reason) { setError(modelCategoryError(reason)); }
    finally { setBusy(false); props.onBusyChange(false); }
  }
  return { root, setRoot: changeRoot, category, setCategory: changeCategory, custom, setCustom, busy, error, setError, crossRoot, valid, destination, move, acknowledged, setAcknowledged };
}
function CategoryMoveForm({ target, ...props }: EditorProps & { target: LocalModelCategoryTarget }) {
  const { t } = useTranslation();
  const id = useId();
  const { root, setRoot, category, setCategory, custom, setCustom, busy, error, setError, crossRoot, valid, destination, move, acknowledged, setAcknowledged } = useCategoryMove({ target, ...props });
  return <div data-model-category-form className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <div data-model-category-root className="space-y-2"><p className="text-xs font-medium">{t("toolBox.civitai.localType")}</p><SimpleSelect value={root} ariaLabel={t("toolBox.civitai.localType")} options={target.roots.map((item) => ({ value: item.path, label: item.name }))} onChange={(value) => { if (!busy) { setRoot(value); setError(""); } }} portal /></div>
      {crossRoot ? <><p role="status" data-model-category-cross className="text-xs leading-relaxed text-muted-foreground">{t("toolBox.civitai.categoryMove.crossRoot")}</p><ExplorerButtons source={props.folderPath} destination={root} /></> : <>
        <ModelCategoryPicker id={id} category={category} custom={custom} categories={target.categories} valid={valid} hint={t("toolBox.civitai.categoryMove.hint")} onSelect={(value) => { if (!busy) { setCustom(value === "/custom"); setCategory(value === "/custom" ? "" : value); setError(""); } }} onInput={setCategory} />
        <div className="space-y-1"><p className="text-xs font-medium">{t("toolBox.civitai.categoryMove.destination")}</p><p className="break-all text-[10px] text-muted-foreground">{destination}</p></div>
        <label className="flex items-start gap-2 text-xs leading-relaxed"><input data-model-category-acknowledge type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 accent-sky-600" />{t("toolBox.civitai.categoryMove.acknowledge")}</label>
        <button data-model-category-move type="button" disabled={!acknowledged || !valid || busy || (category.trim() || "Uncategorized") === target.currentCategory} onClick={() => { void move(); }} className="w-full rounded-lg bg-sky-600 px-3 py-2 text-xs text-white hover:bg-sky-700 disabled:opacity-50">{t(busy ? "toolBox.civitai.categoryMove.moving" : "toolBox.civitai.categoryMove.move")}</button>
      </>}
    </fieldset>
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}
function CategoryMoveBody(props: EditorProps) {
  const { t } = useTranslation();
  const { target, error } = useCategoryTarget(props.folderPath);
  if (target) return <CategoryMoveForm target={target} {...props} />;
  return <div className="space-y-2 rounded-lg border border-border p-3"><p role={error ? "alert" : "status"} className="text-xs text-muted-foreground">{error || t("common.loading")}</p>{error && <ExplorerButtons source={props.folderPath} />}</div>;
}
export function LocalModelCategoryEditor(props: EditorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="space-y-2">
    <button data-local-change-category type="button" disabled={props.disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"><FolderInput size={14} />{t("toolBox.civitai.categoryMove.title")}</button>
    {open && <div id={id}><CategoryMoveBody {...props} /></div>}
  </section>;
}
