"use client";

import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

type PromptCollapseButtonProps = {
  collapsed: boolean;
  onToggle: () => void;
  /** 用于 aria-label，如「提示词」 */
  label: string;
};

/** 提示词输入框的收起 / 展开按钮（两个框共用） */
export function PromptCollapseButton({
  collapsed,
  onToggle,
  label,
}: PromptCollapseButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={
        collapsed
          ? t("create.promptCollapseButton.expandLabel", { label })
          : t("create.promptCollapseButton.collapseLabel", { label })
      }
      title={
        collapsed
          ? t("create.promptCollapseButton.expand")
          : t("create.promptCollapseButton.collapse")
      }
      onClick={onToggle}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ChevronDown
        className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
      />
    </button>
  );
}
