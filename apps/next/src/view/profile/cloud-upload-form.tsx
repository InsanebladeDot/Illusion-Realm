"use client";

import { AccountApiError } from "@/api/account";
import { useTranslation } from "@/i18n";
import { CLOUD_BUTTON_CLASS, CLOUD_INPUT_CLASS, cloudErrorKey } from "@/utils/cloud-image-ui";
import type { CloudUploadState } from "./use-cloud-upload";
import { CloudSignIn } from "./cloud-sign-in";

export function CloudUploadForm({ state }: { state: CloudUploadState }) {
  const { t } = useTranslation();
  return <form data-cloud-upload onSubmit={event => { event.preventDefault(); void state.submit(); }} className="space-y-4 rounded-lg border border-border bg-background p-4 sm:p-5">
    <fieldset disabled={state.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="min-w-0 space-y-1.5 text-sm sm:col-span-2"><span>{t("profile.cloud.file")}</span>
        <input type="file" accept=".png,image/png" required={!state.draft.file} className={CLOUD_INPUT_CLASS} onChange={event => { const file = event.target.files?.[0] ?? null; state.change({ file, title: file?.name.replace(/\.png$/i, "").slice(0, 100) || "" }); }} />
        {state.draft.file && <span className="block break-all text-xs text-foreground">{state.draft.file.name}</span>}
        <span className="block text-xs text-muted-foreground">{t("profile.cloud.fileHint")}</span>
      </label>
      <label className="space-y-1.5 text-sm sm:col-span-2"><span>{t("profile.cloud.title")}</span><input required maxLength={100} value={state.draft.title} onChange={event => state.change({ title: event.target.value })} className={CLOUD_INPUT_CLASS} /></label>
      {/* 界面：访问权限和展示方式是独立设置；不把仅展示描述为去除原图元数据 */}
      <label className="space-y-1.5 text-sm"><span>{t("profile.cloud.visibility")}</span><select value={state.draft.visibility} onChange={event => state.change({ visibility: event.target.value === "public" ? "public" : "private" })} className={CLOUD_INPUT_CLASS}>
        <option value="private">{t("profile.cloud.private")}</option><option value="public">{t("profile.cloud.public")}</option>
      </select></label>
      <label className="space-y-1.5 text-sm"><span>{t("profile.cloud.presentation")}</span><select value={state.draft.presentationMode} onChange={event => state.change({ presentationMode: event.target.value === "withGenerationInfo" ? "withGenerationInfo" : "imageOnly" })} className={CLOUD_INPUT_CLASS}>
        <option value="imageOnly">{t("profile.cloud.imageOnly")}</option><option value="withGenerationInfo">{t("profile.cloud.withGenerationInfo")}</option>
      </select></label>
    </fieldset>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("profile.cloud.privacy")}</p>
    <UploadStatus state={state} />
    <button type="submit" disabled={state.busy || state.cooldown > 0 || state.success || !state.draft.file || !state.draft.title.trim()} className={CLOUD_BUTTON_CLASS}>{t(state.busy ? "profile.cloud.uploading" : state.error ? "profile.cloud.retry" : "profile.cloud.upload")}</button>
  </form>;
}
function UploadStatus({ state }: { state: CloudUploadState }) {
  const { t } = useTranslation();
  return <div aria-live="polite" className="space-y-1 text-sm">
    {state.success && <p>{t("profile.cloud.success")}</p>}
    {Boolean(state.error) && <p role="alert" className="text-destructive">{t(cloudErrorKey(state.error))}</p>}
    {state.error instanceof AccountApiError && state.error.status === 401 && <CloudSignIn />}
    {state.error instanceof AccountApiError && state.error.requestId && <p className="break-all text-xs text-muted-foreground">{t("profile.cloud.requestId", { id: state.error.requestId })}</p>}
    {state.cooldown > 0 && <p>{t("profile.cloud.cooldown", { seconds: state.cooldown })}</p>}
  </div>;
}
