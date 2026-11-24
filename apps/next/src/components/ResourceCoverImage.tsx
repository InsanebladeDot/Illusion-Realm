"use client";

import NextImage from "next/image";
import { ImageOff } from "lucide-react";
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
  placeholder?: string;
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
  placeholder,
}: ResourceCoverImageProps) {
  const { t } = useTranslation();

  // 封面区：空路径和本地图片读取失败都用同一图标，卡片尺寸不变。
  const fallback = <div data-resource-cover-placeholder className={cn(
    "flex flex-col items-center justify-center gap-2 bg-muted text-[10px] text-muted-foreground",
    fill && "absolute inset-0", className
  )}>
    <ImageOff size={26} strokeWidth={1.5} aria-hidden />
    <span className="break-all px-3 text-center">{placeholder || t("components.resourceCoverImage.empty")}</span>
  </div>;

  if (typeof cover === "string") {
    if (!cover) return fallback;

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
        fallback={fallback}
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
