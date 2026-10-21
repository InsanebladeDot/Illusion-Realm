"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { CloudCollection } from "@illusion-realm/shared";
import { readCollectionPage, type CollectionImageResult } from "@/api/cloud-collections";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS, cloudErrorKey } from "@/utils/cloud-image-ui";
import { CloudIdLookup } from "./cloud-id-lookup";
import { CloudImageGallery } from "./cloud-image-gallery";
import { listCloudCollections, cloudLibraryRequest } from "@/api/cloud-library";
import { CloudScope, CloudError, CloudPageFooter } from "./cloud-library-controls";
import { useCloudList } from "./use-cloud-list";
import { CloudCollectionEditor } from "./cloud-collection-editor";
import { useCloudMutation } from "./use-cloud-mutation";
import { useAccountStore } from "@/stores/useAccountStore";
import { CollectionCard } from "./collection-card";
import { ResourceViewToggle, type ResourceView } from "./resource-view-toggle";

interface CollectionState { collection: CloudCollection; images: CollectionImageResult[]; nextCursor: string | null; reset: boolean }
export function CloudCollectionsPanel({ ownerId, active }: { ownerId: string | null; active: boolean }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<"mine" | "public">(ownerId ? "mine" : "public");
  const [selected, setSelected] = useState<string | null>(null), [creating, setCreating] = useState(false), [editing, setEditing] = useState<CloudCollection | null>(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<ResourceView>("grid");
  function changed() { setSelected(null); setRevision(value => value + 1); }
  return <div data-cloud-collections className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-lg font-semibold tracking-tight">{t(scope === "mine" ? "profile.cloud.myCollections" : "profile.cloud.publicCollections")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("profile.cloud.collectionsDescription")}</p></div>
      <div className="flex flex-wrap items-center gap-2"><CloudScope scope={scope} ownerId={ownerId} onChange={value => { setScope(value); setSelected(null); setEditing(null); }} /><ResourceViewToggle value={view} onChange={setView} />
      {ownerId && <button type="button" data-cloud-create-collection className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent-fill px-3 text-xs font-medium text-accent-fill-foreground hover:opacity-85" onClick={() => { setCreating(value => !value); setEditing(null); }}><Plus size={15} />{t("profile.cloud.createCollection")}</button>}</div>
    </div>
    {/* 界面：创建/编辑复用同一表单，创建重试保留 UUID */}
    {ownerId && (creating || editing) && <CloudCollectionEditor key={editing?.id ?? "create"} collection={editing ?? undefined} ownerId={ownerId} onChanged={changed} onClose={() => { setCreating(false); setEditing(null); }} />}
    {/* 界面：详情替换展示区域但列表保持挂载，返回时不丢分页和布局状态。 */}
    <div hidden={Boolean(selected)}><CollectionList key={scope} scope={scope} ownerId={ownerId} view={view} revision={revision} active={active} onSelect={setSelected} onEdit={value => { setCreating(false); setEditing(value); }} /></div>
    <details className="max-w-md text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded py-1 hover:text-foreground">{t("profile.cloud.lookupById")}</summary><div className="pt-3"><CloudIdLookup kind="collection" busy={false} onLookup={setSelected} /></div></details>
    {selected && active && <><button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />{t("profile.cloud.backToCollections")}</button><CollectionDetail key={`${selected}:${revision}`} id={selected} ownerId={ownerId} onEdit={setEditing} /></>}
  </div>;
}
function CollectionList({ scope, ownerId, view, revision, active, onSelect, onEdit }: { scope: "mine" | "public"; ownerId: string | null; view: ResourceView; revision: number; active: boolean; onSelect: (id: string) => void; onEdit: (value: CloudCollection) => void }) {
  const { t } = useTranslation();
  const loader = useCallback((offset: number) => listCloudCollections(scope, offset), [scope]);
  const page = useCloudList(loader, revision, active);
  const accountName = useAccountStore(state => state.profile?.displayName);
  return <section className="space-y-4" aria-label={t(scope === "mine" ? "profile.cloud.myCollections" : "profile.cloud.publicCollections")}>
    <CloudError error={page.error} />
    <div className="collection-layout"><div data-collection-layout={view} className={view === "grid" ? "collection-grid" : "collection-list"}>{page.items.map(item => <CollectionCard key={item.id} collection={item} creator={ownerId === item.ownerId && accountName ? accountName : t("profile.cloud.id", { id: item.ownerId })} canEdit={ownerId === item.ownerId} onSelect={onSelect} onEdit={onEdit} />)}</div></div>
    {!page.busy && !page.items.length && !page.error && <p className="py-4 text-center text-sm text-muted-foreground">{t("profile.cloud.noCollections")}</p>}
    <CloudPageFooter busy={page.busy} hasMore={page.hasMore} error={page.error} onMore={page.more} onReload={page.reload} />
  </section>;
}
function CollectionDetail({ id, ownerId, onEdit }: { id: string; ownerId: string | null; onEdit: (value: CloudCollection) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<CollectionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const alive = useRef(true);
  const pending = useRef(false);
  const task = useCloudMutation(() => { void load(id); });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load(id: string, more = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    if (!more) setValue(null);
    try {
      const next = await readCollectionPage(id, more ? value?.nextCursor ?? undefined : undefined, more ? value?.collection.revision : undefined);
      if (alive.current) setValue(current => ({ ...next, images: more && !next.reset && current ? mergeItems(current.images, next.images) : next.images }));
    } catch (failure) { if (alive.current) { setError(failure); if (failure instanceof Error && "status" in failure && (failure.status === 401 || failure.status === 404)) setValue(null); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => { void load(id); /* 详情以 ID 为单位挂载；后续刷新由写操作触发。 */ }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="space-y-5">
    <p className="text-xs text-muted-foreground">{t("profile.cloud.collectionPrivacy")}</p>
    <CloudError error={task.error} cooldown={task.cooldown} />
    {Boolean(error) && <p role="alert" className="text-sm text-destructive">{t(cloudErrorKey(error))}</p>}
    {busy && <p role="status" className="text-sm">{t("profile.cloud.loading")}</p>}
    {value && <CollectionContents value={value} busy={busy || task.busy || task.cooldown > 0} ownerId={ownerId} onEdit={() => onEdit(value.collection)} onRemove={imageId => { if (ownerId) void task.run(() => cloudLibraryRequest({ action: "removeItem", ownerId, id, imageId })); }} onMore={() => { void load(value.collection.id, true); }} />}
  </div>;
}
function mergeItems(previous: CollectionImageResult[], next: CollectionImageResult[]) {
  return [...previous, ...next.filter(item => !previous.some(old => old.imageId === item.imageId))];
}
function CollectionContents({ value, busy, ownerId, onEdit, onRemove, onMore }: { value: CollectionState; busy: boolean; ownerId: string | null; onEdit: () => void; onRemove: (id: string) => void; onMore: () => void }) {
  const { t } = useTranslation();
  const available = value.images.flatMap(item => item.image ? [item.image] : []);
  return <section className="space-y-4">
    <div><h3 className="break-words text-lg font-semibold">{value.collection.name}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{value.collection.description}</p></div>
    {ownerId === value.collection.ownerId && <button type="button" onClick={onEdit} disabled={busy} className="text-sm underline">{t("profile.cloud.editCollection")}</button>}
    {value.reset && <p role="status" className="text-sm text-muted-foreground">{t("profile.cloud.revisionReset")}</p>}
    <CloudImageGallery images={available} actions={ownerId === value.collection.ownerId ? image => <button type="button" disabled={busy} className="underline disabled:opacity-50" onClick={() => onRemove(image.id)}>{t("profile.cloud.removeFromCollection")}</button> : undefined} />
    {value.images.filter(item => !item.image).map(item => <div key={item.imageId} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><p>{t("profile.cloud.id", { id: item.imageId })} · {t(cloudErrorKey(item.error))}</p>{ownerId === value.collection.ownerId && <button type="button" disabled={busy} className="underline" onClick={() => onRemove(item.imageId)}>{t("profile.cloud.removeFromCollection")}</button>}</div>)}
    {!value.images.length && <p className="py-6 text-center text-sm text-muted-foreground">{t("profile.cloud.collectionEmpty")}</p>}
    {value.nextCursor && <button type="button" disabled={busy} onClick={onMore} className={CLOUD_BUTTON_CLASS}>{t(busy ? "profile.cloud.loading" : "profile.cloud.loadMore")}</button>}
  </section>;
}
