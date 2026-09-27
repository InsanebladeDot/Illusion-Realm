"use client";

import { useTranslation } from "@/i18n";
import { PRIMARY_BUTTON_CLASS, THIN_DIVIDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type SimpleGenerateFooterProps = {
  label?: string;
};

export function SimpleGenerateFooter({
  label,
}: SimpleGenerateFooterProps) {
  const { t } = useTranslation();

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const labelText = label ?? t("create.simpleGenerateFooter.labelDefault");
  return (
    <div
      className={cn(
        "z-10 shrink-0 bg-background p-2 sm:p-3 md:border-t lg:sticky lg:bottom-0",
        THIN_DIVIDER_CLASS,
        "max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
      )}
    >
      <button
        type="submit"
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold shadow transition-colors active:scale-[0.99] sm:h-14",
          PRIMARY_BUTTON_CLASS
        )}
      >
        {labelText}
      </button>
    </div>
  );
}
