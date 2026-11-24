"use client";

/** 各资料库共用的卡片；调用方提供展示数据和操作回调。 */
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Check, Heart, Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { ACCENT_SELECTED_OUTLINE_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { LibraryTextItem } from "./library-text-item";
import type { LibraryDisplayMode } from "./library-display-switch";
import { HoverTip } from "@/components/hover-tip";
import { VideoFirstFrameCover } from "@/components/video-first-frame-cover";

export interface LibraryCardProps {
  tooltip?: boolean;
  // contain 显示完整素材，cover 裁切填满；卡片比例均为 4:5。
  previewFit?: "cover" | "contain";
  // 视频封面按需读首帧；普通资料库不传此项，继续使用原图片封面。
  previewVideoSrc?: string;
  // 缺少封面时显示调用方提供的图标，未提供则沿用无预览图提示。
  previewFallback?: ReactNode;
  displayMode?: LibraryDisplayMode;
  text?: string;
  colorKey?: string;
  prefix: string; id: string; title: string; subtitle?: string; preview: string;
  badge: ReactNode; metric?: ReactNode; selected: boolean; favorite?: boolean;
  onSelect: () => void; onDetail?: () => void; onFavorite?: () => void;
}

/** 只记失败的图片地址，切换资源后可正常加载新图。 */
export function LibraryCard(props: LibraryCardProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState("");
  const { prefix, id, title, subtitle, preview, badge, metric, selected, favorite, onSelect, onDetail, onFavorite } = props;
  if (props.displayMode === "text") return <LibraryTextItem {...props} />;
  return <article data-library-card {...{ [`data-${prefix}-card`]: id, [`data-${prefix}-selected`]: String(selected) }} className={cn("group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-shadow hover:shadow-md", selected ? ACCENT_SELECTED_OUTLINE_CLASS : "border-border")}>
    {/* 预览区：固定 4:5，缺图仍可选。 */}
    <button type="button" onClick={onSelect} aria-label={t("characters.card.select", { name: title })} aria-pressed={selected} className="relative block aspect-[4/5] w-full overflow-hidden bg-muted">
      {props.previewVideoSrc ? <VideoFirstFrameCover src={props.previewVideoSrc} alt={title} className={cn("h-full w-full transition-transform duration-300 group-hover:scale-[1.03]", props.previewFit === "contain" ? "object-contain" : "object-cover")} /> : preview && failed !== preview ? <Image key={preview} src={preview} alt={title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" onError={() => setFailed(preview)} className={cn(props.previewFit === "contain" ? "object-contain" : "object-cover", "transition-transform duration-300 group-hover:scale-[1.03]")} /> : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{props.previewFallback ?? t("characters.card.noPreview")}</span>}
    </button>
    {/* 名称与分类区 */}
    <div className="h-px w-full bg-border" />
    <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">{props.tooltip ? <HoverTip label={title} asChild><h3 className="truncate text-sm font-semibold text-foreground">{title}</h3></HoverTip> : <HoverTip asChild layer="window" label={(title) ?? ""}><h3 className="truncate text-sm font-semibold text-foreground">{title}</h3></HoverTip>}{subtitle && <HoverTip asChild layer="window" label={(subtitle) ?? ""}><p className="truncate text-[11px] text-muted-foreground">{subtitle}</p></HoverTip>}<div className="flex items-end justify-between gap-2"><span className="max-w-[65%] truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{badge}</span><span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">{metric}</span></div></div>
    {/* 收藏入口：仅支持时显示。 */}
    {onFavorite && <button type="button" {...{ [`data-${prefix}-favorite`]: id }} aria-pressed={!!favorite} aria-label={t(favorite ? "characters.card.unfavorite" : "characters.card.favorite", { name: title })} onClick={onFavorite} className="absolute right-2 top-2 rounded-full bg-background/85 p-1.5 shadow-sm backdrop-blur hover:bg-background"><Heart className={cn("h-4 w-4", favorite ? "fill-accent-fill text-accent-fill" : "text-muted-foreground group-hover:text-foreground")} /></button>}
    {/* 选择标记与详情入口 */}
    <div className="absolute left-2 top-2 flex items-center gap-1">{selected && <span {...{ [`data-${prefix}-checked`]: true }} className={cn("flex h-5 w-5 items-center justify-center rounded-full shadow", PRIMARY_BUTTON_CLASS)}><Check className="h-3.5 w-3.5" /></span>}{onDetail && <button type="button" {...{ [`data-${prefix}-detail`]: id }} aria-label={t("characters.card.viewDetail", { name: title })} onClick={onDetail} className="rounded-full bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground"><Info className="h-4 w-4" /></button>}</div>
  </article>;
}
