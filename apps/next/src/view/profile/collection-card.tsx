"use client";

import { FolderOpen, Globe2, LockKeyhole, MoreHorizontal } from "lucide-react";
import type { CloudCollection } from "@illusion-realm/shared";
import { useTranslation } from "@/i18n";

interface CollectionCardProps { collection: CloudCollection; creator: string; canEdit: boolean; onSelect: (id: string) => void; onEdit: (collection: CloudCollection) => void }

// 界面：收藏夹卡片 / 列表共用同一结构，只由父容器切换排版，不自行请求数据。
export function CollectionCard({ collection, creator, canEdit, onSelect, onEdit }: CollectionCardProps) {
  const { t } = useTranslation();
  const VisibilityIcon = collection.visibility === "private" ? LockKeyhole : Globe2;
  return <article data-cloud-collection-id={collection.id} className="collection-card group min-w-0">
    <button type="button" onClick={() => onSelect(collection.id)} aria-label={collection.name} className="collection-cover relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-accent-stroke">
      {/* 接口没有封面地址：使用明确占位，不借示例图冒充收藏内容。 */}
      <span className="flex min-w-0 flex-col items-center gap-2 px-3"><FolderOpen size={28} strokeWidth={1.3} aria-hidden="true" /><span className="collection-cover-caption text-[11px]">{t("profile.cloud.noCover")}</span></span>
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-1 text-[10px]" title={t(collection.visibility === "private" ? "profile.cloud.private" : "profile.cloud.public")}><VisibilityIcon size={11} aria-hidden="true" /><span className="collection-visibility-label">{t(collection.visibility === "private" ? "profile.cloud.private" : "profile.cloud.public")}</span></span>
    </button>
    <div className="min-w-0 pt-2">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onSelect(collection.id)} className="min-w-0 text-left hover:underline"><h4 className="truncate text-sm font-semibold" title={collection.name}>{collection.name}</h4></button>
        {canEdit && <button type="button" onClick={() => onEdit(collection)} title={t("profile.cloud.editCollection")} className="-mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={17} aria-hidden="true" /><span className="sr-only">{t("profile.cloud.editCollection")}</span></button>}
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground" title={t("profile.cloud.collectionOwner", { name: creator })}>{t("profile.cloud.collectionOwner", { name: creator })}</p>
      {collection.description && <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{collection.description}</p>}
    </div>
  </article>;
}
