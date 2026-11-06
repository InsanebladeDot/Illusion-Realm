"use client";

/**
 * Agent 密钥的**状态**（注意：只有状态，没有密钥本身）。
 *
 * 密钥原值在主进程侧（`apps/electron/src/main/modules/agent/secret.js`，safeStorage 加密落盘），
 * 渲染层能拿到的只有 `AgentSecretStatus`：有没有 / 从哪来（设置页 or `.env`）/
 * 怎么存的（safeStorage or 明文兜底）/ 尾 4 位。见 `packages/shared/src/types/agent.ts`。
 *
 * 怎么用：
 * - 设置页「Agent」区块：`refresh()` 读初始状态，`save(key)` 保存，`clear()` 清除；
 *   返回的都是**新的状态**（成功即生效，不需要再 refresh 一次）。
 * - Agent 页：`refresh()` 之后看 `status.configured`；用户没配就拦在发送前，
 *   并把 `missingNotice` 置 true 让输入框上方出现「去设置里填写」的提示。
 *
 * 传什么 / 拿到什么：
 * - `save(apiKey)`：明文只经过这一次调用（IPC 到主进程后立刻加密落盘），
 *   失败**抛错**（调用方要显示出来），成功返回新状态；
 * - `clear()`：返回新状态，失败按"没配"处理；
 * - `refresh()`：读一次主进程状态（挂载时 / 保存后 / 清除后各调一次就够）。
 *
 * 持久化：不落盘 —— 真正的密钥由主进程存，这里只是它的一份**只读投影**。
 */
import { create } from "zustand";
import type { AgentSecretStatus } from "@illusion-realm/shared";
// 状态可按服务商查询，但原密钥始终只在主进程存储和注入。
// 新选择仅用于默认请求参数，运行路径会显式传入启动时的站点。
// 这样旧的挂载调用仍可工作，异步保存不会串写另一个站点。
import type { AgentProvider } from '@illusion-realm/shared';
import { useAgentProviderStore } from '@/stores/use-agent-provider-store';
// 单调序号防止先前站点的迟到状态覆盖当前站点。
// 返回值仍交给发起方使用；只限制共享状态的发布顺序。
// 密钥成功配置后清除 notice 的行为继续保留。
let statusRequest = 0;
// 这个序号只管理 renderer 的状态投影，不改变主进程实际凭据文件。
// 保存原站点时用户切到新站点，旧保存仍完成，但回执不能覆盖新站点状态。
// refresh 每次返回自己的状态，因此发送前检查不依赖最后一个全局回执。
// 共享 status 不当作跨站缓存使用，不会因为 A 已配置就允许 B 发请求。
// missingNotice 表示用户按过发送，切换时由最新状态决定是否还需提示。
// read 失败回未配置不会清除主进程密钥，只是提醒用户当前未能确认状态。
// loaded=false 阶段不展示另一站尾号，避免用户误判正在编辑的凭据来源。
// save 的原值参数不会进入任何 set 对象，Zustand 订阅者拿不到 key。
// clear 不负责服务商令牌撤销，文件删除和服务商账户管理保持不同职责。
// 自动刷新目录不使用此状态的尾号生成认证头，真正 key 仍由 main 解析。
// API Key 设置成功不是模型请求成功，状态字段不能被解释为模型服务可用。
import {
  clearAgentSecret,
  getAgentSecretStatus,
  setAgentSecret,
} from "@/utils/electronBridge";

/** 未读到状态时的初值：与"没配置"同一条提示路径，不引入第三种状态 */
const UNCONFIGURED: AgentSecretStatus = {
  configured: false,
  source: "none",
  protection: "",
  tail: "",
};

