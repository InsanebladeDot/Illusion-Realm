"use client";

// 共用图片高级设置的外壳：只管理折叠和布局，具体参数由调用方传入。
import { useState, type ReactNode } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

export function AdvancedSettingsSection({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return <div data-advanced-settings className={cn("min-w-0 w-full max-w-full overflow-hidden rounded-xl", open && "bg-muted/30 dark:bg-muted/20", className)}>
    <button type="button" data-advanced-settings-toggle aria-expanded={open} onClick={() => setOpen(!open)}
      className={cn("inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground", open && "rounded-b-none")}>
      <span className="flex min-w-0 items-center gap-2"><Settings className="h-4 w-4 shrink-0" /><span className="truncate">{t("create.advancedSettings.title")}</span></span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
    </button>
    <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
      <div className="min-h-0 overflow-hidden"><div className="space-y-4 px-3 pb-3 pt-2">{children}</div></div>
    </div>
  </div>;
}
