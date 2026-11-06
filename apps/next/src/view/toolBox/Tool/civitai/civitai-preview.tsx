"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { ImagePreviewTrigger } from "@/components/ImagePreviewOverlay";
import { CivitaiImage } from "./civitai-image";

/** 预览只响应手动翻页；当前下标由详情持有，下载时直接使用这一张封面。 */
export function CivitaiPreview({ images, title, index, onIndexChange }: { images: string[]; title: string; index: number; onIndexChange: (index: number) => void }) {
  const { t } = useTranslation();
  const src = images[index] || "";
  return (
    <div data-civitai-preview className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
      <ImagePreviewTrigger items={images.map((image, imageIndex) => ({ key: `${title}-${imageIndex}`, src: image, alt: title }))} index={index} onIndexChange={onIndexChange} className="absolute inset-0 z-0" imageClassName="h-full w-full object-contain"><CivitaiImage key={src} src={src} alt={title} loading="eager" className="absolute inset-0 h-full w-full object-contain" /></ImagePreviewTrigger>
      {images.length > 1 && <><button data-civitai-preview-prev type="button" aria-label={t("toolBox.civitai.prevImage")} onClick={() => onIndexChange((index + images.length - 1) % images.length)} className="absolute left-2 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronLeft size={18} /></button><button data-civitai-preview-next type="button" aria-label={t("toolBox.civitai.nextImage")} onClick={() => onIndexChange((index + 1) % images.length)} className="absolute right-2 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronRight size={18} /></button><span role="status" className="absolute bottom-2 right-2 z-[1] rounded bg-black/60 px-2 py-1 text-[10px] text-white">{index + 1} / {images.length}</span></>}
    </div>
  );
}
