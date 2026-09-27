"use client";

import { useEffect, useRef } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type GeneratedImageContextMenuProps = {
  x: number;
  y: number;
  imageName: string;
  onSaveAs: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/**
 * 图片右键菜单：保存图片 / 在线改名 / 删除图片。
 *
 * 交互与 `HistoryFolderContextMenu` 保持一致：点击外部、Esc、滚动都关闭。
 * 坐标做了视口夹取，避免靠近右边缘或底部时菜单被裁掉。
 */
export function GeneratedImageContextMenu({
  x,
  y,
  imageName,
  onSaveAs,
  onRename,
  onDelete,
  onClose,
}: GeneratedImageContextMenuProps) {
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

  const left =
    typeof window === "undefined" ? x : Math.min(x, window.innerWidth - 196);
  const top =
    typeof window === "undefined" ? y : Math.min(y, window.innerHeight - 172);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: Math.max(8, top), left: Math.max(8, left) }}
      className={cn(
        "fixed z-[120] min-w-[188px] rounded-lg border bg-background py-1 shadow-lg",
        INPUT_BORDER_CLASS
      )}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onSaveAs();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
      >
        <Download className="h-4 w-4 text-muted-foreground" />
        {t("create.generatedImageContextMenu.saveAs")}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRename();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
      >
        <Pencil className="h-4 w-4 text-muted-foreground" />
        {t("create.generatedImageContextMenu.rename")}
      </button>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 dark:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
        {t("create.generatedImageContextMenu.delete")}
      </button>
      <p className="truncate px-3 pb-1 pt-1 text-[11px] text-muted-foreground">
        {imageName}
      </p>
    </div>
  );
}
