"use client";

/** 唯一的资料库文本卡片，把源数据差异留给角色与标签适配器。 */
// 主操作、收藏和详情是并列按钮，点心形不能顺便选中一个角色。
// 与图片卡片共用身份属性，切换视图不根据文字标题重建业务选择。
import { Heart, Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import type { LibraryCardProps } from "./library-card";

// 色点只是稳定的浏览提示，不代表模型兼容性或标签质量评分。
// 用同一身份计算颜色，换页和重新渲染不会出现随机跳色。
// 与原静态库的调色集合保持一致，主题背景和文字仍读取语义变量。
function textTagColor(id: string): string {
  const colors = ["#EAB308", "#F97316", "#38BDF8", "#A78BFA", "#34D399"];
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// 只展示名称与触发词，不挂载隐藏图片，文本模式不会下载卡片缩略图。
// 完整内容留在 title 中，长名称截断也不改变复制、应用时使用的原始数据。
// 详情回调可选，普通标签没有详情时不留一个无法操作的空按钮。
// 收藏状态由外部传入，组件不能把视觉点击当成已经写盘成功。
// 各按钮使用独立可访问名称，键盘用户能分清选择、收藏和详情。
// 类型导入会被编译移除，不建立两个组件互相执行的运行时依赖。
export function LibraryTextItem(props: LibraryCardProps) {
  const { t } = useTranslation();
  const { prefix, id, title, text, subtitle, selected, favorite, onSelect, onFavorite, onDetail } = props;
  return <article data-library-text {...{ [`data-${prefix}-card`]: id, [`data-${prefix}-selected`]: String(selected) }} className={cn("inline-flex max-w-full items-center rounded-lg border bg-background text-xs", selected ? "border-accent-stroke bg-accent-soft ring-1 ring-accent-stroke" : "border-border")}>
    {/* modal：文字卡片主操作不包住心形和详情，避免嵌套交互控件。 */}
    <button type="button" aria-label={t("characters.card.select", { name: title })} aria-pressed={selected} title={`${title} ${text ?? subtitle ?? ""}`} onClick={onSelect} className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: textTagColor(props.colorKey ?? id) }} />
      <span className="max-w-[14rem] truncate font-semibold text-foreground">{title}</span>
      <span className="max-w-[18rem] truncate text-muted-foreground">{text ?? subtitle}</span>
    </button>
    {onDetail && <button type="button" {...{ [`data-${prefix}-detail`]: id }} aria-label={t("characters.card.viewDetail", { name: title })} onClick={onDetail} className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-accent-stroke"><Info size={14} /></button>}
    {onFavorite && <button type="button" {...{ [`data-${prefix}-favorite`]: id }} aria-pressed={!!favorite} aria-label={t(favorite ? "characters.card.unfavorite" : "characters.card.favorite", { name: title })} onClick={onFavorite} className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-accent-stroke"><Heart size={14} className={favorite ? "fill-accent-fill text-accent-fill" : ""} /></button>}
  </article>;
}
