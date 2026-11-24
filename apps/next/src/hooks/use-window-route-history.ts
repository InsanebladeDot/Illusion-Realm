"use client";
/** 只消费原生历史信号；Next 继续处理页面、滚动恢复和内部路由状态。 */
import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { subscribeWindowHistory, windowHistorySnapshot, windowHistoryTarget } from "@/utils/window-route-history";
import { runPageStyleTransition } from "@/utils/pageTransition";

const emptyHistory = () => 0;

export function useWindowRouteHistory() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeWindowHistory, windowHistorySnapshot, emptyHistory);
  const go = (direction: -1 | 1) => {
    const href = windowHistoryTarget(direction);
    if (!href) return;
    runPageStyleTransition({
      direction: direction < 0 ? "backward" : "forward",
      apply: () => { if (direction < 0) router.back(); else router.forward(); },
      isSettled: () => location.pathname + location.search + location.hash === href,
    });
  };
  return { canGoBack: Boolean(snapshot & 1), canGoForward: Boolean(snapshot & 2), go };
}
