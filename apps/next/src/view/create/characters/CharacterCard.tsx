"use client";

import Image from "next/image";
import { Check, Flame, Heart, Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AnimadexCharacter } from "@/types/character";
import { formatCount } from "@/utils/charactersFormat";
import { cn } from "@/utils/cn";

type CharacterCardProps = {
  character: AnimadexCharacter;
  favorite: boolean;
  /** 是否已被选中（选择弹窗里点击卡片即选中） */
  selected?: boolean;
  /** 点击卡片：选中该角色 */
  onOpen: () => void;
  /** 查看详情浮层（可选） */
  onShowDetail?: () => void;
  onToggleFavorite: () => void;
};

/**
 * 角色卡片（浅色极简）：
 * 白色大圆角 + 1px 浅灰描边 + 柔和阴影；上方主图（约 75% 高）+ 发丝分割线，
 * 下方信息栏：角色名（加粗深黑）、作品名（浅灰底小标签）、右下角热度、右上角爱心。
 * 点击整张卡片 = 选中（选中态为淡紫描边 + 右上角勾选标记）。
 */
export function CharacterCard({
  character,
  favorite,
  selected = false,
  onOpen,
  onShowDetail,
  onToggleFavorite,
}: CharacterCardProps) {
  const { t } = useTranslation();

  return (
    <article
      data-character-card={character.slug}
      data-character-selected={selected ? "true" : "false"}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]",
        selected ? "border-[#A78BFA] ring-1 ring-[#A78BFA]" : "border-[#E8E8E8]"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("characters.card.select", { name: character.name })}
        aria-pressed={selected}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-[#F3F4F6]"
      >
        {character.thumbUrl || character.imageUrl ? (
          <Image
            src={character.thumbUrl || character.imageUrl}
            alt={character.name}
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

      {/* 发丝分割线 */}
      <div className="h-px w-full bg-[#EFEFEF]" />

      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        <h3
          className="truncate text-sm font-semibold text-[#222222]"
          title={character.name}
        >
          {character.name}
        </h3>
        <div className="flex items-end justify-between gap-2">
          <span className="max-w-[65%] truncate rounded-md bg-[#F0F0F0] px-1.5 py-0.5 text-[11px] text-[#666666]">
            {character.copyrightName || character.copyright || t("characters.card.unknownWork")}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-[#999999]">
            <Flame className="h-3.5 w-3.5" />
            {formatCount(character.count)}
          </span>
        </div>
      </div>

      {/* 右上角：收藏 */}
      <button
        type="button"
        aria-label={
          favorite
            ? t("characters.card.unfavorite", { name: character.name })
            : t("characters.card.favorite", { name: character.name })
        }
        aria-pressed={favorite}
        data-character-favorite={character.slug}
        onClick={onToggleFavorite}
        className="absolute right-2 top-2 rounded-full bg-white/85 p-1.5 shadow-sm backdrop-blur transition-colors hover:bg-white"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            favorite
              ? "fill-[#A78BFA] text-[#A78BFA]"
              : "text-[#9CA3AF] group-hover:text-[#A78BFA]"
          )}
        />
      </button>

      {/* 左上角：选中标记 / 详情入口 */}
      <div className="absolute left-2 top-2 flex items-center gap-1">
        {selected && (
          <span
            data-character-checked
            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B5CF6] text-white shadow"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        {onShowDetail && (
          <button
            type="button"
            data-character-detail={character.slug}
            aria-label={t("characters.card.viewDetail", { name: character.name })}
            onClick={onShowDetail}
            className="rounded-full bg-white/85 p-1.5 text-[#9CA3AF] shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-[#6D28D9]"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
