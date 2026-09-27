"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";
import { Upload, X } from "lucide-react";
import type { CartoonCustomAssetInput, CartoonTextArea } from "@/types/cartoonBubble";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";

type CustomAssetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: CartoonCustomAssetInput) => void;
};

const DEFAULT_TEXT_AREA: CartoonTextArea = {
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
};

export function CustomAssetDialog({
  open,
  onOpenChange,
  onSave,
}: CustomAssetDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const reset = useCallback(() => {
    setName("");
    setPreviewSrc(null);
    setImageSize({ width: 0, height: 0 });
  }, []);

  /**
   * 渲染期同步：关闭时把表单复位。
   * 记录前值到 state、渲染期比较后立即 set，替代 effect 内 setState。
   */
  const [previousOpen, setPreviousOpen] = useState<boolean | null>(null);
  if (!open && open !== previousOpen) {
    setPreviousOpen(open);
    reset();
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setPreviewSrc(src);
        setImageSize({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleSave = () => {
    if (!previewSrc || imageSize.width <= 0) return;
    onSave({
      name: name.trim() || t("cartoon.customAsset.defaultName"),
      src: previewSrc,
      width: imageSize.width,
      height: imageSize.height,
      textArea: DEFAULT_TEXT_AREA,
    });
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-cartoon-dialog-title"
        className={cn(
          "relative z-10 flex max-h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
          THIN_BORDER_CLASS
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 id="custom-cartoon-dialog-title" className="text-sm font-medium">
              {t("cartoon.customAsset.add")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("cartoon.customAsset.description")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("cartoon.customAsset.closeDialog")}
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-gutter:stable]">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-sm transition-colors hover:bg-muted/40">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span>
              {previewSrc
                ? t("cartoon.customAsset.rechooseImage")
                : t("cartoon.customAsset.chooseImage")}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>

          <div>
            <label htmlFor="custom-cartoon-name" className="mb-1 block text-xs font-medium">
              {t("cartoon.customAsset.nameLabel")}
            </label>
            <input
              id="custom-cartoon-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("cartoon.customAsset.namePlaceholder")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
          </div>

          {previewSrc ? (
            <div className="relative mx-auto aspect-square max-h-[320px] w-full max-w-[320px] overflow-hidden rounded-lg bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={t("cartoon.customAsset.previewAlt")}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!previewSrc}
            onClick={handleSave}
            className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("cartoon.customAsset.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
