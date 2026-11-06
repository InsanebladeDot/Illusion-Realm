"use client";

// 直接采用交付包 components.tsx 的控件结构与 class，宿主只注入数据和回调。
// 所有状态样式来自同一份 canvas-components.css，不能靠调用方覆写几何来模拟复用。
// 原生 disabled 同时阻止鼠标和键盘操作；title 解释未接通能力，不产生假完成事件。
import type { ReactNode, Ref } from "react";
import { CanvasIcon, type IconName } from "./canvas-icon";

export { CanvasIcon };
export type { IconName };
export type CanvasAction = (action: string) => void;

interface IconButtonProps {
  // 图标只负责视觉，label 同时供读屏和工具提示；没有可见文字也不能失去名称。
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  pressed?: boolean;
  // pressed 是持续的业务状态；没有传值时只是普通动作，不伪装成切换开关。
  // reason 覆盖工具提示，用于解释禁用原因；不会把按钮重新变成可操作控件。
  reason?: string;
}

export function IconButton({ icon, label, onClick, disabled = false, className = "", pressed, reason }: IconButtonProps) {
  // 使用原生 disabled 统一拦住鼠标、Enter 和 Space，不只依赖灰色样式。
  // 点击后不自动置 pressed；状态是否改变由真正拥有业务数据的调用者决定。
  return <button type="button" title={reason || label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className={`hy-icon-button ${className}`}><CanvasIcon name={icon} /></button>;
}

interface ChipProps {
  // 胶囊共用结构，图标和文字是内容差异；模型、比例等不同业务仍注入各自回调。
  children: ReactNode;
  icon?: IconName;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  reason?: string;
  ref?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
}

// 展开、关联面板和触发器引用都是可选参数；普通胶囊不用承担浮层生命周期。
// ref 使用 React 19 的原生参数，只把焦点交回同一个真实按钮，不额外套一层 DOM。
export function CanvasChip({ children, icon, active, disabled, onClick, className = "", reason, ref, expanded, controls }: ChipProps) {
  return <button ref={ref} type="button" className={`hy-chip ${active ? "is-active" : ""} ${className}`} disabled={disabled} aria-pressed={active} aria-expanded={expanded} aria-controls={controls} title={reason} onClick={onClick}>{icon && <CanvasIcon name={icon} size={14} />}<span>{children}</span></button>;
}

// value 使用稳定 ID，翻译只改变 label；切换语言不能把已有模式变成另一种模式。
// selected 属于业务数据，失焦不会取消；focus 也不会擅自选中其他选项。
export function SegmentedControl({ items, value, onChange, label, disabled }: { items: readonly { id: string; label: string }[]; value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  // 不在点击后写一份内部选择；即使外部拒绝修改，界面也不会先显示假的新选项。
  // 原生 button 自带 Tab、Enter、Space，不能为模仿原型 div 而丢掉键盘路径。
  return <div className="hy-segmented" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.id} disabled={disabled} aria-pressed={item.id === value} aria-label={item.label} className={item.id === value ? "is-active" : ""} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>;
}

export function CanvasSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  // checked 与视觉 class 同源，避免读屏读“开启”但滑块仍留在左边。
  // 这里只通知下一个值；设置是否可保存、是否影响图引擎仍由设置调用方处理。
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className={`hy-switch ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}><span /></button>;
}
