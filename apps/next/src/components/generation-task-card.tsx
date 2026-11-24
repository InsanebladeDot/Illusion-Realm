"use client";
import { HoverTip } from "@/components/hover-tip";


/** 任务卡片：展示真实快照、完成张数及终态，淡紫色强调当前生成任务。 */
import Image from "next/image";
// 音频任务没有图片缩略图；固定 SVG 图标在离线和主题切换时保持可见。
// 图片继续使用原来的预览地址，避免把音频 Blob 送入 next/image。
// 媒介标记仅影响展示，任务取消和状态徽标仍复用同一套组件。
import { ImageIcon, Loader2, Music, Video } from "lucide-react";
import { useTranslation } from "@/i18n";
import { isGenerationTaskActive, type GenerationTask } from "@/stores/useGenerationTaskStore";
import { cancelAllImageGeneration, cancelImageGeneration } from "@/utils/image-generation-queue";
import { useToastStore } from "@/stores/useToastStore";
import { useGenerationTaskElapsed } from "@/hooks/use-generation-task-elapsed";
import { getWorkflowExecutionMs } from "@/utils/generation-execution-time";

export const TASK_ACTION_CLASS = "inline-flex min-h-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs text-(--task-accent) transition-colors hover:bg-(--task-soft) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--task-accent) disabled:cursor-wait disabled:opacity-50";

export function stopGenerationTask(id?: string) {
  const request = id ? cancelImageGeneration(id) : cancelAllImageGeneration();
  void request.catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : ""));
}

function TaskIdentity({ task }: { task: GenerationTask }) {
  const { locale } = useTranslation();
  const date = new Date(task.startedAt ?? task.createdAt);
  return <HoverTip asChild layer="window" label={(task.id) ?? ""}><span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">
    #{task.id.slice(0, 6)} · <HoverTip asChild layer="window" label={(date.toLocaleString(locale)) ?? ""}><time dateTime={date.toISOString()}>{date.toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</time></HoverTip>
  </span></HoverTip>;
}

// 完成后优先显示服务端耗时；运行中或记录不完整时明确标为本地任务耗时。
function TaskTiming({ task }: { task: GenerationTask }) {
  const { t, locale } = useTranslation();
  const elapsed = useGenerationTaskElapsed(task);
  const workflowMs = task.status === "completed" ? getWorkflowExecutionMs(task.executions) : null;
  const seconds = workflowMs === null ? elapsed : workflowMs / 1000;
  return <div data-generation-timing className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
    <span>{t(task.startedAt !== undefined ? "create.generationTasks.startedAt" : "create.generationTasks.submittedAt")}: {new Date(task.startedAt ?? task.createdAt).toLocaleString(locale, { hour12: false })}</span>
    {seconds !== null && <span data-generation-elapsed data-generation-timing-source={workflowMs === null ? "local" : "comfy"}>{t(workflowMs === null ? "create.generationTasks.elapsed" : "create.generationTasks.workflowElapsed", { seconds: seconds.toFixed(2) })}</span>}
    {task.finishedAt && <span>{t("create.generationTasks.finishedAt")}: {new Date(task.finishedAt).toLocaleTimeString(locale, { hour12: false })}</span>}
  </div>;
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
  // 模板内部的 32×32 不是音频分辨率，不能向用户显示成图片规格。
  // 音频卡片使用音乐图标；实际播放器位于 Role TTS 的结果展示区。
  // 状态和取消操作仍来自公共任务，无需建立第二个音频任务中心。
  if (task.mediaKind === 'video') return <Video className="h-16 w-11 shrink-0 text-muted-foreground" aria-hidden />;
  if (task.mediaKind === 'audio') return <Music className="h-16 w-11 shrink-0 text-muted-foreground" aria-hidden />;
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
      {/* 音频进度按任务项计数，不用图片单位“张”解释声音输出。 */}
      {/* completed 仍表示已经保存的工作流项数，不把临时音频当作完成。 */}
      {/* 图片分支继续使用原来的批次文案。 */}
      <span className="text-xs tabular-nums text-muted-foreground">{t(task.mediaKind === 'audio' ? 'create.audio.progress' : "create.generationTasks.progress", { completed: task.completed, total: task.total })}</span>
      <span className={`${TASK_ACTION_CLASS} group-open:bg-(--task-soft)`}>{t("create.generationTasks.details")}</span>
    </summary>
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-(--task-border) bg-background/60 p-3 leading-5">
      <dt className="text-muted-foreground">{t("create.generationTasks.prompt")}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{task.prompt || t("create.generationTasks.noPrompt")}</dd>
      <dt className="text-muted-foreground">{t("create.generationTasks.model")}</dt><dd className="wrap-anywhere">{task.model}</dd>
      {/* 音频没有可展示的图像尺寸，保留其他真实提交参数。 */}
      {/* 缺省媒介标记的旧图片任务仍按原逻辑展示宽高。 */}
      {/* 不把内部占位画布或虚构采样率展示为用户参数。 */}
      {task.mediaKind !== 'audio' && task.width > 0 && task.height > 0 && <><dt className="text-muted-foreground">{t("create.generationTasks.dimensions")}</dt><dd className="tabular-nums">{task.width} × {task.height}</dd></>}
      {/* 音频的数量是生成项数，不能标为图片张数。 */}
      {/* 任务总数来自入队快照，与当前图片表单数量无关。 */}
      {/* 音频每次提交一项，多个返回文件仍由同一次工作流生成。 */}
      <dt className="text-muted-foreground">{t(task.mediaKind === 'audio' ? 'create.audio.quantity' : "create.generationTasks.quantity")}</dt><dd className="tabular-nums">{task.total}</dd>
    </dl>
  </details>;
}

