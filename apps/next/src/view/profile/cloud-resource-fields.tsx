"use client";

import { useTranslation } from "@/i18n";
import { CLOUD_INPUT_CLASS } from "@/utils/cloud-image-ui";

export interface ResourceDraft { name: string; description: string; visibility: "private" | "public"; presentationMode: "imageOnly" | "withGenerationInfo" }
/** 界面：图片编辑、收藏夹创建/编辑共用小表单；只负责字段，不负责请求。 */
export function CloudResourceFields({ draft, collection, onChange }: { draft: ResourceDraft; collection: boolean; onChange: (patch: Partial<ResourceDraft>) => void }) {
  const { t } = useTranslation();
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm sm:col-span-2"><span>{t(collection ? "profile.cloud.collectionName" : "profile.cloud.title")}</span><input required maxLength={100} className={CLOUD_INPUT_CLASS} value={draft.name} onChange={event => onChange({ name: event.target.value })} /></label>
    {collection && <label className="space-y-1 text-sm sm:col-span-2"><span>{t("profile.cloud.description")}</span><textarea maxLength={1000} className={CLOUD_INPUT_CLASS} rows={3} value={draft.description} onChange={event => onChange({ description: event.target.value })} /></label>}
    <label className="space-y-1 text-sm"><span>{t("profile.cloud.visibility")}</span><select className={CLOUD_INPUT_CLASS} value={draft.visibility} onChange={event => onChange({ visibility: event.target.value === "public" ? "public" : "private" })}><option value="private">{t("profile.cloud.private")}</option><option value="public">{t("profile.cloud.public")}</option></select></label>
    {!collection && <label className="space-y-1 text-sm"><span>{t("profile.cloud.presentation")}</span><select className={CLOUD_INPUT_CLASS} value={draft.presentationMode} onChange={event => onChange({ presentationMode: event.target.value === "withGenerationInfo" ? "withGenerationInfo" : "imageOnly" })}><option value="imageOnly">{t("profile.cloud.imageOnly")}</option><option value="withGenerationInfo">{t("profile.cloud.withGenerationInfo")}</option></select></label>}
  </div>;
}
export function CloudDeleteConfirmation({ collection, checked, onChange }: { collection: boolean; checked: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  return <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1" /><span>{t(collection ? "profile.cloud.deleteCollectionHint" : "profile.cloud.deleteImageHint")}</span></label>;
}
