"use client";

/**
 * 角色资料适配器：保留线上/本地身份、收藏与详情契约。
 * 统一卡片只接收显示字段，角色源结构不会泄漏到动作等其他库。
 * 热度仍取角色资料count，不描述为实时生成数量。
 * 缺少作品时沿用既有未知作品词条，图片仍按缩略图优先。
 */
import { Flame } from "lucide-react";
import { LibraryCard } from "@/components/library/library-card";
import { useTranslation } from "@/i18n";
import type { AnimadexCharacter } from "@/types/character";
import { formatCount } from "@/utils/charactersFormat";

type CharacterCardProps = {
  // 同一角色数据可呈现图片或文本，收藏与选择回调保持不变。
  displayMode?: "card" | "text";
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
 * 三个操作分别透传，不将收藏或详情转换为主卡片点击。
 * character前缀保留既有回归与详情定位的数据钩子。
 * 包装器不持有选择状态，父组件仍负责跨页草稿。
 * 底部作品和右侧热度作为参数送入唯一卡片布局。
 * 主题、比例、圆角和图片失败回退全部由共用组件维护。
 * 同一角色切换资料来源后，预览会按当前地址重新加载。
 */
export function CharacterCard({ character, favorite, selected = false, displayMode, onOpen, onShowDetail, onToggleFavorite }: CharacterCardProps) {
  const { t } = useTranslation();
  return <LibraryCard displayMode={displayMode} text={character.trigger || character.name} prefix="character" id={character.slug} title={character.name} preview={character.thumbUrl || character.imageUrl} badge={character.copyrightName || character.copyright || t("characters.card.unknownWork")} metric={<><Flame className="h-3.5 w-3.5 shrink-0" />{formatCount(character.count)}</>} selected={selected} favorite={favorite} onSelect={onOpen} onDetail={onShowDetail} onFavorite={onToggleFavorite} />;
}