function TaskFooter({ task, onView }: { task: GenerationTask; onView: (task: GenerationTask) => void }) {
  const { t } = useTranslation(), active = isGenerationTaskActive(task);
  // 批量工作流只在完成后返回图片，运行时显示整批张数。
  const label = task.status !== "generating" ? t(`create.generationTasks.status.${task.status}`)
    : task.mediaKind === "video" ? t("canvas.upscaleRunning")
    : task.mediaKind === "audio" ? t("create.audio.generating")
    : task.total > 1 ? t("create.generationTasks.generatingBatch", { count: task.total })
    : t("create.generationTasks.generatingImage", { number: 1 });
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-(--task-border) pt-3">
    <span className={`inline-flex items-center gap-2 text-xs ${active ? "text-(--task-accent)" : "text-muted-foreground"}`}>
      {active && <Loader2 size={13} aria-hidden="true" className="motion-safe:animate-spin" />}{label}
    </span>
    <div className="flex flex-wrap items-center gap-1">
      {/* 音频查看定位实际文件，不把动作描述成查看图片。 */}
      {/* 是否可查看仍以已经保存的路径为准，生成中不显示伪入口。 */}
      {/* 上层 onView 负责媒介分流，停止动作继续复用原公共队列。 */}
      {task.savedPaths.length > 0 && <button type="button" onClick={() => onView(task)} className={TASK_ACTION_CLASS}>{t(task.mediaKind === 'audio' ? 'create.audio.reveal' : "create.generationTasks.view")}</button>}
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
      <HoverTip asChild layer="window" label={(task.prompt) ?? ""}><p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.6] wrap-anywhere">{task.prompt || t("create.generationTasks.noPrompt")}</p></HoverTip>
      {/* 音频摘要标注媒介名称，图片继续显示真实像素规格。 */}
      {/* 这个分支不改变模型名，便于用户分辨 MiniMax 音频与图片任务。 */}
      {/* 每项摘要读取提交快照，后续切换页面或修改模型不反向更新卡片。 */}
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground"><HoverTip asChild layer="window" label={(task.model) ?? ""}><span className="max-w-full truncate">{model}</span></HoverTip><span className="shrink-0 tabular-nums">{task.mediaKind === 'audio' ? t('create.audio.media') : task.mediaKind === 'video' ? t('canvas.video') : `${task.width} × ${task.height}`}</span></div>
    </div></div>
    {/* 界面：「查看参数」展开原始快照；不填充服务端未提供的参数 */}
    {/* 队列：耗时与生成日期直接放在卡片，不必展开参数才能查到。 */}
    {/* 音频也复用时钟展示，但本轮图片统计不会把它算成图片。 */}
    <TaskTiming task={task} />
    <TaskParameters task={task} />
    <TaskFooter task={task} onView={onView} />
    {task.error && <p role="alert" className="mt-3 rounded-lg bg-red-500/5 p-2.5 text-xs leading-5 wrap-anywhere text-red-600 dark:text-red-400">{task.error}</p>}
  </li>;
}

export function QueuedGenerationTask({ task, position }: { task: GenerationTask; position: number }) {
  const { t } = useTranslation();
  return <li data-generation-task={task.id} data-generation-task-status={task.status} className="flex items-center justify-between gap-3 border-t border-border px-1 py-4">
    <div className="min-w-0"><TaskIdentity task={task} /><HoverTip asChild layer="window" label={(task.prompt) ?? ""}><p className="mt-1 truncate text-[13px]">{task.prompt || t("create.generationTasks.noPrompt")}</p></HoverTip>
      <p className="mt-1 text-xs text-muted-foreground">{t("create.generationTasks.queuePosition", { position })}</p>
    </div>
    <button type="button" data-generation-cancel={task.id} onClick={() => stopGenerationTask(task.id)} className={TASK_ACTION_CLASS}>{t("create.generationTasks.cancelQueued")}</button>
  </li>;
}
