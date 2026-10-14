"use client";

// 界面：分类和分类内模型共用的资源卡片，封面、选中边框、标题及 footer 完全同源。
import type { ReactNode } from "react";
import { Info, Star } from "lucide-react";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ModelCover } from "@/types/model";
import type { ResourceDialogTypography } from "@/utils/resourceDialogFontSize";

interface Props {
  name: string; cover: ModelCover; selected: boolean; typography: ResourceDialogTypography;
  tag?: string; tagClassName?: string; meta?: ReactNode; children: ReactNode;
  optionId?: string; onPick?: () => void;
}
export function ResourceSelectionCard({ name, cover, selected, typography, tag, tagClassName, meta, children, optionId, onPick }: Props) {
  const { t } = useTranslation();
  return <div data-resource-model-option={optionId} data-lora-model-option={optionId}
    role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-pressed={onPick ? selected : undefined}
    onClick={onPick} onKeyDown={(event) => { if (onPick && event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); onPick(); } }}
    className={cn("group relative flex min-w-0 flex-col rounded-xl border bg-background transition-colors",
      onPick && "cursor-pointer", selected ? "overflow-visible border-green-500 outline outline-1 outline-green-500" : "overflow-hidden border-border/60 hover:border-foreground/40 dark:border-gray-700")}>
    {selected && <span className={cn("absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 font-bold text-white", typography.selectedBadge)}>{t("create.extensionSelectDialog.selected")}</span>}
    <div className="relative isolate aspect-[4/5] w-full shrink-0 overflow-hidden rounded-t-xl bg-muted">
      <ResourceCoverImage cover={cover} alt={name} fill sizes="(max-width: 640px) 50vw, 33vw" className="absolute inset-0 h-full w-full object-cover" />
      {tag && <span title={tag} className={cn("absolute left-2 top-2 max-w-[70%] truncate rounded-full px-2 py-1 font-semibold", typography.coverTag, tagClassName ?? "bg-zinc-700/80 text-white")}>{tag}</span>}
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        {[{ Icon: Info, label: t("create.extensionSelectDialog.viewInfo") }, { Icon: Star, label: t("create.extensionSelectDialog.addToFavorites") }].map(({ Icon, label }) => <button key={label} type="button" title={label} onClick={(event) => event.stopPropagation()} className="rounded-full bg-black/50 p-1.5 hover:bg-black/70"><Icon className="h-4 w-4 text-white" /></button>)}
      </div>
    </div>
    <div className="flex min-w-0 flex-1 flex-col px-3 pb-3 pt-2">
      <h3 title={name} className={cn("truncate font-semibold text-foreground", typography.cardTitle)}>{name}</h3>
      <div className={cn("min-w-0 flex-1 text-muted-foreground", typography.cardMeta)}>{meta}</div>
      {children}
    </div>
  </div>;
}
