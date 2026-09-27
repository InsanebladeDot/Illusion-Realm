"use client";

/**
 * 更新公告「已读到哪一段」。
 *
 * 怎么用：读 `useUpdatesStore((s) => s.lastSeenChangelogSectionId)`；
 * 用户看完公告后 `markChangelogSeen(sectionId)`。
 * 拿到什么：`lastSeenChangelogSectionId: string | null`（null = 从没看过）。
 * 持久化：用户数据文档 `updates` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDataUpdates } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type UpdatesState = {
  lastSeenChangelogSectionId: string | null;
  markChangelogSeen: (sectionId: string) => void;
};

export const useUpdatesStore = create<UpdatesState>()(
  persist<UpdatesState, [], [], UserDataUpdates>(
    (set) => ({
      lastSeenChangelogSectionId: null,
      markChangelogSeen: (sectionId) =>
        set({ lastSeenChangelogSectionId: sectionId }),
    }),
    {
      name: "illusion-realm-updates",
      storage: createUserDataSectionPersistStorage<UserDataUpdates>("updates"),
      partialize: (state): UserDataUpdates => ({
        lastSeenChangelogSectionId: state.lastSeenChangelogSectionId,
      }),
      skipHydration: true,
    }
  )
);
