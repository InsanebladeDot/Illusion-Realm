"use client";

import NextImage from "next/image";
import { ChevronDown } from "lucide-react";
import { getSelectedRoleDisplay } from "@/data/roles";
import { useTranslation } from "@/i18n";
import type { SelectedRole } from "@/types/role";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type RoleModelSelectProps = {
  value: SelectedRole;
  onOpenDialog: () => void;
};

export function RoleModelSelect({ value, onOpenDialog }: RoleModelSelectProps) {
  const { t } = useTranslation();
  const display = getSelectedRoleDisplay(value);

  return (
    <button
      type="button"
      onClick={onOpenDialog}
      className={cn(
        "relative isolate flex h-[64px] w-full cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-xl border bg-background p-2 shadow-none ring-0 sm:h-[80px] sm:p-2 md:h-[72px] md:p-3",
        INPUT_BORDER_CLASS
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg sm:h-12 sm:w-12">
          <NextImage
            src={display.cover}
            alt={display.roleName}
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
        <div className="flex min-w-0 flex-col text-left">
          <span className="text-xs font-medium text-muted-foreground sm:text-xs">
            {t("create.roleModelSelect.roleLabel")}
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold sm:text-base">
              {display.roleName}
            </span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {display.modelLabel}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center border-l border-foreground/10 pl-2">
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
