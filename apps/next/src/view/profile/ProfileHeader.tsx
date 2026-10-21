"use client";

import { useRef, useState } from "react";
import { ImagePlus, RotateCcw, SquarePen } from "lucide-react";
import { useProfileStore } from "@/stores/useProfileStore";
import { useAccountStore } from "@/stores/useAccountStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { getProfileInitials, readImageFileAsDataUrl } from "@/utils/profile";

interface ProfileHeaderProps { onEdit: () => void }

// 界面：封面仅作当前页面的外观预览，不新增账户字段或修改原图。
function ProfileCover({ onEdit }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const [cover, setCover] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function choose(file?: File) {
    if (!file) return;
    try { setCover(await readImageFileAsDataUrl(file)); }
    catch (error) { useToastStore.getState().show(error instanceof Error ? error.message : t("profile.errors.readFailed"), "error"); }
  }
  const buttonClass = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/90 px-2.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-background";
  return <div className="relative h-[108px] overflow-hidden bg-muted sm:h-[132px] lg:h-36" data-profile-cover>
    {cover ? <img src={cover} alt={t("profile.cover.preview")} className="h-full w-full object-cover" /> : <div aria-hidden="true" className="absolute inset-0 bg-linear-to-br from-sky-500/15 via-transparent to-teal-500/10"><div className="absolute -right-12 -top-20 h-80 w-80 rounded-full border border-foreground/5" /><div className="absolute -right-24 -top-32 h-[440px] w-[440px] rounded-full border border-foreground/5" /></div>}
    <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2 sm:right-5 sm:top-4">
      {cover && <button type="button" onClick={() => setCover(null)} className={buttonClass} aria-label={t("profile.cover.reset")} title={t("profile.cover.reset")}><RotateCcw size={14} /></button>}
      <button type="button" className={buttonClass} title={t("profile.cover.hint")} onClick={() => input.current?.click()}><ImagePlus size={14} />{t("profile.cover.change")}</button>
      <button type="button" onClick={onEdit} className={buttonClass}><SquarePen size={14} />{t("profile.edit.title")}</button>
    </div>
    <input ref={input} type="file" accept="image/*" className="hidden" aria-label={t("profile.cover.change")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
    {cover && <p className="absolute bottom-3 right-3 max-w-[60%] rounded bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">{t("profile.cover.hint")}</p>}
  </div>;
}

/** 界面：昵称下的账户信息；仅展示当前登录者自己的资料。 */
function AccountDetails() {
  const { t } = useTranslation();
  const account = useAccountStore(state => state.profile);
  if (!account) return null;
  return <div data-profile-account-details className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
    <span className="min-w-0 break-all">{account.email}</span>
    <span>{t("auth.accountId", { id: account.id })}</span>
    <span>{t(account.emailVerifiedAt ? "auth.emailVerified" : "auth.emailUnverified")}</span>
  </div>;
}

function ProfileStats() {
  const { t } = useTranslation();
  const stats = useProfileStore(state => state.stats);
  return <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {(["posts", "followers", "following"] as const).map(key => <span key={key}><strong className="mr-1 font-semibold tabular-nums text-foreground">{stats[key]}</strong>{t(`profile.stats.${key}`)}</span>)}
  </div>;
}

export function ProfileHeader({ onEdit }: ProfileHeaderProps) {
  const localUsername = useProfileStore(state => state.username);
  const accountName = useAccountStore(state => state.profile?.displayName);
  // 登录账户以服务端昵称为准；游客沿用本地资料，不覆盖用户文档。
  const username = accountName ?? localUsername;
  const bio = useProfileStore(state => state.bio);
  const avatar = useProfileStore(state => state.avatarDataUrl);
  return <header>
    <ProfileCover onEdit={onEdit} />
    {/* 界面：头像叠放在封面下缘，身份信息使用一套响应式布局。 */}
    <div className="profile-content relative flex items-start gap-3 pb-4 sm:gap-5">
      <span className="relative -mt-7 flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted text-xl font-semibold shadow-sm sm:-mt-8 sm:h-[88px] sm:w-[88px]">
        {avatar ? <img src={avatar} alt={username} className="h-full w-full object-cover" /> : getProfileInitials(username)}
      </span>
      <div className="min-w-0 flex-1 pt-3">
        <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{username}</h1>
        <AccountDetails />
        <ProfileStats />
        {bio && <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{bio}</p>}
      </div>
    </div>
  </header>;
}
