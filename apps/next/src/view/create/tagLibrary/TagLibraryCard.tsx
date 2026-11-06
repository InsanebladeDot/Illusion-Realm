"use client";

/**
 * 静态资料适配器：动作、背景、表情及画师只映射源字段。
 * 卡片结构完全复用角色所用的LibraryCard，不再维护第二套白色样式。
 * 提示词保持源tags原值，显示截断不会影响确认后的实际输出。
 * 画师可额外提供收藏回调，普通静态库不显示空操作入口。
 */
import { Tag } from "lucide-react";
import { LibraryCard } from "@/components/library/library-card";
import { useTranslation } from "@/i18n";
import type { StaticTagItem } from "@/types/staticTagLibrary";
import { formatTagPreview, tagCategoryShortName } from "@/utils/tagLibrary";

/**
 * prefix沿用库配置，旧选择脚本不需要按新DOM层级猜入口。
 * favorite及onToggleFavorite同时由支持收藏的业务提供。
 * badge与metric可覆盖默认标签展示，用于画师作品数和独特性评分。
 * 其余静态库仍以原分类和源标签展示，不添加虚构的热度。
 */
interface TagLibraryCardProps { displayMode?: "card" | "text"; item: StaticTagItem; selected: boolean; prefix: string; onOpen: () => void; favorite?: boolean; onToggleFavorite?: () => void; badge?: React.ReactNode; metric?: React.ReactNode }

/**
 * 中文名与英文名不相同时保留英文副标题，画师原名不重复两遍。
 * 不在转换层下载预览或请求在线详情，离线也可选择Tags。
 * source id保持不变，跨页选择和收藏不会依赖当前卡片顺序。
 * 默认分类仍使用既有短名称函数，避免标签与过滤值混淆。
 * 图标可收缩，长Tags由共用指标区截断而非撑宽卡片。
 * 主选择回调只透传一次，不绑定article上的第二个click。
 * 同一套选中描边与角标适用于所有库及明暗主题。
 * 不修改源对象，业务层仍可以用原始资料构建生成参数。
 */
export function TagLibraryCard({ item, selected, prefix, onOpen, displayMode, favorite, onToggleFavorite, badge, metric }: TagLibraryCardProps) {
  const { t } = useTranslation();
  return <LibraryCard displayMode={displayMode} text={formatTagPreview(item.tags, 1) || item.name} colorKey={item.categories[0] || item.id} prefix={prefix} id={item.id} title={item.name_zh || item.name} subtitle={item.name_zh && item.name_zh !== item.name ? item.name : undefined} preview={item.preview} badge={badge ?? tagCategoryShortName(item.categories[0] || t("characters.tagLibrary.uncategorized"))} metric={metric ?? <><Tag className="h-3.5 w-3.5 shrink-0" />{formatTagPreview(item.tags, 2)}</>} selected={selected} favorite={favorite} onSelect={onOpen} onFavorite={onToggleFavorite} />;
}
