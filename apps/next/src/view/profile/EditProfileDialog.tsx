"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_SOCIAL_PLATFORM_LABELS,
} from "@/data/profile";
import { useProfileStore } from "@/stores/useProfileStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import type { ProfileSocialLink, ProfileSocialPlatform } from "@/types/profile";
import {
  createSocialLinkId,
  getProfileInitials,
  readImageFileAsDataUrl,
} from "@/utils/profile";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type EditProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SOCIAL_PLATFORMS = Object.keys(
  PROFILE_SOCIAL_PLATFORM_LABELS
) as ProfileSocialPlatform[];

export function EditProfileDialog({
  open,
  onOpenChange,
}: EditProfileDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const profile = useProfileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState(profile.bio);
  const [avatarDataUrl, setAvatarDataUrl] = useState(profile.avatarDataUrl);
  const [socialLinks, setSocialLinks] = useState<ProfileSocialLink[]>(
    profile.socialLinks
  );

  /**
   * 渲染期同步：**每次**打开都从 store 回填表单（store 在别处被更新时也会跟随）。
   * 用「记录前值 + 渲染期比较」替代 effect 内 setState，语义等价且少一次级联渲染。
   *
   * 注意：key 里带了 open，因此必须在**两个方向**上都记录前值
   * ——若加上 `open &&` 前置条件，关闭时前值不会更新，再次打开时会跳过回填，
   * 残留上次未保存的草稿。
   */
  const [previousFillKey, setPreviousFillKey] = useState<string | null>(null);
  const fillKey = `${open}|${profile.bio}|${profile.avatarDataUrl ?? ""}|${profile.socialLinks.length}`;
  if (fillKey !== previousFillKey) {
    setPreviousFillKey(fillKey);
    if (open) {
      setBio(profile.bio);
      setAvatarDataUrl(profile.avatarDataUrl);
      setSocialLinks(profile.socialLinks);
    }
  }

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  const handlePickAvatar = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setAvatarDataUrl(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("profile.edit.uploadFailed");
      showToast(message);
    }
  }, [showToast, t]);

  const handleAddSocial = useCallback(() => {
    setSocialLinks((prev) => [
      ...prev,
      {
        id: createSocialLinkId(),
        platform: "website",
        url: "",
      },
    ]);
  }, []);

  const handleSave = useCallback(() => {
    profile.updateProfile({
      bio: bio.trim(),
      avatarDataUrl,
      socialLinks: socialLinks.filter((item) => item.url.trim()),
    });
    showToast(t("profile.edit.saved"));
    onOpenChange(false);
  }, [avatarDataUrl, bio, onOpenChange, profile, showToast, socialLinks, t]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[89] bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[90] flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden border bg-background p-6 shadow-lg outline-none sm:max-w-[625px] sm:rounded-xl",
          INPUT_BORDER_CLASS
        )}
      >
        <div className="shrink-0 space-y-1.5">
          <h2 id="edit-profile-title" className="text-lg font-semibold">
            {t("profile.edit.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("profile.edit.description")}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain py-1">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("profile.edit.avatarLabel")}</label>
            <div className="flex items-center gap-4">
              <span className="relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-background bg-muted shadow">
                {avatarDataUrl ? (
                  <img
                    src={avatarDataUrl}
                    alt={t("profile.edit.avatarPreviewAlt")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-medium">
                    {getProfileInitials(profile.username)}
                  </span>
                )}
              </span>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handlePickAvatar(file);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted",
                    INPUT_BORDER_CLASS
                  )}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t("profile.edit.uploadAvatar")}
                </button>
                <p className="text-xs text-muted-foreground">
                  {t("profile.edit.avatarHint")}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-bio" className="text-sm font-medium">
              {t("profile.edit.bioLabel")}
            </label>
            <textarea
              id="profile-bio"
              rows={4}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder={t("profile.edit.bioPlaceholder")}
              className={cn(
                "flex min-h-[96px] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                INPUT_BORDER_CLASS
              )}
            />
            <p className="text-right text-xs text-muted-foreground">
              {bio.length}/{PROFILE_BIO_MAX_LENGTH}
              {t("profile.edit.bioCounterUnit")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("profile.edit.socialLabel")}</label>
            <div className="space-y-3">
              {socialLinks.map((link) => (
                <div key={link.id} className="flex gap-2">
                  <select
                    value={link.platform}
                    onChange={(event) =>
                      setSocialLinks((prev) =>
                        prev.map((item) =>
                          item.id === link.id
                            ? {
                                ...item,
                                platform: event.target
                                  .value as ProfileSocialPlatform,
                              }
                            : item
                        )
                      )
                    }
                    className={cn(
                      "h-9 rounded-md border bg-background px-2 text-sm",
                      INPUT_BORDER_CLASS
                    )}
                  >
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <option key={platform} value={platform}>
                        {PROFILE_SOCIAL_PLATFORM_LABELS[platform]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="url"
                    value={link.url}
                    placeholder="https://"
                    onChange={(event) =>
                      setSocialLinks((prev) =>
                        prev.map((item) =>
                          item.id === link.id
                            ? { ...item, url: event.target.value }
                            : item
                        )
                      )
                    }
                    className={cn(
                      "h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm",
                      INPUT_BORDER_CLASS
                    )}
                  />
                  <button
                    type="button"
                    aria-label={t("common.delete")}
                    onClick={() =>
                      setSocialLinks((prev) =>
                        prev.filter((item) => item.id !== link.id)
                      )
                    }
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddSocial}
                className={cn(
                  "inline-flex h-8 w-full items-center justify-center rounded-md border px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted",
                  INPUT_BORDER_CLASS
                )}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("profile.edit.addSocial")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium shadow-sm hover:bg-muted",
              INPUT_BORDER_CLASS
            )}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent-fill px-4 text-sm font-medium text-accent-fill-foreground hover:bg-accent-fill/90"
          >
            {t("profile.edit.save")}
          </button>
        </div>

        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
