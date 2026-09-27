"use client";

import { useState } from "react";
import type { GalleryPainting } from "@/types/gallery";
import { useTranslation } from "@/i18n";
import { PaintingCard } from "@/view/home/PaintingCard";
import { PaintingDetailDialog } from "@/view/home/PaintingDetailDialog";
import { cn } from "@/utils/cn";

type PaintingWaterfallProps = {
  items: GalleryPainting[];
  /** 用于「更多来自」等同作者推荐，默认与 items 相同 */
  allItems?: GalleryPainting[];
  className?: string;
};

export function PaintingWaterfall({
  items,
  allItems = items,
  className,
}: PaintingWaterfallProps) {
  const { t } = useTranslation();
  const [selectedPainting, setSelectedPainting] = useState<GalleryPainting | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const handleSelect = (painting: GalleryPainting) => {
    setSelectedPainting(painting);
    setDetailOpen(true);
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
        {t("home.waterfall.empty")}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6",
          className
        )}
      >
        {items.map((painting) => (
          <div key={painting.id} className="mb-3 break-inside-avoid">
            <PaintingCard painting={painting} onSelect={handleSelect} />
          </div>
        ))}
      </div>

      <PaintingDetailDialog
        painting={selectedPainting}
        allPaintings={allItems}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSelectPainting={handleSelect}
      />
    </>
  );
}
