"use client";

import { LayoutList, Rows3 } from "lucide-react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import {
  ACCENT_PILL_ACTIVE_CLASS,
  ACCENT_TAB_ACTIVE_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import {
  RESOURCE_DIALOG_FONT_SIZE_OPTIONS,
  type ResourceCategoryUiMode,
  type ResourceDialogFontSize,
} from "@/types/resourceDialog";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";

export type { ResourceCategoryUiMode };

type ResourceCategoryFilterProps = {
  categories: string[];
  selectedCategory: string | null;
  uiMode: ResourceCategoryUiMode;
  fontSize: ResourceDialogFontSize;
  onCategoryChange: (category: string | null) => void;
  onUiModeChange: (mode: ResourceCategoryUiMode) => void;
  onFontSizeChange: (size: ResourceDialogFontSize) => void;
};

export function ResourceCategoryFilter({
  categories,
  selectedCategory,
  uiMode,
  fontSize,
  onCategoryChange,
  onUiModeChange,
  onFontSizeChange,
}: ResourceCategoryFilterProps) {
  const { t } = useTranslation();
  const typography = getResourceDialogTypography(fontSize);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {uiMode === "dropdown" ? (
        <SimpleSelect
          ariaLabel={t("create.resourceCategoryFilter.filterByCategory")}
          value={selectedCategory ?? ""}
          variant="pill"
          portal
          triggerClassName={cn(
            typography.categoryTab,
            typography.toolbarHeight
          )}
          optionClassName={typography.categoryTab}
          chevronClassName={typography.searchIcon}
          checkClassName={typography.searchIcon}
          options={[
            { value: "", label: t("create.resourceCategoryFilter.all") },
            ...categories.map((category) => ({
              value: category,
              label: category,
            })),
          ]}
          onChange={(nextValue) => onCategoryChange(nextValue || null)}
        />
      ) : categories.length === 0 ? (
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            className={cn(
              "border-b-2 py-2 pt-2 font-medium",
              typography.categoryTab,
              ACCENT_TAB_ACTIVE_CLASS
            )}
          >
            {t("create.resourceCategoryFilter.all")}
          </button>
        </nav>
      ) : (
        <nav className="-mb-px flex min-w-0 flex-1 gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onCategoryChange(null)}
            className={cn(
              "shrink-0 border-b-2 py-2 pt-2 font-medium transition-colors",
              typography.categoryTab,
              selectedCategory === null
                ? ACCENT_TAB_ACTIVE_CLASS
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t("create.resourceCategoryFilter.all")}
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
              className={cn(
                "shrink-0 border-b-2 py-2 pt-2 font-medium transition-colors",
                typography.categoryTab,
                selectedCategory === category
                  ? ACCENT_TAB_ACTIVE_CLASS
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {category}
            </button>
          ))}
        </nav>
      )}

      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-0.5 dark:bg-gray-800/80"
        role="group"
        aria-label={t("create.resourceCategoryFilter.fontSize")}
      >
        {RESOURCE_DIALOG_FONT_SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={t("create.resourceCategoryFilter.fontSizeTitle", {
              label: option.label,
            })}
            aria-pressed={fontSize === option.value}
            onClick={() => onFontSizeChange(option.value)}
            className={cn(
              "inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 font-medium transition-colors",
              typography.toolbar,
              typography.toolbarHeight,
              fontSize === option.value
                ? ACCENT_PILL_ACTIVE_CLASS
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted/60 p-0.5 dark:bg-gray-800/80"
        role="group"
        aria-label={t("create.resourceCategoryFilter.displayMode")}
      >
        <button
          type="button"
          title={t("create.resourceCategoryFilter.tabs")}
          aria-pressed={uiMode === "tabs"}
          onClick={() => onUiModeChange("tabs")}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
            uiMode === "tabs"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Rows3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={t("create.resourceCategoryFilter.dropdown")}
          aria-pressed={uiMode === "dropdown"}
          onClick={() => onUiModeChange("dropdown")}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
            uiMode === "dropdown"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutList className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
