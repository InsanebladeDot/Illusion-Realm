"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { deleteGeneratedImagesOnDisk } from "@/utils/generatedImages";
import { hasDeleteImagesSupport } from "@/utils/electronBridge";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type DeleteImagesDialogProps = {
  open: boolean;
  filePaths: string[];
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function DeleteImagesDialog({
  open,
  filePaths,
  onOpenChange,
  onDeleted,
}: DeleteImagesDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const [deleting, setDeleting] = useState(false);

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
    if (filePaths.length === 0) return;

    if (!hasDeleteImagesSupport()) {
      showToast(t("create.deleteImagesDialog.deleteUnsupported"));
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteGeneratedImagesOnDisk(outputPath, filePaths);
      refreshGeneratedImages();
      refreshFolders();

      const skippedHint =
        result.skippedCount > 0
          ? t("create.deleteImagesDialog.skippedSuffix", {
              count: result.skippedCount,
            })
          : "";

      showToast(
        t("create.deleteImagesDialog.deletedSummary", {
          imageCount: result.deletedImageCount,
          sidecarCount: result.deletedSidecarCount,
          skipped: skippedHint,
        })
      );
      onDeleted?.();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("create.deleteImagesDialog.failed");
      showToast(message);
    } finally {
      setDeleting(false);
    }
  };

  if (!open || filePaths.length === 0) return null;

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
        aria-labelledby="delete-images-title"
        aria-describedby="delete-images-description"
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
            <h2 id="delete-images-title" className="text-lg font-semibold">
              {t("create.deleteImagesDialog.title")}
            </h2>
            <p
              id="delete-images-description"
              className="text-sm text-muted-foreground"
            >
              {t("create.deleteImagesDialog.confirmPrefix")} {filePaths.length}{" "}
              {t("create.deleteImagesDialog.confirmSuffix")}
            </p>
          </div>
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
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting
              ? t("create.deleteImagesDialog.deleting")
              : t("common.delete")}
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
