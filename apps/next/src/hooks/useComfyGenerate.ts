"use client";

import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { enqueueImageGeneration, type ImageGenerationResult } from "@/utils/image-generation-queue";

export type ComfyGenerateHookResult = ImageGenerationResult;

/** 创建页订阅全局图片队列；预览 URL 由任务列表持有，页面切换不取消任务。 */
export function useComfyGenerate() {
  const tasks = useGenerationTaskStore((state) => state.tasks);
  // URL 和路径必须取自同一个任务，不能各自寻找最近一项。
  // 新任务尚未生成时仍保留上一张图，避免排队期间预览突然消失。
  // 不从 savedPaths 最后一项推断：一次结果可以保存多图，而预览取第一张。
  // 精确映射由生成执行器记录，重命名和独立输出目录不会影响判断。
  // 这里只提供已有身份，不另读磁盘或创建第二个 Blob 地址。
  // 路径暂缺时兼容旧任务，不能过滤掉无法证实为同一文件的历史图。
  // 当前保存完成后的新任务都有路径，不需要 Agent 或界面额外猜测。
  const preview = [...tasks].reverse().find((task) => task.previewUrl);
  return { generating: tasks.some(isGenerationTaskActive), previewUrl: preview?.previewUrl ?? null,
    previewFilePath: preview?.previewFilePath ?? null, generate: enqueueImageGeneration };
}
