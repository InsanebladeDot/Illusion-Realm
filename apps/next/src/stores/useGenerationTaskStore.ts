"use client";

/** 图片生成任务列表：记录每次提交的快照和独立状态，不随创建页卸载而清空。 */
import { create } from "zustand";

export type GenerationTaskStatus = "queued" | "generating" | "saving" | "completed" | "failed";
export interface GenerationTask {
  id: string;
  status: GenerationTaskStatus;
  prompt: string;
  model: string;
  width: number;
  height: number;
  total: number;
  completed: number;
  createdAt: number;
  previewUrl: string | null;
  savedPaths: string[];
  folderId: string | null;
  error: string | null;
}
interface GenerationTaskState {
  tasks: GenerationTask[];
  add: (task: GenerationTask) => void;
  update: (id: string, patch: Partial<GenerationTask>) => void;
}
export function isGenerationTaskActive(task: GenerationTask): boolean {
  return task.status !== "completed" && task.status !== "failed";
}
export const useGenerationTaskStore = create<GenerationTaskState>((set) => ({
  tasks: [],
  add: (task) => set((state) => {
    const finished = state.tasks.filter((item) => !isGenerationTaskActive(item));
    const removed = new Set(finished.slice(0, Math.max(0, finished.length - 39)));
    for (const item of removed) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    return { tasks: [...state.tasks.filter((item) => !removed.has(item)), task] };
  }),
  update: (id, patch) => set((state) => ({
    tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
  })),
}));
