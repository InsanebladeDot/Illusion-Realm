"use client";

import { useState } from "react";
import { DEFAULT_IMAGE_COUNT } from "@/data/createForm";
import { useTranslation } from "@/i18n";
import { ImageCountDropdown } from "@/view/create/ImageCountDropdown";
import { PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

type GenerateFooterProps = {
  generating?: boolean;
  onGenerate?: (imageCount: number) => void;
};

export function GenerateFooter({
  generating = false,
  onGenerate,
}: GenerateFooterProps) {
  const { t } = useTranslation();
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);

  return (
    <div
      className={cn(
        "z-20 shrink-0 space-y-2 border-t border-[#d4d4d8]/70 bg-background px-2 py-2 dark:border-[#e4e4e7]/25 sm:px-3 sm:py-3",
        "max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
      )}
    >
      <ImageCountDropdown value={imageCount} onChange={setImageCount} />
      <button
        type="button"
        data-generate-button
        disabled={generating}
        onClick={() => onGenerate?.(imageCount)}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold shadow transition-colors active:scale-[0.99] sm:h-14",
          "disabled:cursor-not-allowed disabled:opacity-60",
          PRIMARY_BUTTON_CLASS
        )}
      >
        {generating ? t("create.progress.generating") : t("create.generateButton.label")}
      </button>
    </div>
  );
}
