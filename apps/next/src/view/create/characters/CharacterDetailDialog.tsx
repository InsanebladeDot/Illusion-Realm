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
import { PRIMARY_BUTTON_CLASS } from "@/utils/layout";
// 本地分类选中的角色按姓名与作品补充线上媒体，不能只按同名借图。
// hook 在切换/关闭时隔离迟到回执，原详情的收藏和插入仍用稳定本地 slug。
// 在线无法匹配时保持本地详情可用，并说明实际状态而非无止境加载。
import { useCharacterOnlineDetails } from "@/hooks/use-character-online-details";

type CharacterDetailDialogProps = {
  character: AnimadexCharacter | null;
  favorite: boolean;
  onToggleFavorite: () => void;
  /** 把该角色的提示词（触发词）导入提示词区 */
  onInsert: (character: AnimadexCharacter) => void;
  onOpenChange: (open: boolean) => void;
};

/** 线框按钮：复用主题背景、文字与强调色描边。 */
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
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors",
    "hover:border-accent-stroke hover:text-foreground"
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
  // 分别保存选择基准与展示结果，线上补图不改变本地筛选身份。
  // 原 props 名不变，外层多选和详情关闭逻辑无需维护第二套对象。
  // 直接在线角色不会额外联网，只有 local 前缀才尝试组合资料。
  character: selectedCharacter,
  favorite,
  onToggleFavorite,
  onInsert,
  onOpenChange,
}: CharacterDetailDialogProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const [lorasOpen, setLorasOpen] = useState(false);
  // 详情也会先展示本地关联封面，CDN 缺图时回落已有占位而非破损图片。
  // 失败状态只记地址，不改角色资料、标签或父层的选择草稿。
  // 记录地址而非布尔值，在线补全返回新地址时仍允许重新加载。
  // 与 LibraryCard 使用同样的失败归属规则，不另造下载和重试服务。
  const [failedPreview, setFailedPreview] = useState("");
  // 详情首帧显示本地字段，线上只补图片、来源链接和推荐 LoRA。
  // notice 是 i18n key；网络错误不向 UI 泄露上游异常或磁盘路径。
  // 同名不同作品无匹配时保持原数据，不能把第一个候选当成用户角色。
  const { character,notice } = useCharacterOnlineDetails(selectedCharacter);

  if (!character) return null;

  const loras = character.loras;
  // 线上高清图优先，其次缩略图；本地适配器已关联同一参考封面。
  // 图片失败只影响展示，不阻塞触发词插入、收藏与详情关闭。
  // hook 切换角色时仍核对原对象归属，此处不通过姓名猜图片所属。
  // 没有自动重试循环，用户换图后才会尝试新的资源地址。
  const preview = character.imageUrl || character.thumbUrl;

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
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {character.copyrightName || character.copyright || t("characters.detail.unknownWork")}
          </span>
          <span>{character.tags.length}{t("characters.detail.tagUnit")}</span>
          {/* 界面：线上资料匹配状态；失败仍可使用本地触发词。 */}
          {/* 通知不替代已有作品标签，用户能继续核对正在查看的身份。 */}
          {/* 线上原卡片不显示此通知，避免把已加载详情误标为等待。 */}
          {notice && <span data-character-online-status className="text-xs text-muted-foreground">{t(notice)}</span>}
        </span>
      }
      onOpenChange={onOpenChange}
      bodyClassName="px-3 pb-4 pt-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-5 lg:flex-row">
        {/* 主图 */}
        <div className="relative min-h-[240px] w-full shrink-0 overflow-hidden rounded-xl border border-border bg-muted lg:w-72">
          {/* 界面：角色封面；未收录的 CDN 图片沿用原缺图文案。 */}
          {/* 图片错误不冒泡成整张详情的加载失败，离线资料仍然可用。 */}
          {preview && failedPreview !== preview ? (
            <Image
              key={preview}
              src={preview}
              onError={() => setFailedPreview(preview)}
              alt={character.name}
              fill
              sizes="(max-width: 1024px) 100vw, 288px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
              {t("characters.detail.noPreview")}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {/* Trigger 触发词 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("characters.detail.triggerLabel")}
            </p>
            <div className="flex items-center gap-2">
              <div
                data-character-trigger
                className="h-10 min-w-0 flex-1 truncate rounded-lg border-0 bg-muted px-3 text-sm leading-10 text-foreground"
                title={character.trigger}
              >
                {character.trigger || t("characters.detail.noTrigger")}
              </div>
              <button
                type="button"
                data-character-add-lora
                aria-expanded={lorasOpen}
                onClick={() => setLorasOpen((prev) => !prev)}
                className={cn("shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors", PRIMARY_BUTTON_CLASS)}
              >
                + LoRA{loras.length > 0 ? `（${loras.length}）` : ""}
              </button>
            </div>

            {lorasOpen && (
              <div
                data-character-lora-list
                className="space-y-2 rounded-lg border border-border bg-background p-2"
              >
                {loras.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    {t("characters.detail.noLora")}
                  </p>
                ) : (
                  loras.map((lora: AnimadexLora) => (
                    <a
                      key={`${lora.name}-${lora.url}`}
                      href={lora.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-muted"
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
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {lora.name}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ))
                )}
              </div>
            )}
          </div>

          {/* TAGS */}
          <div className="space-y-2">
            <p className="text-sm font-light text-muted-foreground">
              TAGS · {character.tags.length}
            </p>
            <div
              data-character-tags
              className="flex flex-wrap gap-1.5"
            >
              {character.tags.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t("characters.detail.noTags")}
                </span>
              ) : (
                character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
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
                    favorite && "fill-accent-fill text-accent-fill"
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
          <div className="flex items-center gap-5 border-t border-border pt-3 text-xs text-muted-foreground">
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
