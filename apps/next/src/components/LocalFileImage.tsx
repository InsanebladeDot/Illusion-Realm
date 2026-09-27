"use client";

import { useLocalImageSrc } from "@/hooks/useLocalImageSrc";
import { cn } from "@/utils/cn";

type LocalFileImageProps = {
  filePath: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function LocalFileImage({
  filePath,
  alt,
  className,
  fallback = null,
}: LocalFileImageProps) {
  const src = useLocalImageSrc(filePath);

  if (!src) return fallback;

  return <img src={src} alt={alt} className={cn(className)} />;
}
