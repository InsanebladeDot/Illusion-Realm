"use client";

/** 任务卡片：展示真实快照、完成张数及终态，淡紫色强调当前生成任务。 */
import Image from "next/image";
// 音频任务没有图片缩略图；固定 SVG 图标在离线和主题切换时保持可见。
// 图片继续使用原来的预览地址，避免把音频 Blob 送入 next/image。
// 媒介标记仅影响展示，任务取消和状态徽标仍复用同一套组件。
import { ImageIcon, Loader2, Music } from "lucide-react";
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
  const date = new Date(task.startedAt ?? task.createdAt);
  return <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground" title={task.id}>
    #{task.id.slice(0, 6)} · <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>{date.toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</time>
  </span>;
}

// 开始和结束采用真实状态边界，不能用提交时间代替开始时间。
// 排队卡没有执行耗时，老任务缺少开始时间也不会假装耗时为零。
// 终态只展示固定秒数，重新打开详情不增加历史任务的耗时。
// 运行任务不放一个脱离服务事件的“假进度”，结束后自然显示实测时长。
// 所有日期使用当前语言，本地时区与私密统计的日历分组一致。
// 详细日期包含年份，跨年查看时不依赖卡片标题里的月日猜测。
// 手动停止也能看实际时间，但它不参与统计成功率或平均时长。
// 这个小区域只展示任务快照，不持有计时器，也无需卸载清理。
/**
 * 队列时间展示的约定：
 * 未开始时显示“提交时间”，避免让等待中的用户误以为已经执行。
 * 有开始证据后显示“开始时间”，与私密统计平均耗时的起点一致。
 * 结束后再显示“完成时间”，失败和停止同样可以查到何时结束。
 * 耗时使用开始与结束两个值相减，不会把排队分钟数算进去。
 * 秒数保留一位，极快的本地夹具会显示零点几秒而不是固定一秒。
 * 先按原始毫秒相减再格式化，避免分别舍入两个时间造成误差。
 * 日期包含本机年、月、日，可以区别昨天与今天同一时刻的任务。
 * 时间使用当前界面 locale，英语和中文不会混用固定中文格式。
 * 卡片身份里的短日期便于扫读，这一行完整日期负责消除歧义。
 * 日期不会把模型路径或输出目录带进 tooltip。
 * 没有 startedAt 的旧卡片不会出现“0 秒”这样的伪测量。
 * 正在运行的任务暂不展示最终耗时，生成中状态仍由原卡片提供。
 * 本区域没有 interval，因此隐藏队列不会留下后台刷新计时器。
 * 再次展开任务历史只重新格式化数字，不改变已经确定的起止时间。
 * 手动停止保留界面时钟，但是否参与统计由账本汇总统一控制。
 * 音频卡也可读取起止时间，媒体类型不决定是否拥有执行时钟。
 * 这里不读取任务的 total 或 completed，张数变化不能重置时间。
 * flex-wrap 允许日期与耗时在窄窗口换行，不把长日期撑出卡片。
 * 只显示有限的固定字段，不新增第二套参数弹窗或任务卡外壳。
 */
function TaskTiming({ task }: { task: GenerationTask }) {
  const { t, locale } = useTranslation();
  /*
   * 固定耗时的显示细节：
   * 用 undefined 区分缺失，数值零仍然是合法时间戳。
   * 这与共享 schema 的非负数字契约保持一致。
   * 开始与结束必须同时存在，只有提交时间不能得出耗时。
   * Math.max 保护从旧内存夹具传入的倒置时间，不在界面显示负秒数。
   * 正常生产记录已经在状态边界保证时间顺序。
   * toFixed 仅用于显示，不把舍入后的秒数回写到任务或账本。
   * 小时、日期与秒数采用 tabular-nums，状态更新时减少数字宽度跳动。
   * flex 布局允许换行，完整日期在小窗口不会被迫覆盖停止按钮。
   * 卡片没有从 Date.now 计算正在运行的耗时，因此历史项不会随渲染变老。
   * 真实进行中状态继续显示生成阶段，不用滚动数字假装远端进度。
   */
  const elapsed = task.startedAt !== undefined && task.finishedAt !== undefined ? Math.max(0, task.finishedAt - task.startedAt) / 1000 : null;
  return <div data-generation-timing className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
    <span>{t(task.startedAt ? "create.generationTasks.startedAt" : "create.generationTasks.submittedAt")}: {new Date(task.startedAt ?? task.createdAt).toLocaleString(locale, { hour12: false })}</span>
    {elapsed !== null && <span>{t("create.generationTasks.elapsed", { seconds: elapsed.toFixed(1) })}</span>}
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
      {task.mediaKind !== 'audio' && <><dt className="text-muted-foreground">{t("create.generationTasks.dimensions")}</dt><dd className="tabular-nums">{task.width} × {task.height}</dd></>}
      {/* 音频的数量是生成项数，不能标为图片张数。 */}
      {/* 任务总数来自入队快照，与当前图片表单数量无关。 */}
      {/* 音频每次提交一项，多个返回文件仍由同一次工作流生成。 */}
      <dt className="text-muted-foreground">{t(task.mediaKind === 'audio' ? 'create.audio.quantity' : "create.generationTasks.quantity")}</dt><dd className="tabular-nums">{task.total}</dd>
    </dl>
  </details>;
}

function TaskFooter({ task, onView }: { task: GenerationTask; onView: (task: GenerationTask) => void }) {
  const { t } = useTranslation(), active = isGenerationTaskActive(task);
  // 音频生成不使用“第几张图片”描述；其余模式继续保持原来的批次进度。
  // 真实状态来自队列，不能仅凭类型将 failed 或 saving 误写成生成中。
  // 音频专用词条仅替换 generating 分支，终态仍复用已有状态翻译。
  const label = task.status === 'generating' && task.mediaKind === 'audio' ? t('create.audio.generating') : task.status === "generating" ? t("create.generationTasks.generatingImage", { number: Math.min(task.completed + 1, task.total) }) : t(`create.generationTasks.status.${task.status}`);
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
      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-[1.6] wrap-anywhere" title={task.prompt}>{task.prompt || t("create.generationTasks.noPrompt")}</p>
      {/* 音频摘要标注媒介名称，图片继续显示真实像素规格。 */}
      {/* 这个分支不改变模型名，便于用户分辨 MiniMax 音频与图片任务。 */}
      {/* 每项摘要读取提交快照，后续切换页面或修改模型不反向更新卡片。 */}
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground"><span title={task.model} className="max-w-full truncate">{model}</span><span className="shrink-0 tabular-nums">{task.mediaKind === 'audio' ? t('create.audio.media') : `${task.width} × ${task.height}`}</span></div>
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
    <div className="min-w-0"><TaskIdentity task={task} /><p className="mt-1 truncate text-[13px]" title={task.prompt}>{task.prompt || t("create.generationTasks.noPrompt")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("create.generationTasks.queuePosition", { position })}</p>
    </div>
    <button type="button" data-generation-cancel={task.id} onClick={() => stopGenerationTask(task.id)} className={TASK_ACTION_CLASS}>{t("create.generationTasks.cancelQueued")}</button>
  </li>;
}
