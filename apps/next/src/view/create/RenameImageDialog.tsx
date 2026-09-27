"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { renameGeneratedImageOnDisk } from "@/utils/generatedImages";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import type { GeneratedImageFile } from "@/types/historyFolder";

type RenameImageDialogProps = {
  open: boolean;
  image: GeneratedImageFile | null;
  onOpenChange: (open: boolean) => void;
  onRenamed?: (oldPath: string, image: GeneratedImageFile) => void;
};

function splitImageName(fileName: string): {
  baseName: string;
  extension: string;
} {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return { baseName: fileName, extension: "" };
  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex),
  };
}

export function RenameImageDialog({
  open,
  image,
  onOpenChange,
  onRenamed,
}: RenameImageDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);

  /**
   * 渲染期同步：每次打开或切换到另一张图片时，把输入框重置为当前文件名的**主体**。
   * 用「记录前值 + 渲染期比较」替代 effect 里的 setState（react-hooks/set-state-in-effect
   * 会拦后者），与项目其它弹窗的写法保持一致。
   */
  const [previousRenameKey, setPreviousRenameKey] = useState<string | null>(null);
  const renameKey = open && image ? `${image.filePath}|open` : null;
  if (renameKey !== previousRenameKey) {
    setPreviousRenameKey(renameKey);
    setName(image ? splitImageName(image.fileName).baseName : "");
  }

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

  const handleRename = async () => {
    if (!image) return;
    const trimmed = name.trim();
    if (!trimmed) {
      showToast(t("create.renameImageDialog.nameRequired"));
      return;
    }

    setRenaming(true);
    try {
      const result = await renameGeneratedImageOnDisk(
        outputPath,
        image.filePath,
        trimmed
      );
      showToast(
        t("create.renameImageDialog.renamed", { name: result.fileName })
      );
      onRenamed?.(result.oldPath, {
        filePath: result.filePath,
        fileName: result.fileName,
        modifiedAt: result.modifiedAt,
      });
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("create.renameImageDialog.failed");
      showToast(message);
    } finally {
      setRenaming(false);
    }
  };

  if (!open || !image) return null;

  const { extension } = splitImageName(image.fileName);

  return (
    <>
      <div
        className="fixed inset-0 z-[125] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-image-title"
        onSubmit={(event) => {
          event.preventDefault();
          void handleRename();
        }}
        className={cn(
          "fixed left-1/2 top-1/2 z-[126] grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <Pencil className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h2 id="rename-image-title" className="text-lg font-semibold">
              {t("create.renameImageDialog.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("create.renameImageDialog.description")}
            </p>
          </div>
        </div>

        <label className="space-y-1.5">
          <span className="text-sm font-medium">
            {t("create.renameImageDialog.nameLabel")}
          </span>
          <span className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("create.renameImageDialog.namePlaceholder")}
              disabled={renaming}
              className={cn(
                "h-9 min-w-0 flex-1 rounded-md bg-transparent px-3 text-sm outline-none focus:ring-0",
                INPUT_BORDER_CLASS
              )}
            />
            {extension ? (
              <span className="shrink-0 text-sm text-muted-foreground">
                {extension}
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t("create.renameImageDialog.extensionHint", {
              ext: extension || "—",
            })}
          </span>
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={renaming}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50",
              INPUT_BORDER_CLASS
            )}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={renaming}
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {renaming
              ? t("create.renameImageDialog.renaming")
              : t("common.save")}
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
      </form>
    </>
  );
}
