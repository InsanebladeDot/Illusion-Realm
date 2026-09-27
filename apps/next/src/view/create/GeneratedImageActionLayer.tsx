"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import {
  saveGeneratedImageAsOnDisk,
} from "@/utils/generatedImages";
import {
  hasDeleteImagesSupport,
  hasRenameGeneratedImageSupport,
  hasSaveImageAsSupport,
} from "@/utils/electronBridge";
import { DeleteImagesDialog } from "@/view/create/DeleteImagesDialog";
import { GeneratedImageContextMenu } from "@/view/create/GeneratedImageContextMenu";
import { RenameImageDialog } from "@/view/create/RenameImageDialog";
import type { GeneratedImageFile } from "@/types/historyFolder";

export type GeneratedImageActionHandle = {
  openContextMenu: (
    clientX: number,
    clientY: number,
    image: GeneratedImageFile
  ) => void;
};

type GeneratedImageActionLayerProps = {
  onRenamed?: (oldPath: string, image: GeneratedImageFile) => void;
  onDeleted?: (filePaths: string[]) => void;
};

/**
 * 图片文件操作层：把右键菜单、在线改名、删除确认收在一处。
 *
 * 缩略图和详情大图共用同一个实例，避免「图片网格里能删、详情里不能删」这类行为分叉。
 */
export const GeneratedImageActionLayer = forwardRef<
  GeneratedImageActionHandle,
  GeneratedImageActionLayerProps
>(function GeneratedImageActionLayer({ onRenamed, onDeleted }, ref) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const refreshGeneratedImages = useHistoryFolderStore(
    (state) => state.refreshGeneratedImages
  );
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    image: GeneratedImageFile;
  } | null>(null);
  const [renameTarget, setRenameTarget] =
    useState<GeneratedImageFile | null>(null);
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);

  useImperativeHandle(
    ref,
    () => ({
      openContextMenu: (clientX, clientY, image) => {
        setMenu({ x: clientX, y: clientY, image });
      },
    }),
    []
  );

  const handleSaveAs = async (image: GeneratedImageFile) => {
    if (!hasSaveImageAsSupport()) {
      showToast(t("create.generatedImageContextMenu.saveUnsupported"));
      return;
    }

    try {
      const savedPath = await saveGeneratedImageAsOnDisk(
        outputPath,
        image.filePath
      );
      showToast(
        savedPath
          ? t("create.generatedImageContextMenu.saved")
          : t("create.generatedImageContextMenu.saveCanceled")
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("create.generatedImageContextMenu.saveFailed");
      showToast(message);
    }
  };

  const handleRequestRename = (image: GeneratedImageFile) => {
    if (!hasRenameGeneratedImageSupport()) {
      showToast(t("create.generatedImageContextMenu.renameUnsupported"));
      return;
    }
    setRenameTarget(image);
  };

  const handleRequestDelete = (image: GeneratedImageFile) => {
    if (!hasDeleteImagesSupport()) {
      showToast(t("create.createHistorySidebar.deleteUnsupported"));
      return;
    }
    setPendingDeletePaths([image.filePath]);
  };

  return (
    <>
      {menu ? (
        <GeneratedImageContextMenu
          x={menu.x}
          y={menu.y}
          imageName={menu.image.fileName}
          onSaveAs={() => void handleSaveAs(menu.image)}
          onRename={() => handleRequestRename(menu.image)}
          onDelete={() => handleRequestDelete(menu.image)}
          onClose={() => setMenu(null)}
        />
      ) : null}

      <RenameImageDialog
        open={Boolean(renameTarget)}
        image={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRenamed={(oldPath, image) => {
          refreshGeneratedImages();
          refreshFolders();
          onRenamed?.(oldPath, image);
        }}
      />

      <DeleteImagesDialog
        open={pendingDeletePaths.length > 0}
        filePaths={pendingDeletePaths}
        onOpenChange={(open) => {
          if (!open) setPendingDeletePaths([]);
        }}
        onDeleted={() => {
          onDeleted?.(pendingDeletePaths);
          setPendingDeletePaths([]);
        }}
      />
    </>
  );
});
