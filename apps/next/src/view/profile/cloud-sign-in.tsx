"use client";

import { useAccountStore } from "@/stores/useAccountStore";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { useTranslation } from "@/i18n";

/** 界面：退出失效会话或游客入口，交给已有 AuthGate 转回登录页。 */
export function CloudSignIn() {
  const { t } = useTranslation();
  const busy = useAccountStore(state => state.loading);
  function signIn() {
    useGuestSessionStore.getState().leaveGuest();
    if (useAccountStore.getState().profile) void useAccountStore.getState().logout().catch(() => undefined);
  }
  return <button type="button" disabled={busy} onClick={signIn} className="inline-block underline disabled:opacity-50">{t("profile.cloud.goLogin")}</button>;
}
