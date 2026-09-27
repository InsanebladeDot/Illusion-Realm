"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { HistoryFolder } from "@/types/historyFolder";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import {
  deleteHistoryFolderOnDisk,
  previewDeleteHistoryFolderOnDisk,
} from "@/utils/generatedImages";
import { hasDeleteFolderSupport } from "@/utils/electronBridge";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

function isFolderIdUnderDeletedTarget(
  folderDirPath: string,
  targetFolderId: string
): boolean {
  const normalizedRoot = folderDirPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedTarget = targetFolderId.replace(/\\/g, "/");
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  );
}

type DeleteFolderPreview = {
  imageCount: number;
  sidecarCount: number;
  subfolderCount: number;
};

type DeleteFolderDialogProps = {
  open: boolean;
  folder: HistoryFolder | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function DeleteFolderDialog({
  open,
  folder,
  onOpenChange,
  onDeleted,
}: DeleteFolderDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const selectedFolderId = useHistoryFolderStore(
    (state) => state.selectedFolderId
  );
  const openedFolderId = useHistoryFolderStore((state) => state.openedFolderId);
  const setSelectedFolderId = useHistoryFolderStore(
    (state) => state.setSelectedFolderId
  );
  const openFolder = useHistoryFolderStore((state) => state.openFolder);
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );

  const [preview, setPreview] = useState<DeleteFolderPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * 渲染期同步：未打开或没有目标文件夹时清空预览。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setPreview(null)。
   */
  const [previousPreviewKey, setPreviousPreviewKey] = useState<string | null>(null);
  const previewKey = `${open}|${folder?.dirPath ?? ""}|${outputPath}`;
  if ((!open || !folder?.dirPath) && previewKey !== previousPreviewKey) {
    setPreviousPreviewKey(previewKey);
    setPreview(null);
  }

  useEffect(() => {
    if (!open || !folder?.dirPath) return;

    const dirPath = folder.dirPath;
    let cancelled = false;

    void (async () => {
      // setLoadingPreview 放在 async IIFE 内部：与原先同步调用同批次，
      // 但不属「effect 体内同步 setState」（react-hooks/set-state-in-effect）
      setLoadingPreview(true);
      try {
        const result = await previewDeleteHistoryFolderOnDisk(outputPath, dirPath);
        if (!cancelled) setPreview(result);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : t("create.deleteFolderDialog.readFailed");
          showToast(message);
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, folder, outputPath, onOpenChange, showToast, t]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  const handleDelete = async () => {
    if (!folder?.dirPath) return;

    if (!hasDeleteFolderSupport()) {
      showToast(t("create.deleteFolderDialog.deleteUnsupported"));
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteHistoryFolderOnDisk(outputPath, folder.dirPath);
      refreshFolders();
      refreshGeneratedImages();

      if (
        isFolderIdUnderDeletedTarget(folder.dirPath, selectedFolderId)
      ) {
        setSelectedFolderId(DEFAULT_FOLDER_ID);
      }
      if (isFolderIdUnderDeletedTarget(folder.dirPath, openedFolderId)) {
        openFolder(DEFAULT_FOLDER_ID);
      }

      showToast(
        t("create.deleteFolderDialog.deletedSummary", {
          name: folder.name,
          imageCount: result.deletedImageCount,
          sidecarCount: result.deletedSidecarCount,
        })
      );
      onDeleted?.();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("create.deleteFolderDialog.failed");
      showToast(message);
    } finally {
      setDeleting(false);
    }
  };

  if (!open || !folder) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[105] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-folder-title"
        aria-describedby="delete-folder-description"
        className={cn(
          "fixed left-1/2 top-1/2 z-[106] grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <h2 id="delete-folder-title" className="text-lg font-semibold">
              {t("create.deleteFolderDialog.title")}
            </h2>
            <p
              id="delete-folder-description"
              className="text-sm text-muted-foreground"
            >
              {t("create.deleteFolderDialog.confirmPrefix")}
              {folder.name}
              {t("create.deleteFolderDialog.confirmSuffix")}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          {loadingPreview ? (
            <span className="text-muted-foreground">
              {t("create.deleteFolderDialog.counting")}
            </span>
          ) : preview ? (
            <ul className="space-y-1 text-muted-foreground">
              <li>
                {t("create.deleteFolderDialog.imagesLabel")}
                <span className="font-medium text-foreground">
                  {preview.imageCount}
                </span>{" "}
                {t("create.deleteFolderDialog.imagesUnit")}
              </li>
              <li>
                {t("create.deleteFolderDialog.sidecarsLabel")}
                <span className="font-medium text-foreground">
                  {preview.sidecarCount}
                </span>{" "}
                {t("create.deleteFolderDialog.sidecarsUnit")}
              </li>
              {preview.subfolderCount > 0 ? (
                <li>
                  {t("create.deleteFolderDialog.subfoldersLabel")}
                  <span className="font-medium text-foreground">
                    {preview.subfolderCount}
                  </span>{" "}
                  {t("create.deleteFolderDialog.subfoldersUnit")}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50",
              INPUT_BORDER_CLASS
            )}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={deleting || loadingPreview}
            onClick={() => void handleDelete()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? t("create.progress.deleting") : t("common.delete")}
          </button>
        </div>

        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
