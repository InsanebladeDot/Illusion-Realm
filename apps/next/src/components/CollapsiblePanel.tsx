"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

type CollapsiblePanelProps = {
  open: boolean;
  children: ReactNode;
  /** 外层额外类名 */
  className?: string;
  /** 内容层额外类名（底部留白写在这里，保证测量得到） */
  contentClassName?: string;
  /** 过渡时长（毫秒） */
  durationMs?: number;
  /** 折叠状态的数据钩子，例如 data-prompt-collapse-panel */
  stateAttribute?: string;
};

const EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * 通用「抽屉」过渡容器（提示词 / 反向提示词的收起与抽出）。
 *
 * 关键点：
 * - 内容**始终留在 DOM 中**（只是高度被裁掉），contentEditable 里用户写的内容
 *   不会因为卸载而丢失，也就不会出现「收起再展开内容变空」的闪烁；
 * - 高度用 ResizeObserver 实测内容高度，动画在 `0 ↔ 真实高度` 之间做过渡，
 *   所以收起 / 抽出都是匀速自然的滑动，而不是先跳到某个固定高度再回弹；
 * - 收起时给内容加 `inert`，避免 Tab 聚焦到看不见的输入框。
 */
export function CollapsiblePanel({
  open,
  children,
  className,
  contentClassName,
  durationMs = 300,
  stateAttribute,
}: CollapsiblePanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // 实测内容高度（收起时内容仍在文档流中，高度依然可测）
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const update = () => {
      const next = element.scrollHeight;
      setContentHeight((prev) => (prev === next ? prev : next));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      {...(stateAttribute ? { [stateAttribute]: open ? "true" : "false" } : {})}
      data-collapsible-panel
      className={cn("overflow-hidden", className)}
      style={{
        height: open ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        opacity: open ? 1 : 0,
        transition: [
          `height ${durationMs}ms ${EASING}`,
          `opacity ${Math.round(durationMs * 0.8)}ms ease-out`,
        ].join(", "),
      }}
    >
      <div
        ref={contentRef}
        className={contentClassName}
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  );
}
