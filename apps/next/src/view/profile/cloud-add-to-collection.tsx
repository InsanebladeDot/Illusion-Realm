"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

import { useCallback, useState } from "react";
import { cloudLibraryRequest, listCloudCollections } from "@/api/cloud-library";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS } from "@/utils/cloud-image-ui";
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
    <label className="block space-y-1 text-sm"><span>{t("profile.cloud.chooseCollection")}</span><SimpleSelect
 value={String(id)}
 disabled={task.busy}
 onChange={(value) => { setId(value); setSuccess(false); }}
 className="min-w-0" portal
 options={[{ value: String(""), label: t("profile.cloud.chooseCollection") }, ...page.items.map((item) => ({ value: String(item.id), label: item.name }))]}
 /></label>
    {!page.busy && !page.items.length && <p className="text-sm text-muted-foreground">{t("profile.cloud.createFirst")}</p>}
    <CloudError error={page.error || task.error} cooldown={task.cooldown} />
    {success && <p role="status" className="text-sm">{t("profile.cloud.collected")}</p>}
    <CloudPageFooter busy={page.busy || task.busy} hasMore={page.hasMore} error={page.error} onMore={page.more} onReload={page.reload} />
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!id || task.busy || task.cooldown > 0 || success} className={CLOUD_BUTTON_CLASS} onClick={() => { void task.run(() => cloudLibraryRequest({ action: "addItem", ownerId, id, imageId })); }}>{t("profile.cloud.addToCollection")}</button>
      <button type="button" disabled={task.busy} onClick={onClose} className="text-sm underline">{t("common.close")}</button></div>
    <p className="text-xs text-muted-foreground">{t("profile.cloud.collectionPrivacy")}</p>
  </section>;
}
