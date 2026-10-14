"use client";

import { Copy, Eye, Search, Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AnimadexSearchParams } from "@/types/character";
import { cn } from "@/utils/cn";
import { ACCENT_SELECTED_SOFT_CLASS } from "@/utils/layout";

type CharacterPickerToolbarProps = {
  query: string;
  sort: NonNullable<AnimadexSearchParams["sort"]> | "";
  multi: boolean;
  selectedCount: number;
  selectedOnly: boolean;
  onQueryChange: (value: string) => void;
  onSortChange: (sort: NonNullable<AnimadexSearchParams["sort"]> | "") => void;
  onMultiChange: (multi: boolean) => void;
  onCopySelected: () => void;
  onToggleSelectedOnly: () => void;
  onClearSelected: () => void;
};

/**
 * 弹窗标题下方的横向工具条：
 * 左侧浮动：[搜索角色名称]（收窄后的固定宽度）
 * 右侧浮动：排序（热度 | 最新）/ 单选多选 / 复制已选 / 只看已选 / 清除已选
 */
export function CharacterPickerToolbar({
  query,
  sort,
  multi,
  selectedCount,
  selectedOnly,
  onQueryChange,
  onSortChange,
  onMultiChange,
  onCopySelected,
  onToggleSelectedOnly,
  onClearSelected,
}: CharacterPickerToolbarProps) {
  const { t } = useTranslation();

  return (
    <div
      data-character-toolbar
      className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
    >
      <div data-character-search className="relative w-[220px] max-w-full shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          aria-label={t("characters.toolbar.searchLabel")}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("characters.toolbar.searchPlaceholder")}
          className="h-8 w-full rounded-lg border border-border bg-muted pl-8 pr-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-stroke/40"
        />
      </div>

      {/* 其余控件整体右浮动 */}
      <div
        data-character-toolbar-right
        className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        {/* 排序：横向排列 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("characters.toolbar.sort")}</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(
              [
                { value: "", label: t("characters.toolbar.sortHot") },
                { value: "recent", label: t("characters.toolbar.sortLatest") },
              ] as const
            ).map((option) => {
              const active = sort === option.value;
              return (
                <button
                  key={option.value || "hot"}
                  type="button"
                  data-character-sort={option.value || "hot"}
                  aria-pressed={active}
                  onClick={() => onSortChange(option.value)}
                  className={cn(
                    "h-8 px-3 text-xs transition-colors",
                    active
                      ? cn("font-medium", ACCENT_SELECTED_SOFT_CLASS)
                      : "bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 单选 / 多选 */}
        <button
          type="button"
          role="switch"
          data-character-mode={multi ? "multi" : "single"}
          aria-checked={multi}
          onClick={() => onMultiChange(!multi)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
              multi ? "border-accent-stroke bg-accent-fill" : "border-border bg-background"
            )}
          >
            {multi && <span className="h-1.5 w-1.5 rounded-full bg-accent-fill-foreground" />}
          </span>
          {multi ? t("characters.toolbar.multi") : t("characters.toolbar.single")}
        </button>

        <div className="flex items-center gap-1.5">
          <ToolbarButton
            dataAttr="data-character-copy-selected"
            icon={<Copy className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.copySelected")}
            disabled={selectedCount === 0}
            onClick={onCopySelected}
          />
          <ToolbarButton
            dataAttr="data-character-only-selected"
            icon={<Eye className="h-3.5 w-3.5" />}
            label={t("characters.toolbar.onlySelected")}
            active={selectedOnly}
            onClick={onToggleSelectedOnly}
          />
          <ToolbarButton
            dataAttr="data-character-clear-selected"
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
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? cn("font-medium", ACCENT_SELECTED_SOFT_CLASS)
          : "bg-background text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
