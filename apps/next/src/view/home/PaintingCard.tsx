"use client";

import NextImage from "next/image";
import { Copy, Star, ThumbsUp } from "lucide-react";
import type { GalleryPainting } from "@/types/gallery";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { getRatingColor } from "@/utils/gallery";
import { cn } from "@/utils/cn";

type PaintingCardProps = {
  painting: GalleryPainting;
  className?: string;
  onSelect?: (painting: GalleryPainting) => void;
};

export function PaintingCard({ painting, className, onSelect }: PaintingCardProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(painting.prompt);
      showToast(t("home.card.promptCopied"));
    } catch {
      showToast(t("common.copyFailed"));
    }
  };

  const handleOpen = () => onSelect?.(painting);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-3xl bg-black shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40",
        className
      )}
    >
      <NextImage
        src={painting.image}
        alt={painting.title}
        width={painting.image.width}
        height={Math.round(painting.image.width / painting.aspectRatio)}
        className="h-auto w-full object-cover"
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16vw"
      />

      <div
        className="pointer-events-none absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow transition-opacity group-hover:opacity-0 group-active:opacity-0"
        style={{ backgroundColor: getRatingColor(painting.rating) }}
      >
        {painting.rating}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col opacity-0 transition-opacity duration-200",
          "group-hover:opacity-100 group-active:opacity-100",
          "rounded-3xl border-2 border-white"
        )}
      >
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/85 to-transparent px-3 pb-6 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: getRatingColor(painting.rating) }}
            >
              {painting.rating}
            </div>
            <h3 className="min-w-0 truncate text-sm font-medium text-white">
              {painting.title}
            </h3>
          </div>
        </div>

        <div className="relative mt-auto bg-black px-3 pb-3 pt-10">
          <div className="absolute -top-5 left-1/2 z-20 -translate-x-1/2">
            <div className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-black">
              <NextImage
                src={painting.authorAvatar}
                alt={painting.authorName}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <p className="mx-auto max-w-full px-1 text-center text-sm leading-relaxed text-white">
            {painting.description}
          </p>

          <div className="pointer-events-auto mx-auto mt-3 flex w-fit items-center gap-4 rounded-full bg-[#2d2d2d]/95 px-5 py-2.5">
            <button
              type="button"
              title={t("home.card.like")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation();
                showToast(t("home.card.likeNotImplemented"));
              }}
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t("home.card.favorite")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation();
                showToast(t("home.card.favoriteNotImplemented"));
              }}
            >
              <Star className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t("home.card.copyPrompt")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation();
                void handleCopyPrompt();
              }}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
