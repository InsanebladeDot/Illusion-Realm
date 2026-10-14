"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { ModelCategorySchema, type DownloadModelType, type ModelDownloadTarget } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";
import { useModelDownloadStore } from "@/stores/useModelDownloadStore";
import { civitaiDownload, type CivitaiModel, type CivitaiVersion, type CivitaiFile } from "@/utils/civitai";
import { downloadErrorMessage, getModelDownloadTarget, readLogoFile, startModelDownload } from "@/utils/model-downloads";
import { CivitaiImage } from "./civitai-image";
import { ModelCategoryPicker } from "./model-category-picker";

interface FormProps { model: CivitaiModel; version: CivitaiVersion; file: CivitaiFile; source: string; onBack: () => void }
interface LogoProps { src: string; name: string; custom: boolean; onChange: (file?: File) => void; onReset: () => void }
function DownloadLogo({ src, name, custom, onChange, onReset }: LogoProps) {
  const { t } = useTranslation();
  return <section className="space-y-2"><p className="text-xs font-medium">{t("toolBox.civitai.transfer.logo")}</p>
    <div className="relative h-36 overflow-hidden rounded-lg border border-border bg-muted">{src ? <CivitaiImage key={src} src={src} alt={name} className="relative h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center break-all p-4 text-center text-xs text-muted-foreground">{name}</div>}</div>
    <label className="block cursor-pointer rounded-lg border border-border px-3 py-2 text-center text-xs hover:bg-muted">{t("toolBox.civitai.transfer.changeLogo")}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { onChange(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {custom && <button type="button" onClick={onReset} className="text-xs text-sky-600 dark:text-sky-300">{t("toolBox.civitai.transfer.resetLogo")}</button>}
    <p className="text-[10px] leading-relaxed text-muted-foreground">{t("toolBox.civitai.transfer.logoHint")}</p>
  </section>;
}
function useDownloadTarget(modelType: string, baseModel: string) {
  const [target, setTarget] = useState<ModelDownloadTarget | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getModelDownloadTarget({ modelType: modelType as DownloadModelType, baseModel }).then((value) => { if (active) setTarget(value); }).catch((reason: unknown) => { if (active) setError(downloadErrorMessage(reason)); });
    return () => { active = false; };
  }, [modelType, baseModel]);
  return { target, targetError: error };
}
export function ModelDownloadForm({ model, version, file, source, onBack }: FormProps) {
  const { t } = useTranslation();
  const { target, targetError } = useDownloadTarget(model.type, version.baseModel);
  const [category, setCategory] = useState("Uncategorized");
  const [custom, setCustom] = useState(false);
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = ModelCategorySchema.safeParse(category).success;
  async function selectLogo(file?: File) {
    if (!file) return;
    try { setLogo(await readLogoFile(file)); setError(""); } catch (reason) { setError(downloadErrorMessage(reason)); }
  }
  async function begin() {
    setBusy(true); setError("");
    try {
      const task = await startModelDownload({ modelType: model.type as DownloadModelType, baseModel: version.baseModel, modelName: model.name, fileName: file.name, downloadUrl: civitaiDownload(file, source), category: category.trim(), sha256: file.sha256, previewUrl: version.images[0] || "", ...(logo ? { logoDataUrl: logo } : {}) });
      useModelDownloadStore.getState().update(task); onBack();
    } catch (reason) { setError(downloadErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div data-model-download-form className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"><button type="button" disabled={busy} onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft size={14} />{t("toolBox.civitai.transfer.back")}</button>
    <p className="break-all text-xs font-medium">{file.name}</p>
    <ModelCategoryPicker id="model-download-category" category={category} custom={custom} categories={target?.categories || []} valid={valid} hint={t("toolBox.civitai.transfer.categoryHint")} onSelect={(value) => { setCustom(value === "/custom"); setCategory(value === "/custom" ? "" : value); }} onInput={setCategory} />
    <section className="space-y-1"><p className="text-xs font-medium">{t("toolBox.civitai.transfer.destination")}</p><p className="break-all rounded-lg border border-border bg-muted/40 p-2 text-[10px] text-muted-foreground">{target ? `${target.rootPath}/${category.trim() || "Uncategorized"}/${model.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 100)}/${file.name}` : targetError || t("toolBox.civitai.loading")}</p><Link href="/settings" className="text-xs text-sky-600 dark:text-sky-300">{t("toolBox.civitai.configure")}</Link></section>
    {/* 界面：默认第一张预览图，也可自行选择封面 */}
    <DownloadLogo src={logo || version.images[0] || ""} name={file.name} custom={!!logo} onChange={(file) => { void selectLogo(file); }} onReset={() => setLogo("")} />
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
  </div><footer className="shrink-0 border-t border-border p-3"><button data-model-download-start type="button" disabled={!target || !valid || busy} onClick={() => { void begin(); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs text-white hover:bg-sky-700 disabled:opacity-50"><Download size={14} />{t(busy ? "toolBox.civitai.transfer.starting" : "toolBox.civitai.transfer.start")}</button></footer></div>;
}
