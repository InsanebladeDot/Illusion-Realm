"use client";

import { useState, type MouseEvent } from "react";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { HistoryFolderContextMenu } from "@/view/create/HistoryFolderContextMenu";
import { useTranslation } from "@/i18n";
import { deleteLocalModelFolder, modelCategoryError } from "@/utils/model-categories";
import { LocalModelFolderEditor } from "./local-model-folder-editor";

interface FolderTarget { root: string; folder: string }
interface FolderActions {
  disabled: boolean;
  onCreated: (root: string, folder: string) => void;
  onDeleted: (target: FolderTarget) => void;
}

/** 右键只选定操作目标。真正移入回收站由确认卡片发起。 */
export function useModelFolderActions({ disabled, onCreated, onDeleted }: FolderActions) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<(FolderTarget & { x: number; y: number }) | null>(null);
  const [create, setCreate] = useState<FolderTarget | null>(null);
  const [deleting, setDeleting] = useState<FolderTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open(event: MouseEvent<HTMLButtonElement>, root: string, folder: string) {
    event.preventDefault();
    event.stopPropagation();
    if (!busy) setMenu({ root, folder, x: event.clientX, y: event.clientY });
  }

  async function confirm() {
    if (!deleting || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await deleteLocalModelFolder({ root: deleting.root, folder: deleting.folder, acknowledged: true });
      setDeleting(null);
      onDeleted(deleting);
    } catch (reason) {
      setError(modelCategoryError(reason));
    } finally {
      setBusy(false);
    }
  }

  // 用完整相对路径确认，区分不同分类里的同名文件夹。
  const overlays = <>
    {/* 模型库侧栏右键菜单和删除确认卡片。 */}
    {menu && <HistoryFolderContextMenu x={menu.x} y={menu.y} folderName={menu.folder || menu.root}
      canCreateSubfolder={!disabled} canDelete={!!menu.folder && !disabled} onClose={() => setMenu(null)}
      onCreateSubfolder={() => setCreate(menu)} onDelete={() => { setError(""); setDeleting(menu); }} />}
    {deleting && <ConfirmActionDialog closeLabel={t("common.cancel")} title={t("toolBox.civitai.folders.deleteTitle")}
      description={t("toolBox.civitai.folders.deleteDescription", { folder: `${deleting.root}/${deleting.folder}` })}
      cancelLabel={t("common.cancel")} confirmLabel={t("toolBox.civitai.folders.deleteConfirm")}
      confirmDisabled={disabled} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => { void confirm(); }}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </ConfirmActionDialog>}
  </>;
  const editor = create && <LocalModelFolderEditor key={JSON.stringify(create)} root={create.root} parent={create.folder}
    onClose={() => setCreate(null)} onCreated={folder => { onCreated(create.root, folder); setCreate(null); }} />;
  return { open, overlays, editor };
}
