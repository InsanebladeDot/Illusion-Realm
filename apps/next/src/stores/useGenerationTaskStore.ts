"use client";

/** 图片生成任务列表：记录每次提交的快照和独立状态，不随创建页卸载而清空。 */
import { create } from "zustand";
// 共用终态入口记账，普通生成和编辑不分别维护统计分支。
// 只导入模型类型，不把工作流节点或图像字节放入卡片状态。
import type { GenerationModel } from "@/schemas/generation-history.schema";
import { recordGenerationTask } from "./use-generation-history-store";

export type GenerationTaskStatus = "queued" | "generating" | "saving" | "cancelling" | "cancelled" | "completed" | "failed";
export interface GenerationTask {
  // 省略表示历史图片任务，避免改变所有已有图片和编辑调用方。
  // 音频卡片不将播放地址当成图片缩略图，也不展示 32×32 的内部画布尺寸。
  // 这里只描述结果媒介，取消、失败和完成仍使用同一任务状态机。
  mediaKind?: 'image' | 'audio';
  id: string;
  status: GenerationTaskStatus;
  prompt: string;
  model: string;
  width: number;
  height: number;
  total: number;
  completed: number;
  createdAt: number;
  // 入队时间保留原字段，开始时间只在首次实际执行时补齐。
  // 终态时间固定，展开卡片或切换页面不能让历史耗时继续增加。
  // 老内存夹具没有这些值时展示未知，不按提交时间推算生成耗时。
  startedAt?: number;
  finishedAt?: number;
  // 由已解析工作流填入；只有对应结果真正保存后才计使用次数。
  // LoRA 为零权重时在提取阶段排除，VAE/CLIP 同样不进入此快照。
  models?: GenerationModel[];
  previewUrl: string | null;
  // 临时预览与保存文件共用这份身份，图库据此合并成一项。
  // 路径由实际保存结果提供，不能根据 ComfyUI 的原文件名拼接。
  // 可选字段兼容尚无预览的排队任务和旧的内存快照。
  previewFilePath?: string | null;
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
  return !["completed", "failed", "cancelled"].includes(task.status);
}
// 时钟只在状态边界读取，不在组件渲染或每个进度事件中重复重置。
// 第一张保存后还可能继续生成下一张，因此 saving 不代表终态。
// completed/failed/cancelled 的第一次到达才封口，后续补字段保持原时间。
// 主动取消与异常失败沿用队列真实状态，不靠 error 字符串猜原因。
// recordGenerationTask 消费自身保存错误，不让统计故障阻断生成队列。
// 这里先生成新快照再记账，记录能包含同次 patch 带来的保存文件。
/**
 * 任务时钟的状态边界：
 * queued 只代表等待，创建任务时不能同时登记实际开始时间。
 * generating 是执行器开始准备任务后的状态，首次进入时确定 startedAt。
 * saving 也属于执行阶段，兼容执行器直接进入保存的更新路径。
 * 同一批次可能在 generating 与 saving 之间多次往返，开始时间只设一次。
 * cancelling 是请求停止中的活动状态，仍占用执行槽，不提前登记 finishedAt。
 * 只有 completed、failed、cancelled 这三个终态才能封口。
 * 终态来自执行器或公共取消分支，组件不会通过卸载来制造停止事件。
 * 同一次 patch 可能同时带 savedPaths 与 completed，先合并再生成小票。
 * 因此账本能够看到刚保存的最后一张，而不是前一轮的张数。
 * 重复终态更新可以补展示字段，但不会再产生第二张小票。
 * 旧终态卡片如果缺少时间，不依据今天的日期补造过去的耗时。
 * 模型快照带主要模型时，同步替换卡片上提交时的短显示名。
 * 快照里只有 LoRA 时不会将 LoRA 错当成主模型标题。
 * Date.now 用于和现有 createdAt 保持同一时间单位。
 * 系统时间向后调整时将时间夹到起点，防止出现负耗时。
 * 该夹取只保护时间顺序，不声称抵消了系统时钟跳变造成的测量误差。
 * 记录是异步副作用，函数立即返回新任务供卡片显示。
 * 记录方法自行处理保存失败，生成 Promise 的成功与失败仍归执行器决定。
 */
function patchTask(task: GenerationTask, patch: Partial<GenerationTask>): GenerationTask {
  const next = { ...task, ...patch };
  // 解析后的加载器名称也同步到卡片，避免表单短别名与统计身份不一致。
  // 音频没有图片模型快照时保持原名，不拿 VAE 或 LoRA 替代主模型标题。
  if (patch.models) next.model = patch.models.find(model => model.role === "main")?.name ?? next.model;
  // 系统时间被向后调整时起止仍保持有序，避免出现负耗时破坏账本格式。
  // 缺失用 undefined 判断，数值零本身仍是合法时间戳。
  if (next.startedAt === undefined && ["generating", "saving"].includes(next.status)) next.startedAt = Math.max(Date.now(), next.createdAt);
  if (isGenerationTaskActive(task) && !isGenerationTaskActive(next)) {
    next.finishedAt = Math.max(Date.now(), next.startedAt ?? next.createdAt);
    void recordGenerationTask(next);
  }
  return next;
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
    // 相同 patch 不重开时钟；不同任务继续各用自己的起止快照。
    // 记录只在首次进入终态时发出，避免重复状态更新造成双倍统计。
    tasks: state.tasks.map((task) => task.id === id ? patchTask(task, patch) : task),
  })),
}));
