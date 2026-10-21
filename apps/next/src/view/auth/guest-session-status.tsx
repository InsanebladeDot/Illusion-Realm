"use client";

// 界面：「我的主页」当前账户 / 游客身份及主动退出入口。
import { LogOut } from "lucide-react";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { useTranslation } from "@/i18n";
import { useAccountStore } from "@/stores/useAccountStore";
import { useToastStore } from "@/stores/useToastStore";

export function GuestSessionStatus() {
  const { t } = useTranslation();
  const profile = useAccountStore(state => state.profile);
  const loading = useAccountStore(state => state.loading);
  const logout = async () => {
    try { if (profile) await useAccountStore.getState().logout(); else useGuestSessionStore.getState().leaveGuest(); }
    catch { useToastStore.getState().show(t("auth.authUnavailable"), "error"); }
  };
  return <div className="profile-content flex flex-wrap items-center justify-between gap-2 pb-3 text-xs">
    <span className="text-muted-foreground">{profile ? t("auth.accountStatus", { name: profile.displayName }) : t("auth.guestStatus")}</span>
    <button type="button" data-auth-logout disabled={loading} onClick={() => { void logout(); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><LogOut size={13} />{t(profile ? "auth.logoutAccount" : "auth.logout")}</button>
  </div>;
}
