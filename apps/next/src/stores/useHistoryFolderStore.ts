"use client";

/**
 * 图库的状态中枢 —— 宽屏右栏、窄屏整页、窄屏右上角固钉三处**共用同一份**。
 *
 * 怎么用：读 `useHistoryFolderStore((s) => s.openedFolderId)`；
 * 写 `openFolder(folderId)`（选中 + 打开）、`setViewMode("grid" | "stack" | "bookmark")`。
 * 拿到什么：
 * - `selectedFolderId` 单击选中（生成图的保存目标）；`openedFolderId` 双击打开（当前展示的文件夹）
 * - `imagesRefreshVersion` / `foldersRefreshVersion`：**自增**计数器，
 *   订阅它就能在删除 / 移动 / 重命名之后重新拉取列表
 * - `pendingOpenImagePath` + `requestOpenImage(path)` / `clearOpenImageRequest()`：
 *   「生成完成，打开这张图」走这条，由当前活跃的图库实例消费
 * 注意：folderId 非法（旧数据 / 文件夹已被删）会被规范化回默认文件夹。
 * 持久化：用户数据文档 `historyFolders` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import { isValidFolderId } from "@/utils/historyFolders";
import type { UserDataHistoryFolders } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

/**
 * 图库的视图档位。**放在 store 而不是组件里**：宽屏右栏、窄屏换页、以及窄屏右上角那枚
 * 固钉切换器是三处入口，但它们说的是同一个视图 —— 拆成三份本地 state 就会出现
 * 「在固钉上切了停在网格、进换页却显示堆栈」这种同一件事两个答案的状态。
 */
export type HistoryViewMode = "grid" | "stack" | "bookmark";

type HistoryFolderState = {
  /** 单击选中，用于生成保存目标 */
  selectedFolderId: string;
  /** 双击打开，决定图片区展示哪个文件夹 */
  openedFolderId: string;
  imagesRefreshVersion: number;
  foldersRefreshVersion: number;
  /** 外部（生成完成通知）请求打开某张图片详情；由当前活跃的图库实例消费 */
  pendingOpenImagePath: string | null;
  /** 图片区视图档位（网格 / 堆栈 / 收藏） */
  viewMode: HistoryViewMode;
  outputMode: "free" | "fixed";
  fixedOutputPath: string;
  setSelectedFolderId: (folderId: string) => void;
  openFolder: (folderId: string) => void;
  setViewMode: (viewMode: HistoryViewMode) => void;
  setOutputMode: (mode: "free" | "fixed") => void;
  setFixedOutputPath: (path: string) => void;
  refreshGeneratedImages: () => void;
  refreshFolders: () => void;
  requestOpenImage: (filePath: string) => void;
  clearOpenImageRequest: () => void;
};

function normalizeFolderId(folderId: string | undefined): string {
  if (!folderId || !isValidFolderId(folderId)) {
    return DEFAULT_FOLDER_ID;
  }
  return folderId;
}

export const useHistoryFolderStore = create<HistoryFolderState>()(
  persist<HistoryFolderState, [], [], UserDataHistoryFolders>(
    (set) => ({
      selectedFolderId: DEFAULT_FOLDER_ID,
      openedFolderId: DEFAULT_FOLDER_ID,
      imagesRefreshVersion: 0,
      foldersRefreshVersion: 0,
      pendingOpenImagePath: null,
      viewMode: "grid",
      outputMode: "free",
      fixedOutputPath: "",
      setSelectedFolderId: (folderId) =>
        set({ selectedFolderId: normalizeFolderId(folderId) }),
      openFolder: (folderId) => {
        const normalized = normalizeFolderId(folderId);
        set({ selectedFolderId: normalized, openedFolderId: normalized });
      },
      setViewMode: (viewMode) => set({ viewMode }),
      setOutputMode: (outputMode) => set({ outputMode }),
      setFixedOutputPath: (fixedOutputPath) =>
        set({ fixedOutputPath: fixedOutputPath.trim() }),
      refreshGeneratedImages: () =>
        set((state) => ({
          imagesRefreshVersion: state.imagesRefreshVersion + 1,
        })),
      refreshFolders: () =>
        set((state) => ({
          foldersRefreshVersion: state.foldersRefreshVersion + 1,
        })),
      requestOpenImage: (filePath) => set({ pendingOpenImagePath: filePath }),
      clearOpenImageRequest: () => set({ pendingOpenImagePath: null }),
    }),
    {
      name: "illusion-realm-history-folders",
      storage:
        createUserDataSectionPersistStorage<UserDataHistoryFolders>("historyFolders"),
      partialize: (state): UserDataHistoryFolders => ({
        selectedFolderId: state.selectedFolderId,
        openedFolderId: state.openedFolderId,
        outputMode: state.outputMode,
        fixedOutputPath: state.fixedOutputPath,
      }),
      skipHydration: true,
    }
  )
);

export function getSelectedFolderDirPath(selectedFolderId: string): string | null {
  if (selectedFolderId === DEFAULT_FOLDER_ID) return null;
  return selectedFolderId;
}

export function getOpenedFolderDirPath(openedFolderId: string): string | null {
  if (openedFolderId === DEFAULT_FOLDER_ID) return null;
  return openedFolderId;
}

export function sanitizePersistedFolderIds(
  selectedFolderId: string,
  openedFolderId: string
): { selectedFolderId: string; openedFolderId: string } {
  return {
    selectedFolderId: normalizeFolderId(selectedFolderId),
    openedFolderId: normalizeFolderId(openedFolderId),
  };
}
