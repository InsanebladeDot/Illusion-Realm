"use client";

/** 动作、背景和表情共用收藏状态，沿用统一用户 JSON 的节流保存。 */
// 收藏身份像“图书馆名+书号”，两个库里的相同 id 不能互相取消。
// 用条目快照保留当时的标签，即使新版资料改名也能正确导出原收藏。
// 列表只订阅当前数据，临时选择、搜索和展示模式仍归弹窗本地状态。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import type { StaticFavoriteLibrary, UserDataLibraryFavorites } from "@/types/library-favorites";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";
import { emptyLibraryFavorites, normalizeLibraryFavorites } from "@/utils/library-favorites";

// 只有 toggle 是写入口，查看收藏或切换分类不创建多余用户文档写入。
// 泛型 library 参数把相同机制应用于三类资料，不为每个库再写一个 store。
// 数据分区可序列化，action 不进入 JSON；读取时仍逐项校验未知输入。
interface LibraryFavoritesState {
  data: UserDataLibraryFavorites;
  toggle: (library: StaticFavoriteLibrary, item: StaticTagItem) => void;
}

// hydration 由 AppShell 在用户文档加载后统一安排，初始空数组不会覆盖旧收藏。
// partialize 只保存本段，凭据、任务和其他设置继续由公共 storage 合并。
// 取消收藏只移除本库关系，不删除源资料或用户下载的图片。
// 复制条目时用 structuredClone，源库中的数组不能被收藏视图反向修改。
// 新旧文档都走 normalize，损坏版本不会直接冒充运行时状态。
export const useLibraryFavoritesStore = create<LibraryFavoritesState>()(persist<LibraryFavoritesState, [], [], UserDataLibraryFavorites>((set) => ({
  data: emptyLibraryFavorites(),
  toggle: (library, item) => set(({ data }) => {
    const current = data.items[library];
    const next = current.some(entry => entry.id === item.id) ? current.filter(entry => entry.id !== item.id) : [...current, structuredClone(item)];
    return { data: { ...data, items: { ...data.items, [library]: next } } };
  }),
}), { name: "illusion-realm-library-favorites", storage: createUserDataSectionPersistStorage<UserDataLibraryFavorites>("libraryFavorites"), partialize: state => state.data, merge: (saved, current) => ({ ...current, data: normalizeLibraryFavorites(saved) }), skipHydration: true }));
