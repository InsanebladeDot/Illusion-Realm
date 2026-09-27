"use client";

import {
  Image,
  Mic,
  Music2,
  Video,
  WandSparkles,
} from "lucide-react";
import type { CreateMode } from "@/types/createMode";
import { useTranslation, type MessageKey } from "@/i18n";
import { ACCENT_TAB_ACTIVE_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type CreateModeTabsProps = {
  value: CreateMode;
  onChange: (mode: CreateMode) => void;
};

/** 模块作用域拿不到 hook：标签存**词条 key**，渲染时再 `t()` 取文案 */
const TABS: Array<{
  id: CreateMode;
  label: MessageKey;
  icon: typeof Image;
  badge?: string;
}> = [
  { id: "image", label: "create.createModeTabs.image", icon: Image },
  { id: "video", label: "create.createModeTabs.video", icon: Video },
  { id: "edit", label: "create.createModeTabs.edit", icon: WandSparkles, badge: "NEW" },
  { id: "roleCover", label: "create.createModeTabs.roleCover", icon: Music2 },
  { id: "roleTts", label: "create.createModeTabs.roleTts", icon: Mic },
];

export function CreateModeTabs({ value, onChange }: CreateModeTabsProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        THIN_DIVIDER_CLASS
      )}
    >
      <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = value === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center justify-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:px-4",
                active
                  ? ACCENT_TAB_ACTIVE_CLASS
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t(tab.label)}</span>
              {tab.badge && (
                <span className="rounded bg-red-500/10 px-1 text-[8px] font-bold leading-normal text-red-600 dark:text-red-400">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
