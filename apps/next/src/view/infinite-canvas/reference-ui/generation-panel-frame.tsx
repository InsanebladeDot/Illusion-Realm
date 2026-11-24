"use client";

import { HoverTip } from "@/components/hover-tip";

/** 节点输入面板的共用外壳；沿用音频面板的紧凑排版，媒体业务只注入内容与动作。 */
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { CanvasIcon, IconButton } from "./components";

interface Props {
  kind: string;
  children: ReactNode;
  options: ReactNode;
  actions: ReactNode;
  details?: ReactNode;
  busy?: boolean;
  disabled: boolean;
  available: boolean;
  onToggle: () => void;
  onSubmit: () => void;
}

// 外壳不读模型、不持有草稿；像同一个托盘装不同餐点，按钮只转交当前节点的回调。
export function GenerationPanelFrame({ kind, children, options, actions, details, busy, disabled, available, onToggle, onSubmit }: Props) {
  const { t } = useTranslation();
  return <section data-canvas-theme data-generation-panel-frame className={`hy-generation-panel hy-prompt-generation-panel hy-panel-${kind} nodrag nopan nowheel`} aria-label={t("canvas.settings")} onKeyDownCapture={event => {
    // Enter 与 Shift+Enter留给换行；只有Ctrl/Command+Enter提交，输入法确认不提交。
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    event.preventDefault(); event.stopPropagation(); onSubmit();
  }}>
    <IconButton icon="expand" label={t("canvas.collapse")} className="hy-panel-expand" onClick={onToggle} />
    {children}
    {/* 输入面板操作行：所有媒体共用按钮排列，参数与请求业务通过插槽和回调注入。 */}
    <div className="hy-panel-footer"><div className="hy-panel-options">{options}</div><div className="hy-panel-submit">
      {actions}
      <HoverTip asChild label={(t(available ? "canvas.generate" : "canvas.unavailable")) || ""}><button type="button" className="hy-submit" aria-label={t("canvas.generate")} disabled={disabled} onClick={onSubmit}><CanvasIcon name={busy ? "history" : "arrow"} size={18} /></button></HoverTip>
    </div></div>
    {details}
  </section>;
}
