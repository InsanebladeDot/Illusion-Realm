"use client";

// 设置、帮助和合成器共用一个主区浮层生命周期，关闭后焦点回到真实触发控件。
// 浮层不复制应用外壳，也不挡住 nav；Tab 只在当前浮层内循环。
// 未挂载的面板没有事件监听，多个画布实例不会互相消费 Escape。
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./canvas.module.css";

export function CanvasOverlay({ label, onClose, children, returnFocus }: { label: string; onClose: () => void; children: ReactNode; returnFocus?: RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 触发器由打开前的事件捕获；不能等工作区变成 inert 后再读取，否则只会读到 body。
    // 像在进屋前留下门牌，关窗时才能准确回到原来的按钮，而不是随便找一个能聚焦的元素。
    const previous = returnFocus?.current ?? document.activeElement;
    const current = root.current;
    current?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled),a[href]")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <div className={styles.overlay} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={root} className={styles.overlayContent} role="dialog" aria-label={label} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    // getClientRects 只排除真正隐藏的控件；超出滚动区的可见控件仍可通过 Tab 滚入。
    // disabled 和负 tabindex 不能成为循环站点，避免 Tab 卡在无法操作的服务入口上。
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex='0']")].filter(element => element.tabIndex >= 0 && !element.closest("[inert]") && element.getClientRects().length > 0);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (!elements.length) return;
    event.preventDefault();
    elements[(index + (event.shiftKey ? elements.length - 1 : 1)) % elements.length]?.focus();
  }}>{children}</div></div>;
}
