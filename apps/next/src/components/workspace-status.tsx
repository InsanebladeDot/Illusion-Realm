"use client";

// 界面：状态条从真实任务队列读取进行中与等待数量。
import { useGenerationTaskStore, isGenerationTaskActive } from "@/stores/useGenerationTaskStore";
import { useTranslation } from "@/i18n";

export function WorkspaceStatus() {
  const { t } = useTranslation();
  const tasks = useGenerationTaskStore(state => state.tasks);
  const running = tasks.filter(task => isGenerationTaskActive(task) && task.status !== "queued").length;
  const queued = tasks.filter(task => task.status === "queued").length;
  return <footer data-workspace-status className="fixed inset-x-0 bottom-0 z-40 flex h-8 items-center justify-between gap-3 px-4 text-[10px] text-muted-foreground">
    <span className="flex min-w-0 items-center gap-1.5"><span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-accent-stroke" /><span className="truncate">{t("nav.brandTagline")}</span></span>
    <span className="shrink-0 tabular-nums">{t("create.generationTasks.summary", { running, queued })}</span>
  </footer>;
}
