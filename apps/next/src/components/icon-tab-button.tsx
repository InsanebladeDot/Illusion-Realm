"use client";

// 界面：带图标和下划线的切换标签；创建模式与参考素材共用外观，调用方管理选中值。
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ACCENT_TAB_ACTIVE_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
  icon: LucideIcon;
  label: string;
  trailing?: ReactNode;
}
export function IconTabButton({ active, icon: Icon, label, trailing, className, ...props }: Props) {
  return <button {...props} type="button" className={cn(
    "flex shrink-0 items-center justify-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4",
    active ? ACCENT_TAB_ACTIVE_CLASS : "border-transparent text-muted-foreground hover:text-foreground",
    className,
  )}>
    <Icon className="h-3.5 w-3.5 shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
    {trailing}
  </button>;
}
