"use client";

/** 参数菜单留在原节点主题域；按屏幕边界挪开，像把桌沿的托盘推回桌面。 */
import { useLayoutEffect, type RefObject } from "react";
import { useViewport } from "@xyflow/react";

function fitPopup(popup: HTMLElement, zoom: number) {
  const canvas = popup.closest("[data-infinite-canvas]");
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  popup.style.translate = "none";
  popup.style.maxWidth = `${Math.max(1, bounds.width - 16) / zoom}px`;
  popup.style.maxHeight = `${Math.max(1, bounds.height - 16) / zoom}px`;
  popup.style.overflow = "auto";
  const rect = popup.getBoundingClientRect();
  const dx = Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - 8 - rect.width)) - rect.left;
  const dy = Math.max(bounds.top + 8, Math.min(rect.top, bounds.bottom - 8 - rect.height)) - rect.top;
  // DOM矩形是屏幕像素，translate仍在缩放后的节点中，必须除以画布倍率。
  popup.style.translate = `${dx / zoom}px ${dy / zoom}px`;
}

export function useParameterBounds(ref: RefObject<HTMLDivElement | null>) {
  const { x, y, zoom } = useViewport();
  useLayoutEffect(() => {
    const popup = ref.current;
    if (!popup) return;
    const update = () => fitPopup(popup, zoom);
    const observer = new ResizeObserver(update);
    observer.observe(popup);
    const canvas = popup.closest("[data-infinite-canvas]");
    if (canvas) observer.observe(canvas);
    update();
    // 内容、自定义输入和窗口变化都重新限位；收起后不留下观察器。
    return () => observer.disconnect();
  }, [ref, x, y, zoom]);
}
