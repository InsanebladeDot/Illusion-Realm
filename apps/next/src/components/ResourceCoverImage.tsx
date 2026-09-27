"use client";

import NextImage from "next/image";
import type { ImageAsset } from "@/types/common";
import { LocalFileImage } from "@/components/LocalFileImage";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

type ResourceCoverImageProps = {
  cover: ImageAsset | string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
};

export function ResourceCoverImage({
  cover,
  alt,
  fill = false,
  width,
  height,
  sizes,
  className,
  priority = false,
}: ResourceCoverImageProps) {
  const { t } = useTranslation();

  if (typeof cover === "string") {
    if (!cover) {
      return (
        <div
          className={cn(
            "flex items-center justify-center bg-muted text-[10px] text-muted-foreground",
            fill && "absolute inset-0",
            className
          )}
        >
          {t("components.resourceCoverImage.empty")}
        </div>
      );
    }

    if (cover.startsWith("data:")) {
      return (
        <img
          src={cover}
          alt={alt}
          className={cn(fill && "absolute inset-0 h-full w-full object-cover", className)}
          width={width}
          height={height}
        />
      );
    }

    return (
      <LocalFileImage
        filePath={cover}
        alt={alt}
        className={cn(fill && "absolute inset-0 h-full w-full object-cover", className)}
        fallback={
          <div
            className={cn(
              "flex items-center justify-center bg-muted text-[10px] text-muted-foreground",
              fill && "absolute inset-0",
              className
            )}
          >
            {t("components.resourceCoverImage.empty")}
          </div>
        }
      />
    );
  }

  if (fill) {
    return (
      <NextImage
        src={cover}
        alt={alt}
        fill
        sizes={sizes}
        className={className}
        priority={priority}
      />
    );
  }

  return (
    <NextImage
      src={cover}
      alt={alt}
      width={width ?? 40}
      height={height ?? 40}
      className={className}
      priority={priority}
    />
  );
}
