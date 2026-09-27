"use client";

/**
 * 左侧应用导航（`nav`）的展开 / 收起。
 *
 * 怎么用：读 `useSidebarStore((s) => s.expanded)`；写 `toggle()` 或 `setExpanded(boolean)`。
 * 拿到什么：`expanded`（true = 220px 展开、false = 56px 收起，宽度常量在 `data/navigation`）。
 * 持久化：用户数据文档 `sidebar` 段（只存 `expanded`）。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDataSidebar } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type SidebarState = {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (expanded: boolean) => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist<SidebarState, [], [], UserDataSidebar>(
    (set) => ({
      expanded: true,
      toggle: () => set((state) => ({ expanded: !state.expanded })),
      setExpanded: (expanded) => set({ expanded }),
    }),
    {
      name: "illusion-realm-sidebar",
      storage: createUserDataSectionPersistStorage<UserDataSidebar>("sidebar"),
      partialize: (state): UserDataSidebar => ({ expanded: state.expanded }),
      skipHydration: true,
    }
  )
);
