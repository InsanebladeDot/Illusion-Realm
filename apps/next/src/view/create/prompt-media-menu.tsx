"use client";

// 界面：「@ 素材搜索」矩形浮层，候选数据由当前任务提供；只展示与返回选择，不导入素材。
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { Film, Image as ImageIcon, Music } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { mediaReferenceToken, type PromptReferenceMedia } from "@/utils/prompt-media-references";

export interface MediaMenuPosition { left: number; top: number; width: number; maxHeight: number; transform?: string }
interface Props {
  id: string; position: MediaMenuPosition; items: readonly PromptReferenceMedia[]; active: number;
  onSelect: (item: PromptReferenceMedia) => void;
}
function MediaThumbnail({ item }: { item: PromptReferenceMedia }) {
  const Icon = item.kind === "video" ? Film : item.kind === "audio" ? Music : ImageIcon;
  const thumbnail = item.thumbnail ?? (item.kind === "image" ? item.src : undefined);
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {thumbnail ? <img src={thumbnail} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon className="h-4 w-4" />}
  </span>;
}
function MediaMenuItem({ item, selected, id, onSelect }: { item: PromptReferenceMedia; selected: boolean; id: string; onSelect: Props["onSelect"] }) {
  const { t } = useTranslation();
  return <button id={id} type="button" role="option" aria-selected={selected} data-prompt-media-option={item.id}
    onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(item)}
    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60", selected && "bg-accent/60")}>
    <MediaThumbnail item={item} />
    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.label ?? item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.label ? `${item.name} · ` : ""}{mediaReferenceToken(item)}</span></span>
    <span className="shrink-0 text-[11px] text-muted-foreground">{t(item.kind === "image" ? "create.mediaReferences.image" : item.kind === "video" ? "create.mediaReferences.video" : "create.mediaReferences.audio")}</span>
  </button>;
}
export function PromptMediaMenu({ id, position, items, active, onSelect }: Props) {
  const { t } = useTranslation();
  useEffect(() => { document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [id, active]);
  return createPortal(<div id={id} role="listbox" aria-label={t("create.mediaReferences.title")} data-prompt-media-menu
    style={position} onMouseDown={(event) => event.preventDefault()}
    className="fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-1 text-foreground shadow-lg">
    <div className="px-2 py-1 text-xs text-muted-foreground">{t("create.mediaReferences.title")}</div>
    {items.length ? items.map((item, index) => <MediaMenuItem key={item.id} id={`${id}-${index}`} item={item} selected={index === active} onSelect={onSelect} />)
      : <p className="px-2 py-3 text-xs text-muted-foreground">{t("create.mediaReferences.empty")}</p>}
  </div>, document.body);
}
