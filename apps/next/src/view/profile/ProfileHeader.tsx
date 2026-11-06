"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, RotateCcw, SquarePen } from "lucide-react";
import { useProfileStore } from "@/stores/useProfileStore";
import { useAccountStore } from "@/stores/useAccountStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import { getProfileInitials, readImageFileAsDataUrl } from "@/utils/profile";
import { PROFILE_REFERENCE_ART } from "./profile-reference-data";

interface ProfileHeaderProps { onEdit: () => void; sample: boolean }

// 界面：封面仅作当前页面的外观预览，不新增账户字段或修改原图。
function ProfileCover({ onEdit, children }: { onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const [cover, setCover] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function choose(file?: File) {
    if (!file) return;
    try { setCover(await readImageFileAsDataUrl(file)); }
    catch (error) { useToastStore.getState().show(error instanceof Error ? error.message : t("profile.errors.readFailed"), "error"); }
  }
  const buttonClass = "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/90 px-2.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-background";
  return <header className="pr-banner" data-profile-cover>
    <img src={cover ?? PROFILE_REFERENCE_ART.banner} alt={t("profile.cover.preview")} className="pr-banner-image" /><div className="pr-banner-wash" />{children}
    <div className="pr-cover-actions">
      {cover && <button type="button" onClick={() => setCover(null)} className={buttonClass} aria-label={t("profile.cover.reset")} title={t("profile.cover.reset")}><RotateCcw size={14} /></button>}
      <button type="button" className={buttonClass} title={t("profile.cover.hint")} onClick={() => input.current?.click()}><ImagePlus size={14} /><span>{t("profile.cover.change")}</span></button>
      <button type="button" onClick={onEdit} className={buttonClass}><SquarePen size={14} />{t("profile.ui.edit")}</button>
    </div>
    <input ref={input} type="file" accept="image/*" className="hidden" aria-label={t("profile.cover.change")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void choose(file); }} />
    {cover && <p className="absolute bottom-3 right-3 max-w-[60%] rounded bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">{t("profile.cover.hint")}</p>}
  </header>;
}

/** 界面：昵称下的账户信息；仅展示当前登录者自己的资料。 */
function AccountDetails() {
  const { t } = useTranslation();
  const account = useAccountStore(state => state.profile);
  if (!account) return null;
  return <details data-profile-account-details className="pr-account"><summary>{t("auth.accountId", { id: account.id })}</summary><div className="flex flex-wrap gap-x-3 text-xs">
    <span className="min-w-0 break-all">{account.email}</span>
    <span>{t("auth.accountId", { id: account.id })}</span>
    <span>{t(account.emailVerifiedAt ? "auth.emailVerified" : "auth.emailUnverified")}</span>
  </div></details>;
}

function ProfileStats({ sample }: { sample: boolean }) {
  const { t } = useTranslation();
  const stats = useProfileStore(state => state.stats);
  return <div className="pr-social">
    <span><strong>{sample ? 128 : stats.following}</strong>{t("profile.stats.following")}</span>
    <span><strong>{sample ? 36 : stats.followers}</strong>{t("profile.stats.followers")}</span>
    <span><strong>{sample ? 468 : stats.posts}</strong>{t(sample ? "profile.ui.likesTotal" : "profile.stats.posts")}</span>
  </div>;
}

/**
 * 账户昵称优先于本地游客昵称；样例只回退头像、简介及明确标注的展示数字。
 * 实际模式的第三项仍是 store 提供的帖子数，不能将它改名为并不存在的获赞数。
 * 邮箱放进可展开的账户信息，避免撑高固定尺寸横幅；登录状态和 ID 仍可查看。
 */
export function ProfileHeader({ onEdit, sample }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const localUsername = useProfileStore(state => state.username);
  const accountName = useAccountStore(state => state.profile?.displayName);
  // 登录账户以服务端昵称为准；游客沿用本地资料，不覆盖用户文档。
  const username = accountName ?? localUsername;
  const bio = useProfileStore(state => state.bio);
  const avatar = useProfileStore(state => state.avatarDataUrl);
  return <ProfileCover onEdit={onEdit}>
    {/* 界面：资料横幅内头像、昵称与社交统计；样例数字不写入真实资料。 */}
    <div className="pr-identity"><button type="button" className="pr-avatar" onClick={onEdit} aria-label={t("profile.ui.edit")}>
      {avatar || sample ? <img src={avatar ?? PROFILE_REFERENCE_ART.avatar} alt={username} /> : getProfileInitials(username)}
    </button><div className="pr-identity-copy"><div className="pr-name"><h1 title={username}>{username}</h1>{sample && <span>{t("profile.ui.level")}</span>}</div>
      <p className="pr-bio">{bio || (sample ? t("profile.ui.defaultBio") : "")}</p><AccountDetails /><ProfileStats sample={sample} />
    </div></div>
    <blockquote>{t("profile.ui.quoteFirst")}<br />{t("profile.ui.quoteLast")}</blockquote>
  </ProfileCover>;
}
