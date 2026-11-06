"use client";

import { useState } from "react";
import type { CloudImage } from "@illusion-realm/shared";
import { cloudLibraryRequest } from "@/api/cloud-library";
import { getCloudImage } from "@/api/cloud-images";
import { AccountApiError } from "@/api/account";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS } from "@/utils/cloud-image-ui";
import { CloudResourceFields, CloudDeleteConfirmation, type ResourceDraft } from "./cloud-resource-fields";
import { useCloudMutation } from "./use-cloud-mutation";
import { CloudError } from "./cloud-library-controls";

export function CloudImageEditor({ image, ownerId, onChanged, onClose }: { image: CloudImage; ownerId: string; onChanged: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(image);
  const [draft, setDraft] = useState<ResourceDraft>({ name: image.title, description: "", visibility: image.visibility, presentationMode: image.presentationMode });
  const [confirmed, setConfirmed] = useState(false);
  const task = useCloudMutation(() => { onChanged(); onClose(); });
  async function save() {
    try { await cloudLibraryRequest({ action: "updateImage", id: image.id, ownerId, expectedRevision: current.revision, title: draft.name, visibility: draft.visibility, presentationMode: draft.presentationMode }); }
    catch (error) { if (error instanceof AccountApiError && error.code === "REVISION_CONFLICT") { const latest = await getCloudImage(image.id); setCurrent(latest); setDraft({ name: latest.title, description: "", visibility: latest.visibility, presentationMode: latest.presentationMode }); } throw error; }
  }
  return <section data-cloud-image-editor className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
    <h3 className="font-semibold">{t("profile.cloud.editImage")}</h3>
    <fieldset disabled={task.busy || task.cooldown > 0} className="space-y-4">
      <form onSubmit={event => { event.preventDefault(); void task.run(save); }} className="space-y-3">
        {/* 弹窗：将请求锁显式传给浮层下拉，fieldset 无法禁用挂在外面的菜单。 */}
        <CloudResourceFields disabled={task.busy || task.cooldown > 0} draft={draft} collection={false} onChange={patch => setDraft(value => ({ ...value, ...patch }))} />
        <button type="submit" className={CLOUD_BUTTON_CLASS} disabled={!draft.name.trim()}>{t("profile.cloud.save")}</button>
      </form>
      <div className="space-y-3 border-t border-border pt-3"><CloudDeleteConfirmation collection={false} checked={confirmed} onChange={setConfirmed} />
        <button type="button" disabled={!confirmed} className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive disabled:opacity-50" onClick={() => { void task.run(() => cloudLibraryRequest({ action: "deleteImage", ownerId, id: image.id })); }}>{t("profile.cloud.deleteImage")}</button>
      </div>
    </fieldset>
    <CloudError error={task.error} cooldown={task.cooldown} />
    <button type="button" disabled={task.busy} onClick={onClose} className="text-sm underline">{t("common.close")}</button>
  </section>;
}
