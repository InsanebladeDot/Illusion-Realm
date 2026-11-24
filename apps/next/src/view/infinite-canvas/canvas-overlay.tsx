"use client";

// 设置、帮助和合成器共用一个主区浮层生命周期，关闭后焦点回到真实触发控件。
// 浮层不复制应用外壳，也不挡住 nav；Tab 只在当前浮层内循环。
// 未挂载的面板没有事件监听，多个画布实例不会互相消费 Escape。
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./canvas.module.css";

export function CanvasOverlay({ label, onClose, children, returnFocus, full = false }: { label: string; onClose: () => void; children: ReactNode; returnFocus?: RefObject<HTMLElement | null>; full?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 触发器由打开前的事件捕获；不能等工作区变成 inert 后再读取，否则只会读到 body。
    // 像在进屋前留下门牌，关窗时才能准确回到原来的按钮，而不是随便找一个能聚焦的元素。
    const previous = returnFocus?.current ?? document.activeElement;
    const current = root.current;
    // 加载时按钮可能全禁用；隐藏的文件输入不能接焦点，此时由外壳接住 Escape。
    const controls = current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),a[href]");
    const first = controls && [...controls].find(element => element.tabIndex >= 0 && !element.closest("[inert]") && element.getClientRects().length > 0);
    (first ?? current)?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [returnFocus]);
  return <div className={styles.overlay} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={root} tabIndex={-1} className={styles.overlayContent} style={full ? { position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", overflow: "hidden", padding: 0, borderRadius: 0 } : undefined} role="dialog" aria-label={label} onKeyDown={event => {
    if (!full) event.stopPropagation();
    // 导演台自己的 Escape 先取消拖动或关闭内部面板，不能同时从外层把作品关掉。
    if (event.key === "Escape" && !full) { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    // getClientRects 只排除真正隐藏的控件；超出滚动区的可见控件仍可通过 Tab 滚入。
    // disabled 和负 tabindex 不能成为循环站点，避免 Tab 卡在无法操作的服务入口上。
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex='0']")].filter(element => element.tabIndex >= 0 && !element.closest("[inert]") && element.getClientRects().length > 0);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (!elements.length) return;
    event.preventDefault();
    elements[(index + (event.shiftKey ? elements.length - 1 : 1)) % elements.length]?.focus();
  }}>{children}</div></div>;
}
