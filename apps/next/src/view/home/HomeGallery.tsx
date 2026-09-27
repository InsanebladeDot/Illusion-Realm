"use client";

import { useMemo, useState } from "react";
import { GALLERY_PAINTINGS } from "@/data/galleryPaintings";
import type {
  GalleryOrder,
  GallerySearchScope,
  GallerySortKey,
  GalleryTimeRange,
} from "@/types/gallery";
import { useTranslation, type MessageKey } from "@/i18n";
import { filterGalleryPaintings, sortGalleryPaintings } from "@/utils/gallery";
import { GallerySearchBox } from "@/view/home/GallerySearchBox";
import { PaintingWaterfall } from "@/view/home/PaintingWaterfall";
import { SegmentMenu } from "@/view/home/SegmentMenu";

/** 模块作用域拿不到 hook：标签存**词条 key**，渲染时再 `t()` 取文案 */
const SORT_ITEMS: Array<{ id: GallerySortKey; label: MessageKey }> = [
  { id: "publishedAt", label: "home.gallery.sortPublishedAt" },
  { id: "likes", label: "home.gallery.sortLikes" },
  { id: "references", label: "home.gallery.sortReferences" },
  { id: "score", label: "home.gallery.sortScore" },
];

const ORDER_ITEMS: Array<{ id: GalleryOrder; label: MessageKey }> = [
  { id: "asc", label: "home.gallery.orderAsc" },
  { id: "desc", label: "home.gallery.orderDesc" },
];

const TIME_ITEMS: Array<{ id: GalleryTimeRange; label: MessageKey }> = [
  { id: "day", label: "home.gallery.timeDay" },
  { id: "week", label: "home.gallery.timeWeek" },
  { id: "month", label: "home.gallery.timeMonth" },
  { id: "all", label: "home.gallery.timeAll" },
];

export function HomeGallery() {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<GallerySortKey>("publishedAt");
  const [order, setOrder] = useState<GalleryOrder>("desc");
  const [timeRange, setTimeRange] = useState<GalleryTimeRange>("all");
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<GallerySearchScope>("all");

  // SegmentMenu 只负责渲染 `label` 文本，因此在这里把词条 key 翻成当前语言；
  // 数组必须保持引用稳定（SegmentMenu 的 useLayoutEffect 依赖 items）。
  const sortItems = useMemo(
    () => SORT_ITEMS.map((item) => ({ ...item, label: t(item.label) })),
    [t]
  );
  const orderItems = useMemo(
    () => ORDER_ITEMS.map((item) => ({ ...item, label: t(item.label) })),
    [t]
  );
  const timeItems = useMemo(
    () => TIME_ITEMS.map((item) => ({ ...item, label: t(item.label) })),
    [t]
  );

  const paintings = useMemo(() => {
    const filtered = filterGalleryPaintings(GALLERY_PAINTINGS, {
      query,
      scope: searchScope,
      timeRange,
    });

    return sortGalleryPaintings(filtered, sortKey, order);
  }, [query, searchScope, sortKey, order, timeRange]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="sticky top-0 z-20 bg-background px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          <SegmentMenu
            items={sortItems}
            value={sortKey}
            onChange={setSortKey}
          />
          <SegmentMenu
            items={orderItems}
            value={order}
            onChange={setOrder}
          />
          <GallerySearchBox
            query={query}
            scope={searchScope}
            onQueryChange={setQuery}
            onScopeChange={setSearchScope}
            className="min-w-[240px] basis-full sm:basis-auto lg:min-w-[280px]"
          />
          <SegmentMenu
            items={timeItems}
            value={timeRange}
            onChange={setTimeRange}
          />
        </div>
      </div>

      <div className="px-3 pb-4 sm:px-4">
        <PaintingWaterfall items={paintings} allItems={GALLERY_PAINTINGS} />
      </div>
    </div>
  );
}
