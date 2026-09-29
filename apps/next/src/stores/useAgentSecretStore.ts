"use client";

/**
 * Agent 密钥的**状态**（注意：只有状态，没有密钥本身）。
 *
 * 密钥原值在主进程侧（`apps/electron/agent/secret.js`，safeStorage 加密落盘），
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
  refresh: () => Promise<AgentSecretStatus>;
  save: (apiKey: string) => Promise<AgentSecretStatus>;
  clear: () => Promise<AgentSecretStatus>;
  /** 用户按了发送但没 key 时调用（Agent 页据此显示提示） */
  flagMissing: () => void;
  /** 走通一次发送 / 配置完成后清掉提示 */
  dismissNotice: () => void;
};

export const useAgentSecretStore = create<AgentSecretState>((set) => ({
  status: UNCONFIGURED,
  loaded: false,
  missingNotice: false,

  refresh: async () => {
    const status = await getAgentSecretStatus();
    set((state) => ({
      status,
      loaded: true,
      // 一配置好就把提示收掉：用户已经照做了，别再杵在屏幕上
      missingNotice: status.configured ? false : state.missingNotice,
    }));
    return status;
  },

  save: async (apiKey) => {
    const status = await setAgentSecret(apiKey);
    set({ status, loaded: true, missingNotice: status.configured ? false : true });
    return status;
  },

  clear: async () => {
    const status = await clearAgentSecret();
    set({ status, loaded: true });
    return status;
  },

  flagMissing: () => set({ missingNotice: true }),
  dismissNotice: () => set({ missingNotice: false }),
}));
