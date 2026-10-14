"use client";

/** Reserve caption space before rendering; mirror native/DOM fullscreen changes through one shared signal. */
let nativeVisible = true;
const listeners = new Set<() => void>();
export function hasWindowChrome(): boolean {
  return typeof window !== "undefined" && window.electronAPI?.hasCustomTitleBar === true;
}
export function windowChromeVisible(): boolean {
  return hasWindowChrome() && nativeVisible && !document.fullscreenElement;
}
export function applyWindowChromeSignals(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.windowChrome = windowChromeVisible() ? "custom" : "native";
  for (const listener of listeners) listener();
}
export function subscribeWindowChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function subscribeWindowChromeSignals(): () => void {
  if (!hasWindowChrome()) return () => undefined;
  const unsubscribe = window.electronAPI?.onWindowChromeVisibility((visible) => { nativeVisible = visible; applyWindowChromeSignals(); });
  document.addEventListener("fullscreenchange", applyWindowChromeSignals);
  applyWindowChromeSignals();
  return () => { unsubscribe?.(); document.removeEventListener("fullscreenchange", applyWindowChromeSignals); };
}
