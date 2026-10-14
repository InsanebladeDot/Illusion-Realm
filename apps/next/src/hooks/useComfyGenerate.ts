"use client";

import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { enqueueImageGeneration, type ImageGenerationResult } from "@/utils/image-generation-queue";

export type ComfyGenerateHookResult = ImageGenerationResult;

/** 创建页订阅全局图片队列；预览 URL 由任务列表持有，页面切换不取消任务。 */
export function useComfyGenerate() {
  const tasks = useGenerationTaskStore((state) => state.tasks);
  const previewUrl = [...tasks].reverse().find((task) => task.previewUrl)?.previewUrl ?? null;
  return { generating: tasks.some(isGenerationTaskActive), previewUrl, generate: enqueueImageGeneration };
}
