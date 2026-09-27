/**
 * 画作详情的派生数据：标签、图片列表、相关作品、生成信息、发布时间文案。
 *
 * 怎么做：从 `GalleryPainting` 派生（字段缺失时给回退值）；所有文案返回**词条 key**，
 * 由渲染侧 `t(...)` 翻译（模块级不写死中文）。
 */
import { t } from "@/i18n";
import type { ImageAsset } from "@/types/common";
import type { GalleryGenerationMeta, GalleryPainting } from "@/types/gallery";

export function getPaintingTags(painting: GalleryPainting): string[] {
  if (painting.tags?.length) return painting.tags;
  return painting.prompt
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function getPaintingImages(
  painting: GalleryPainting
): ImageAsset[] {
  if (painting.galleryImages?.length) {
    return [painting.image, ...painting.galleryImages];
  }
  return [painting.image];
}

export function getRelatedPaintings(
  all: GalleryPainting[],
  painting: GalleryPainting,
  limit = 6
): GalleryPainting[] {
  return all
    .filter(
      (item) =>
        item.id !== painting.id && item.authorName === painting.authorName
    )
    .slice(0, limit);
}

export function getGenerationMeta(
  painting: GalleryPainting
): Required<
  Pick<
    GalleryGenerationMeta,
    "negativePrompt" | "seed" | "steps" | "cfg" | "sampler" | "modelName" | "modelVersion"
  >
> & { modelCover: ImageAsset } {
  const seed =
    painting.generation?.seed ??
    Math.abs(
      painting.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    );

  return {
    negativePrompt: painting.generation?.negativePrompt ?? "",
    seed,
    steps: painting.generation?.steps ?? 30,
    cfg: painting.generation?.cfg ?? 4,
    sampler: painting.generation?.sampler ?? "er_sde",
    modelName: painting.generation?.modelName ?? "Local Checkpoint",
    modelVersion: painting.generation?.modelVersion ?? "v1.0",
    modelCover: painting.generation?.modelCover ?? painting.image,
  };
}

export function formatPublishedAt(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return t("home.relativeTime.justNow");
  if (minutes < 60) return t("home.relativeTime.minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("home.relativeTime.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("home.relativeTime.daysAgo", { days });
  const months = Math.floor(days / 30);
  if (months < 12) return t("home.relativeTime.monthsAgo", { months });
  const years = Math.floor(months / 12);
  return t("home.relativeTime.yearsAgo", { years });
}
