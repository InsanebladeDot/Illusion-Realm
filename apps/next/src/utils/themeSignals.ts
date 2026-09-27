/**
 * 主题信号的**唯一写点**：`data-theme`（决议后的 `light` / `dark`）、`data-theme-preference`
 * （用户选的三态）、`color-scheme`，以及真正让界面变色那一步 —— 主进程的 `themeSource`。
 *
 * 为什么真正改 UI 的是最后那一步：本项目的深色 token 与全部 `dark:` 工具类都由
 * **`prefers-color-scheme`** 驱动，只在 `globals.css` 里定义一次。Electron 的
 * `nativeTheme.themeSource` 正是「应用级覆盖该媒体查询」的官方入口，于是 CSS 一个字节都不用改，
 * 也不存在「媒体查询一份、class 一份」两套色值漂移的可能。DOM 上的 `data-theme` 是**观测信号**：
 * 给冒烟断言与人排查用（和 locale 的 `data-locale` 同一个用意）。
 *
 * `data-theme` 取**决议后**的值（`system` 也落成实际的 light/dark），
 * 因为断言要问的是「现在到底是深还是浅」，而不是「用户选了什么」。
 */
import { applyNativeThemeSource } from "@/utils/electronBridge";
import type { ThemePreference } from "@/utils/themeResolution";

/** 读系统偏好（读为准；事件只做触发，见 AppShell 的 useMediaQuery 订阅） */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveAppliedTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function applyThemeSignals(preference: ThemePreference): ThemePreference {
  const resolved = resolveAppliedTheme(preference);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-preference", preference);
    root.style.colorScheme = resolved;
  }

  /**
   * 唯一一次跨进程写：失败只影响「应用内强制深/浅」，不影响任何业务动作，
   * 因此这里吞掉错误（`applyNativeThemeSource` 内部已按 IpcResult 兜底，返回 null）。
   */
  void applyNativeThemeSource(preference).catch(() => null);

  return preference;
}

/**
 * 等「信号 + 真正的媒体查询」都到位。
 *
 * 为什么要等：真正让界面变色的是主进程的 `nativeTheme.themeSource`，它走 IPC 回到渲染进程
 * 才反映到 `prefers-color-scheme` —— 也就是说点击之后存在**一帧级的不一致窗口**：
 * `data-theme` 已经是新值，而页面还是旧配色。做波纹换肤时如果不等它，
 * 新快照截到的仍是旧配色，波纹扩散到最后「什么也没变」，动画看起来像坏掉了。
 *
 * 纯轮询 + 有界（默认 400ms）：拿不到就放弃等待（动画照放，只是那一帧可能不新），
 * 绝不因为一次主题切换失败就卡住交互。
 */
export async function waitForAppliedTheme(
  preference: ThemePreference,
  timeoutMs = 400
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const expectedApplied =
    preference === "system" ? null : preference;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const applied = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const signalMatches =
      expectedApplied === null || applied === expectedApplied;
    if (signalMatches && prefersDark === (applied === "dark")) return;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}
