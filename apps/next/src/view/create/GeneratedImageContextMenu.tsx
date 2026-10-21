"use client";

import { ContextMenuShell } from "@/components/context-menu-shell";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";

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
  return (
    <ContextMenuShell x={x} y={y} label={imageName} onClose={onClose} className="w-[188px] py-1">
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
    </ContextMenuShell>
  );
}
