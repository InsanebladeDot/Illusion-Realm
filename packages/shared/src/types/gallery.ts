import type { ImageAsset } from "./common";

export type GalleryRating = "B" | "C" | "D";

export type GallerySortKey = "publishedAt" | "likes" | "references" | "score";

export type GalleryOrder = "asc" | "desc";

export type GalleryTimeRange = "day" | "week" | "month" | "all";

export type GallerySearchScope = "all" | "name";

export type GalleryGenerationMeta = {
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  modelName?: string;
  modelVersion?: string;
  modelCover?: ImageAsset;
};

export type GalleryPainting = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  rating: GalleryRating;
  image: ImageAsset;
  /** 鍚屽笘澶氬浘锛涙湭璁剧疆鏃朵粎灞曠ず灏侀潰鍥?*/
  galleryImages?: ImageAsset[];
  aspectRatio: number;
  authorName: string;
  authorAvatar: ImageAsset;
  publishedAt: number;
  likes: number;
  references: number;
  score: number;
  tags?: string[];
  generation?: GalleryGenerationMeta;
};
