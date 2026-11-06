"use client";

/** Non-secret assistant preferences use the existing user document; load once and preserve custom instructions. */
import { create } from "zustand";
import type { PromptAssistantPreferences } from "@illusion-realm/shared";
import { PROMPT_DEFAULTS } from "@/utils/prompt-assistant";
import { createUserDataSectionPersistStorage, flushUserDataSave } from "@/utils/userDataStorage";
import { normalizeTranslationHistory } from "@/utils/prompt-translation-history";
// 函数式更新在轮到写盘时才读当前值，多个输入框同时完成也不会丢掉彼此历史。
// 普通配置仍可传原来的对象补丁，已有预设、连接菜单无需改变调用契约。
type AssistantPatch = Partial<PromptAssistantPreferences> | ((current: PromptAssistantPreferences) => Partial<PromptAssistantPreferences>);
interface AssistantState { preferences: PromptAssistantPreferences; ready: boolean; load: () => Promise<void>; save: (patch: AssistantPatch) => Promise<void> }
const storage = createUserDataSectionPersistStorage<PromptAssistantPreferences>("promptAssistant");
let loading: Promise<void> | null = null;
// 像单列排队盖章，前一笔提交结束后下一笔才读取与合并偏好。
// 一笔失败不能堵死整条队列，失败仍返回给该次调用者显示提示。
// 排队只保护本段偏好，不另建全局持久化机制或第二份用户文档。
let saving: Promise<void> = Promise.resolve();
// 队列接收一个尚未执行的提交函数，不能先计算 preferences 再放进队列。
// 否则 A、B 都读到空历史，哪怕串行写盘，B 仍会用旧快照覆盖 A。
// 当前做法使 B 真正执行时才读取包含 A 的完整偏好。
// 调用者拿到的是 task，仍能捕捉本次写盘错误并给出明确提示。
// saving 则接住同一个错误，只用于让后续任务继续，不替代调用者的失败反馈。
// 排队不是自动重试：失败提交不会再次调用服务或产生第二次翻译。
// 每次写盘仍通过原 userDataStorage 合并应用其余段落。
// 不把整个用户文档锁住，图库排序与其他 store 沿用自己的提交边界。
// 队列没有后台定时器，页面关闭时也不留下定时轮询去扫描记录。
// 这里不缓存 API 响应字节，只短暂持有等待提交的偏好补丁。
// history 追加与连接修改共享队列，避免设置页刚保存的站点被旧转换回包倒退。
// 回包记录只补 history，不重新提交发送时整个 preferences 快照。
// 例如发送时选择 GLM、等待时改为 Euzhi，历史记录仍标 GLM，而当前选择保持 Euzhi。
// 函数补丁只用于读取最新本地值，不传过 IPC，也不保存到 JSON。
// 普通对象补丁仍表示明确更新该字段，未提到的字段一律从最新偏好继承。
// 这不是通用任务队列，用户无须操作“开始队列”才能看到翻译结果。
function enqueueSave(write: () => Promise<void>): Promise<void> {
  const task = saving.then(write);
  saving = task.catch(() => undefined);
  return task;
}
function normalize(value: Partial<PromptAssistantPreferences> | undefined): PromptAssistantPreferences {
  // 扩展允许集，防止重新进入创建页后把已选 Euzhi 悄悄恢复成 GLM。
  // 不接收自由站点 id；旧文档缺省和未知值仍回到原默认 GLM。
  // 仅保存供应商选择，Euzhi 模型和密钥继续由 Agent 现有能力管理。
  return { ...PROMPT_DEFAULTS, provider: value?.provider === "euzhi" ? "euzhi" : value?.provider === "custom" ? "custom" : "glm",
    baseUrl: typeof value?.baseUrl === "string" ? value.baseUrl : PROMPT_DEFAULTS.baseUrl,
    model: typeof value?.model === "string" ? value.model : PROMPT_DEFAULTS.model,
    customModel: typeof value?.customModel === "string" ? value.customModel : "",
    presetId: typeof value?.presetId === "string" ? value.presetId : "translate",
    presets: Array.isArray(value?.presets) ? value.presets.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.instruction === "string").slice(0, 50) : [],
    // 旧文档缺省为空；损坏单项不会妨碍其他偏好和历史正常加载。
    // 归一化只处理本地记录，不根据当前供应商筛掉过去的转换。
    history: normalizeTranslationHistory(value?.history) };
}
export const usePromptAssistantStore = create<AssistantState>((set, get) => ({
  preferences: PROMPT_DEFAULTS, ready: false,
  load: () => {
    if (!loading) loading = (async () => { try { const value = await storage.getItem("promptAssistant"); set({ preferences: normalize(value?.state), ready: true }); } catch (error) { loading = null; throw error; } })();
    return loading;
  },
  // 历史追加与普通设置共用同一提交边界，防止两类写入相互覆盖。
  // 直到落盘成功才发布新偏好，失败继续沿用原来的回滚与异常反馈。
  // load 和 save 使用不同 Promise，提交等待首次读取不会等待自身而形成死锁。
  // ready 为 false 时先完成读取，避免把默认空历史覆盖到已有文档。
  // normalize 同时用于读取和写入，追加第 101 项时立即淘汰最早一项。
  // previous 直到本次成功前保持不变，用于写盘失败后的缓存恢复。
  // 失败回滚的对象也是本次排队开始时的最新值，不能退回应用启动快照。
  // 后续任务排在回滚之后，读取到的不是半写入的失败历史。
  // 原保存机制的磁盘异常继续由调用者处理，本队列不会伪造落盘成功。
  // 即使错误被历史调用处降级为提示，已成功返回的译文仍可以应用或复制。
  save: patch => enqueueSave(async () => {
    if (!get().ready) await get().load();
    const previous = get().preferences; const preferences = normalize({ ...previous, ...(typeof patch === "function" ? patch(previous) : patch) });
    try { await storage.setItem("promptAssistant", { state: preferences }); await flushUserDataSave(); set({ preferences }); }
    catch (error) { await storage.setItem("promptAssistant", { state: previous }); throw error; }
  }),
}));
