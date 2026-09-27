"use client";

/**
 * 角色库的收藏。
 *
 * 怎么用：读 `useCharacterFavoriteStore((s) => s.slugs)`；写 `toggleFavorite(slug)`；
 * 判断某角色是否已收藏用 `isFavorite(slug)`（它读的是 `get()`，**不是响应式字段**，
 * 要跟着变化重渲染就订阅 `slugs` 再自己判断）。
 * 拿到什么：`slugs: string[]`（角色 slug）；`clearFavorites()` 清空。
 * 持久化：用户数据文档 `characterFavorites` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDataCharacterFavorites } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type CharacterFavoriteState = {
  /** 收藏的角色 slug */
  slugs: string[];
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
  clearFavorites: () => void;
};

/**
 * 角色库收藏：与其它用户数据一同写入 illusion-realm.json 的 characterFavorites 段。
 */
export const useCharacterFavoriteStore = create<CharacterFavoriteState>()(
  persist<CharacterFavoriteState, [], [], UserDataCharacterFavorites>(
    (set, get) => ({
      slugs: [],
      toggleFavorite: (slug) =>
        set((state) => ({
          slugs: state.slugs.includes(slug)
            ? state.slugs.filter((item) => item !== slug)
            : [...state.slugs, slug],
        })),
      isFavorite: (slug) => get().slugs.includes(slug),
      clearFavorites: () => set({ slugs: [] }),
    }),
    {
      name: "illusion-realm-character-favorites",
      storage:
        createUserDataSectionPersistStorage<UserDataCharacterFavorites>(
          "characterFavorites"
        ),
      partialize: (state): UserDataCharacterFavorites => ({ slugs: state.slugs }),
      skipHydration: true,
    }
  )
);
