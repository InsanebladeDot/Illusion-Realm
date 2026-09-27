/**
 * 画作/图库（`/标签`、主页图库）的筛选与排序。
 *
 * 怎么做：纯函数 —— 按搜索范围/时间范围过滤 + 按排序键比较；
 * 另含「评分 → 颜色」的展示映射。
 */
import type {
  GalleryOrder,
  GalleryPainting,
  GallerySearchScope,
  GallerySortKey,
  GalleryTimeRange,
} from "@/types/gallery";

const TIME_RANGE_MS: Record<Exclude<GalleryTimeRange, "all">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export function getRatingColor(rating: GalleryPainting["rating"]): string {
  switch (rating) {
    case "B":
      return "#2a82e4";
    case "C":
      return "#43cf7c";
    case "D":
      return "#a6a6a6";
    default:
      return "#a6a6a6";
  }
}

export function filterGalleryPaintings(
  items: GalleryPainting[],
  options: {
    query: string;
    scope?: GallerySearchScope;
    timeRange: GalleryTimeRange;
    now?: number;
  }
): GalleryPainting[] {
  const now = options.now ?? Date.now();
  const normalizedQuery = options.query.trim().toLowerCase();
  const scope = options.scope ?? "all";

  return items.filter((item) => {
    if (options.timeRange !== "all") {
      const rangeMs = TIME_RANGE_MS[options.timeRange];
      if (now - item.publishedAt > rangeMs) return false;
    }

    if (!normalizedQuery) return true;

    switch (scope) {
      case "name":
        return item.authorName.toLowerCase().includes(normalizedQuery);
      case "all":
      default:
        return (
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.description.toLowerCase().includes(normalizedQuery) ||
          item.prompt.toLowerCase().includes(normalizedQuery) ||
          item.authorName.toLowerCase().includes(normalizedQuery)
        );
    }
  });
}

export function sortGalleryPaintings(
  items: GalleryPainting[],
  sortKey: GallerySortKey,
  order: GalleryOrder
): GalleryPainting[] {
  const sorted = [...items].sort((left, right) => {
    switch (sortKey) {
      case "likes":
        return left.likes - right.likes;
      case "references":
        return left.references - right.references;
      case "score":
        return left.score - right.score;
      case "publishedAt":
      default:
        return left.publishedAt - right.publishedAt;
    }
  });

  return order === "desc" ? sorted.reverse() : sorted;
}
