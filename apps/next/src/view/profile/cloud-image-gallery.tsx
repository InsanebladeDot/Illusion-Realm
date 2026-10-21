"use client";

import { useState, type ReactNode } from "react";
import type { CloudImage } from "@illusion-realm/shared";
import { ImagePreviewOverlay } from "@/components/ImagePreviewOverlay";
import { useTranslation } from "@/i18n";

export function CloudImageGallery({ images, actions }: { images: CloudImage[]; actions?: (image: CloudImage) => ReactNode }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<number | null>(null);
  const items = images.map(image => ({ key: image.id, src: image.sourceUrl, alt: image.title }));
  return <>
    <div className="grid grid-cols-1 gap-x-4 gap-y-6 min-[540px]:grid-cols-2 xl:grid-cols-3">
      {images.map((image, index) => <article key={image.id} data-cloud-image-id={image.id} className="group min-w-0">
        <button type="button" onClick={() => setPreview(index)} aria-label={t("profile.cloud.preview", { title: image.title })} className="block w-full overflow-hidden rounded-2xl border border-border/60 bg-muted outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {/* 界面：云端原图缩略展示，点开复用全局图片预览层 */}
          <img src={image.sourceUrl} alt={image.title} loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover transition-transform duration-200 motion-reduce:transition-none group-hover:scale-[1.02]" />
        </button>
        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <h4 className="truncate text-base font-medium text-foreground" title={image.title}>{image.title}</h4>
          <p className="text-sm">PNG · {t(image.visibility === "private" ? "profile.cloud.private" : "profile.cloud.public")}</p>
          <p className="select-text break-all text-[11px]">{t("profile.cloud.id", { id: image.id })} · {t("profile.cloud.dimensions", { width: image.width, height: image.height })}</p>
          {actions && <div className="flex flex-wrap gap-x-3 gap-y-2 pt-1">{actions(image)}</div>}
        </div>
      </article>)}
    </div>
    {/* 弹窗：复用已有的图片大图预览，不单独实现缩放、拖动 */}
    {preview !== null && <ImagePreviewOverlay items={items} index={preview} open onIndexChange={setPreview} onOpenChange={open => { if (!open) setPreview(null); }} />}
  </>;
}
