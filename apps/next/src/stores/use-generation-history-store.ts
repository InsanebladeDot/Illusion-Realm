"use client";

/**
 * 生成账本复用用户文档分段存储；任务卡清理不会删除统计。
 * 像把收据放进同一本账：先恢复旧页，再写新收据，不能用空本盖住旧历史。
 * 对应到 persist，启动统一水合，极早结束的任务也先等水合再写入。
 * 写盘失败会提示用户；生成图片已经完成，不把统计保存失败说成生成失败。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GenerationRecordSchema, type GenerationHistory, type GenerationRecord } from "@/schemas/generation-history.schema";
import type { GenerationTask } from "./useGenerationTaskStore";
import { normalizeGenerationHistory } from "@/utils/generation-statistics";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import { useToastStore } from "@/stores/useToastStore";
import { t } from "@/i18n";

// data 是唯一落盘字段，方法和短暂的保存状态不进入用户 JSON。
// record 以任务 ID 覆盖，重复到达的终态不能增加尝试次数。
// 记录数组保留完整历史，七天/三十天只是查询范围，不是删除策略。
// partialize 防止 Zustand action 被当作普通文档字段导出。
/**
 * 状态分层的约定：
 * 任务卡的 prompt、预览 URL 和进度保留在原来的内存 store。
 * 这里的 data 只承担历史事实，不能保存正在执行的闭包或 AbortController。
 * 图片任务离开页面仍由公共队列执行，所以历史不能挂在页面局部 state。
 * Zustand action 不序列化，重新启动后采用当前版本实现。
 * record 的输入必须是一张终态小票，不能拿模型安装清单调用这个入口。
 * 同 ID 覆盖只用于幂等，不提供用户批量编辑历史数字的界面。
 */
interface GenerationHistoryState {
  data: GenerationHistory;
  record: (record: GenerationRecord) => void;
}

// 老文档缺段时由 normalize 恢复独立空数组，不复用可变全局默认值。
// schema 验证阻止负图片数量、错误状态和倒置时间进入统计面板。
// 水合只替换账本数据，不覆盖 store 中的函数实现。
// skipHydration 服从 AppShell 的用户文档加载顺序，不另读一份磁盘文档。
/**
 * 持久化的约定：
 * 复用 createUserDataSectionPersistStorage，保存时合并主文档的一个段。
 * 不建立第二个 localStorage key 来存真实用户统计。
 * 浏览器兼容模式依旧由公共文档层处理，不在此判断 Electron 环境。
 * 主进程原有 JSON 读写和可选数据目录保持不变。
 * 水合由 AppShell 排在主文档 prime 之后，避免从默认目录多读一份。
 * merge 使用 normalize，把动态 JSON 缩窄为当前版本能解释的形状。
 * 缺段时为空不代表已经清除磁盘记录，只有后续写入才修改文档。
 * partialize 只返回 data，toast、错误处理函数和运行时依赖都不会写盘。
 * 新增小票只验证自身，较长历史不必每次重新做所有 schema 检查。
 * 记录不会采用队列的四十条保留上限，以免长期统计随 UI 清理丢失。
 */
export const useGenerationHistoryStore = create<GenerationHistoryState>()(persist<GenerationHistoryState, [], [], GenerationHistory>((set) => ({
  data: { version: 1, records: [] },
  // 新小票单独验证，不能每次生成后把全部旧历史重新做一遍 schema 校验。
  // 先检查再替换同 ID 的记录，非法更新不能挤掉原来有效的小票。
  // 身份去重仍以任务 ID 为准，同一秒生成两张不同任务不会合并。
  record: record => {
    const parsed = GenerationRecordSchema.safeParse(record);
    if (parsed.success) set(({ data }) => ({ data: { version: 1, records: [...data.records.filter(entry => entry.id !== record.id), parsed.data] } }));
  },
}), {
  name: "illusion-realm-generation-history",
  storage: createUserDataSectionPersistStorage<GenerationHistory>("generationHistory"),
  partialize: state => state.data,
  merge: (saved, current) => ({ ...current, data: normalizeGenerationHistory(saved) }),
  skipHydration: true,
}));

// 只由终态写入；队列状态和卡片预览仍由原任务 store 管理。
// 图片与音频共用调度器，但本次私密统计明确只统计图片。
// LoRA 快照来自实际图，旧任务缺少快照时不猜测已用模型。
// savedPaths 只用于数实际落盘张数，路径本身不写进账本。
// 失败任务保留零张结果，成功率仍能正确反映节点报错。
// finishedAt 缺失意味着未经过完整终态边界，不能编造完成时间。
// 等待水合后再写入，避免刚启动的失败任务覆盖过去几天的记录。
// 立即 flush 缩短应用正常退出前的保存窗口，不依赖三百毫秒节流。
// 异常在这里被消费，不把未处理的 Promise 泄漏给调用方。
// 错误提示不输出提示词、模型路径或用户文档内容。
/**
 * 终态落盘的约定：
 * 图片类型省略代表原有图片任务，兼容此前调用方。
 * mediaKind 为 audio 时立即结束，不能把声音文件当作一张图。
 * 未到终态的 task 不具有 finishedAt，此时不应生成历史小票。
 * 模型准备失败仍会有 startedAt 和 failed，因此可以计入失败分母。
 * 排队撤回没有 startedAt，但仍保留 cancelled 供区分停止原因。
 * 用户停止是否计入指标由纯汇总器统一决定，不在各界面分别猜测。
 * 只用 savedPaths 的长度，避免把用户目录原文写入私密统计。
 * models 是加载器身份快照，不是重新查询磁盘得到的当前安装状态。
 * 持久化前等待旧账本水合，极早结束的任务也不会覆盖历史。
 * 公共 storage 在微任务中合并段数据，flush 需要等待这一合并边界。
 * flush 成功只说明账本保存，不改变已经确定的生成状态。
 * flush 失败会保留内存数据，toast 解释统计保存故障。
 * 失败不会撤销已经保存的图片，也不会把卡片改成 ComfyUI 执行失败。
 * 调用方不需要再接一层 catch，避免同一个问题显示两次错误。
 * 提示不包含原始异常路径，防止把用户文件位置写进日志或分享截图。
 */
export async function recordGenerationTask(task: GenerationTask): Promise<void> {
  if (task.mediaKind === "audio" || task.finishedAt === undefined || !["completed", "failed", "cancelled"].includes(task.status)) return;
  try {
    if (!useGenerationHistoryStore.persist.hasHydrated()) await useGenerationHistoryStore.persist.rehydrate();
    useGenerationHistoryStore.getState().record({
      id: task.id, status: task.status as GenerationRecord["status"],
      createdAt: task.createdAt, startedAt: task.startedAt ?? null, finishedAt: task.finishedAt,
      images: task.savedPaths.length, models: task.models ?? [],
    });
    await flushUserDataSave();
  } catch {
    useToastStore.getState().show(t("profile.ui.historySaveFailed"));
  }
}
