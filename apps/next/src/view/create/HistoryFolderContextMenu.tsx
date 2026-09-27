"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type HistoryFolderContextMenuProps = {
  x: number;
  y: number;
  folderName: string;
  canCreateSubfolder: boolean;
  onAddImages: () => void;
  onCreateSubfolder: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function HistoryFolderContextMenu({
  x,
  y,
  folderName,
  canCreateSubfolder,
  onAddImages,
  onCreateSubfolder,
  onDelete,
  onClose,
}: HistoryFolderContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const handleScroll = () => onClose();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: y, left: x }}
      className={cn(
        "fixed z-[100] min-w-[168px] rounded-md border bg-background py-1 shadow-md",
        INPUT_BORDER_CLASS
      )}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onAddImages();
          onClose();
        }}
        className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted/60"
      >
        {t("create.historyFolderContextMenu.addImages")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canCreateSubfolder}
        onClick={() => {
          if (!canCreateSubfolder) return;
          onCreateSubfolder();
          onClose();
        }}
        className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("create.historyFolderContextMenu.createSubfolder")}
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400"
      >
        {t("create.historyFolderContextMenu.deleteFolder")}
      </button>
      <p className="px-3 pb-1 pt-1 text-[11px] text-muted-foreground truncate">
        {folderName}
      </p>
    </div>
  );
}
