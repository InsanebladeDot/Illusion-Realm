"use client";

import { useTranslation } from "@/i18n";
import { cloudErrorKey, CLOUD_BUTTON_CLASS } from "@/utils/cloud-image-ui";
import { AccountApiError } from "@/api/account";
import { CloudSignIn } from "./cloud-sign-in";

export function CloudScope({ scope, ownerId, onChange }: { scope: "mine" | "public"; ownerId: string | null; onChange: (scope: "mine" | "public") => void }) {
  const { t } = useTranslation();
  return <div className="inline-flex gap-1 rounded-lg bg-muted p-1" aria-label={t("profile.cloud.resourceScope")}>
    {(["mine", "public"] as const).map(value => <button key={value} type="button" data-cloud-scope={value} disabled={value === "mine" && !ownerId} aria-pressed={scope === value} className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-40 ${scope === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => onChange(value)}>{t(value === "mine" ? "profile.cloud.mine" : "profile.cloud.publicLibrary")}</button>)}
  </div>;
}
export function CloudError({ error, cooldown = 0 }: { error: unknown; cooldown?: number }) {
  const { t } = useTranslation();
  return <div aria-live="polite" className="space-y-1 text-sm">
    {Boolean(error) && <p role="alert" className="text-destructive">{t(cloudErrorKey(error))}</p>}
    {error instanceof AccountApiError && error.status === 401 && <CloudSignIn />}
    {cooldown > 0 && <p>{t("profile.cloud.cooldown", { seconds: cooldown })}</p>}
  </div>;
}
export function CloudPageFooter({ busy, hasMore, error, onMore, onReload }: { busy: boolean; hasMore: boolean; error: unknown; onMore: () => void; onReload: () => void }) {
  const { t } = useTranslation();
  return <div className="flex flex-wrap gap-2">
    {(hasMore || Boolean(error)) && <button type="button" className={CLOUD_BUTTON_CLASS} disabled={busy} onClick={hasMore ? onMore : onReload}>{t(busy ? "profile.cloud.loading" : error ? "profile.cloud.refresh" : "profile.cloud.loadMore")}</button>}
    {!error && <button type="button" className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onReload}>{t(busy ? "profile.cloud.loading" : "profile.cloud.refresh")}</button>}
  </div>;
}
