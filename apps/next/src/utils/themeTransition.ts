/**
 * 主题切换的**波纹换肤**：以点击点为圆心，新配色按圆形 clip-path 向外扩散（View Transitions API）。
 *
 * ## 为什么要等两件异步的事
 * `startViewTransition(callback)` 的时序是：先给旧状态拍快照，跑 callback，再拍新状态快照。
 * 所以 callback 返回时新配色必须已经上屏，否则新快照还是旧配色、波纹扩到最后「什么都没变」。
 * 而本项目里配色生效经过两跳：
 *   1. React 状态提交（store → AppShell 的订阅 → applyThemeSignals 写 data-theme）；
 *   2. 主进程 nativeTheme.themeSource 经 IPC 回到渲染进程，prefers-color-scheme 才翻。
 * 因此 callback 里应用主题后要 await waitForAppliedTheme(...)（等到信号与媒体查询一致），
 * 再让出两帧给 React 提交与样式重算。少了任何一步，动画都会「看起来没生效」。
 *
 * ## 什么时候不做动画
 * - 运行时没有 startViewTransition（老 Chromium / 非 Electron 环境）；
 * - 用户要求减少动效（prefers-reduced-motion: reduce）。
 * 两种都走 apply() 直接切 —— 动效是锦上添花，绝不能成为切换主题的前提。
 *
 * 波纹的样式（keyframes / clip-path）在 app/globals.css，且只在 .theme-ripple 下生效。
 */
import { waitForAppliedTheme } from "@/utils/themeSignals";
import type { ThemePreference } from "@/utils/themeResolution";

export interface RippleOrigin {
  x: number;
  y: number;
}

export interface RippleGeometry extends RippleOrigin {
  radius: number;
}

/**
 * 圆形波的最大半径 = 圆心到最远角的距离（+8px 抹掉边缘抗锯齿的白缝）。
 *
 * 缺省圆心是左下角 (0, height)：主题入口就在侧边栏左下角，
 * 即使拿不到按钮位置，波纹方向也不会跑偏。
 */
export function computeRippleGeometry(
  origin: RippleOrigin | null,
  width: number,
  height: number
): RippleGeometry {
  const x = origin?.x ?? 0;
  const y = origin?.y ?? height;
  const radius =
    Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 8;
  return { x, y, radius };
}

/** 当前环境能不能放这个动效 */
export function canAnimateThemeRipple(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }
  if (typeof document.startViewTransition !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 动画结束（含被跳过）后把类与 CSS 变量摘掉，别留在 DOM 上干扰下一次 */
function clearRippleStyles(root: HTMLElement): void {
  root.classList.remove("theme-ripple");
  root.style.removeProperty("--theme-ripple-x");
  root.style.removeProperty("--theme-ripple-y");
  root.style.removeProperty("--theme-ripple-radius");
}

/** 计时器拍：**不用 rAF**，理由见下面那段注释 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 给任意等待加上上限：宁可少等一拍，也不能让主题切换卡住 */
function withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
  return Promise.race([task, delay(timeoutMs)]);
}

/**
 * 从 origin 扩散到新主题。
 *
 * @param preference 目标主题偏好（用来等它真的生效）
 * @param origin     圆心（通常是主题按钮的中心）；null = 左下角
 * @param apply      只负责改状态（写 store + 关弹框），落色由 AppShell 的订阅完成
 */
export function startThemeRippleTransition({
  preference,
  origin,
  apply,
}: {
  preference: ThemePreference;
  origin: RippleOrigin | null;
  apply: () => void;
}): void {
  if (!canAnimateThemeRipple()) {
    apply();
    return;
  }

  const root = document.documentElement;
  const { x, y, radius } = computeRippleGeometry(
    origin,
    window.innerWidth,
    window.innerHeight
  );
  root.style.setProperty("--theme-ripple-x", `${x}px`);
  root.style.setProperty("--theme-ripple-y", `${y}px`);
  root.style.setProperty("--theme-ripple-radius", `${radius}px`);
  root.classList.add("theme-ripple");

  const transition = document.startViewTransition(async () => {
    apply();
    /**
     * 这里**刻意不用 requestAnimationFrame 当日节拍**。
     *
     * 本仓库的已知前提：窗口被遮挡 / 最小化时渲染生命周期停摆，rAF 回调**永远不来**
     * （见 AGENTS.md「窗口被遮挡 = 渲染生命周期停摆」，以及 smoke-harness 里同一句话）。
     * 用它等 React 提交，等于把「换个主题」押在窗口可见性上 —— 实测后果是整页卡在旧快照上：
     * 回调不 resolve → view transition 永远不完成 → 新旧配色都不显示。
     *
     * 计时器拍（setTimeout 宏任务）不受可见性影响：两拍足够让 React 提交与样式重算落地。
     */
    await withTimeout(waitForAppliedTheme(preference), 500);
    await delay(0);
    await delay(32);
  });

  /**
   * 兜底清理：`finished` 正常会 settle，但若动画因环境原因没能开始，
   * 它可能一直挂着 —— 那就由看门狗把类与变量摘掉（视觉上等价于「这次没放动画」）。
   */
  const watchdog = setTimeout(() => clearRippleStyles(root), 1500);
  void transition.finished
    .finally(() => {
      clearTimeout(watchdog);
      clearRippleStyles(root);
    })
    .catch(() => null);
}
