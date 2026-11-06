"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

// 界面：预览工具与缩略图带，数据全部来自正式图库与当前生成结果。
import { ChevronLeft, ChevronRight, Expand, ZoomIn } from "lucide-react";
import { LocalFileImage } from "@/components/LocalFileImage";
import type { ImagePreviewItem } from "@/components/ImagePreviewOverlay";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

interface PreviewHeaderProps { zoom: number; disabled: boolean; onZoom: (value: number) => void; onExpand: () => void }
export function CreationPreviewHeader({ zoom, disabled, onZoom, onExpand }: PreviewHeaderProps) {
  const { t } = useTranslation();
  return <header className="flex shrink-0 items-center gap-2 px-4 font-semibold">
    <span className="flex-1">{t("create.workspace.preview")}</span>
    <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
      <span className="hidden sm:inline">{t("create.workspace.zoom")}</span>
      <SimpleSelect
 data-preview-zoom
 ariaLabel={t("create.workspace.zoom")}
 disabled={disabled}
 value={String(zoom)}
 onChange={(value) => onZoom(Number(value))}
 className="min-w-[100px]" portal
 options={[...[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => ({ value: String(value), label: [Math.round(value * 100), "%"].join('') }))]}
 />
    </label>
    <button type="button" aria-label={t("create.workspace.zoomIn")} disabled={disabled} onClick={() => onZoom(Math.min(2, zoom + 0.25))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40"><ZoomIn size={16} /></button>
    <button data-preview-expand type="button" aria-label={t("components.imagePreviewOverlay.triggerLabel")} disabled={disabled} onClick={onExpand} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40"><Expand size={17} /></button>
  </header>;
}

interface FilmstripProps { items: ImagePreviewItem[]; index: number; onChange: (index: number) => void }
export function CreationFilmstrip({ items, index, onChange }: FilmstripProps) {
  const { t } = useTranslation();
  if (!items.length) return null;
  const step = (delta: number) => onChange((index + delta + items.length) % items.length);
  return <div data-create-filmstrip className="flex h-[86px] shrink-0 items-center gap-2 px-3">
    <button type="button" aria-label={t("create.workspace.previous")} onClick={() => step(-1)} className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"><ChevronLeft size={16} /></button>
    <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-1 [scrollbar-width:thin]">
      {items.map((item, position) => <button type="button" key={item.key} data-preview-thumbnail={position} aria-label={item.alt ?? t("create.page.previewAlt")} aria-pressed={position === index} onClick={() => onChange(position)} className={cn("h-16 w-[72px] shrink-0 overflow-hidden rounded-md bg-muted", position === index && "ring-2 ring-accent-stroke")}>
        {item.src ? <img src={item.src} alt="" className="h-full w-full object-cover" /> : <LocalFileImage filePath={item.filePath ?? null} alt="" className="h-full w-full object-cover" />}
      </button>)}
    </div>
    <button type="button" aria-label={t("create.workspace.next")} onClick={() => step(1)} className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></button>
  </div>;
}
