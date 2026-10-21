"use client";

// 游客入口状态复用用户 JSON 文档持久化；不存密码，也不模拟已认证的普通用户。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GuestSession, UserDataEntrySession } from "@/types/guest-session";
import { createGuestSession, isGuestSessionActive, readGuestSession } from "@/utils/guest-session";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import { t } from "@/i18n";

interface State {
  guest: GuestSession | null; ready: boolean; expired: boolean; error: string;
  enterGuest: () => Promise<void>; leaveGuest: () => void; checkExpiry: () => void;
}
const storage = createUserDataSectionPersistStorage<UserDataEntrySession>("entrySession");
export const useGuestSessionStore = create<State>()(persist<State, [], [], UserDataEntrySession>((set, get) => ({
  guest: null, ready: false, expired: false, error: "",
  enterGuest: async () => {
    const guest = createGuestSession();
    try {
      await storage.setItem("illusion-realm-entry", { state: { guest } });
      await flushUserDataSave();
      set({ guest, expired: false, error: "" });
    } catch {
      // 写盘失败先撤销缓存中的游客，防止后续自动保存把失败的入口误写成成功。
      await Promise.resolve(storage.setItem("illusion-realm-entry", { state: { guest: null } })).catch(() => undefined);
      set({ error: t("auth.sessionSaveFailed") });
      throw new Error(t("auth.sessionSaveFailed"));
    }
  },
  leaveGuest: () => set({ guest: null, expired: false }),
  checkExpiry: () => { const { guest } = get(); if (guest && !isGuestSessionActive(guest)) set({ guest: null, expired: true }); },
}), {
  name: "illusion-realm-entry", storage, skipHydration: true,
  partialize: ({ guest }) => ({ guest }),
  merge: (persisted, current) => {
    const guest = readGuestSession(persisted && typeof persisted === "object" && "guest" in persisted ? persisted.guest : null);
    return { ...current, guest: isGuestSessionActive(guest) ? guest : null, expired: Boolean(guest && !isGuestSessionActive(guest)) };
  },
  onRehydrateStorage: () => (_state, error) => {
    useGuestSessionStore.setState({ ready: true, ...(error ? { guest: null, error: t("auth.sessionLoadFailed") } : {}) });
  },
}));
