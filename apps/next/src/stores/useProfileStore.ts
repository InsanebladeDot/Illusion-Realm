"use client";

/**
 * 「我的主页」的资料（用户名 / 签名 / 头像 / 社交链接）。
 *
 * 怎么用：读 `useProfileStore((s) => s.username)`；写 `updateProfile({ bio: "..." })` 或单个 setter。
 * 传什么 / 拿到什么：`updateProfile(patch)` 接受 `username / bio / avatarDataUrl / socialLinks`
 * 的任意子集；`setUsername` 会把**空串回落到默认名**（不允许把用户名清空）；
 * `stats`（作品数等展示用统计）随文档一起读。
 * 持久化：用户数据文档 `profile` 段（头像是 data URL，注意体积）。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PROFILE } from "@/data/profile";
import type { ProfileSocialLink, UserProfile } from "@/types/profile";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type ProfileState = UserProfile & {
  setUsername: (username: string) => void;
  setBio: (bio: string) => void;
  setAvatarDataUrl: (avatarDataUrl: string | null) => void;
  setSocialLinks: (socialLinks: ProfileSocialLink[]) => void;
  updateProfile: (
    patch: Partial<
      Pick<UserProfile, "username" | "bio" | "avatarDataUrl" | "socialLinks">
    >
  ) => void;
};

export const useProfileStore = create<ProfileState>()(
  persist<ProfileState, [], [], UserProfile>(
    (set) => ({
      ...DEFAULT_PROFILE,
      setUsername: (username) =>
        set({ username: username.trim() || DEFAULT_PROFILE.username }),
      setBio: (bio) => set({ bio }),
      setAvatarDataUrl: (avatarDataUrl) => set({ avatarDataUrl }),
      setSocialLinks: (socialLinks) => set({ socialLinks }),
      updateProfile: (patch) =>
        set((state) => ({
          username:
            patch.username != null
              ? patch.username.trim() || state.username
              : state.username,
          bio: patch.bio ?? state.bio,
          avatarDataUrl:
            patch.avatarDataUrl !== undefined
              ? patch.avatarDataUrl
              : state.avatarDataUrl,
          socialLinks: patch.socialLinks ?? state.socialLinks,
        })),
    }),
    {
      name: "illusion-realm-profile",
      storage: createUserDataSectionPersistStorage<UserProfile>("profile"),
      partialize: (state): UserProfile => ({
        username: state.username,
        bio: state.bio,
        avatarDataUrl: state.avatarDataUrl,
        socialLinks: state.socialLinks,
        stats: state.stats,
      }),
      skipHydration: true,
    }
  )
);
