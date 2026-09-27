"use client";

/**
 * EXIF 工具记住的两个文件夹（批量导入 / 批量保存）。
 *
 * 怎么用：读 `useExifToolStore((s) => s.inputFolder)`；写 `setInputFolder(path | null)`。
 * 拿到什么：`inputFolder` / `outputFolder`（绝对路径，null = 还没选过）。
 * 持久化：用户数据文档 `exifTool` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDataExifTool } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type ExifToolState = {
  /** 批量导入的输入文件夹 */
  inputFolder: string | null;
  /** 批量保存的输出文件夹 */
  outputFolder: string | null;
  setInputFolder: (folderPath: string | null) => void;
  setOutputFolder: (folderPath: string | null) => void;
};

/**
 * EXIF 工具的文件夹选择持久化。
 * 与其它用户数据一同写入 illusion-realm.json 的 exifTool 段，
 * 切换页面/重启后仍保留。
 */
export const useExifToolStore = create<ExifToolState>()(
  persist<ExifToolState, [], [], UserDataExifTool>(
    (set) => ({
      inputFolder: null,
      outputFolder: null,
      setInputFolder: (folderPath) => set({ inputFolder: folderPath }),
      setOutputFolder: (folderPath) => set({ outputFolder: folderPath }),
    }),
    {
      name: "illusion-realm-exif-tool",
      storage: createUserDataSectionPersistStorage<UserDataExifTool>("exifTool"),
      partialize: (state): UserDataExifTool => ({
        inputFolder: state.inputFolder,
        outputFolder: state.outputFolder,
      }),
      skipHydration: true,
    }
  )
);
