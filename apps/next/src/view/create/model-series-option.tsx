"use client";

/** 系列选项保留勾选，说明移到滚动栏外；离开选项或失焦后收起，不残留悬停状态。 */
import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { Check } from "lucide-react";
import type { LocalizedModelSeries } from "@/data/modelSeries";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { useCascadePosition } from "@/components/prompt-assistant/use-cascade-position";
import tipStyles from "@/components/hover-tip.module.css";

function SeriesTips({ series }: { series: LocalizedModelSeries }) {
  const { t } = useTranslation();
  return <><p className="mb-1.5 font-medium">{t(series.tipsTitle)}</p><div className="space-y-1">{series.tips.map(tip => <p key={tip} className="flex items-start gap-1.5 opacity-80"><span className="mt-px">•</span><span>{t(tip)}</span></p>)}</div></>;
}

/** 像把说明贴到柜台外侧：沿用级联定位，右侧不足时翻到左边，滚动时跟随原选项。 */
function SeriesTip({ series, anchor }: { series: LocalizedModelSeries; anchor: RefObject<HTMLDivElement | null> }) {
  const { panel } = useCascadePosition(anchor, 0, "side");
  // 多段说明沿用级联定位和窄屏内联展示，浮层的黑色表面直接取公共提示卡片样式。
  return createPortal(<div ref={panel} role="tooltip" data-visible="true" data-model-series-tip={series.id} className={cn(tipStyles.tip, "hidden max-h-[calc(100dvh-16px)] overflow-y-auto md:block")}><SeriesTips series={series} /></div>, document.body);
}

export function ModelSeriesOption({ series, selected, blocked, onSelect }: { series: LocalizedModelSeries; selected: boolean; blocked: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const anchor = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const active = hovered || focused;
  return <div ref={anchor} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
    {/* 模型系列选项：当前值只显示勾选，底色仅在悬停时出现。 */}
    <button type="button" role="option" aria-selected={selected} aria-disabled={blocked} data-model-series-option={series.id} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={onSelect} className={cn("flex w-full items-start gap-2 rounded-md bg-transparent px-2 py-2 text-left transition-colors", blocked ? "cursor-not-allowed grayscale opacity-50" : "hover:bg-accent/50")}>
      <NextImage src={series.icon} alt="" width={18} height={18} className="mt-0.5 shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{series.label}</span>{selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground" />}</div><p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t(series.description)}</p>{active && <div className="mt-2 border-t border-border pt-2 text-xs md:hidden"><SeriesTips series={series} /></div>}</div>
    </button>
    {active && <SeriesTip series={series} anchor={anchor} />}
  </div>;
}
