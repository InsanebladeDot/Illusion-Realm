"use client";

// 界面：「@ 素材搜索」分类浮层；数据与键盘选中状态由同一补全 hook 提供，不导入素材。
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Music } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { MEDIA_REFERENCE_LABELS, mediaReferenceToken, type PromptMediaKind, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import { MediaThumbnail } from "./media-thumbnail";

export interface MediaMenuPosition { left: number; top: number; width: number; maxHeight: number; transform?: string }
export interface PromptMediaGroup { id: string; label: string; path: string; items: readonly PromptReferenceMedia[] }
export type MediaMenuEntry = { kind: "group"; group: PromptMediaGroup; count: number } | { kind: "category"; category: PromptMediaKind; count: number } | { kind: "media"; item: PromptReferenceMedia };
interface Props {
  id: string; position: MediaMenuPosition; entries: readonly MediaMenuEntry[]; active: number;
  category: PromptMediaKind | null; groupLabel?: string; hideTokens?: boolean; onBack: () => void; onChoose: (entry: MediaMenuEntry) => void;
}
function MenuEntry({ entry, selected, id, onChoose, hideTokens }: { hideTokens?: boolean; entry: MediaMenuEntry; selected: boolean; id: string; onChoose: Props["onChoose"] }) {
  const { t } = useTranslation();
  const category = entry.kind === "category" ? entry.category : null;
  const item = entry.kind === "media" ? entry.item : null;
  const group = entry.kind === "group" ? entry.group : null;
  const Icon = category === "video" ? Film : category === "audio" ? Music : ImageIcon;
  return <button id={id} type="button" role="option" aria-selected={selected}
    data-prompt-media-group={group?.id} data-prompt-media-option={item?.id} data-prompt-media-category={category ?? undefined}
    onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(entry)}
    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/60", selected && "bg-accent/60")}>
    {item ? <><MediaThumbnail item={item} />
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.label ?? item.name}</span>
        {!hideTokens && <span className="block truncate text-xs text-muted-foreground">{item.label ? `${item.name} · ` : ""}{mediaReferenceToken(item)}</span>}</span></>
      : (category || group) && <><Icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1">{group?.label ?? (category ? t(MEDIA_REFERENCE_LABELS[category]) : "")}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{entry.kind !== "media" && entry.count}</span><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></>}
  </button>;
}
export function PromptMediaMenu({ id, position, entries, active, category, groupLabel, hideTokens, onBack, onChoose }: Props) {
  const { t } = useTranslation();
  useEffect(() => { document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [id, active, entries]);
  return createPortal(<div data-prompt-media-menu style={position} onMouseDown={(event) => event.preventDefault()}
    className="fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-1 text-foreground shadow-lg">
    <div className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
      {(category || groupLabel) && <button type="button" data-prompt-media-back aria-label={t("create.mediaReferences.back")} onClick={onBack} className="rounded p-1 hover:bg-accent"><ChevronLeft className="h-3.5 w-3.5" /></button>}
      {groupLabel ?? (category ? t(MEDIA_REFERENCE_LABELS[category]) : t("create.mediaReferences.title"))}
    </div>
    <div id={id} role="listbox" aria-label={t("create.mediaReferences.title")}>
      {entries.length ? entries.map((entry, index) => <MenuEntry key={entry.kind === "category" ? entry.category : entry.kind === "group" ? entry.group.id : entry.item.id}
        id={`${id}-${index}`} entry={entry} hideTokens={hideTokens} selected={index === active} onChoose={onChoose} />)
        : <p className="px-2 py-3 text-xs text-muted-foreground">{t("create.mediaReferences.empty")}</p>}
    </div>
  </div>, document.body);
}
