"use client";

// 下拉选项沿用原业务值，菜单外观、滚动与键盘操作统一复用采样器组件。
import { SimpleSelect } from "@/components/SimpleSelect";

import { useTranslation } from "@/i18n";
import { CLOUD_INPUT_CLASS } from "@/utils/cloud-image-ui";

export interface ResourceDraft { name: string; description: string; visibility: "private" | "public"; presentationMode: "imageOnly" | "withGenerationInfo" }
/** 界面：图片编辑、收藏夹创建/编辑共用小表单；只负责字段，不负责请求。 */
// disabled 从操作持有方注入，保存与冷却期间同时关闭已经展开的 Portal。
// 普通输入仍由外层 fieldset 管理，不增加第二份请求或倒计时状态。
export function CloudResourceFields({ draft, collection, disabled, onChange }: { draft: ResourceDraft; collection: boolean; disabled: boolean; onChange: (patch: Partial<ResourceDraft>) => void }) {
  const { t } = useTranslation();
  return <div className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm sm:col-span-2"><span>{t(collection ? "profile.cloud.collectionName" : "profile.cloud.title")}</span><input required maxLength={100} className={CLOUD_INPUT_CLASS} value={draft.name} onChange={event => onChange({ name: event.target.value })} /></label>
    {collection && <label className="space-y-1 text-sm sm:col-span-2"><span>{t("profile.cloud.description")}</span><textarea maxLength={1000} className={CLOUD_INPUT_CLASS} rows={3} value={draft.description} onChange={event => onChange({ description: event.target.value })} /></label>}
    <label className="space-y-1 text-sm"><span>{t("profile.cloud.visibility")}</span><SimpleSelect
 disabled={disabled}
 value={String(draft.visibility)}
 onChange={(value) => onChange({ visibility: value === "public" ? "public" : "private" })}
 className="min-w-0" portal
 options={[{ value: String("private"), label: t("profile.cloud.private") }, { value: String("public"), label: t("profile.cloud.public") }]}
 /></label>
    {!collection && <label className="space-y-1 text-sm"><span>{t("profile.cloud.presentation")}</span><SimpleSelect
 disabled={disabled}
 value={String(draft.presentationMode)}
 onChange={(value) => onChange({ presentationMode: value === "withGenerationInfo" ? "withGenerationInfo" : "imageOnly" })}
 className="min-w-0" portal
 options={[{ value: String("imageOnly"), label: t("profile.cloud.imageOnly") }, { value: String("withGenerationInfo"), label: t("profile.cloud.withGenerationInfo") }]}
 /></label>}
  </div>;
}
export function CloudDeleteConfirmation({ collection, checked, onChange }: { collection: boolean; checked: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTranslation();
  return <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-1" /><span>{t(collection ? "profile.cloud.deleteCollectionHint" : "profile.cloud.deleteImageHint")}</span></label>;
}
