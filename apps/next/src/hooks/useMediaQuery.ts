"use client";

import { useEffect, useState } from "react";
import { useIsHydrated } from "@/hooks/useIsHydrated";

/**
 * 简单的媒体查询 Hook（首帧返回 false，避免 SSR/静态导出时的不一致）。
 * 用于「高级提示词组装」在宽屏挂到右侧面板、窄屏就地展开，保证只有一份面板实例在 DOM 里。
 *
 * ## 为什么除了 `change` 还要监听 `resize` / `visibilitychange`
 *
 * 「窗口被遮挡或最小化」时 Chromium 会停摆渲染生命周期，此时**媒体查询的结果仍然会重算**
 * （读 `matches` / `innerWidth` 都是新值），但 **`change` 事件不派发**。
 * 实测（2026-09-19，Electron 43 / Chromium 对应版本）：
 *
 *   最小化后               width=1584 matches=true   change 0 次  → 变体 panel
 *   hidden 期间改视口→1000  width=1000 matches=false  change 0 次  → 变体仍停在 panel
 *   恢复窗口后              width=1000 matches=false  change 1 次  → 1ms 内翻到 inline
 *
 * **谁是安全网（时间线归因，不是推测）**：`SMOKE_SWALLOW_MEDIA_EVENT=change` 会把 change 通道
 * 主动掐断（记录到 2 次尝试），此时页面侧时间线为
 * `variant=panel@117 → resize@1639 → change(swallowed)@1639 ×2 → variant=inline@1657`：
 * 救场的是 **resize**（change 被吞、`visibilitychange` 那次根本没来，因为页面全程 visible）。
 * 页面上还有一条护栏：容器尺寸变化必然伴随 `resize`，与媒体查询的结果变化同源。
 *
 * 结论与纪律：
 *   1. 「恢复可见时补发 change」是**实测行为、不是规范承诺**（规范只要求 `matches` 反映最新值）
 *      —— **不得依赖它**。
 *   2. 因此这里显式在 `change` / `resize` / `visibilitychange` 上都重读 `media.matches`，
 *      不采信事件载荷。`visibilitychange` 是第二层网：窗口重新可见时先到它，与尺寸变没变无关。
 *   3. 同族写法（`SimpleSelect` 的 resize → 重测 rect、`TruncatedTextPopover` 的 resize → 重新 measure）
 *      本来就符合「以读为准」，未改动。
 *
 * 可复现的验伪：`SMOKE_SWALLOW_MEDIA_EVENT=1 npx electron scripts/smoke-prompt-assembly.js`
 * 会在页面加载前装一个「吞掉 change 事件」的 shim，验证即使事件通道失效、
 * 变体也能靠冗余触发纠正过来（并把 shim 是否真的生效一并断言）。
 */
/** 读一次当前匹配结果：**唯一的事实来源**，事件只用来到点子上重新读它 */
function readMatchMedia(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

/**
 * 两个导出共用的订阅：`change` / `resize` / `visibilitychange` 三个触发点
 * 都重新求值（不采信事件载荷），差异只在**首帧取什么值**。
 */
function useMediaQueryValue(
  query: string,
  readInitial: () => boolean
): boolean {
  const [matches, setMatches] = useState(readInitial);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    // 唯一的事实来源：每次通知都重新求值，而不是采信事件对象
    const update = () => setMatches(media.matches);
    update();

    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [query]);

  return matches;
}

/**
 * **服务端渲染 / 静态导出安全的**媒体查询：首帧恒为 `false`，hydration 之后才读真实值。
 *
 * 用于**会出现在预渲染 HTML 里**的组件（创建页、右侧组装面板、AppShell…）：
 * 那里首帧必须两端一致，否则 hydration 不一致。
 */
export function useMediaQuery(query: string): boolean {
  return useMediaQueryValue(query, () => false);
}

/**
 * **首帧就给出真实值**的媒体查询 —— 给「点开才挂载」的弹窗/浮层用。
 *
 * ## 为什么需要它（这是一个已复现过的观感缺陷，不是洁癖）
 *
 * `useMediaQuery` 首帧恒为 `false`（那是预渲染组件必须的），而挂在 `useEffect` 里的
 * 首次测量**发生在首帧绘制之后**。于是「点开才挂载」的弹窗会经历两帧：
 *
 *   第 1 帧：`isCompact = !false = true` → 渲染**紧凑变体**（铺满右侧主区，且带 `motion-none`）
 *   第 2 帧：effect 测出真实宽度 → 翻成**居中弹窗**，同时 `motion-none` 被摘掉，
 *           `[role="dialog"]:not(.motion-none)` 的 `motion-pop-in`（scale 0.97 → 1）这才开始播
 *
 * 用户看到的就是「**先满屏、再缩放**」，而不是「直接显示在中间」。
 * 修复不能靠改动画：动画本身是对的，坏的是第一帧的变体。
 *
 * ## 为什么这里可以直接同步读
 *
 * 这类弹窗只在 `open && isHydrated` 时才渲染（见 `ResourceDialogShell`），
 * 它的首帧**必然发生在 hydration 之后**，因此没有「两端首帧必须一致」的约束。
 * 本 hook 仍用 `useIsHydrated()` 兜底：hydration 之前恒返回 `false`，
 * 所以就算被误用在预渲染组件里，也不会造成 hydration 不一致 ——
 * 只是那种用法下它退化回 `useMediaQuery` 的语义（**页面级组件请继续用 `useMediaQuery`**）。
 *
 * 回归网：`scripts/smoke-characters.js` 的「弹窗首帧」段 —— 用 `MutationObserver`
 * 在**元素插入的那一瞬间**记录变体与几何（微任务，不依赖 rAF，因此遮挡/最小化下依然可跑），
 * 断言宽窗口首帧就是居中弹窗、且首帧到稳定期**没有变体翻转**；
 * 再用 1100px 的窄窗口做配对对照（首帧必须是紧凑变体），证明这条判据能区分两种变体。
 */
export function useMediaQueryAfterHydration(query: string): boolean {
  const isHydrated = useIsHydrated();
  const matches = useMediaQueryValue(query, () => readMatchMedia(query));
  return isHydrated ? matches : false;
}
