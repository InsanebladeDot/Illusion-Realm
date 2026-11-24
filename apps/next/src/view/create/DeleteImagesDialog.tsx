"use client";

import { useState } from "react";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { deleteGeneratedImagesOnDisk } from "@/utils/generatedImages";
import { hasDeleteImagesSupport } from "@/utils/electronBridge";

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
    <ConfirmActionDialog
      title={t("create.deleteImagesDialog.title")}
      description={<>{t("create.deleteImagesDialog.confirmPrefix")} {filePaths.length} {t("create.deleteImagesDialog.confirmSuffix")}</>}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
      confirmLabel={deleting ? t("create.deleteImagesDialog.deleting") : t("common.delete")}
      busy={deleting}
      onCancel={() => onOpenChange(false)}
      onConfirm={() => void handleDelete()}
    />
  );
}
