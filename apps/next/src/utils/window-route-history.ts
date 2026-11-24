/** 读取浏览器真实历史的位置和边界；像翻书只移动书签，不另抄一份页码栈。 */
interface HistoryEntry { url: string | null }
interface BrowserNavigation extends EventTarget {
  canGoBack: boolean;
  canGoForward: boolean;
  currentEntry: { index: number } | null;
  entries: () => HistoryEntry[];
}

function browserNavigation(): BrowserNavigation | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { navigation?: BrowserNavigation }).navigation;
}

/** 初始空白页或外部站点不作为应用内目标；没有记录时按钮保持禁用。 */
export function windowHistoryTarget(direction: -1 | 1): string | null {
  const navigation = browserNavigation();
  if (!navigation?.currentEntry || !(direction < 0 ? navigation.canGoBack : navigation.canGoForward)) return null;
  const entry = navigation.entries()[navigation.currentEntry.index + direction];
  if (!entry?.url) return null;
  try {
    const target = new URL(entry.url);
    if (target.protocol !== location.protocol || target.host !== location.host) return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}

export function windowHistorySnapshot(): number {
  return (windowHistoryTarget(-1) ? 1 : 0) | (windowHistoryTarget(1) ? 2 : 0);
}

/** currententrychange 同时覆盖 push、replace 和返回；监听随标题栏卸载清理。 */
export function subscribeWindowHistory(changed: () => void): () => void {
  const navigation = browserNavigation();
  let active = true, pending = false;
  // Next 在插入阶段写历史；像等翻页结束再报页码，延后通知并合并同轮事件。
  const notify = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; if (active) changed(); });
  };
  navigation?.addEventListener("currententrychange", notify);
  window.addEventListener("popstate", notify);
  return () => {
    // 已排队的微任务无法撤销，退订标记负责挡住旧组件的回调。
    active = false;
    navigation?.removeEventListener("currententrychange", notify);
    window.removeEventListener("popstate", notify);
  };
}
