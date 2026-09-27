"use client";

import { useState } from "react";
import Image from "next/image";
import { Bookmark, Check, Copy, ExternalLink, Heart, Image as ImageIcon } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import type { AnimadexCharacter, AnimadexLora } from "@/types/character";
import { copyText, formatCount } from "@/utils/charactersFormat";
import { cn } from "@/utils/cn";

type CharacterDetailDialogProps = {
  character: AnimadexCharacter | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** 把该角色的提示词（触发词）导入提示词区 */
  onInsert: (character: AnimadexCharacter) => void;
  onOpenChange: (open: boolean) => void;
};

const ACCENT = "#8B5CF6";

/** 线框按钮（白底 + 1px 浅灰边框 + 深灰文字，悬浮变主题色边框） */
function OutlineAction({
  icon,
  label,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = cn(
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#333333] transition-colors",
    "hover:border-[#C4B5FD] hover:text-[#6D28D9]"
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {icon}
        {label}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

/**
 * 角色详情浮层：复用创作页「模型选择器 / 扩展选择器」的弹框父组件
 * （ResourceDialogShell），保证遮罩、容器、关闭按钮、标题与滚动行为完全一致。
 */
export function CharacterDetailDialog({
  character,
  favorite,
  onToggleFavorite,
  onInsert,
  onOpenChange,
}: CharacterDetailDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const [lorasOpen, setLorasOpen] = useState(false);

  if (!character) return null;

  const loras = character.loras;

  const handleCopyTrigger = async () => {
    const ok = await copyText(character.trigger);
    showToast(
      ok
        ? t("characters.detail.copiedTrigger")
        : t("characters.detail.copyFailedManual"),
      ok ? "success" : "error"
    );
  };

  const handleCopyTags = async () => {
    const ok = await copyText(character.tags.join(", "));
    showToast(
      ok
        ? t("characters.detail.copiedTags", { count: character.tags.length })
        : t("common.copyFailed"),
      ok ? "success" : "error"
    );
  };

  return (
    <ResourceDialogShell
      open={Boolean(character)}
      title={character.name}
      titleId="character-detail-dialog-title"
      description={
        <span className="inline-flex items-center gap-2">
          <span className="rounded-md bg-[#F0F0F0] px-1.5 py-0.5 text-[11px] text-[#666666]">
            {character.copyrightName || character.copyright || t("characters.detail.unknownWork")}
          </span>
          <span>{character.tags.length}{t("characters.detail.tagUnit")}</span>
        </span>
      }
      onOpenChange={onOpenChange}
      bodyClassName="px-3 pb-4 pt-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-5 lg:flex-row">
        {/* 主图 */}
        <div className="relative min-h-[240px] w-full shrink-0 overflow-hidden rounded-xl border border-[#E8E8E8] bg-[#F3F4F6] lg:w-72">
          {character.imageUrl || character.thumbUrl ? (
            <Image
              src={character.imageUrl || character.thumbUrl}
              alt={character.name}
              fill
              sizes="(max-width: 1024px) 100vw, 288px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-xs text-[#9CA3AF]">
              {t("characters.detail.noPreview")}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {/* Trigger 触发词 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#888888]">
              {t("characters.detail.triggerLabel")}
            </p>
            <div className="flex items-center gap-2">
              <div
                data-character-trigger
                className="h-10 min-w-0 flex-1 truncate rounded-lg border-0 bg-[#F5F6F8] px-3 text-sm leading-10 text-[#333333]"
                title={character.trigger}
              >
                {character.trigger || t("characters.detail.noTrigger")}
              </div>
              <button
                type="button"
                data-character-add-lora
                aria-expanded={lorasOpen}
                onClick={() => setLorasOpen((prev) => !prev)}
                className="shrink-0 rounded-full px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: ACCENT }}
              >
                + LoRA{loras.length > 0 ? `（${loras.length}）` : ""}
              </button>
            </div>

            {lorasOpen && (
              <div
                data-character-lora-list
                className="space-y-2 rounded-lg border border-[#E8E8E8] bg-white p-2"
              >
                {loras.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-[#9CA3AF]">
                    {t("characters.detail.noLora")}
                  </p>
                ) : (
                  loras.map((lora: AnimadexLora) => (
                    <a
                      key={`${lora.name}-${lora.url}`}
                      href={lora.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-[#F8F9FA]"
                    >
                      {lora.thumb ? (
                        <Image
                          src={lora.thumb}
                          alt=""
                          width={40}
                          height={40}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#F0F0F0] text-[#9CA3AF]">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-[#333333]">
                        {lora.name}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
                    </a>
                  ))
                )}
              </div>
            )}
          </div>

          {/* TAGS */}
          <div className="space-y-2">
            <p className="text-sm font-light text-[#6B7280]">
              TAGS · {character.tags.length}
            </p>
            <div
              data-character-tags
              className="flex flex-wrap gap-1.5"
            >
              {character.tags.length === 0 ? (
                <span className="text-xs text-[#9CA3AF]">
                  {t("characters.detail.noTags")}
                </span>
              ) : (
                character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-[#EDEDED] bg-[#FAFAFA] px-2 py-0.5 text-xs text-[#555555]"
                  >
                    {tag}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* 操作按钮（2×2 线框按钮） */}
          <div className="grid grid-cols-2 gap-2">
            <OutlineAction
              icon={<Check className="h-4 w-4" />}
              label={t("characters.detail.insertPrompt")}
              onClick={() => onInsert(character)}
            />
            <OutlineAction
              icon={<Copy className="h-4 w-4" />}
              label={t("characters.detail.copyTrigger")}
              onClick={() => void handleCopyTrigger()}
            />
            <OutlineAction
              icon={<Bookmark className="h-4 w-4" />}
              label={t("characters.detail.copyAllTags")}
              onClick={() => void handleCopyTags()}
            />
            <OutlineAction
              icon={
                <Heart
                  className={cn(
                    "h-4 w-4",
                    favorite && "fill-[#8B5CF6] text-[#8B5CF6]"
                  )}
                />
              }
              label={
                favorite
                  ? t("characters.detail.unfavorite")
                  : t("characters.detail.favorite")
              }
              onClick={onToggleFavorite}
            />
          </div>

          {/* 底部信息栏 */}
          <div className="flex items-center gap-5 border-t border-[#EFEFEF] pt-3 text-xs text-[#999999]">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {formatCount(character.favCount)}
            </span>
            <span>
              {t("characters.detail.heat")}
              {formatCount(character.count)}
            </span>
            <span>
              {t("characters.detail.rating")}
              {character.rating.up} / {character.rating.down}
            </span>
            <span className="ml-auto truncate" title={character.slug}>
              {character.slug}
            </span>
          </div>
        </div>
      </div>
    </ResourceDialogShell>
  );
}
