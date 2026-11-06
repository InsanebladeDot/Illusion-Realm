"use client";

// 根列独立贴住锚点，子列向空间足够的一侧展开，逐列使用同一宽度。
// 像从桌边展开折页：右边不够就朝左，不能把根列一起推走。
// above保留翻译按钮的上弹位置，pointer让右键菜单从实际指针位置开始。
import { useEffect, useRef, useState, type RefObject } from "react";
// 每列与根列等宽，capacity表示屏幕目前还能容纳多少完整侧列。
// 不足一列时由菜单改为逐级进入，不能把半列按钮塞到窗口外。
// 标题栏高度取应用外壳变量，固定定位不能进入系统窗口拖拽区。
// 绝对定位子列不参与根列高度，所以展开不会改变根菜单的位置。
// 子列可用高度按根列顶部到窗口底部计算，长预设独立滚动。
// 所有位置使用client坐标，不叠加页面滚动量或应用导航宽度。
function placeCascade(anchor: HTMLDivElement | null, element: HTMLDivElement | null, levels: number, placement: "above" | "pointer", onCapacity: (value: number) => void) {
  if (!anchor || !element) return;
  const rect = anchor.getBoundingClientRect();
  const inset = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
  const width = element.offsetWidth; const height = element.offsetHeight;
  const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
  const top = Math.max(inset + 8, Math.min(placement === "above" ? rect.top - height - 6 : rect.top, innerHeight - height - 8));
  const rightSpace = innerWidth - left - width - 8; const leftSpace = left - 8;
  const direction = rightSpace >= levels * width || rightSpace >= leftSpace ? 1 : -1;
  onCapacity(Math.max(0, Math.floor(Math.max(rightSpace, leftSpace) / width)));
  element.style.left = `${left}px`; element.style.top = `${top}px`;
  element.style.setProperty("--assistant-cascade-offset", `${direction * width}px`);
  element.style.setProperty("--assistant-cascade-arrow", direction === 1 ? "0deg" : "180deg");
  element.style.setProperty("--assistant-cascade-height", `${Math.max(60, innerHeight - top - 8)}px`);
  element.dataset.submenuDirection = direction === 1 ? "right" : "left";
}

// 观察真实尺寸，导航开合和内容变化也会重算，不只依赖窗口resize。
// 可见性恢复时重新读取布局，关闭则同时拆除观察和监听。
export function useCascadePosition(anchor: RefObject<HTMLDivElement | null>, levels: number, placement: "above" | "pointer" = "above") {
  const panel = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(2);
  useEffect(() => {
    const position = () => placeCascade(anchor.current, panel.current, levels, placement, setCapacity);
    position(); const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current); if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true); document.addEventListener("visibilitychange", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); document.removeEventListener("visibilitychange", position); };
  }, [anchor, levels, placement]);
  return { panel, capacity };
}
