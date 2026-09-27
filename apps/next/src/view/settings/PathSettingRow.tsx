"use client";

import { FolderOpen } from "lucide-react";
import { useTranslation } from "@/i18n";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type PathSettingRowProps = {
  label: string;
  description: string;
  value: string;
  disabled?: boolean;
  onBrowse: () => void;
};

export function PathSettingRow({
  label,
  description,
  value,
  disabled = false,
  onBrowse,
}: PathSettingRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xl sm:flex-1">
        <div
          className={cn(
            "flex min-h-10 items-center rounded-xl bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
            INPUT_BORDER_CLASS
          )}
          title={value || t("settings.pathSection.empty")}
        >
          <span className="truncate">
            {value || t("settings.pathSection.placeholder")}
          </span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onBrowse}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl px-3 text-sm font-medium transition-all",
            "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          {t("settings.pathSection.openFolder")}
        </button>
      </div>
    </div>
  );
}
