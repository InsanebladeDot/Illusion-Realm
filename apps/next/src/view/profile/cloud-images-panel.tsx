"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudImage } from "@illusion-realm/shared";
import { Upload } from "lucide-react";
import { getCloudImage } from "@/api/cloud-images";
import { listCloudImages } from "@/api/cloud-library";
import { useTranslation } from "@/i18n";
import { CloudImageGallery } from "./cloud-image-gallery";
import { CloudSignIn } from "./cloud-sign-in";
import { CloudScope, CloudError, CloudPageFooter } from "./cloud-library-controls";
import { useCloudList } from "./use-cloud-list";
import { CloudImageEditor } from "./cloud-image-editor";
import { CloudAddToCollection } from "./cloud-add-to-collection";
import { CloudImagesOverview } from "./cloud-images-overview";
import { CloudImagesToolbar, type ImageFilter, matchesCloudImage } from "./cloud-images-toolbar";
import { CloudUploadDialog } from "./cloud-upload-dialog";

interface BrowserProps { scope: "mine" | "public"; ownerId: string | null; revision: number; active: boolean; onUpload: () => void; onScopeChange: (scope: "mine" | "public") => void }

export function CloudImagesPanel({ ownerId, active }: { ownerId: string | null; active: boolean }) {
  const [scope, setScope] = useState<"mine" | "public">(ownerId ? "mine" : "public");
  const [revision, setRevision] = useState(0), [uploadOpen, setUploadOpen] = useState(false);
  return <>
    {/* 界面：云端图片，概览、工具条与图库保持同一个主内容容器 */}
    <CloudImagesBrowser key={scope} scope={scope} ownerId={ownerId} revision={revision} active={active} onUpload={() => setUploadOpen(true)} onScopeChange={setScope} />
    {/* 弹窗：复用资源外壳；关闭或切换标签后仍保留上传草稿与重试 UUID */}
    {ownerId && <CloudUploadDialog ownerId={ownerId} open={uploadOpen && active} onOpenChange={setUploadOpen} onUploaded={() => setRevision(value => value + 1)} />}
  </>;
}

function useImageLookup() {
  const [found, setFound] = useState<CloudImage | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const ticket = useRef(0);
  useEffect(() => () => { ticket.current++; }, []);
  function clear() { ticket.current++; setFound(null); setError(null); setBusy(false); }
  async function lookup(id: string) {
    const request = ++ticket.current;
    setBusy(true); setFound(null); setError(null);
    try { const image = await getCloudImage(id); if (request === ticket.current) setFound(image); }
    catch (failure) { if (request === ticket.current) setError(failure); }
    finally { if (request === ticket.current) setBusy(false); }
  }
  return { found, error, busy, clear, lookup };
}

function CloudImagesBrowser({ scope, ownerId, revision, active, onScopeChange, onUpload }: BrowserProps) {
  const { t } = useTranslation();
  const loader = useCallback((offset: number) => listCloudImages(scope, offset), [scope]);
  const page = useCloudList(loader, revision, active), lookup = useImageLookup();
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<ImageFilter>("all");
  const [edit, setEdit] = useState<CloudImage | null>(null), [collect, setCollect] = useState<CloudImage | null>(null);
  const images = page.items.filter(image => matchesCloudImage(image, query, filter));
  function actions(image: CloudImage) {
    return <>{ownerId === image.ownerId && <button type="button" className="rounded-md hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setEdit(image); setCollect(null); }}>{t("profile.cloud.editImage")}</button>}
      {ownerId && <button type="button" className="rounded-md hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setCollect(image); setEdit(null); }}>{t("profile.cloud.addToCollection")}</button>}</>;
  }
  return <section data-cloud-images className="min-w-0 space-y-6 bg-background">
    <CloudImagesOverview images={page.items} busy={page.busy} failed={Boolean(page.error)} accessory={<CloudScope scope={scope} ownerId={ownerId} onChange={onScopeChange} />} />
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-xl font-semibold tracking-tight">{t(scope === "mine" ? "profile.cloud.myImages" : "profile.cloud.publicImages")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("profile.cloud.manageImages")}</p></div>
      {ownerId ? <button type="button" data-cloud-upload-trigger onClick={onUpload} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Upload size={18} />{t("profile.cloud.upload")}</button> : <CloudSignIn />}</div>
    <CloudImagesToolbar query={query} filter={filter} busy={lookup.busy} onQuery={value => { setQuery(value); lookup.clear(); }} onFilter={value => { setFilter(value); lookup.clear(); }} onLookup={id => { void lookup.lookup(id); }} />
    <CloudError error={lookup.error || page.error} />
    {edit && ownerId && <CloudImageEditor key={edit.id} image={edit} ownerId={ownerId} onClose={() => setEdit(null)} onChanged={() => { lookup.clear(); page.reload(); }} />}
    {collect && ownerId && <CloudAddToCollection key={collect.id} imageId={collect.id} ownerId={ownerId} onClose={() => setCollect(null)} />}
    {lookup.found && !images.some(image => image.id === lookup.found?.id) && <CloudImageGallery images={[lookup.found]} actions={actions} />}
    <CloudImageGallery images={images} actions={actions} />
    {!page.busy && !images.length && !lookup.found && !page.error && <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">{t(query || filter !== "all" ? "profile.cloud.noSearchResults" : "profile.cloud.empty")}</p>}
    <CloudPageFooter busy={page.busy} hasMore={page.hasMore} error={page.error} onMore={page.more} onReload={page.reload} />
    <p className="text-xs leading-relaxed text-muted-foreground">{t("profile.cloud.statsHint")}</p>
  </section>;
}
