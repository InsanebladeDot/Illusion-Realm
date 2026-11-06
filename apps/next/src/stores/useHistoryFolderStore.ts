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
  // key 是实际浏览目录，不是可翻译的“全部”或可重复的文件夹名称。
  // value 仅包含图片路径顺序，图片内容和元数据仍由原扫描流程提供。
  // 两个同名文件位于不同目录时不会共享位置，切换输出根也各自保存。
  // 该偏好不会成为文件系统的目录排序；只影响应用图库如何展示扫描结果。
  // 字符串路径名单能够直接写入 JSON，不需要序列化 Map 或 Set。
  // 修改的是同一 historyFolders section，原设置页和账户数据结构都不新增存储位置。
  // 未打开过的目录不预建空记录，避免扫描一个大目录树就写出大量无用偏好。
  // 读取某目录队列由调用方用空数组回退，不要求把所有历史文档补齐同一字段。
  // 记录不带页码，分页大小变化或切换单栏都不会使名单失去含义。
  // 记录不带 viewMode，三种图库排列形态共享同一个先后顺序。
  // 记录不带搜索词，用户清空搜索后仍回到这份全目录名单。
  // 外部改名没有回执时不猜测新身份，路径映射的补入规则会处理它。
  // 删除文件留下的旧路径不会造成卡片复活，渲染映射会先检查当前扫描集合。
  // 下一次确认目录排列会写入当前有效路径，自然清除这份名单里过期的成员。
  // 存储不保存缩略图 data URL，排序偏好不会随着图片分辨率增大而膨胀。
  // 路径属于本地用户偏好，不由这个 action 上传到云端或转交给模型服务。
  // 多个入口订阅同一个 store，已确认顺序不必通过组件事件逐个广播。
  // 未确认草稿不放进 store，所以两个打开窗口之间不会互相实时移动图片行。
  imageOrderByFolder: Record<string, string[]>;
  setSelectedFolderId: (folderId: string) => void;
  openFolder: (folderId: string) => void;
  browseFolder: (folderId: string) => void;
  setViewMode: (viewMode: HistoryViewMode) => void;
  setOutputMode: (mode: "free" | "fixed") => void;
  setFixedOutputPath: (path: string) => void;
  refreshGeneratedImages: () => void;
  refreshFolders: () => void;
  setImageOrderForFolder: (folderPath: string, paths: string[]) => void;
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
      // 初始空映射等于没有自定义排列，旧用户文档不需要一次强制迁移。
      // 新目录第一次打开仍按已有扫描顺序显示，确认后才建立该目录队列。
      imageOrderByFolder: {},
      setSelectedFolderId: (folderId) =>
        set({ selectedFolderId: normalizeFolderId(folderId) }),
      openFolder: (folderId) => {
        const normalized = normalizeFolderId(folderId);
        set({ selectedFolderId: normalized, openedFolderId: normalized });
      },
      // 空态快捷入口仅切换浏览目录，生成保存目标保持用户原来的选择。
      browseFolder: (folderId) => set({ openedFolderId: normalizeFolderId(folderId) }),
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
      // 每个图库目录保存独立的路径队列，旧用户没有此字段时仍保留原排序。
      // 顺序跟随同一用户文档；主列表照常重新扫描，文件不存在时会被忽略。
      setImageOrderForFolder: (folderPath, paths) => set(state => ({
        // 浅复制保留其他目录的队列，不能保存一个目录就清掉所有偏好。
        // 路径数组也复制一次，防止调用方后来移动草稿时污染已确认的状态。
        // 此 action 只保存名单，不在 store 内调用磁盘文件服务或弹出提示。
        // UI 的确认与取消边界由窗口掌握，store 不猜测用户是否真的确认。
        imageOrderByFolder: { ...state.imageOrderByFolder, [folderPath]: [...paths] },
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
        // 和原文件夹选择偏好一起写入用户文档，不新增 localStorage 或第二个 JSON。
        // 只持久化已确认的顺序；窗口开关、忙碌锁和未确认草稿都不会落盘。
        // imagesRefreshVersion 仍不持久化，重新进入页面照常扫描磁盘。
        imageOrderByFolder: state.imageOrderByFolder,
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
