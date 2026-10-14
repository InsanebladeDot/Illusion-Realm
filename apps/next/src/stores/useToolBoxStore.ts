"use client";

import { create } from "zustand";

export type ToolCategory = "all" | "image" | "video" | "models";
interface ToolBoxState {
  category: ToolCategory;
  query: string;
  setCategory: (category: ToolCategory) => void;
  setQuery: (query: string) => void;
}

// 工具箱首页的分类和搜索；不写入用户配置。
export const useToolBoxStore = create<ToolBoxState>((set) => ({
  category: "all", query: "",
  setCategory: (category) => set({ category }),
  setQuery: (query) => set({ query }),
}));
