"use client";

import { useState, type FormEvent } from "react";
import { FolderPlus } from "lucide-react";
import { ModelCategorySchema } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";
import { createLocalModelFolder, modelCategoryError } from "@/utils/model-categories";

interface Props { root: string; parent: string; onCreated: (folder: string) => void; onClose?: () => void }

/** 侧栏新建目录。显示所在位置，便于区分同级与下一级。 */
export function LocalModelFolderEditor({ root, parent, onCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!!onClose), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const folderName = name.trim().replace(/\s+/g, "_");
  const valid = !!folderName && ModelCategorySchema.safeParse(folderName).success;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setError("");
    setBusy(true);
    try {
      const folder = await createLocalModelFolder({ root, parent, name: folderName });
      setOpen(false);
      setName("");
      onCreated(folder);
    } catch (reason) {
      setError(modelCategoryError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button data-local-folder-new type="button" onClick={() => setOpen(true)} className="mb-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><FolderPlus size={14} />{t("toolBox.civitai.folders.create")}</button>;
  return <form data-local-folder-form onSubmit={submit} className="mb-2 space-y-2 rounded-lg border border-border p-2">
    <p className="break-all text-xs text-muted-foreground">{[root, parent].filter(Boolean).join(" / ")}</p>
    <input autoFocus value={name} maxLength={120} disabled={busy} onChange={event => { setName(event.target.value); setError(""); }} aria-label={t("toolBox.civitai.folders.name")} placeholder={t("toolBox.civitai.folders.name")} className="w-full border-b border-border bg-transparent px-1 py-1 text-xs focus:border-accent-stroke focus-visible:outline-none!" />
    {folderName && folderName !== name.trim() && <p className="break-all text-xs text-muted-foreground">{folderName}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex justify-end gap-2 text-xs"><button type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); onClose?.(); }}>{t("common.cancel")}</button><button type="submit" disabled={!valid || busy} className="rounded bg-primary/10 px-2 py-1 text-primary disabled:opacity-40">{t("toolBox.civitai.folders.confirm")}</button></div>
  </form>;
}