type AgentSecretState = {
  status: AgentSecretStatus;
  /** 状态是否已经从主进程读过一次（没读过就别急着提示"未配置"） */
  loaded: boolean;
  /** Agent 页用：用户在有 key 之前按了发送，需要提示去设置里填 */
  missingNotice: boolean;
  // optional 仅为旧调用兼容，默认取当前已加载的服务商。
  // 发送和保存都显式传 provider，避免 await 后读到变化的选择。
  // 这些方法只返回状态，不返回 API Key。
  // 同站或跨站并发通过序号拒绝过期结果，不能显示另一个站点已配置。
  // 明文只存在保存参数，不进入 Zustand 状态。
  // loaded 仅代表最后发布的状态已读，不替代发送前的重新检查。
  // API 失败仍沿用现有读回退和写抛错策略。
  refresh: (provider?: AgentProvider) => Promise<AgentSecretStatus>;
  save: (apiKey: string, provider?: AgentProvider) => Promise<AgentSecretStatus>;
  clear: (provider?: AgentProvider) => Promise<AgentSecretStatus>;
  /** 用户按了发送但没 key 时调用（Agent 页据此显示提示） */
  flagMissing: () => void;
  /** 走通一次发送 / 配置完成后清掉提示 */
  dismissNotice: () => void;
};

export const useAgentSecretStore = create<AgentSecretState>((set) => ({
  status: UNCONFIGURED,
  loaded: false,
  missingNotice: false,

  // 共享状态只接收最新请求，切换站点后旧状态不能把未配置改为已配置。
  // 发起方仍能拿到自己查询的状态，用于独立发送前检查。
  // 这里不根据 busy 阻断查询，避免用户刚保存密钥却仍被旧值拦下。
  // 未加载偏好的旧挂载调用稍后会由当前站点 effect 再查询。
  // 无密钥仅显示 notice，不会自动访问另一个站点。
  // 返回 status 的来源和尾号与主进程保持一致。
  refresh: async (provider = useAgentProviderStore.getState().preferences.provider) => {
    const request = ++statusRequest;
    // 立即清掉上一站可见摘要，加载过程中不短暂显示错误尾号或配置成功。
    // 读取 IPC 异常按未配置处理，页面后续可以再次刷新，不传播未处理拒绝。
    // 返回值仍由请求方自己检查，序号只限制共享 UI 的发布。
    set({ status: UNCONFIGURED, loaded: false });
    const status = await getAgentSecretStatus(provider).catch(() => UNCONFIGURED);
    if (request === statusRequest) set((state) => ({
      status,
      loaded: true,
      // 一配置好就把提示收掉：用户已经照做了，别再杵在屏幕上
      missingNotice: status.configured ? false : state.missingNotice,
    }));
    return status;
  },

  // 捕获 provider 和序号后再 await，绝不在保存完成时重新挑站点。
  // 表单会在成功时清空原文，这里也不把原文写进状态。
  // 失败不发布配置成功，调用方负责可见错误提示。
  // 共享状态只有最新请求能更新，另一站查询不被旧保存回执覆盖。
  // 主进程仍会独立校验 provider 允许集。
  // 保存仅影响后续任务，正在运行的 stdin 配置已经固定。
  save: async (apiKey, provider = useAgentProviderStore.getState().preferences.provider) => {
    const request = ++statusRequest;
    const status = await setAgentSecret(apiKey, provider);
    if (request === statusRequest) set({ status, loaded: true, missingNotice: status.configured ? false : true });
    return status;
  },

  // 清除只针对传入站点，不先清另一个站点再复制状态。
  // 迟到结果仍通过序号过滤，返回值保留给发起的设置表单。
  // 主进程环境变量优先级不变，有环境密钥时状态会继续为 env。
  // 不自动撤销服务商令牌，也不清除聊天历史或生成资源。
  // 状态读取接口不返回原文，所以清除不会暴露旧值。
  // 默认参数只服务兼容调用，新表单始终明确服务商。
  clear: async (provider = useAgentProviderStore.getState().preferences.provider) => {
    const request = ++statusRequest;
    const status = await clearAgentSecret(provider);
    if (request === statusRequest) set({ status, loaded: true });
    return status;
  },

  flagMissing: () => set({ missingNotice: true }),
  dismissNotice: () => set({ missingNotice: false }),
}));
