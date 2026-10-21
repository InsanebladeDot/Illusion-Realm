"use client";

// 界面：未进入时只挂载登录页，不挂载应用导航或业务页面；有效游客直接继续使用。
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/use-guest-session";
import { useTranslation } from "@/i18n";
import { LoginPage } from "@/view/auth/login-page";
import { useAccountStore } from "@/stores/useAccountStore";

export function AuthGate({ children }: { children: ReactNode }) {
  const { guest, ready: guestReady } = useGuestSession(), accountReady = useAccountStore(state => state.ready), account = useAccountStore(state => state.profile), router = useRouter(), pathname = usePathname();
  const { t } = useTranslation();
  const loginRoute = pathname === "/login" || pathname === "/login/";
  useEffect(() => {
    if (!guestReady || !accountReady) return;
    if (!guest && !account && !loginRoute) router.replace("/login");
    else if ((guest || account) && loginRoute) router.replace("/");
  }, [guestReady, accountReady, guest, account, loginRoute, router]);
  useEffect(() => { void useAccountStore.getState().hydrate(); }, []);
  if (!guestReady || !accountReady || ((guest || account) && loginRoute)) return <div data-auth-loading className="flex min-h-[calc(100dvh-var(--window-chrome-height))] items-center justify-center bg-background text-sm text-muted-foreground" role="status">{t("common.loading")}</div>;
  if (!guest && !account) return <LoginPage />;
  return children;
}
