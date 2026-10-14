"use client";

import Image from "next/image";
import { Check, Flame, Heart, Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AnimadexCharacter } from "@/types/character";
import { formatCount } from "@/utils/charactersFormat";
import { cn } from "@/utils/cn";
import { ACCENT_SELECTED_OUTLINE_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";

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
 * 角色卡片：背景、文字和选中态复用主题变量与创建页强调色样式。
 * 上方主图，下方角色与作品信息；点击卡片选中，角标提供收藏和详情入口。
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
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-background shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]",
        selected ? ACCENT_SELECTED_OUTLINE_CLASS : "border-border"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("characters.card.select", { name: character.name })}
        aria-pressed={selected}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-muted"
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
          <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {t("characters.card.noPreview")}
          </span>
        )}
      </button>

      {/* 发丝分割线 */}
      <div className="h-px w-full bg-border" />

      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        <h3
          className="truncate text-sm font-semibold text-foreground"
          title={character.name}
        >
          {character.name}
        </h3>
        <div className="flex items-end justify-between gap-2">
          <span className="max-w-[65%] truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {character.copyrightName || character.copyright || t("characters.card.unknownWork")}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
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
        className="absolute right-2 top-2 rounded-full bg-background/85 p-1.5 shadow-sm backdrop-blur transition-colors hover:bg-background"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            favorite
              ? "fill-accent-fill text-accent-fill"
              : "text-muted-foreground group-hover:text-foreground"
          )}
        />
      </button>

      {/* 左上角：选中标记 / 详情入口 */}
      <div className="absolute left-2 top-2 flex items-center gap-1">
        {selected && (
          <span
            data-character-checked
            className={cn("flex h-5 w-5 items-center justify-center rounded-full shadow", PRIMARY_BUTTON_CLASS)}
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
            className="rounded-full bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground"
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
