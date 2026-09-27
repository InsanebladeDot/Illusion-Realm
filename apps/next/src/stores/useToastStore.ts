"use client";

/**
 * 全局轻提示（浮出来的那条 toast）：生成成功 / 失败、复制成功这类一次性反馈。
 *
 * 怎么用：事件回调里 `useToastStore.getState().show("已复制", "success")`；
 * 组件里也可以 `const show = useToastStore((s) => s.show)`。
 * 传什么 / 拿到什么：`show(message, variant?)` —— `message` 必须是**已翻译**的文案
 * （store 不做 i18n），`variant` 为 `info | success | error`，默认 info；
 * info 2.8s、error 4.2s 后自动消失；`hide()` 立即关。
 * 另导出 `showNotImplementedToast(label)`：「还没做的功能」用它（`label` 传 `t(...)` 的结果）。
 * 持久化：不落盘（纯瞬时状态）。
 */
import { create } from "zustand";
import { t } from "@/i18n";

export type ToastVariant = "info" | "success" | "error";

type ToastState = {
  message: string | null;
  variant: ToastVariant;
  show: (message: string, variant?: ToastVariant) => void;
  hide: () => void;
};

const DEFAULT_DURATION_MS = 2800;
const ERROR_DURATION_MS = 4200;

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: "info",
  show: (message, variant = "info") => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message, variant });
    hideTimer = setTimeout(
      () => set({ message: null }),
      variant === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS
    );
  },
  hide: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: null });
  },
}));

/** 未实现的功能：`label` 传入的已经是翻译过的文案（如 t("nav.language")） */
export function showNotImplementedToast(label: string) {
  useToastStore.getState().show(t("common.notImplemented", { label }));
}
