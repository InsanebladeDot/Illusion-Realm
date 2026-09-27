"use client";

/**
 * 本地模型的**自定义分类**（设置页里把模型文件归到自己的分类下）。
 *
 * 怎么用：读 `useCustomCategoryStore((s) => s.categories)`；
 * 写 `addCategory(name)` —— **空名或重名返回 null**（调用方据此提示），成功返回新分类 id；
 * 再把模型挂进去 `addModelsToCategory(id, filePaths)`（已分配的会跳过）。
 * 拿到什么：`categories: CustomModelCategory[]`（`{ id, name, modelFilePaths }`）；
 * 反查：`assignedCategoryOf(filePath)` → 分类或 null、`isAssigned(filePath)` → boolean。
 * 持久化：用户数据文档 `customCategories` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CustomModelCategory,
  UserDataCustomCategories,
} from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type CustomCategoryState = {
  categories: CustomModelCategory[];
  /** 新增自定义分类；重名或空名返回 null */
  addCategory: (name: string) => string | null;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  /** 批量分配模型文件到分类（跳过已分配的） */
  addModelsToCategory: (id: string, filePaths: string[]) => void;
  removeModelFromCategory: (id: string, filePath: string) => void;
  /** 查询某模型文件被分配到的自定义分类 */
  assignedCategoryOf: (filePath: string) => CustomModelCategory | null;
  isAssigned: (filePath: string) => boolean;
};

function createCategoryId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export const useCustomCategoryStore = create<CustomCategoryState>()(
  persist<CustomCategoryState, [], [], UserDataCustomCategories>(
    (set, get) => ({
      categories: [],

      addCategory: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const exists = get().categories.some(
          (category) => category.name === trimmed
        );
        if (exists) return null;
        const category: CustomModelCategory = {
          id: createCategoryId(),
          name: trimmed,
          modelFilePaths: [],
        };
        set((state) => ({ categories: [...state.categories, category] }));
        return category.id;
      },

      removeCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter(
            (category) => category.id !== id
          ),
        })),

      renameCategory: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id ? { ...category, name: trimmed } : category
          ),
        }));
      },

      addModelsToCategory: (id, filePaths) => {
        if (filePaths.length === 0) return;
        const state = get();
        const target = state.categories.find((category) => category.id === id);
        if (!target) return;
        const used = new Set(
          state.categories.flatMap((category) => category.modelFilePaths)
        );
        const added = filePaths.filter((filePath) => !used.has(filePath));
        if (added.length === 0) return;
        set((current) => ({
          categories: current.categories.map((category) =>
            category.id === id
              ? {
                  ...category,
                  modelFilePaths: [...category.modelFilePaths, ...added],
                }
              : category
          ),
        }));
      },

      removeModelFromCategory: (id, filePath) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id
              ? {
                  ...category,
                  modelFilePaths: category.modelFilePaths.filter(
                    (item) => item !== filePath
                  ),
                }
              : category
          ),
        })),

      assignedCategoryOf: (filePath) =>
        get().categories.find((category) =>
          category.modelFilePaths.includes(filePath)
        ) ?? null,

      isAssigned: (filePath) =>
        get().categories.some((category) =>
          category.modelFilePaths.includes(filePath)
        ),
    }),
    {
      name: "illusion-realm-custom-categories",
      storage:
        createUserDataSectionPersistStorage<UserDataCustomCategories>(
          "customCategories"
        ),
      partialize: (state): UserDataCustomCategories => ({
        categories: state.categories,
      }),
      skipHydration: true,
    }
  )
);
