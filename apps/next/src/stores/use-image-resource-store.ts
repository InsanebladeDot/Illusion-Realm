"use client";

/** 图片模式只在会话里保留 LoRA 草稿。模型系列和加载槽归创作表单持久化。 */
import { create } from "zustand";
import type { SetStateAction } from "react";
import type { SelectedExtension } from "@/types/extension";

interface ImageResourceState {
  selectedExtensions: SelectedExtension[];
  setSelectedExtensions: (value: SetStateAction<SelectedExtension[]>) => void;
}

export const useImageResourceStore = create<ImageResourceState>((set) => ({
  selectedExtensions: [],
  // 连续确认多个扩展时，从最新队列追加，而不是覆盖之前选中的版本。
  setSelectedExtensions: value => set(state => ({
    selectedExtensions: typeof value === "function" ? value(state.selectedExtensions) : value,
  })),
}));
