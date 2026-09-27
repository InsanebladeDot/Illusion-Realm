"use client";

import Image from "next/image";
import { Check, Tag } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { formatTagPreview, tagCategoryShortName } from "@/utils/tagLibrary";
import { cn } from "@/utils/cn";

type TagLibraryCardProps = {
  item: StaticTagItem;
  selected: boolean;
  /** 数据钩子前缀：pose / background */
  prefix: string;
  onOpen: () => void;
};

/**
 * 静态标签库卡片：视觉与角色卡片一致
 * （白底、12px 圆角、1px 浅灰描边、4:5 预览图、选中态描边 + 勾选标记）。
 */
export function TagLibraryCard({
  item,
  selected,
  prefix,
  onOpen,
}: TagLibraryCardProps) {
  const { t } = useTranslation();

  return (
    <article
      {...{ [`data-${prefix}-card`]: item.id }}
      {...{ [`data-${prefix}-selected`]: selected ? "true" : "false" }}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]",
        selected ? "border-[#A78BFA] ring-1 ring-[#A78BFA]" : "border-[#E8E8E8]"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("characters.card.select", { name: item.name_zh || item.name })}
        aria-pressed={selected}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-[#F3F4F6]"
      >
        {item.preview ? (
          <Image
            src={item.preview}
            alt={item.name_zh || item.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-[#9CA3AF]">
            {t("characters.card.noPreview")}
          </span>
        )}
      </button>

      <div className="h-px w-full bg-[#EFEFEF]" />

      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-semibold text-[#222222]"
            title={item.name_zh}
          >
            {item.name_zh || item.name}
          </h3>
          <p className="truncate text-[11px] text-[#999999]" title={item.name}>
            {item.name}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="max-w-[70%] truncate rounded-md bg-[#F0F0F0] px-1.5 py-0.5 text-[11px] text-[#666666]">
            {tagCategoryShortName(
              item.categories?.[0] ?? t("characters.tagLibrary.uncategorized")
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#999999]">
            <Tag className="h-3.5 w-3.5" />
            {formatTagPreview(item.tags, 2)}
          </span>
        </div>
      </div>

      {selected ? (
        <span
          {...{ [`data-${prefix}-checked`]: "true" }}
          className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#8B5CF6] text-white shadow"
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </article>
  );
}
