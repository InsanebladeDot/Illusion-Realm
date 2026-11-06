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
import type { AnimadexCharacter } from "@/types/character";
import { normalizeFavoriteCharacters } from "@/utils/library-favorites";

type CharacterFavoriteState = {
  /** 收藏的角色 slug */
  slugs: string[];
  // 快照只包含已收藏角色，浏览当前页不能把整页资料写入用户文档。
  characters: AnimadexCharacter[];
  toggleFavorite: (slug: string, character?: AnimadexCharacter) => void;
  rememberCharacters: (characters: AnimadexCharacter[]) => void;
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
      characters: [],
      // 收藏和选择是独立动作；取消收藏同时删除快照，不留下导出孤儿资料。
      // 对旧调用方保留只传 slug 的兼容入口，资料稍后可由真实查询结果补上。
      toggleFavorite: (slug, character) =>
        set((state) => ({
          slugs: state.slugs.includes(slug)
            ? state.slugs.filter((item) => item !== slug)
            : [...state.slugs, slug],
          characters: state.slugs.includes(slug) ? state.characters.filter(item => item.slug !== slug) : character ? [...state.characters.filter(item => item.slug !== slug), structuredClone(character)] : state.characters,
        })),
      // 已收藏但没有快照的旧条目，在真实浏览到它时补齐；不进行额外云端请求。
      // 没有缺项就返回原 state，避免切页或普通重绘不断触发持久化。
      rememberCharacters: characters => set(state => {
        const missing = characters.filter(item => state.slugs.includes(item.slug) && !state.characters.some(saved => saved.slug === item.slug));
        return missing.length ? { characters: [...state.characters, ...structuredClone(missing)] } : state;
      }),
      isFavorite: (slug) => get().slugs.includes(slug),
      clearFavorites: () => set({ slugs: [], characters: [] }),
    }),
    {
      name: "illusion-realm-character-favorites",
      storage:
        createUserDataSectionPersistStorage<UserDataCharacterFavorites>(
          "characterFavorites"
        ),
      partialize: (state): UserDataCharacterFavorites => ({ slugs: state.slugs, characters: state.characters }),
      // 文档形状先收窄；旧 slugs 仍保留，非法快照不能覆盖 action 或清空其他收藏。
      // merge 不把未知对象整体 spread 到状态里，只有声明字段可以进入运行时。
      merge: (saved, current) => {
        const value = saved && typeof saved === "object" ? saved as Partial<UserDataCharacterFavorites> : {};
        const slugs = Array.isArray(value.slugs) ? [...new Set(value.slugs.filter((slug): slug is string => typeof slug === "string" && !!slug))] : [];
        return { ...current, slugs, characters: normalizeFavoriteCharacters(value.characters, slugs) };
      },
      skipHydration: true,
    }
  )
);
