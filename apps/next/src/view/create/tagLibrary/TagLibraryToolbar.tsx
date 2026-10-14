"use client";

import { Copy, Eye, Grid2X2, List, Search, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { TAG_SORT_OPTIONS, type TagSortMode } from "@/utils/tagLibrary";
import { cn } from "@/utils/cn";

type TagLibraryToolbarProps = {
  displayMode: "card" | "text";
  query: string;
  sort: TagSortMode;
  multi: boolean;
  selectedCount: number;
  selectedOnly: boolean;
  prefix: string;
  placeholder: string;
  onQueryChange: (value: string) => void;
  onSortChange: (sort: TagSortMode) => void;
  onMultiChange: (multi: boolean) => void;
  onCopySelected: () => void;
  onToggleSelectedOnly: () => void;
  onClearSelected: () => void;
  onDisplayModeChange: (mode: "card" | "text") => void;
};

/**
 * 静态标签库工具条：与角色选择器同一套排版
 * （搜索框固定宽度左浮动，其余控件整体右浮动）。
 */
export function TagLibraryToolbar({
  displayMode,
  query,
  sort,
  multi,
  selectedCount,
  selectedOnly,
  prefix,
  placeholder,
  onQueryChange,
  onSortChange,
  onMultiChange,
  onCopySelected,
  onToggleSelectedOnly,
  onClearSelected,
  onDisplayModeChange,
}: TagLibraryToolbarProps) {
  const { t } = useTranslation();

  return (
    <div
      {...{ [`data-${prefix}-toolbar`]: "true" }}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
    >
      <div
        {...{ [`data-${prefix}-search`]: "true" }}
        className="relative w-[220px] max-w-full shrink-0"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          type="search"
          value={query}
          aria-label={t("characters.tagLibrary.searchLabel", { label: placeholder })}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-8 w-full rounded-lg border border-[#E5E7EB] bg-[#F8F9FA] pl-8 pr-2.5 text-sm text-[#333333] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#A78BFA]/40"
        />
      </div>

      <div
        {...{ [`data-${prefix}-toolbar-right`]: "true" }}
        className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#888888]">{t("characters.toolbar.sort")}</span>
          <div className="flex overflow-hidden rounded-lg border border-[#E5E7EB]">
            {TAG_SORT_OPTIONS.map((option) => {
              const active = sort === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  {...{ [`data-${prefix}-sort`]: option.value }}
                  aria-pressed={active}
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    "h-8 px-3 text-xs transition-colors",
                    active
                      ? "bg-[#F5F3FF] font-medium text-[#6D28D9]"
                      : "bg-white text-[#333333] hover:bg-[#F8F9FA]"
                  )}
                >
                  {t(option.label)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          {...{ [`data-${prefix}-mode`]: multi ? "multi" : "single" }}
          aria-checked={multi}
          onClick={() => onMultiChange(!multi)}
          className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#333333] transition-colors hover:bg-[#F8F9FA]"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
              multi ? "border-[#A78BFA] bg-[#A78BFA]" : "border-[#D1D5DB] bg-white"
            )}
          >
            {multi ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
          </span>
          {multi ? t("characters.toolbar.multi") : t("characters.toolbar.single")}
        </button>

        <div className="flex items-center gap-1.5">
          <div
            role="group"
            aria-label={t("characters.tagLibrary.displayModeLabel")}
            className="flex overflow-hidden rounded-lg border border-[#E5E7EB]"
          >
            <button
              type="button"
              {...{ [`data-${prefix}-display-mode`]: "card" }}
              aria-label={t("characters.tagLibrary.cardMode")}
              aria-pressed={displayMode === "card"}
              onClick={() => onDisplayModeChange("card")}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 px-2.5 text-xs transition-colors",
                displayMode === "card"
                  ? "bg-[#F5F3FF] font-medium text-[#6D28D9]"
                  : "bg-white text-[#333333] hover:bg-[#F8F9FA]"
              )}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              {t("characters.tagLibrary.cardMode")}
            </button>
            <button
              type="button"
              {...{ [`data-${prefix}-display-mode`]: "text" }}
              aria-label={t("characters.tagLibrary.textMode")}
              aria-pressed={displayMode === "text"}
              onClick={() => onDisplayModeChange("text")}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 border-l border-[#E5E7EB] px-2.5 text-xs transition-colors",
                displayMode === "text"
                  ? "bg-[#F5F3FF] font-medium text-[#6D28D9]"
                  : "bg-white text-[#333333] hover:bg-[#F8F9FA]"
              )}
            >
              <List className="h-3.5 w-3.5" />
              {t("characters.tagLibrary.textMode")}
            </button>
          </div>
          <ToolbarButton
            dataAttr={`data-${prefix}-copy-selected`}
            icon={<Copy className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.copySelected")}
            disabled={selectedCount === 0}
            onClick={onCopySelected}
          />
          <ToolbarButton
            dataAttr={`data-${prefix}-only-selected`}
            icon={<Eye className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.onlySelected")}
            active={selectedOnly}
            onClick={onToggleSelectedOnly}
          />
          <ToolbarButton
            dataAttr={`data-${prefix}-clear-selected`}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.clearSelected")}
            disabled={selectedCount === 0}
            onClick={onClearSelected}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  dataAttr,
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  dataAttr: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...{ [dataAttr]: "true" }}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "bg-[#F5F3FF] font-medium text-[#6D28D9]"
          : "bg-white text-[#333333] hover:bg-[#F8F9FA]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
