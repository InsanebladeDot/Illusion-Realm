"use client";

/**
 * 视频剪辑 / GIF 工具记住的两项设置。
 *
 * 怎么用：读 `useVideoToolStore((s) => s.ffmpegPath)`；写 `setFfmpegPath(path | null)`。
 * 拿到什么：`ffmpegPath`（null = 自动探测；用户手动指定后记住）、
 * `outputFolder`（导出默认目录，null = 每次问）。
 * 持久化：用户数据文档 `videoTool` 段。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDataVideoTool } from "@/types/userData";
import { createUserDataSectionPersistStorage } from "@/utils/userDataStorage";

type VideoToolState = {
  /** 用户手动指定的 ffmpeg 可执行文件路径（为空则自动探测） */
  ffmpegPath: string | null;
  /** 默认输出文件夹（视频剪辑与 GIF 制作共用，导出时「选择文件夹」会记住这里） */
  outputFolder: string | null;
  setFfmpegPath: (filePath: string | null) => void;
  setOutputFolder: (folderPath: string | null) => void;
};

/**
 * 视频 / GIF 工具持久化：与其它用户数据一同写入 illusion-realm.json 的 videoTool 段。
 */
export const useVideoToolStore = create<VideoToolState>()(
  persist<VideoToolState, [], [], UserDataVideoTool>(
    (set) => ({
      ffmpegPath: null,
      outputFolder: null,
      setFfmpegPath: (filePath) => set({ ffmpegPath: filePath }),
      setOutputFolder: (folderPath) => set({ outputFolder: folderPath }),
    }),
    {
      name: "illusion-realm-video-tool",
      storage:
        createUserDataSectionPersistStorage<UserDataVideoTool>("videoTool"),
      partialize: (state): UserDataVideoTool => ({
        ffmpegPath: state.ffmpegPath,
        outputFolder: state.outputFolder,
      }),
      skipHydration: true,
    }
  )
);
