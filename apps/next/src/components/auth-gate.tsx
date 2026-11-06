"use client";

// 界面：未进入时只挂载登录页，不挂载应用导航或业务页面；有效游客直接继续使用。
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGuestSession } from "@/hooks/use-guest-session";
import { useTranslation } from "@/i18n";
import { LoginPage } from "@/view/auth/login-page";
import { useAccountStore } from "@/stores/useAccountStore";
// 凭据隔离失败时仅显示入口，不能立即尝试恢复残留的正式账户。
// 读取当前 store 错误而不额外持久化，具体失败提示由登录页复用。
// 不借此阻止用户主动提交新的登录；只约束启动自动恢复。
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";

export function AuthGate({ children }: { children: ReactNode }) {
  const { guest, ready: guestReady } = useGuestSession(), accountReady = useAccountStore(state => state.ready), account = useAccountStore(state => state.profile), router = useRouter(), pathname = usePathname();
  const { t } = useTranslation();
  const loginRoute = pathname === "/login" || pathname === "/login/";
  useEffect(() => {
    if (!guestReady || !accountReady) return;
    if (!guest && !account && !loginRoute) router.replace("/login");
    else if ((guest || account) && loginRoute) router.replace("/");
  }, [guestReady, accountReady, guest, account, loginRoute, router]);
  // 先等本地入口恢复，游客凭据清理完成后才能尝试读取正式账户资料。
  // 避免旧版游客同时留有账户令牌时，启动第一帧就向后端发起 /account/me。
  // 无凭据的资料查询由客户端本地返回 401，不依赖账号服务器在线。
  // 只有本地水合成功才自动请求账户资料；失败则以未登录状态完成加载。
  // 否则“清除令牌失败”会紧接着使用残留令牌请求服务器，违反游客切换语义。
  // 用户手动登录仍由登录表单执行，不依赖这个自动恢复 effect。
  // 依赖仅为 ready，后续的表单错误不应反复触发账户资料读取。
  // clearAccountForGuest 已在游客水合内等待完成，因此不会与这里的查询竞跑。
  // 本地 401 只清空正式账户资料，不会撤销已有效的游客记录。
  // guest 与 account 仍分别判断，长期游客并不伪造正式用户的 profile。
  // 生成页面可直接通过 guest 分支挂载，不要求服务器返回账户信息。
  useEffect(() => {
    if (!guestReady) return;
    if (useGuestSessionStore.getState().error) useAccountStore.setState({ ready: true, profile: null });
    else void useAccountStore.getState().hydrate();
  }, [guestReady]);
  if (!guestReady || !accountReady || ((guest || account) && loginRoute)) return <div data-auth-loading className="flex min-h-[calc(100dvh-var(--window-chrome-height))] items-center justify-center bg-background text-sm text-muted-foreground" role="status">{t("common.loading")}</div>;
  if (!guest && !account) return <LoginPage />;
  return children;
}
