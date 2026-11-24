"use client";

/** 设置与转译共用的受控开关；只通知新值，保存和权限由调用方处理。 */
import type { ButtonHTMLAttributes } from "react";

interface ToggleSwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function ToggleSwitch({ checked, onChange, label, ...attributes }: ToggleSwitchProps) {
  return <button {...attributes} type="button" role="switch" aria-label={label} aria-checked={checked} className={`hy-switch inline-flex h-5 w-9 shrink-0 items-center rounded-full p-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? "is-on justify-end bg-foreground/70" : "justify-start bg-muted"}`} onClick={() => onChange(!checked)}><span className="h-3.5 w-3.5 rounded-full bg-background" /></button>;
}
