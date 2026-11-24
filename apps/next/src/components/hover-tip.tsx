"use client";

/** 共用悬浮说明：沿用蒙版工具的延时、移入与失焦收尾，Portal 防止被工具栏裁切。 */
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { createStore } from "zustand/vanilla";
import styles from "./hover-tip.module.css";

interface Props { label: string; children: ReactNode; placement?: "bottom" | "right"; tone?: "black" | "theme"; layer?: "content" | "window"; asChild?: boolean }
// 全页只展开一张说明，避免“卡片内还有按钮”时父子提示叠在一起。
const tips = createStore<{ active: { id: string; hide: () => void } | null }>(() => ({ active: null }));
function activateTip(id: string, hide: () => void) { tips.getState().active?.hide(); tips.setState({ active: { id, hide } }); }
function releaseTip(id: string) { if (tips.getState().active?.id === id) tips.setState({ active: null }); }

// 合并原控件的事件，保留 ref、禁用态与布局；定时器只在事件里操作。
function HoverTarget({ children, asChild, show, hide }: Pick<Props, "children" | "asChild"> & { show: (event: SyntheticEvent<HTMLElement>) => void; hide: () => void }) {
  return asChild && isValidElement<HTMLAttributes<HTMLElement>>(children) ? cloneElement(children, {
    ...{ "data-hover-tip-target": true },
    onPointerEnter: event => { children.props.onPointerEnter?.(event); show(event); },
    onPointerLeave: event => { children.props.onPointerLeave?.(event); hide(); },
    onFocus: event => { children.props.onFocus?.(event); show(event); },
    onBlur: event => { children.props.onBlur?.(event); hide(); },
  }) : <span data-hover-tip-target className={styles.anchor} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>{children}</span>;
}

export function HoverTip({ label, children, placement = "bottom", tone = "black", layer = "content", asChild }: Props) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); releaseTip(id); }, [id]);
  // 按实际文字宽高收回窗口内，不能把所有提示都当成固定120px宽的小纸条。
  useLayoutEffect(() => {
    if (!position) return;
    const place = () => {
      const element = tip.current;
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      const left = placement === "right" ? position.x : position.x - width / 2;
      element.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
      element.style.top = `${Math.max(8, Math.min(position.y, innerHeight - height - 8))}px`;
    };
    place();
    if (!visible) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [position, placement, visible, label]);
  const show = (event: SyntheticEvent<HTMLElement>) => {
    clear();
    // 像父子两块门牌，指到里面的按钮时只读最近那块，聚焦冒泡也遵守此规则。
    if (event.target instanceof Element && event.target.closest("[data-hover-tip-target]") !== event.currentTarget) return;
    if (!label) return;
    activateTip(id, hide);
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition(placement === "right" ? { x: rect.right + 8, y: rect.top }
      : { x: rect.left + rect.width / 2, y: rect.bottom + 8 > innerHeight - 36 ? rect.top - 36 : rect.bottom + 8 });
    timer.current = setTimeout(() => setVisible(true), 230);
  };
  const hide = () => { clear(); setVisible(false); };
  // 直接挂到原控件上，像给原门牌加说明，不再套一层改变布局或焦点的门框。
  return <><HoverTarget asChild={asChild} show={show} hide={hide}>{children}</HoverTarget>
    {position && createPortal(<span ref={tip} role="tooltip" aria-hidden={!visible} data-hover-tip data-visible={visible} className={`${styles.tip} ${tone === "theme" ? styles.theme : ""} ${layer === "window" ? styles.windowLayer : ""}`} style={{ left: position.x, top: position.y }}>{label}</span>, document.body)}
  </>;
}
