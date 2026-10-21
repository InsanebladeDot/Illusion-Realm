"use client";

// 界面：账号登录 / 注册表单共用输入控件；提交由父组件连接账户 API。
import { useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "@/i18n";

export type AccountMode = "login" | "register";
const INPUT = "h-12 w-full rounded-xl border border-border bg-muted/60 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15";
function PasswordField({ confirm = false, register = false }: { confirm?: boolean; register?: boolean }) {
  const { t } = useTranslation(), [visible, setVisible] = useState(false);
  return <label className="block space-y-1.5 text-left text-xs font-medium text-foreground">
    <span>{t(confirm ? "auth.confirmPassword" : "auth.password")}</span>
    <span className="relative block"><input name={confirm ? "confirmPassword" : "password"} required minLength={register ? 12 : 1} type={visible ? "text" : "password"}
      autoComplete={register ? "new-password" : "current-password"} placeholder={t(confirm ? "auth.confirmPlaceholder" : "auth.passwordPlaceholder")} className={`${INPUT} pr-12`} />
      <button type="button" aria-label={t(visible ? "auth.hidePassword" : "auth.showPassword")} onClick={() => setVisible(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-muted">
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
    {register && !confirm && <span className="block font-normal text-muted-foreground">{t("auth.passwordHint")}</span>}
  </label>;
}
interface AccountValues { email: string; password: string; displayName?: string; confirmPassword?: string }
interface AccountFormProps { mode: AccountMode; initialEmail?: string; onModeChange: (mode: AccountMode) => void; onBack: () => void; onSubmit: (values: AccountValues) => Promise<string> }
export function AccountForm({ mode, initialEmail = "", onModeChange, onBack, onSubmit }: AccountFormProps) {
  const { t } = useTranslation(), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const register = mode === "register";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (register && data.get("password") !== data.get("confirmPassword")) { setMessage(t("auth.mismatch")); return; }
    setBusy(true); setMessage("");
    try { setMessage(await onSubmit({ email: String(data.get("email") || "").trim().toLowerCase(), password: String(data.get("password") || ""), displayName: register ? String(data.get("displayName") || "").trim() : undefined, confirmPassword: register ? String(data.get("confirmPassword") || "") : undefined })); }
    catch (error) { setMessage(error instanceof Error && error.message ? error.message : t("auth.accountPending")); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <div className="flex items-center gap-2 text-left"><button type="button" data-auth-back aria-label={t("auth.back")} onClick={onBack} className="-ml-2 rounded-full p-2 text-muted-foreground hover:bg-muted"><ArrowLeft size={18} /></button>
      <h2 className="text-sm font-semibold">{t(register ? "auth.signUpTitle" : "auth.loginTitle")}</h2>
    </div>
    <form data-auth-form={mode} onSubmit={(event) => { void submit(event); }} className="space-y-4">
      <label className="block space-y-1.5 text-left text-xs font-medium"><span>{t("auth.email")}</span><input name="email" defaultValue={initialEmail} required type="email" autoComplete="email" placeholder={t("auth.emailPlaceholder")} className={INPUT} /></label>
      {register && <label className="block space-y-1.5 text-left text-xs font-medium"><span>{t("auth.displayName")}</span><input name="displayName" required maxLength={100} type="text" autoComplete="nickname" placeholder={t("auth.displayNamePlaceholder")} className={INPUT} /></label>}
      <PasswordField register={register} />
      {register && <PasswordField confirm register />}
      {!register && <div className="space-y-2 text-left">
        {/* 界面：「忘记密码」说明；后端未提供找回接口，不能伪装成已发送重置邮件。 */}
        <button type="button" data-auth-forgot aria-expanded={showRecovery} aria-controls="auth-recovery-help" onClick={() => setShowRecovery(value => !value)} className="block text-xs text-sky-600 hover:underline dark:text-sky-400">{t("auth.forgot")}</button>
        {showRecovery && <p id="auth-recovery-help" role="status" className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{t("auth.recoveryUnavailable")}</p>}
      </div>}
      <button type="submit" disabled={busy} className="h-11 w-full rounded-full bg-sky-500 text-sm font-semibold text-white transition-colors hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:opacity-50">{t(busy ? "auth.entering" : register ? "auth.createAccount" : "auth.login")}</button>
    </form>
    <p data-auth-form-message role="status" className="text-xs leading-relaxed text-muted-foreground">{message || t("auth.formHint")}</p>
    <p className="text-xs text-muted-foreground">{t(register ? "auth.haveAccount" : "auth.needAccount")} <button type="button" onClick={() => onModeChange(register ? "login" : "register")} className="font-medium text-sky-600 hover:underline dark:text-sky-400">{t(register ? "auth.login" : "auth.createAccount")}</button></p>
  </div>;
}
