"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { HistoryFolder } from "@/types/historyFolder";
import { createHistoryFolderOnDisk } from "@/utils/generatedImages";
import { isElectronEnvironment } from "@/utils/electronBridge";
import { MAX_HISTORY_FOLDER_DEPTH } from "@/utils/historyFolders";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type CreateFolderDialogProps = {
  open: boolean;
  parentFolder?: HistoryFolder | null;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folderId: string) => void;
};

export function CreateFolderDialog({
  open,
  parentFolder = null,
  onOpenChange,
  onCreated,
}: CreateFolderDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const outputPath = useSettingsStore((state) => state.outputPath);
  const refreshFolders = useHistoryFolderStore((state) => state.refreshFolders);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSubfolder = Boolean(parentFolder?.dirPath);
  const parentDepth = parentFolder?.depth ?? 0;

  /**
   * 渲染期同步：**每次**打开（或切换父文件夹）都清空输入框。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   *
   * 注意：key 里带了 open，因此必须在**两个方向**上都记录前值
   * ——若加上 `open &&` 前置条件，关闭时前值不会更新，
   * 再次打开同一个父文件夹时 key 与上次相同 → 跳过重置，残留上次输入的名字。
   */
  const [previousResetKey, setPreviousResetKey] = useState<string | null>(null);
  const resetKey = `${open}|${parentFolder?.dirPath ?? ""}`;
  if (resetKey !== previousResetKey) {
    setPreviousResetKey(resetKey);
    if (open) setName("");
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

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast(t("create.createFolderDialog.nameRequired"));
      return;
    }

    if (!isElectronEnvironment()) {
      showToast(t("create.createFolderDialog.electronOnly"));
      return;
    }

    if (isSubfolder && parentDepth >= MAX_HISTORY_FOLDER_DEPTH) {
      showToast(
        t("create.createFolderDialog.maxDepth", {
          depth: MAX_HISTORY_FOLDER_DEPTH,
        })
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await createHistoryFolderOnDisk(
        outputPath,
        trimmedName,
        parentFolder?.dirPath ?? null
      );
      refreshFolders();
      showToast(t("create.createFolderDialog.created", { name: created.name }));
      onCreated?.(created.dirPath);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("create.createFolderDialog.failed");
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
        aria-labelledby="create-folder-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg outline-none sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="space-y-1.5">
          <h2 id="create-folder-title" className="text-lg font-semibold">
            {isSubfolder
              ? t("create.createFolderDialog.titleNewSubfolder")
              : t("create.createFolderDialog.titleNew")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSubfolder
              ? t("create.createFolderDialog.subfolderDescription", {
                  name: parentFolder?.name ?? "",
                  depth: MAX_HISTORY_FOLDER_DEPTH,
                })
              : t("create.createFolderDialog.description")}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="folder-name" className="text-sm font-medium">
            {t("create.createFolderDialog.nameLabel")}
          </label>
          <input
            id="folder-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("create.createFolderDialog.namePlaceholder")}
            className={cn(
              "flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              INPUT_BORDER_CLASS
            )}
          />
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
            disabled={submitting}
            onClick={() => void handleCreate()}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-fill-foreground hover:bg-accent-fill/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? t("create.createFolderDialog.creating")
              : t("create.createFolderDialog.create")}
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
