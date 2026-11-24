"use client";
import { HoverTip } from "@/components/hover-tip";


// 界面：分类和分类内模型共用的资源卡片，封面、选中边框、标题及 footer 完全同源。
import type { ReactNode } from "react";
import { Info, Star } from "lucide-react";
import { ResourceCoverImage } from "@/components/ResourceCoverImage";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ModelCover } from "@/types/model";
import type { ResourceDialogTypography } from "@/utils/resourceDialogFontSize";

interface Props {
  name: string; cover: ModelCover; selected: boolean; typography: ResourceDialogTypography;
  tag?: string; tagClassName?: string; meta?: ReactNode; children: ReactNode;
  // 分类卡片可包含多个模型，计数由拥有草稿的选择器计算后注入。
  // 内层单模型卡片不传计数，仍只显示原来的“已选”，避免改变其选中语义。
  // 计数不决定 selected，也不在展示组件重新读取全局模型状态。
  // 同一组件的主模型与 LoRA 实例各自接收数据，不共用另一份计数缓存。
  selectedCount?: number;
  optionId?: string; onPick?: () => void;
}
export function ResourceSelectionCard({ name, cover, selected, selectedCount, typography, tag, tagClassName, meta, children, optionId, onPick }: Props) {
  const { t } = useTranslation();
  // 固定高度跟随已有字号档而非每张卡的内容量；同档所有卡片得到相同底部空间。
  // 小中大三档对应112、128、144像素，给原36、40、44像素按钮保留完整点击区。
  // 不把大字号硬塞进小号高度，副标题不会被竖向裁掉一半。
  const bodyHeight = typography.actionHeight === "h-11" ? "h-36" : typography.actionHeight === "h-10" ? "h-32" : "h-28";
  return <div data-resource-card data-resource-model-option={optionId} data-lora-model-option={optionId}
    role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-pressed={onPick ? selected : undefined}
    onClick={onPick} onKeyDown={(event) => { if (onPick && event.target === event.currentTarget && ["Enter", " "].includes(event.key)) { event.preventDefault(); onPick(); } }}
    className={cn("group relative flex min-w-0 flex-col rounded-xl border bg-background transition-colors",
      onPick && "cursor-pointer", selected ? "overflow-visible border-green-500 outline outline-1 outline-green-500" : "overflow-hidden border-border/60 hover:border-foreground/40 dark:border-gray-700")}>
    {selected && <span className={cn("absolute -top-5 right-2 z-30 rounded-t-md bg-green-500 px-2 py-0.5 font-bold text-white", typography.selectedBadge)}>{t("create.extensionSelectDialog.selected")}{selectedCount !== undefined && <span data-resource-selected-count={selectedCount}> {selectedCount}</span>}</span>}
    <div className="relative isolate aspect-[4/5] w-full shrink-0 overflow-hidden rounded-t-xl bg-muted">
      <ResourceCoverImage cover={cover} alt={name} fill sizes="(max-width: 640px) 50vw, 33vw" className="absolute inset-0 h-full w-full object-cover" />
      {tag && <HoverTip asChild layer="window" label={(tag) ?? ""}><span className={cn("absolute left-2 top-2 max-w-[70%] truncate rounded-full px-2 py-1 font-semibold", typography.coverTag, tagClassName ?? "bg-zinc-700/80 text-white")}>{tag}</span></HoverTip>}
      <div className="absolute right-2 top-2 z-20 flex gap-1">
        {[{ Icon: Info, label: t("create.extensionSelectDialog.viewInfo") }, { Icon: Star, label: t("create.extensionSelectDialog.addToFavorites") }].map(({ Icon, label }) => <HoverTip key={label} asChild layer="window" label={(label) ?? ""}><button key={label} type="button" onClick={(event) => event.stopPropagation()} className="rounded-full bg-black/50 p-1.5 hover:bg-black/70"><Icon className="h-4 w-4 text-white" /></button></HoverTip>)}
      </div>
    </div>
    {/* 文字区按当前字号档固定高度，模型缺少副标题也保留同样空间，按钮不再上下跳。 */}
    {/* 这份高度容纳当前三档标题、单行说明、操作高度和原上下内边距，不覆盖字号偏好。 */}
    {/* 封面继续使用原4:5比例，网格决定卡宽，相同列宽自然得到相同封面与卡片总高。 */}
    <div data-resource-card-body className={cn("flex min-w-0 shrink-0 flex-col px-3 pb-3 pt-2", bodyHeight)}>
      <HoverTip asChild layer="window" label={(name) ?? ""}><h3 className={cn("shrink-0 truncate font-semibold text-foreground", typography.cardTitle)}>{name}</h3></HoverTip>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground", typography.cardMeta)}>{meta}</div>
      {/* 同一行出现有副标题与无副标题的模型时，缺少说明只留下空位，不能压缩卡高。 */}
      {/* meta 继续由调用方传入，分类计数、模型版本路径和已选状态不在这里重新计算。 */}
      {/* 元信息区域可缩到剩余高度，禁止长文件路径通过最小内容尺寸撑开父级。 */}
      {/* 选择按钮的文字和禁用行为不变，公共外壳只负责它所在的底部基线。 */}
      {/* 字体档改变会统一重算所有卡，而不是把长标题单独缩小字号。 */}
      {/* 封面加载失败仍占原比例，网络返回早晚不影响下方按钮位置。 */}
      {/* 选中标签使用原绝对定位，新增固定文字区不会移动上方选中状态。 */}
      {/* 窄窗口仍由原网格决定列宽，不能为了按钮对齐把所有卡改为固定屏幕宽。 */}
      {/* footer 包装保留React事件冒泡，版本整卡点击和分类内部按钮继续走各自动作。 */}
      {/* 纯文字截断不改原始name或meta，打开详情仍能读取完整模型身份。 */}
      {/* 操作区始终贴底且不收缩，模型选择和分类入口复用原children，不复制按钮业务。 */}
      {/* 长名字和副标题只做单行省略，完整名称仍由标题和说明自己的title属性保留。 */}
      {/* 元信息区吸收剩余高度，不能让有说明的一张卡把相邻按钮挤到不同基线。 */}
      <div data-resource-card-footer className="mt-auto shrink-0">{children}</div>
    </div>
  </div>;
}
