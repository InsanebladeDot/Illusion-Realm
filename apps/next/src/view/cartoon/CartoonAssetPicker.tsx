"use client";

import Image from "next/image";
import { Plus, Trash2 } from "lucide-react";
import type { CartoonBubbleAsset } from "@/types/cartoonBubble";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { THIN_BORDER_CLASS } from "@/utils/layout";

type CartoonAssetPickerProps = {
  assets: CartoonBubbleAsset[];
  selectedId: string | null;
  onSelect: (asset: CartoonBubbleAsset) => void;
  onAddCustom: () => void;
  onRemoveCustom?: (id: string) => void;
};

export function CartoonAssetPicker({
  assets,
  selectedId,
  onSelect,
  onAddCustom,
  onRemoveCustom,
}: CartoonAssetPickerProps) {
  const { t } = useTranslation();
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background/80",
        THIN_BORDER_CLASS
      )}
    >
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-medium">{t("cartoon.assetPicker.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("cartoon.assetPicker.description")}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => {
            const selected = asset.id === selectedId;
            return (
              <div key={asset.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(asset)}
                  className={cn(
                    "flex w-full flex-col overflow-hidden rounded-lg border bg-muted/20 transition-colors",
                    selected
                      ? "border-foreground ring-1 ring-foreground"
                      : "border-border/70 hover:border-foreground/40"
                  )}
                >
                  <div className="relative aspect-square w-full bg-black/5 dark:bg-black/30">
                    <Image
                      src={asset.src}
                      alt={asset.name}
                      fill
                      unoptimized
                      className="object-contain p-1"
                      sizes="120px"
                    />
                  </div>
                  <span className="truncate px-2 py-1.5 text-left text-xs">
                    {asset.name}
                  </span>
                </button>
                {!asset.isBuiltIn && onRemoveCustom ? (
                  <button
                    type="button"
                    aria-label={t("cartoon.assetPicker.remove", { name: asset.name })}
                    onClick={() => onRemoveCustom(asset.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 p-3">
        <button
          type="button"
          onClick={onAddCustom}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("cartoon.customAsset.add")}
        </button>
      </div>
    </section>
  );
}
