"use client";

/** 生成任务队列视图：当前任务优先、待执行任务按提交顺序排列，终态任务归入历史。 */
import { useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Images } from "lucide-react";
import { useTranslation } from "@/i18n";
import { DEFAULT_FOLDER_ID } from "@/data/historyFolders";
import { useHistoryFolderStore } from "@/stores/useHistoryFolderStore";
import { useGenerationTaskStore, isGenerationTaskActive, type GenerationTask } from "@/stores/useGenerationTaskStore";
import { resolvePageDirection, startPageNavigation } from "@/utils/pageTransition";
import { GenerationTaskCard, QueuedGenerationTask, stopGenerationTask, TASK_ACTION_CLASS } from "./generation-task-card";

type TaskTab = "active" | "history";
function useViewTask(onClose: () => void) {
  const pathname = usePathname(), router = useRouter();
  return (task: GenerationTask) => {
    const path = task.savedPaths[0];
    if (!path) return;
    const history = useHistoryFolderStore.getState();
    history.openFolder(task.folderId ?? DEFAULT_FOLDER_ID);
    history.requestOpenImage(path);
    onClose();
    if (pathname !== "/create") startPageNavigation({ href: "/create", push: () => router.push("/create"), direction: resolvePageDirection(pathname, "/create") });
  };
}

function TaskTabs({ selected, onSelect, active, history }: { selected: TaskTab; onSelect: (tab: TaskTab) => void; active: number; history: number }) {
  const { t } = useTranslation();
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, tab: TaskTab) => {
    const next = event.key === "Home" ? "active" : event.key === "End" ? "history"
      : ["ArrowLeft", "ArrowRight"].includes(event.key) ? (tab === "active" ? "history" : "active") : null;
    if (!next) return;
    event.preventDefault(); onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-generation-tab="${next}"]`)?.focus();
  };
  return <div role="tablist" aria-label={t("create.generationTasks.categories")} className="flex shrink-0 gap-6 border-b border-border px-5">
    {(["active", "history"] as const).map(tab => <button key={tab} type="button" id={`generation-${tab}-tab`} role="tab" aria-selected={selected === tab} aria-controls={`generation-${tab}-panel`} tabIndex={selected === tab ? 0 : -1} data-generation-tab={tab} onClick={() => onSelect(tab)} onKeyDown={event => keyboard(event, tab)} className="flex min-h-11 items-center gap-2 border-b-2 border-transparent text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--task-accent) aria-selected:border-(--task-accent) aria-selected:font-medium aria-selected:text-(--task-accent)">
      {t(tab === "active" ? "create.generationTasks.tabs.active" : "create.generationTasks.tabs.history")}<span className="text-xs tabular-nums">{tab === "active" ? active : history}</span>
    </button>)}
  </div>;
}

function EmptyTasks({ history }: { history: boolean }) {
  const { t } = useTranslation();
  return <div className="flex flex-col items-center gap-3 px-4 py-10 text-xs text-muted-foreground"><Images size={26} strokeWidth={1.4} aria-hidden="true" />{t(history ? "create.generationTasks.emptyHistory" : "create.generationTasks.emptyActive")}</div>;
}

function TaskPanels({ tab, tasks, onView }: { tab: TaskTab; tasks: GenerationTask[]; onView: (task: GenerationTask) => void }) {
  const { t } = useTranslation();
  const active = tasks.filter(isGenerationTaskActive), history = tasks.filter(task => !isGenerationTaskActive(task)).reverse();
  const running = active.filter(task => task.status !== "queued"), queued = active.filter(task => task.status === "queued");
  return <>
    <div id="generation-active-panel" role="tabpanel" aria-labelledby="generation-active-tab" tabIndex={0} hidden={tab !== "active"} className="min-h-0 overflow-y-auto p-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-(--task-accent)">
      {running.length > 0 && <p className="mb-3 px-1 text-xs text-muted-foreground">{t("create.generationTasks.current")}</p>}
      <ul data-generation-task-list className="space-y-3">{running.map(task => <GenerationTaskCard key={task.id} task={task} onView={onView} current />)}</ul>
      {/* 界面：待执行任务按 FIFO 排列，保留独立取消入口 */}
      <ul className="mt-1 divide-y divide-border">{queued.map((task, index) => <QueuedGenerationTask key={task.id} task={task} position={index + 1} />)}</ul>
      {!active.length && <EmptyTasks history={false} />}
    </div>
    <div id="generation-history-panel" role="tabpanel" aria-labelledby="generation-history-tab" tabIndex={0} hidden={tab !== "history"} className="min-h-0 overflow-y-auto p-4 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-(--task-accent)">
      {history.length ? <ul data-generation-task-list className="space-y-3">{history.map(task => <GenerationTaskCard key={task.id} task={task} onView={onView} />)}</ul> : <EmptyTasks history />}
    </div>
  </>;
}

export function GenerationTaskList({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(), [tab, setTab] = useState<TaskTab>("active");
  const tasks = useGenerationTaskStore(state => state.tasks), onView = useViewTask(onClose);
  const active = tasks.filter(isGenerationTaskActive);
  return <div className="flex min-h-0 flex-1 flex-col">
    {/* 界面：「进行中 / 历史」任务分类，键盘方向键可切换 */}
    <TaskTabs selected={tab} onSelect={setTab} active={active.length} history={tasks.length - active.length} />
    <TaskPanels tab={tab} tasks={tasks} onView={onView} />
    {/* 界面：队列说明与停止全部；操作仍调用真实生成队列 */}
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
      <span>{t("create.generationTasks.serialHint")}</span>
      {active.length > 0 && <button type="button" data-generation-cancel-all onClick={() => stopGenerationTask()} disabled={active.every(task => task.status === "cancelling")} className={TASK_ACTION_CLASS}>{t("create.generationTasks.cancelAll")}</button>}
    </footer>
  </div>;
}
