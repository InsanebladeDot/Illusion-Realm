"use client";

/** 共用图片抓取手势：位移按屏幕像素计算，像移动相框，不改图片文件或工程位置。 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

interface Offset { x: number; y: number }
interface Grab { id: number; x: number; y: number; origin: Offset; host: HTMLImageElement }
interface Options { offset: Offset; onOffsetChange: (offset: Offset) => void; sessionKey?: string }

export function useImagePreviewPan({ offset, onOffsetChange, sessionKey }: Options) {
  const grab = useRef<Grab | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  // 清理只释放本实例捕获的指针；取消、失焦和卸载都不留下抓手状态。
  const release = () => {
    const current = grab.current;
    grab.current = null;
    if (current?.host.hasPointerCapture(current.id)) current.host.releasePointerCapture(current.id);
  };
  const stop = () => { release(); setDragging(false); };
  usePanCleanup(stop, release, sessionKey);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    moved.current = false;
    if (event.button !== 0 || !event.isPrimary || grab.current || !(event.target instanceof HTMLImageElement) || event.target.closest("[data-image-compare]")) return;
    // 捕获在图片本身，普通单击和双击仍命中图片，不会误成点击背景关闭。
    grab.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: offset, host: event.target };
    event.target.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = grab.current;
    if (!current || current.id !== event.pointerId) return;
    const x = event.clientX - current.x, y = event.clientY - current.y;
    if (Math.hypot(x, y) >= 6) moved.current = true;
    onOffsetChange({ x: current.origin.x + x, y: current.origin.y + y });
  };
  // 捕获结束后浏览器可能把click发给背景；拖过图片就拦下这次点击，避免误关预览。
  const click = (event: MouseEvent<HTMLDivElement>) => { if (moved.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); } };
  return { dragging, stop, handlers: { onPointerDown: start, onPointerMove: move, onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop, onClickCapture: click } };
}

// 用ref读取最新清理动作，拖动中的重渲染不反复拆装窗口监听。
function usePanCleanup(stop: () => void, release: () => void, sessionKey?: string) {
  const actions = useRef({ stop, release });
  useEffect(() => { actions.current = { stop, release }; });
  // 创作预览关闭后组件可能仍挂载；切图或关闭同样结束旧手势。
  useEffect(() => () => actions.current.stop(), [sessionKey]);
  useEffect(() => {
    const blur = () => actions.current.stop();
    const hide = () => { if (document.hidden) blur(); };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hide);
      actions.current.release();
    };
  }, []);
}
