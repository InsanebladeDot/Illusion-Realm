"use client";

/** 只刷新耗时显示，起止时间仍由原任务队列记录，不回写任务或生成历史。 */
import { useEffect, useState } from "react";
import { isGenerationTaskActive, type GenerationTask } from "@/stores/useGenerationTaskStore";

export function useGenerationTaskElapsed(task: GenerationTask): number | null {
  const [now, setNow] = useState(Date.now);
  const running = task.startedAt !== undefined && task.finishedAt === undefined && task.status !== "queued" && isGenerationTaskActive(task);
  useEffect(() => {
    if (!running) return;
    // 读真实时间差，不累加秒数；切回后台窗口时不会把漏掉的刷新当成少执行了几秒。
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [running]);
  // 旧记录缺开始时间就不猜；终态只读固定结束时间，重开卡片也不会继续增加。
  if (task.startedAt === undefined || (!running && task.finishedAt === undefined)) return null;
  return Math.max(0, (task.finishedAt ?? now) - task.startedAt) / 1000;
}
