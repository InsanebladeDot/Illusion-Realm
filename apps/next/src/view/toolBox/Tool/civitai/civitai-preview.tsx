"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { CivitaiImage } from "./civitai-image";

export function CivitaiPreview({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const { t } = useTranslation();
  const src = images[index] || "";
  return (
    <div data-civitai-preview className="relative aspect-[4/5] overflow-hidden rounded-lg border border-border bg-muted">
      <CivitaiImage key={src} src={src} alt={title} loading="eager" className="absolute inset-0 h-full w-full object-contain" />
      {images.length > 1 && <><button type="button" aria-label={t("toolBox.civitai.prevImage")} onClick={() => setIndex((index + images.length - 1) % images.length)} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronLeft size={18} /></button><button type="button" aria-label={t("toolBox.civitai.nextImage")} onClick={() => setIndex((index + 1) % images.length)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronRight size={18} /></button><span role="status" className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">{index + 1} / {images.length}</span></>}
    </div>
  );
}
