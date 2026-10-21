"use client";

import { useCallback, useState } from "react";
import { cloudLibraryRequest, listCloudCollections } from "@/api/cloud-library";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS, CLOUD_INPUT_CLASS } from "@/utils/cloud-image-ui";
import { useCloudList } from "./use-cloud-list";
import { useCloudMutation } from "./use-cloud-mutation";
import { CloudError, CloudPageFooter } from "./cloud-library-controls";

export function CloudAddToCollection({ imageId, ownerId, onClose }: { imageId: string; ownerId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const loader = useCallback((offset: number) => listCloudCollections("mine", offset), []);
  const page = useCloudList(loader);
  const [id, setId] = useState("");
  const [success, setSuccess] = useState(false);
  const task = useCloudMutation(() => setSuccess(true));
  return <section data-cloud-add-to-collection className="space-y-3 rounded-lg border border-border p-4">
    <h3 className="font-semibold">{t("profile.cloud.addToCollection")}</h3>
    <label className="block space-y-1 text-sm"><span>{t("profile.cloud.chooseCollection")}</span><select className={CLOUD_INPUT_CLASS} value={id} disabled={task.busy} onChange={event => { setId(event.target.value); setSuccess(false); }}>
      <option value="">{t("profile.cloud.chooseCollection")}</option>{page.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    {!page.busy && !page.items.length && <p className="text-sm text-muted-foreground">{t("profile.cloud.createFirst")}</p>}
    <CloudError error={page.error || task.error} cooldown={task.cooldown} />
    {success && <p role="status" className="text-sm">{t("profile.cloud.collected")}</p>}
    <CloudPageFooter busy={page.busy || task.busy} hasMore={page.hasMore} error={page.error} onMore={page.more} onReload={page.reload} />
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!id || task.busy || task.cooldown > 0 || success} className={CLOUD_BUTTON_CLASS} onClick={() => { void task.run(() => cloudLibraryRequest({ action: "addItem", ownerId, id, imageId })); }}>{t("profile.cloud.addToCollection")}</button>
      <button type="button" disabled={task.busy} onClick={onClose} className="text-sm underline">{t("common.close")}</button></div>
    <p className="text-xs text-muted-foreground">{t("profile.cloud.collectionPrivacy")}</p>
  </section>;
}
