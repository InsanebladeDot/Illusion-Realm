"use client";

/**
 * 「二创」的交接通道：把「本地解析」算出来的表单补丁递给创建页。
 *
 * 怎么用：发方 `useCreateRemixStore.getState().queueRemix(payload)`；
 * 收方（创建页）订阅 `remixRequestId`，**id 变化**即表示来了新请求，再读 `payload` 应用。
 * 传什么 / 拿到什么：`queueRemix(payload: RemixApplyResult)`（补丁 + 提示文案，
 * 形状见 `utils/remixFromMeta`）；`clearRemix()` 消费完清掉；`payload` 为 null = 没有待处理请求。
 * 持久化：不落盘 —— 跨页一次性交接，刷新即失效（这正是想要的）。
 */
import { create } from "zustand";
import type { RemixApplyResult } from "@/utils/remixFromMeta";

type CreateRemixState = {
  remixRequestId: number;
  payload: RemixApplyResult | null;
  queueRemix: (payload: RemixApplyResult) => void;
  clearRemix: () => void;
};

export const useCreateRemixStore = create<CreateRemixState>((set, get) => ({
  remixRequestId: 0,
  payload: null,
  queueRemix: (payload) =>
    set({
      payload,
      remixRequestId: get().remixRequestId + 1,
    }),
  clearRemix: () => set({ payload: null }),
}));
