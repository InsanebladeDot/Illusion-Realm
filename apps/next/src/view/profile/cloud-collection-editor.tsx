"use client";

import { useRef, useState } from "react";
import type { CloudCollection } from "@illusion-realm/shared";
import { cloudLibraryRequest, saveCloudCollection } from "@/api/cloud-library";
import { getCloudCollection } from "@/api/cloud-images";
import { AccountApiError } from "@/api/account";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS } from "@/utils/cloud-image-ui";
import { CloudResourceFields, CloudDeleteConfirmation, type ResourceDraft } from "./cloud-resource-fields";
import { useCloudMutation } from "./use-cloud-mutation";
import { CloudError } from "./cloud-library-controls";

export function CloudCollectionEditor({ collection, ownerId, onChanged, onClose }: { collection?: CloudCollection; ownerId: string; onChanged: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(collection);
  const [draft, setDraft] = useState<ResourceDraft>({ name: collection?.name ?? "", description: collection?.description ?? "", visibility: collection?.visibility ?? "private", presentationMode: "imageOnly" });
  const [confirmed, setConfirmed] = useState(false);
  const requestId = useRef<string | null>(null);
  const task = useCloudMutation(() => { onChanged(); onClose(); });
  async function save() {
    requestId.current ??= crypto.randomUUID();
    const fields = { ownerId, name: draft.name, description: draft.description, visibility: draft.visibility };
    try {
      if (current) await saveCloudCollection({ action: "updateCollection", ...fields, id: current.id, revision: current.revision });
      else await saveCloudCollection({ action: "createCollection", ...fields, requestId: requestId.current });
    } catch (error) { if (current && error instanceof AccountApiError && error.code === "REVISION_CONFLICT") { const latest = await getCloudCollection(current.id); setCurrent(latest); setDraft(value => ({ ...value, name: latest.name, description: latest.description ?? "", visibility: latest.visibility })); } throw error; }
  }
  return <section data-cloud-collection-editor className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
    <h3 className="font-semibold">{t(collection ? "profile.cloud.editCollection" : "profile.cloud.createCollection")}</h3>
    <fieldset disabled={task.busy || task.cooldown > 0} className="space-y-4">
      <form onSubmit={event => { event.preventDefault(); void task.run(save); }} className="space-y-3">
        {/* 弹窗：将请求锁显式传给浮层下拉，fieldset 无法禁用挂在外面的菜单。 */}
        <CloudResourceFields disabled={task.busy || task.cooldown > 0} draft={draft} collection onChange={patch => { requestId.current = null; setDraft(value => ({ ...value, ...patch })); }} />
        <button type="submit" className={CLOUD_BUTTON_CLASS} disabled={!draft.name.trim()}>{t("profile.cloud.save")}</button>
      </form>
      {collection && <div className="space-y-3 border-t border-border pt-3"><CloudDeleteConfirmation collection checked={confirmed} onChange={setConfirmed} />
        <button type="button" disabled={!confirmed} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50" onClick={() => { void task.run(() => cloudLibraryRequest({ action: "deleteCollection", id: collection.id, ownerId })); }}>{t("profile.cloud.deleteCollection")}</button>
      </div>}
    </fieldset>
    <CloudError error={task.error} cooldown={task.cooldown} />
    <button type="button" disabled={task.busy} onClick={onClose} className="text-sm underline">{t("common.close")}</button>
  </section>;
}
