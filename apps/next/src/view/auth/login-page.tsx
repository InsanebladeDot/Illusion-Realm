"use client";

// 界面：全屏插画 + 居中登录卡片；账户连接后端 API，OAuth 保留入口。
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogIn } from "lucide-react";
import { useTranslation, type MessageKey } from "@/i18n";
import { APP_NAME } from "@/data/navigation";
import { AUTH_PROVIDERS } from "@/data/auth-providers";
import { useGuestSessionStore } from "@/stores/useGuestSessionStore";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToastStore } from "@/stores/useToastStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/utils/cn";
import { AccountForm, type AccountMode } from "./account-form";
import { AccountApiError, resendVerification, verifyEmail } from "@/api/account";
import { useAccountStore } from "@/stores/useAccountStore";

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
    <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z" />
  </svg>;
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d={id === "apple"
    ? "M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.37-.02.08-.45 1.56-1.49 3.08-.9 1.31-1.83 2.62-3.3 2.65-1.44.03-1.91-.85-3.56-.85-1.64 0-2.16.82-3.52.88-1.42.05-2.5-1.42-3.4-2.72C2.82 17.28 1.4 12.4 3.3 9.1a5.3 5.3 0 0 1 4.48-2.72c1.4-.03 2.72.94 3.57.94.85 0 2.45-1.16 4.12-.99.7.03 2.68.28 3.95 2.13-.1.06-2.36 1.38-2.34 4.08ZM14.34 4.56c.75-.9 1.25-2.15 1.11-3.4-1.08.05-2.39.72-3.16 1.62-.69.79-1.3 2.06-1.14 3.28 1.21.09 2.44-.62 3.19-1.5Z"
    : "M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.3c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6A4.7 4.7 0 0 1 5.5 8c-.1-.3-.5-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 3 .1 3.3a4.7 4.7 0 0 1 1.2 3.3c0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.7c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"} /></svg>;
}

