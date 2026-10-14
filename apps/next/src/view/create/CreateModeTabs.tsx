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
import { THIN_DIVIDER_CLASS } from "@/utils/layout";
import { IconTabButton } from "@/components/icon-tab-button";
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
        {/* 界面：创建模式标签，与参考素材分类共用图标标签按钮。 */}
        {TABS.map((tab) => (
            <IconTabButton
              key={tab.id}
              active={value === tab.id}
              icon={tab.icon}
              label={t(tab.label)}
              onClick={() => onChange(tab.id)}
              trailing={tab.badge && (
                <span className="rounded bg-red-500/10 px-1 text-[8px] font-bold leading-normal text-red-600 dark:text-red-400">
                  {tab.badge}
                </span>
              )}
            />
        ))}
      </div>
    </div>
  );
}
