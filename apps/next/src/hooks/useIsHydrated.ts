"use client";

import { useSyncExternalStore } from "react";

/**
 * 订阅永不触发（客户端不存在"变为 hydrated"的外部事件源，
 * React 会在 hydration 完成后自动用 getSnapshot 重新取值）。
 */
function subscribe(): () => void {
  return () => {};
}

/** 客户端快照：hydration 完成后恒为 true */
function getSnapshot(): boolean {
  return true;
}

/** 服务端 / hydration 阶段快照：恒为 false，保证两端首帧一致 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * 是否已完成 hydration（服务端与客户端首帧为 false，之后客户端为 true）。
 *
 * 用途：渲染依赖浏览器能力（window、localStorage、Electron 桥）的内容时，
 * 避免 SSR/首屏 hydration 不一致。
 *
 * 用 useSyncExternalStore 而非 `useEffect(() => setMounted(true), [])`：
 * 后者在 effect 里同步 setState 会触发级联渲染（react-hooks/set-state-in-effect），
 * 而本实现不产生额外渲染，语义完全等价。
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