function SocialLogin() {
  const { t } = useTranslation();
  return <div className="space-y-3"><p className="text-xs text-muted-foreground">{t("auth.social")}</p><div className="flex justify-center gap-3">
    {AUTH_PROVIDERS.map(provider => <button key={provider.id} type="button" data-auth-provider={provider.id} aria-label={t("auth.provider", { name: provider.name })} title={t("auth.provider", { name: provider.name })}
      onClick={() => useToastStore.getState().show(t("auth.socialPending", { name: provider.name }))} className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/80 text-foreground transition hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        <ProviderIcon id={provider.id} />
      </button>)}
  </div></div>;
}
function GuestEntry() {
  const { t } = useTranslation(), [busy, setBusy] = useState(false);
  const router = useRouter();
  const error = useGuestSessionStore(state => state.error);
  const enter = async () => {
    if (busy) return;
    setBusy(true);
    try { await useGuestSessionStore.getState().enterGuest(); router.replace("/"); }
    catch { setBusy(false); }
  };
  return <div className="space-y-2">
    <button type="button" data-auth-guest disabled={busy} onClick={() => { void enter(); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-sky-600 transition hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:text-sky-400"><LogIn size={15} />{t(busy ? "auth.entering" : "auth.guest")}</button>
    <p className="text-[11px] leading-relaxed text-muted-foreground">{t("auth.guestHint")}</p>
    {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
  </div>;
}
function accountErrorMessage(error: unknown, t: (key: MessageKey) => string): string {
  const code = error instanceof AccountApiError ? error.code : error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "NETWORK_ERROR") return t("auth.authNetworkError");
  if (code === "INVALID_ARGUMENT") return t("auth.authInvalid");
  if (code === "UNAUTHENTICATED") return t("auth.authUnauthorized");
  if (code === "RATE_LIMITED") return t("auth.authRateLimited");
  return t("auth.authUnavailable");
}
function EmailVerificationForm({ email, onBack, onVerified }: { email: string; onBack: () => void; onVerified: () => void }) {
  const { t } = useTranslation();
  const [token, setToken] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  // 激活后留两秒阅读提示；离开页面时清理计时器，避免延迟切换覆盖用户操作。
  useEffect(() => {
    if (!verified) return;
    const timer = setTimeout(onVerified, 2000);
    return () => clearTimeout(timer);
  }, [verified, onVerified]);
  const run = async (resend = false) => {
    if (busy || verified) return;
    setBusy(true); setMessage("");
    try { if (resend) { await resendVerification(email); setMessage(t("auth.verificationSent")); } else { await verifyEmail(token.trim()); setVerified(true); setMessage(t("auth.verifyRedirect")); } }
    catch (error) { setMessage(accountErrorMessage(error, t)); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 text-left">
    <div className="flex items-center gap-2"><button type="button" data-auth-back aria-label={t("auth.back")} onClick={onBack} className="-ml-2 rounded-full p-2 text-muted-foreground hover:bg-muted"><ArrowLeft size={18} /></button><h2 className="text-sm font-semibold">{t("auth.verifyTitle")}</h2></div>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("auth.verificationSent")} {email}</p>
    <label className="block space-y-1.5 text-xs font-medium"><span>{t("auth.verifyToken")}</span><input data-auth-verification-token disabled={busy || verified} value={token} onChange={event => setToken(event.target.value)} placeholder={t("auth.verifyTokenPlaceholder")} maxLength={64} className="h-12 w-full rounded-xl border border-border bg-muted/60 px-4 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 disabled:opacity-50" /></label>
    <button type="button" disabled={busy || verified || !token.trim()} onClick={() => { void run(); }} className="h-11 w-full rounded-full bg-sky-500 text-sm font-semibold text-white disabled:opacity-50">{t(busy ? "auth.entering" : "auth.verify")}</button>
    {verified ? <button type="button" onClick={onVerified} className="w-full text-xs text-sky-600 hover:underline dark:text-sky-400">{t("auth.returnToLogin")}</button>
      : <button type="button" disabled={busy} onClick={() => { void run(true); }} className="w-full text-xs text-sky-600 hover:underline dark:text-sky-400">{t("auth.resend")}</button>}
    {message && <p data-auth-form-message role="status" className="text-xs leading-relaxed text-muted-foreground">{message}</p>}
  </div>;
}
function LoginContent() {
  const { t } = useTranslation(), [mode, setMode] = useState<AccountMode | "landing" | "verify">("landing"), [verificationEmail, setVerificationEmail] = useState(""), router = useRouter();
  const register = useAccountStore(state => state.register), login = useAccountStore(state => state.login);
  const returnToLogin = useCallback(() => setMode("login"), []);
  const submit = async (values: { email: string; password: string; displayName?: string }) => {
    try {
      if (mode === "register") { await register({ email: values.email, password: values.password, displayName: values.displayName || values.email.split("@")[0] }); setVerificationEmail(values.email); setMode("verify"); return t("auth.registerSuccess"); }
      await login({ email: values.email, password: values.password, deviceName: "Illusion Realm Desktop" }); router.replace("/"); return t("auth.loginSuccess");
    } catch (error) { throw new Error(accountErrorMessage(error, t)); }
  };
  if (mode === "verify") return <EmailVerificationForm email={verificationEmail} onBack={returnToLogin} onVerified={returnToLogin} />;
  return mode === "landing" ? <div className="space-y-6">
        <h2 className="text-sm font-semibold text-foreground">{t("auth.welcome")}</h2>
        <div className="space-y-2.5">
          <button type="button" data-auth-register onClick={() => setMode("register")} className="h-11 w-full rounded-full bg-sky-500 text-sm font-semibold text-white transition-colors hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">{t("auth.createAccount")}</button>
          <button type="button" data-auth-login onClick={() => setMode("login")} className="h-11 w-full rounded-full bg-muted text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">{t("auth.login")}</button>
        </div>
        {/* 界面：第三方登录预留入口，本次不启动授权、不发送账号信息。 */}
        <SocialLogin />
        <div className="border-t border-border/70 pt-4"><GuestEntry /></div>
      </div> : <>
        {/* 界面：注册 / 登录复用同一个表单，切换时清空密码。 */}
        <AccountForm key={mode} mode={mode} initialEmail={verificationEmail} onModeChange={setMode} onBack={() => setMode("landing")} onSubmit={submit} />
        <div className="mt-5 space-y-5 border-t border-border/70 pt-5"><SocialLogin /><GuestEntry /></div>
      </>;
}

function AuthBrand() {
  const { t } = useTranslation();
  return <header data-auth-brand className="mb-7 space-y-1.5 text-center [@media(max-height:720px)]:mb-5">
    <h1 className="break-words text-[30px] font-bold leading-tight tracking-[-1.2px] text-sky-500 sm:text-[34px]">{APP_NAME}</h1>
    <p className="text-xs font-medium text-sky-600 dark:text-sky-400">{t("auth.brandSub")}</p>
  </header>;
}

function LoginCard({ split }: { split: boolean }) {
  const { t } = useTranslation();
  return <div data-auth-card className={cn("flex min-h-0 w-full flex-col overflow-hidden bg-background/95 text-center shadow-[0_16px_64px_rgba(15,23,42,0.16)] backdrop-blur-md",
    split ? "h-full rounded-l-[24px]" : "max-h-full max-w-[420px] rounded-[24px] border border-white/30")}>
      {/* 界面：品牌与表单共同滚动，矮窗口保持页脚与全局标题栏固定。 */}
      <div data-auth-scroll className={cn("flex min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-5 pt-8 [scrollbar-width:thin] sm:px-8", split && "flex-1 px-9 pt-16 sm:px-9")}>
        <div className={cn("mx-auto w-full max-w-[360px] shrink-0", split && "my-auto")}>
          <AuthBrand />
          {/* 界面：账号操作、第三方入口和游客入口。 */}
          <LoginContent />
        </div>
      </div>
      <div data-auth-card-footer className="shrink-0 px-6 pb-4 pt-3 sm:px-8">
        <p className="border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">{t("auth.privacy")}</p>
        <p className="mt-2 text-[11px] tracking-wide text-muted-foreground">{t("auth.footer")}</p>
      </div>
    </div>;
}

export function LoginPage() {
  // 宽屏或宽矮窗口采用有限右栏；只换容器样式，不卸载表单或丢失输入。
  const split = useMediaQuery("(min-width: 1536px), (min-width: 1120px) and (max-height: 640px)");
  return <section data-login-page data-login-layout={split ? "split" : "centered"} className={cn(
    "relative isolate grid h-[calc(100dvh-var(--window-chrome-height))] min-h-0 w-full overflow-hidden bg-[#bdd6e4]",
    split && "grid-cols-[minmax(0,1fr)_clamp(420px,28vw,480px)]",
  )}>
    {/* 界面：插画使用剩余宽度，并延伸到面板左圆角背后。 */}
    <div data-auth-background aria-hidden className={cn("bg-[#bdd6e4] bg-cover bg-[position:center_42%]", split ? "relative col-start-1 row-start-1 -mr-6 min-h-0 min-w-0" : "absolute inset-0")} style={{ backgroundImage: "url('/images/login-background.webp')" }}>
      <div className="absolute inset-0 bg-slate-950/25 dark:bg-slate-950/45" />
    </div>
    {/* 界面：主题按钮固定；登录面板的品牌区为它预留空间。 */}
    <div className="absolute right-4 top-4 z-20"><ThemeToggle /></div>
    <div data-auth-pane className={cn("relative row-start-1 min-h-0 min-w-0", split ? "col-start-2" : "col-start-1")}>
      <div data-auth-content className={cn("flex h-full min-h-0 flex-col items-center justify-center", !split && "px-4 pb-4 pt-14 sm:px-6 sm:pb-6 sm:pt-16")}>
        {/* 只有中间内容可收缩并滚动；外层卡片和页脚始终留在可视区域。 */}
        <div data-auth-stack className={cn("flex max-h-full min-h-0 w-full flex-col items-center", split && "h-full")}>
          <LoginCard split={split} />
        </div>
      </div>
    </div>
  </section>;
}
