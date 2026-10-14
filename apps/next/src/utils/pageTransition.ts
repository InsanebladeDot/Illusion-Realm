/**
 * 页面切换动画：旧内容向右抽出 → 新内容从右移入（反向导航镜像到左侧）。
 *
 * 为什么必须用 View Transitions：想让旧页面「抽出去」，就得在它还存在的时候拍一张快照 ——
 * 而路由一切换，旧页面立刻被 React 卸载，纯 CSS 只能做「新内容入场」，做不出「旧的退场」。
 * startViewTransition(callback) 的时序正好是：拍旧快照 → 跑 callback（这里做路由跳转）→
 * 拍新快照，于是两侧都能动，且不用自己维护「退场中的旧页面」这份状态。
 *
 * 只动内容区、不动导航与顶栏：过渡期间为内容区 page-content、侧边栏 app-sidebar 和
 * 顶栏 window-titlebar 单独命名快照，导航与顶栏不播动画，顶栏组在所有页面快照之上。
 * 名字只在过渡期间挂上（靠 html.page-transition 类）：常驻的话，主题波纹那条
 * 「裁剪 root 新快照」的动画会把这些元素从 root 里摘出去，波纹就盖不到它们了。
 *
 * 不支持 View Transitions / 用户要求减少动效：直接跳，不留痕迹。
 */
import { MAIN_NAV_ITEMS } from "@/data/navigation";

export type PageDirection = "forward" | "backward";

/**
 * 「返回」时的方向政策。
 *
 *  · `mirror`（当前）：向前向右抽、返回向左抽 —— 卡片栈的镜像，返回时能一眼看出「往回走」；
 *  · `same`：两次都向右抽（返回也走同一套动作），如果你更想要「始终同向」的观感，把它改成 `same`。
 *
 * 留成一处开关而不是散在 CSS 里：方向是**产品口味**，改一行就该生效。
 */
const BACKWARD_POLICY: "mirror" | "same" = "mirror";

/** 导航顺序（顶部主导航的先后），用来判定「向前 / 向后」；拿不准的一律算向前 */
export function resolvePageDirection(fromPath: string, toPath: string): PageDirection {
  const indexOf = (path: string) =>
    MAIN_NAV_ITEMS.findIndex((item) => item.href === path);
  const from = indexOf(fromPath);
  const to = indexOf(toPath);
  if (from < 0 || to < 0 || to >= from) return "forward";
  return BACKWARD_POLICY === "same" ? "forward" : "backward";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function canAnimatePageTransition(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }
  if (typeof document.startViewTransition !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 用「和切页面同一套」的动画跑一次界面替换（View Transitions）。
 *
 * 抽象出来的原因：应用里除了路由跳转，还有两处**同性质的替换** ——
 * 创建表单 ↔ 已生成图片、图库 ↔ 图片详情。它们此前各自用一套淡入，
 * 于是同一个应用里出现了三种「进入下一层」的手感。收在这里之后，
 * 路由、图库、详情共用同一条位移曲线与同一个方向语义。
 *
 * @param apply     真正改 DOM 的动作（跳路由 / 切状态）
 * @param isSettled 判定「新界面已经画出来了」——新快照在此之前拍会拍到半成品
 */
export function runPageStyleTransition({
  direction,
  apply,
  isSettled,
}: {
  direction: PageDirection;
  apply: () => void;
  isSettled: () => boolean;
}): void {
  if (!canAnimatePageTransition()) {
    apply();
    return;
  }

  const root = document.documentElement;
  root.dataset.pageDirection = direction;
  root.classList.add("page-transition");

  const clear = () => {
    root.classList.remove("page-transition");
    delete root.dataset.pageDirection;
  };

  const transition = document.startViewTransition(async () => {
    apply();
    await waitForCondition(isSettled);
    /**
     * 让出一拍宏任务给 React 提交。刻意不用 rAF：窗口不可见时 rAF 不回调，
     * 回调不 resolve 就会把整页卡在旧快照上（主题波纹那次踩过，见 AGENTS.md）。
     */
    await delay(32);
  });

  const watchdog = setTimeout(clear, 1500);
  /**
   * `updateCallbackDone` / `ready` 也要各接一个 catch：
   * 过渡被浏览器**跳过**（比如紧接着又发起一次过渡、或文档被隐藏）时这两条会以
   * AbortError 拒绝，没人接就是渲染进程的 `Uncaught (in promise)` ——
   * 冒烟的「无 console 错误」那条断言正是这么红起来的。
   */
  void transition.updateCallbackDone.catch(() => null);
  void transition.ready.catch(() => null);
  void transition.finished
    .finally(() => {
      clearTimeout(watchdog);
      clear();
    })
    .catch(() => null);
}

/** 等谓词成立（有上限：拿不到也照常收尾，绝不把交互卡住） */
async function waitForCondition(
  isSettled: () => boolean,
  timeoutMs = 800
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isSettled()) return;
    await delay(16);
  }
}

/** 带动画地跳转：href 目标路径 / push 真正的路由跳转 / direction 方向 */
export function startPageNavigation({
  href,
  push,
  direction,
}: {
  href: string;
  push: () => void;
  direction: PageDirection;
}): void {
  runPageStyleTransition({
    direction,
    apply: push,
    isSettled: () => window.location.pathname === href,
  });
}
