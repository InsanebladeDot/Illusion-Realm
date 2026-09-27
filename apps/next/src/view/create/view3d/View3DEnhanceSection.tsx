"use client";

import {
  ENHANCE_AXIS_META,
  ENHANCE_MIN,
  ENHANCE_STEP,
  SERIES_ENHANCE_MAX,
  type EnhanceAxis,
  type EnhanceWeights,
} from "@/utils/view3d/enhanceWeights";
import {
  formatWeightedTag,
  type ViewSeries,
  type WeightedTag,
} from "@/utils/view3d/promptMapping";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

type View3DEnhanceSectionProps = {
  series: ViewSeries;
  weights: EnhanceWeights;
  /** Z 轴当前景别（倍率放大后会带权重输出） */
  shotTag: WeightedTag;
  /** X 轴当前朝向词条 */
  toward: WeightedTag[];
  /** Y 轴当前视角词条（平视时为空） */
  angle: WeightedTag[];
  onChange: (axis: EnhanceAxis, value: number) => void;
  onReset: () => void;
};

/**
 * 增强倍率面板：四个滑块（X 朝向 / Y 视角 / Z 景别 / 总系数）。
 *
 * 基准权重来自《AI 提示词动态生成》需求文档，滑块默认全为 1（强度 ×1），
 * 此时输出与文档完全一致；放大后按系列上限收敛（Anima 3.0 / SDXL 2.0）。
 */
export function View3DEnhanceSection({
  series,
  weights,
  shotTag,
  toward,
  angle,
  onChange,
  onReset,
}: View3DEnhanceSectionProps) {
  const { t } = useTranslation();
  const max = SERIES_ENHANCE_MAX[series] ?? SERIES_ENHANCE_MAX.anima;
  const tagsByAxis: Record<"x" | "y" | "z", WeightedTag[]> = {
    x: toward,
    y: angle,
    z: [shotTag],
  };

  return (
    <div data-view3d-enhance className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{t("view3d.enhance.title")}</span>
        <button
          type="button"
          data-view3d-enhance-reset
          onClick={onReset}
          className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("view3d.enhance.resetAll")}
        </button>
      </div>

      {ENHANCE_AXIS_META.map(({ axis, labelKey, hint, hintKey }) => {
        const tags = axis === "total" ? [] : tagsByAxis[axis];
        const label = t(labelKey);
        const hintText = hintKey ? t(hintKey) : hint;
        return (
          <div key={axis} className="space-y-1" data-view3d-enhance-axis={axis}>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{label}</span>
              <span data-view3d-enhance-value={axis} className="font-mono text-foreground">
                ×{weights[axis].toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              aria-label={t("view3d.enhance.sliderLabel", { label })}
              data-view3d-enhance-slider={axis}
              min={ENHANCE_MIN}
              max={max}
              step={ENHANCE_STEP}
              value={weights[axis]}
              onChange={(event) => onChange(axis, Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {axis === "total" ? (
                hintText
              ) : (
                <span
                  data-view3d-enhance-tags={axis}
                  className={cn("font-mono", tags.length === 0 && "opacity-60")}
                >
                  {tags.length > 0
                    ? tags.map(formatWeightedTag).join(" ")
                    : t("view3d.enhance.emptyTags")}
                </span>
              )}
            </p>
          </div>
        );
      })}

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {t("view3d.enhance.footnoteLead")} <span className="font-mono">(front view:3.0)</span>
        {t("view3d.enhance.footnoteBody")}{max}{t("view3d.enhance.footnoteTail")}
      </p>
    </div>
  );
}
