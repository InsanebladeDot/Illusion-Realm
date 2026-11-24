"use client";

/** 仅在本次应用会话记录手工勾选，换页面不丢进度，不写模型设置或安装状态。 */
import { create } from "zustand";

interface SetupChecklistState {
  open: boolean;
  setOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  group: string;
  selectGroup: (group: string) => void;
  openGroup: (group: string) => void;
  completed: string[];
  toggle: (id: string) => void;
}

export const useSetupChecklistStore = create<SetupChecklistState>(set => ({
  open: false,
  group: "anima",
  selectGroup: group => set({ group }),
  openGroup: group => set({ group, open: true }),
  setOpen: value => set(state => ({ open: typeof value === "function" ? value(state.open) : value })),
  completed: [],
  toggle: id => set(state => ({
    completed: state.completed.includes(id) ? state.completed.filter(value => value !== id) : [...state.completed, id],
  })),
}));
