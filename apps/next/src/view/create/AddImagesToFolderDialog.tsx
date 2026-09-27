"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { LocalFileImage } from "@/components/LocalFileImage";
import { useToastStore } from "@/stores/useToastStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import {
  isImageInFolder,
  listGeneratedImages,
  moveImagesToFolderOnDisk,
} from "@/utils/generatedImages";
import { isElectronEnvironment } from "@/utils/electronBridge";
import type { GeneratedImageFile } from "@/types/historyFolder";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type AddImagesToFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  folderDirPath: string;
  onAdded?: (count: number) => void;
};

export function AddImagesToFolderDialog({
  open,
  onOpenChange,
  folderName,
  folderDirPath,
  onAdded,
}: AddImagesToFolderDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const [images, setImages] = useState<GeneratedImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const availableImages = useMemo(
    () => images.filter((image) => !isImageInFolder(image.filePath, folderDirPath)),
    [folderDirPath, images]
  );

  /**
   * 渲染期同步：**每次**「关闭 → 打开」都清空已选项。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setSelectedPaths(new Set())。
   *
   * 注意：必须在两个方向上记录前值（而不是只在 open 为真时记录），
   * 否则第二次打开时 `open === 前值` 会跳过重置，残留上一次的勾选。
   */
  const [previousOpen, setPreviousOpen] = useState(false);
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setSelectedPaths(new Set());
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void (async () => {
      // setLoading 放在 async IIFE 内部（P3）：与原先同步调用同批次，
      // 但不属「effect 体内同步 setState」
      setLoading(true);
      try {
        const files = await listGeneratedImages(outputPath, null);
        if (!cancelled) setImages(files);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, outputPath]);

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

  const toggleImage = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === availableImages.length) {
      setSelectedPaths(new Set());
      return;
    }
    setSelectedPaths(new Set(availableImages.map((image) => image.filePath)));
  };

  const handleAdd = async () => {
    if (selectedPaths.size === 0) {
      showToast(t("create.addImagesToFolderDialog.selectRequired"));
      return;
    }

    if (!isElectronEnvironment()) {
      showToast(t("create.addImagesToFolderDialog.electronOnly"));
      return;
    }

    setSubmitting(true);
    try {
      const movedPaths = await moveImagesToFolderOnDisk(
        outputPath,
        folderDirPath,
        [...selectedPaths]
      );

      if (movedPaths.length === 0) {
        showToast(t("create.addImagesToFolderDialog.nothingToAdd"));
        return;
      }

      showToast(
        t("create.addImagesToFolderDialog.added", {
          count: movedPaths.length,
          name: folderName,
        })
      );
      onAdded?.(movedPaths.length);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("create.addImagesToFolderDialog.failed");
      showToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-images-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1.5">
          <h2 id="add-images-title" className="text-lg font-semibold">
            {t("create.addImagesToFolderDialog.titlePrefix")}
            {folderName}」
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("create.addImagesToFolderDialog.description")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {t("create.addImagesToFolderDialog.selected")} {selectedPaths.size} /{" "}
            {availableImages.length}{" "}
            {t("create.addImagesToFolderDialog.imageUnit")}
          </span>
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={availableImages.length === 0}
            className="text-xs text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selectedPaths.size === availableImages.length && availableImages.length > 0
              ? t("create.bulkSelection.deselectAll")
              : t("create.bulkSelection.selectAll")}
          </button>
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto rounded-md border p-2">
          {loading ? (
            /** 骨架屏（列数与真网格一致）：比「正在加载…」先给出形状 */
            <div
              data-gallery-skeleton="folder-picker"
              className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6"
              aria-label={t("create.addImagesToFolderDialog.loading")}
            >
              {Array.from({ length: 12 }, (_item, index) => (
                <div key={index} className="motion-skeleton aspect-square rounded-md" />
              ))}
            </div>
          ) : availableImages.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("create.addImagesToFolderDialog.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6">
              {availableImages.map((image) => {
                const selected = selectedPaths.has(image.filePath);

                return (
                  <button
                    key={image.filePath}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleImage(image.filePath)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-sm bg-muted/30 ring-2 ring-transparent transition-all hover:opacity-90",
                      selected && "ring-foreground/70"
                    )}
                  >
                    <LocalFileImage
                      filePath={image.filePath}
                      alt={image.fileName}
                      className="h-full w-full object-cover"
                    />
                    {selected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <Check className="h-5 w-5 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-sm hover:bg-muted",
              INPUT_BORDER_CLASS
            )}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={submitting || selectedPaths.size === 0}
            onClick={() => void handleAdd()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-fill-foreground hover:bg-accent-fill/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? t("create.progress.adding")
              : t("create.addImagesToFolderDialog.add", {
                  count: selectedPaths.size,
                })}
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
