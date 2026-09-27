"use client";

import { useSyncExternalStore } from "react";
import { isElectronEnvironment } from "@/utils/electronBridge";

/** 环境在页面生命周期内不会变化，无需订阅 */
function subscribe(): () => void {
  return () => {};
}

/** 服务端与首帧恒为 false，避免 SSR 与 Electron 首屏 hydration 不一致 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * 是否运行在 Electron 桌面版。
 *
 * 用 useSyncExternalStore 而非 `useState + useEffect(() => setState(...))`：
 * 后者在 effect 内同步 setState 会触发级联渲染（react-hooks/set-state-in-effect）。
 * 服务端/首帧为 false、客户端首帧仍为 false（hydration 后才取真值），
 * 与原先的 hydration 语义完全一致。
 */
export function useIsElectronEnvironment(): boolean {
  return useSyncExternalStore(subscribe, isElectronEnvironment, getServerSnapshot);
}
