"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  Maximize2,
  RefreshCcw,
  UserPlus,
  X,
} from "lucide-react";
import type { GalleryPainting } from "@/types/gallery";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import {
  formatPublishedAt,
  getGenerationMeta,
  getPaintingImages,
  getPaintingTags,
  getRelatedPaintings,
} from "@/utils/galleryDetail";
import { cn } from "@/utils/cn";
import { useIsHydrated } from "@/hooks/useIsHydrated";

type PaintingDetailDialogProps = {
  painting: GalleryPainting | null;
  allPaintings: GalleryPainting[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPainting: (painting: GalleryPainting) => void;
};

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(t("home.detailDialog.copiedLabel", { label }));
    } catch {
      showToast(t("common.copyFailed"));
    }
  };

  return (
    <button
      type="button"
      aria-label={t("home.detailDialog.copyLabel", { label })}
      onClick={handleCopy}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export function PaintingDetailDialog({
  painting,
  allPaintings,
  open,
  onOpenChange,
  onSelectPainting,
}: PaintingDetailDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const [imageIndex, setImageIndex] = useState(0);
  const isHydrated = useIsHydrated();

  const images = painting ? getPaintingImages(painting) : [];
  const tags = painting ? getPaintingTags(painting) : [];
  const generation = painting ? getGenerationMeta(painting) : null;
  const related = painting
    ? getRelatedPaintings(allPaintings, painting)
    : [];

  /**
   * 渲染期同步：切换到另一幅画时把图片索引复位。
   * 用「记录前值 + 渲染期比较」替代 useEffect 里的 setState
   * （react-hooks/set-state-in-effect 会拦后者），语义等价且少一次级联渲染。
   */
  const [previousPaintingId, setPreviousPaintingId] = useState<string | null>(null);
  const paintingId = painting?.id ?? null;
  if (paintingId !== previousPaintingId) {
    setPreviousPaintingId(paintingId);
    setImageIndex(0);
  }

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        setImageIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "ArrowRight") {
        setImageIndex((index) => Math.min(images.length - 1, index + 1));
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, images.length]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (!open || !painting || !generation || !isHydrated) return null;

  const currentImage = images[imageIndex] ?? painting.image;
  const hasPrev = imageIndex > 0;
  const hasNext = imageIndex < images.length - 1;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={handleClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="painting-detail-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] w-full max-w-[100vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border-0 bg-background p-0 shadow-lg outline-none",
          "h-[calc(85dvh-env(safe-area-inset-top))] max-h-[calc(95dvh-env(safe-area-inset-top))]",
          "lg:max-w-[86vw]",
          "mt-[calc(env(safe-area-inset-top)+3rem)] lg:mt-0"
        )}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={handleClose}
          className="absolute right-4 top-4 z-[200] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="h-full overflow-y-auto">
          <div className="flex flex-col bg-background p-4 sm:p-6 md:flex-row md:gap-6">
            <aside className="hidden w-[200px] shrink-0 lg:block">
              <h3 className="mb-3 text-sm font-medium">{t("home.detailDialog.tags")}</h3>
              <div className="space-y-0.5">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      showToast(
                        t("home.detailDialog.tagFilterNotImplemented", { tag })
                      )
                    }
                    className="block w-full text-left text-sm font-normal text-blue-500 transition-opacity hover:opacity-80 dark:text-blue-400"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </aside>

            <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="group relative aspect-square max-h-[700px] w-full overflow-hidden rounded-lg bg-muted/50">
                  <NextImage
                    src={currentImage}
                    alt={painting.title}
                    fill
                    className="cursor-zoom-in object-contain"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    priority
                  />

                  <button
                    type="button"
                    aria-label={t("home.detailDialog.fullscreen")}
                    onClick={() =>
                      showToast(t("home.detailDialog.fullscreenNotImplemented"))
                    }
                    className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground opacity-0 shadow-sm transition-opacity hover:bg-secondary/80 group-hover:opacity-100"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    aria-label={t("home.detailDialog.prevImage")}
                    disabled={!hasPrev}
                    onClick={() => setImageIndex((index) => index - 1)}
                    className={cn(
                      "absolute left-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-secondary-foreground opacity-0 shadow-sm transition-opacity hover:bg-secondary/80 group-hover:opacity-100",
                      !hasPrev && "invisible"
                    )}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    aria-label={t("home.detailDialog.nextImage")}
                    disabled={!hasNext}
                    onClick={() => setImageIndex((index) => index + 1)}
                    className={cn(
                      "absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-secondary-foreground opacity-0 shadow-sm transition-opacity hover:bg-secondary/80 group-hover:opacity-100",
                      !hasNext && "invisible"
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {images.length > 1 && (
                  <>
                    <div className="relative z-10 !mt-0 h-0">
                      <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums leading-none text-muted-foreground">
                        {imageIndex + 1}/{images.length}
                      </div>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {images.map((image, index) => (
                        <button
                          key={`${painting.id}-${index}`}
                          type="button"
                          aria-label={`Image ${index + 1}`}
                          onClick={() => setImageIndex(index)}
                          className={cn(
                            "relative aspect-square w-16 shrink-0 overflow-hidden rounded border-2 transition-all",
                            index === imageIndex
                              ? "border-purple-500 ring-2 ring-purple-500/20"
                              : "border-transparent hover:border-purple-200"
                          )}
                        >
                          <NextImage
                            src={image}
                            alt={`${painting.title} ${index + 1}`}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                          {index === imageIndex && (
                            <div className="absolute inset-0 bg-purple-500/10" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-5">
                <div className="lg:hidden">
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          showToast(
                            t("home.detailDialog.tagFilterNotImplemented", { tag })
                          )
                        }
                        className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-sm font-normal text-blue-500 transition-all hover:opacity-80 dark:bg-blue-950/20 dark:text-blue-400"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
                      <NextImage
                        src={painting.authorAvatar}
                        alt={painting.authorName}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{painting.authorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatPublishedAt(painting.publishedAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      showToast(t("home.detailDialog.followNotImplemented"))
                    }
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-500 px-3 text-xs font-medium text-white shadow hover:bg-purple-600"
                  >
                    <UserPlus className="h-4 w-4" />
                    {t("home.detailDialog.follow")}
                  </button>
                </div>

                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={() =>
                      showToast(t("home.detailDialog.likeNotImplemented"))
                    }
                    className="inline-flex h-auto items-center gap-1.5 rounded-md px-0 py-1.5 text-base font-medium transition-colors hover:bg-transparent"
                  >
                    <Heart className="h-5 w-5" />
                    <span>{painting.likes}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <h1
                    id="painting-detail-title"
                    className="text-xl font-bold"
                  >
                    {painting.title}
                  </h1>
                  <p className="text-sm text-muted-foreground">{painting.description}</p>
                </div>

                <div className="space-y-3 rounded-2xl border p-3">
                  <div className="flex h-8 items-center justify-between">
                    <h3 className="font-medium">
                      {t("home.detailDialog.generatedData")}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        showToast(t("home.detailDialog.remixNotImplemented"))
                      }
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-xl bg-purple-500 px-3 text-xs font-medium text-white shadow hover:bg-purple-600"
                    >
                      <RefreshCcw className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {t("home.detailDialog.remix")}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t("home.detailDialog.model")}
                      </div>
                      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                          <NextImage
                            src={generation.modelCover}
                            alt={generation.modelName}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">
                            {generation.modelName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {generation.modelVersion}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="mb-0 flex items-center justify-between">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("home.detailDialog.prompt")}
                        </div>
                        <CopyButton
                          value={painting.prompt}
                          label={t("home.detailDialog.prompt")}
                        />
                      </div>
                      <div className="font-mono text-sm">{painting.prompt}</div>
                    </div>

                    {generation.negativePrompt ? (
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <div className="font-medium text-muted-foreground">
                            {t("home.detailDialog.negativePrompt")}
                          </div>
                          <CopyButton
                            value={generation.negativePrompt}
                            label={t("home.detailDialog.negativePrompt")}
                          />
                        </div>
                        <div className="font-mono text-xs">{generation.negativePrompt}</div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">
                            {t("home.detailDialog.seed")}
                          </div>
                          <div className="font-mono">{generation.seed}</div>
                        </div>
                        <CopyButton
                          value={String(generation.seed)}
                          label={t("home.detailDialog.seed")}
                        />
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("home.detailDialog.steps")}
                        </div>
                        <div>{generation.steps}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("home.detailDialog.cfgRatio")}
                        </div>
                        <div>{generation.cfg}</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t("home.detailDialog.sampler")}
                        </div>
                        <div className="truncate">{generation.sampler}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {related.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-medium">
                      <span>{t("home.detailDialog.moreFrom")}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="relative h-5 w-5 overflow-hidden rounded-full">
                          <NextImage
                            src={painting.authorAvatar}
                            alt={painting.authorName}
                            fill
                            className="object-cover"
                            sizes="20px"
                          />
                        </span>
                        <span>{painting.authorName}</span>
                      </span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {related.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={item.title}
                          onClick={() => onSelectPainting(item)}
                          className="group relative aspect-square overflow-hidden rounded-md bg-muted transition-all hover:ring-2 hover:ring-purple-500/40"
                        >
                          <NextImage
                            src={item.image}
                            alt={item.title}
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="(max-width: 1024px) 33vw, 120px"
                          />
                          {item.galleryImages?.length ? (
                            <div className="absolute right-1 top-1 rounded-md bg-black/60 p-1 backdrop-blur-sm">
                              <span className="text-[10px] text-white">+</span>
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
