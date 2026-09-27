"use client";

import { useState } from "react";
import { ChevronRight, Tag } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { listTagCategories, tagCategoryShortName } from "@/utils/tagLibrary";
import { cn } from "@/utils/cn";

type TagCategorySidebarProps = {
  items: StaticTagItem[];
  category: string;
  selectedCount: number;
  selectedOnly: boolean;
  prefix: string;
  /** 分类区标题（默认「分类」） */
  sectionTitle?: string;
  onCategoryChange: (category: string) => void;
  onSelectedOnlyChange: (value: boolean) => void;
};

const ACCENT_BAR = "#A78BFA";
const ACCENT_TINT = "#F5F3FF";

/**
 * 静态标签库左侧导航（与角色选择器的 Saber 栏同一套排版）：
 * 「已选」固定在上、「分类」可收纳并内部滚动。
 */
export function TagCategorySidebar({
  items,
  category,
  selectedCount,
  selectedOnly,
  prefix,
  sectionTitle,
  onCategoryChange,
  onSelectedOnlyChange,
}: TagCategorySidebarProps) {
  const { t } = useTranslation();

  /** 回退值从「参数默认值」挪到函数体内：默认值在函数体外求值，拿不到 hook 的 t */
  const sectionTitleText = sectionTitle ?? t("characters.tagLibrary.sectionTitleDefault");
  const categories = listTagCategories(items);
  const [listOpen, setListOpen] = useState(true);

  return (
    <aside
      {...{ [`data-${prefix}-sidebar`]: "true" }}
      className="flex h-full w-full shrink-0 flex-col overflow-hidden border-b border-[#E5E7EB] bg-white md:w-56 md:border-b-0 md:border-r"
    >
      <div className="shrink-0 space-y-1 border-b border-[#F0F0F0] px-1 py-3">
        <p className="px-2 text-xs font-medium tracking-wide text-[#888888]">
          {t("characters.tagLibrary.selected")}
        </p>
        <button
          type="button"
          {...{ [`data-${prefix}-filter-selected`]: "true" }}
          aria-pressed={selectedOnly}
          onClick={() => onSelectedOnlyChange(!selectedOnly)}
          className={cn(
            "relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            selectedOnly ? "text-[#222222]" : "text-[#333333] hover:bg-[#F8F9FA]"
          )}
          style={selectedOnly ? { background: ACCENT_TINT } : undefined}
        >
          {selectedOnly ? (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
              style={{ background: ACCENT_BAR }}
            />
          ) : null}
          <span className={cn("truncate pl-1.5", selectedOnly && "font-medium")}>
            {t("characters.tagLibrary.selectedOnlyCount", { count: selectedCount })}
          </span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col py-3">
        <button
          type="button"
          {...{ [`data-${prefix}-section-toggle`]: "categories" }}
          aria-expanded={listOpen}
          onClick={() => setListOpen((prev) => !prev)}
          className="flex w-full shrink-0 items-center justify-between gap-1 px-2 py-1.5 text-left transition-colors hover:bg-[#F8F9FA]"
        >
          <span className="text-xs font-medium tracking-wide text-[#888888]">
            {sectionTitleText}
          </span>
          <ChevronRight
            {...{ [`data-${prefix}-section-arrow`]: listOpen ? "down" : "right" }}
            className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]"
            style={{
              transform: listOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </button>

        <div
          {...{ [`data-${prefix}-category-list`]: "true" }}
          className={cn(
            "min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 [scrollbar-width:thin]",
            !listOpen && "hidden"
          )}
        >
          <CategoryRow
            prefix={prefix}
            label={t("characters.tagLibrary.allCategoriesCount", { count: items.length })}
            selected={category === ""}
            onClick={() => onCategoryChange("")}
          />
          {categories.map((item) => (
            <CategoryRow
              key={item}
              prefix={prefix}
              label={tagCategoryShortName(item)}
              title={item}
              selected={category === item}
              onClick={() => onCategoryChange(item)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function CategoryRow({
  prefix,
  label,
  title,
  selected,
  onClick,
}: {
  prefix: string;
  label: string;
  title?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      {...{ [`data-${prefix}-category`]: title ?? label }}
      aria-pressed={selected}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        selected ? "text-[#222222]" : "text-[#333333] hover:bg-[#F8F9FA]"
      )}
      style={selected ? { background: ACCENT_TINT } : undefined}
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
          style={{ background: ACCENT_BAR }}
        />
      ) : null}
      <Tag className="mr-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
      <span className={cn("truncate", selected && "font-medium")}>{label}</span>
    </button>
  );
}
