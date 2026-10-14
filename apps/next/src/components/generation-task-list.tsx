"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Images, Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useGenerationTaskStore, isGenerationTaskActive, type GenerationTask } from "@/stores/useGenerationTaskStore";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";

function TaskCard({ task, onView }: { task: GenerationTask; onView: (task: GenerationTask) => void }) {
  const { t } = useTranslation();
  const statusLabels = {
    queued: t("create.generationTasks.status.queued"),
    generating: t("create.generationTasks.status.generating"),
    saving: t("create.generationTasks.status.saving"),
    completed: t("create.generationTasks.status.completed"),
    failed: t("create.generationTasks.status.failed"),
  };
  return <li data-generation-task={task.id} data-generation-task-status={task.status} className="flex gap-3 rounded-lg border border-border bg-background p-3">
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">{task.previewUrl ? <Image src={task.previewUrl} alt={task.prompt} width={48} height={48} unoptimized className="h-full w-full object-cover" /> : <Images size={20} />}</div>
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium" title={task.prompt}>{task.prompt}</p><span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">{isGenerationTaskActive(task) && task.status !== "queued" && <Loader2 size={11} className="animate-spin" />}{statusLabels[task.status]}</span></div>
      <p className="mt-1 truncate text-[10px] text-muted-foreground" title={task.model}>{task.model.replace(/\\/g, "/").split("/").pop()} · {task.width} × {task.height}</p>
      <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] tabular-nums text-muted-foreground">{t("create.generationTasks.progress", { completed: task.completed, total: task.total })}</span>{task.savedPaths.length > 0 && <button type="button" onClick={() => onView(task)} className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-muted">{t("create.generationTasks.view")}</button>}</div>
      {task.error && <p role="alert" className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{task.error}</p>}
    </div>
  </li>;
}
export function GenerationTaskList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tasks = useGenerationTaskStore((state) => state.tasks);
  const pathname = usePathname();
  const router = useRouter();
  const onView = (task: GenerationTask) => {
    const path = task.savedPaths[0];
    if (!path) return;
    const history = useHistoryFolderStore.getState();
    history.openFolder(task.folderId ?? DEFAULT_FOLDER_ID);
    history.requestOpenImage(path);
    onClose();
    if (pathname !== "/create") startPageNavigation({ href: "/create", push: () => router.push("/create"), direction: resolvePageDirection(pathname, "/create") });
  };
  if (!tasks.length) return <div className="flex flex-col items-center gap-3 px-4 py-10 text-xs text-muted-foreground"><Images size={28} aria-hidden="true" />{t("create.generationTasks.empty")}</div>;
  return <ul data-generation-task-list className="min-h-0 space-y-2 overflow-y-auto p-3">{[...tasks].reverse().map((task) => <TaskCard key={task.id} task={task} onView={onView} />)}</ul>;
}
