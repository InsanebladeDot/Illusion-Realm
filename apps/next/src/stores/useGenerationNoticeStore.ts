"use client";

/**
 * 全局生成状态：右上角生成通知读它，保证**切到别的页面也能看到「生成中 / 完成」**。
 *
 * 怎么用：发方 `useGenerationNoticeStore.getState().start()`；
 * 成功 `succeed({ filePath, folderId })`、失败 `fail()`；UI 只读 `status` 等字段。
 * 拿到什么：`status: "idle" | "generating" | "success" | "error"`、
 * `filePath`（最近一次成功保存的图，其它状态为 null）、
 * `folderId`（保存到的图库文件夹，用于「查看图片」跳转）；`dismiss()` 手动关。
 * 成功 8s、失败 5s 后自动回 idle。
 * 持久化：不落盘（瞬时状态；放 store 是为了让 AppShell 那一层能订阅）。
 */
import { create } from "zustand";

export type GenerationNoticeStatus = "idle" | "generating" | "success" | "error";

type GenerationNoticeState = {
  status: GenerationNoticeStatus;
  /** 最近一次成功保存的图片路径；失败 / 生成中为 null */
  filePath: string | null;
  /** 图片保存到的文件夹 id（用于点击「查看图片」时切到正确图库目录） */
  folderId: string | null;
  start: () => void;
  succeed: (payload: { filePath: string | null; folderId: string | null }) => void;
  fail: () => void;
  dismiss: () => void;
};

const SUCCESS_DURATION_MS = 8000;
const ERROR_DURATION_MS = 5000;

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

/**
 * 全局生成状态：右上角通知栏读取它。
 *
 * 放在 store 而不是 CreatePage 本地 state：组件挂在 AppShell 上，
 * 这样用户在别的路由页面也能看到「生成中 / 生成完成」。
 */
export const useGenerationNoticeStore = create<GenerationNoticeState>((set) => ({
  status: "idle",
  filePath: null,
  folderId: null,
  start: () => {
    clearDismissTimer();
    set({ status: "generating", filePath: null, folderId: null });
  },
  succeed: ({ filePath, folderId }) => {
    clearDismissTimer();
    set({ status: "success", filePath, folderId });
    dismissTimer = setTimeout(() => {
      set({ status: "idle", filePath: null, folderId: null });
      dismissTimer = null;
    }, SUCCESS_DURATION_MS);
  },
  fail: () => {
    clearDismissTimer();
    set({ status: "error", filePath: null, folderId: null });
    dismissTimer = setTimeout(() => {
      set({ status: "idle", filePath: null, folderId: null });
      dismissTimer = null;
    }, ERROR_DURATION_MS);
  },
  dismiss: () => {
    clearDismissTimer();
    set({ status: "idle", filePath: null, folderId: null });
  },
}));
