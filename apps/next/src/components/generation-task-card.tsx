"use client";

/** 任务卡片：展示真实快照、完成张数及终态，淡紫色强调当前生成任务。 */
import Image from "next/image";
import { ImageIcon, Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { isGenerationTaskActive, type GenerationTask } from "@/stores/useGenerationTaskStore";
import { cancelAllImageGeneration, cancelImageGeneration } from "@/utils/image-generation-queue";
import { useToastStore } from "@/stores/useToastStore";

export const TASK_ACTION_CLASS = "inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs text-(--task-accent) transition-colors hover:bg-(--task-soft) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--task-accent) disabled:cursor-wait disabled:opacity-50";

export function stopGenerationTask(id?: string) {
  const request = id ? cancelImageGeneration(id) : cancelAllImageGeneration();
  void request.catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : ""));
}

function TaskIdentity({ task }: { task: GenerationTask }) {
  const { locale } = useTranslation();
  const date = new Date(task.createdAt);
  return <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground" title={task.id}>
    #{task.id.slice(0, 6)} · <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>{date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
  </span>;
}

function TaskBadge({ task }: { task: GenerationTask }) {
  const { t } = useTranslation();
  const tone = task.status === "failed" ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : task.status === "completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : isGenerationTaskActive(task) ? "bg-(--task-soft) text-(--task-accent)" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${tone}`}>
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{t(`create.generationTasks.status.${task.status}`)}
  </span>;
}

function TaskThumbnail({ task, current }: { task: GenerationTask; current: boolean }) {
  const { t } = useTranslation();
  return <div className={`flex h-16 w-11 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg ${current ? "bg-(--task-soft) text-(--task-accent)" : "bg-muted text-muted-foreground"}`}>
    {task.previewUrl ? <Image src={task.previewUrl} alt={task.prompt} width={44} height={64} unoptimized className="h-full w-full object-cover" /> : <>
      <ImageIcon size={19} strokeWidth={1.5} aria-hidden="true" /><span className="text-[10px]">{t(`create.generationTasks.status.${task.status}`)}</span>
    </>}
  </div>;
}

function TaskParameters({ task }: { task: GenerationTask }) {
  const { t } = useTranslation();
  return <details data-generation-parameters className="group mt-2 rounded-lg text-xs">
    <summary className="ml-14 flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--task-accent) [&::-webkit-details-marker]:hidden">
      <span className="text-xs tabular-nums text-muted-foreground">{t("create.generationTasks.progress", { completed: task.completed, total: task.total })}</span>
      <span className={`${TASK_ACTION_CLASS} group-open:bg-(--task-soft)`}>{t("create.generationTasks.details")}</span>
    </summary>
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-(--task-border) bg-background/60 p-3 leading-5">
      <dt className="text-muted-foreground">{t("create.generationTasks.prompt")}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{task.prompt || t("create.generationTasks.noPrompt")}</dd>
      <dt className="text-muted-foreground">{t("create.generationTasks.model")}</dt><dd className="wrap-anywhere">{task.model}</dd>
      <dt className="text-muted-foreground">{t("create.generationTasks.dimensions")}</dt><dd className="tabular-nums">{task.width} × {task.height}</dd>
      <dt className="text-muted-foreground">{t("create.generationTasks.quantity")}</dt><dd className="tabular-nums">{task.total}</dd>
    </dl>
  </details>;
}

function TaskFooter({ task, onView }: { task: GenerationTask; onView: (task: GenerationTask) => void }) {
  const { t } = useTranslation(), active = isGenerationTaskActive(task);
  const label = task.status === "generating" ? t("create.generationTasks.generatingImage", { number: Math.min(task.completed + 1, task.total) }) : t(`create.generationTasks.status.${task.status}`);
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-(--task-border) pt-3">
    <span className={`inline-flex items-center gap-2 text-xs ${active ? "text-(--task-accent)" : "text-muted-foreground"}`}>
      {active && <Loader2 size={13} aria-hidden="true" className="motion-safe:animate-spin" />}{label}
    </span>
    <div className="flex flex-wrap items-center gap-1">
      {task.savedPaths.length > 0 && <button type="button" onClick={() => onView(task)} className={TASK_ACTION_CLASS}>{t("create.generationTasks.view")}</button>}
      {active && <button type="button" data-generation-cancel={task.id} disabled={task.status === "cancelling"} onClick={() => stopGenerationTask(task.id)} className={`${TASK_ACTION_CLASS} min-h-9 border border-(--task-border) bg-background px-3 text-foreground`}>{t("create.generationTasks.cancel")}</button>}
    </div>
  </div>;
}

interface TaskCardProps { task: GenerationTask; onView: (task: GenerationTask) => void; current?: boolean }
export function GenerationTaskCard({ task, onView, current = false }: TaskCardProps) {
  const { t } = useTranslation();
  const model = task.model.replace(/\\/g, "/").split("/").pop()?.replace(/\.(safetensors|ckpt|gguf)$/i, "");
  return <li data-generation-task={task.id} data-generation-task-status={task.status} className={`rounded-xl border p-4 ${current ? "border-(--task-border) bg-(--task-surface)" : "border-border bg-background"}`}>
    {/* 界面：任务缩略图、标识、提示词与生成参数摘要 */}
    <div className="flex gap-3"><TaskThumbnail task={task} current={current} /><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><TaskIdentity task={task} /><TaskBadge task={task} /></div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.6] wrap-anywhere" title={task.prompt}>{task.prompt || t("create.generationTasks.noPrompt")}</p>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground"><span title={task.model} className="max-w-full truncate">{model}</span><span className="shrink-0 tabular-nums">{task.width} × {task.height}</span></div>
    </div></div>
    {/* 界面：「查看参数」展开原始快照；不填充服务端未提供的参数 */}
    <TaskParameters task={task} />
    <TaskFooter task={task} onView={onView} />
    {task.error && <p role="alert" className="mt-3 rounded-lg bg-red-500/5 p-2.5 text-xs leading-5 wrap-anywhere text-red-600 dark:text-red-400">{task.error}</p>}
  </li>;
}

export function QueuedGenerationTask({ task, position }: { task: GenerationTask; position: number }) {
  const { t } = useTranslation();
  return <li data-generation-task={task.id} data-generation-task-status={task.status} className="flex items-center justify-between gap-3 border-t border-border px-1 py-4">
    <div className="min-w-0"><TaskIdentity task={task} /><p className="mt-1 truncate text-[13px]" title={task.prompt}>{task.prompt || t("create.generationTasks.noPrompt")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("create.generationTasks.queuePosition", { position })}</p>
    </div>
    <button type="button" data-generation-cancel={task.id} onClick={() => stopGenerationTask(task.id)} className={TASK_ACTION_CLASS}>{t("create.generationTasks.cancelQueued")}</button>
  </li>;
}
