"use client";

// 图片与视频共用的受控尺寸 UI；不读取业务 store，不请求接口，不计算模型分辨率。
import { Ruler } from "lucide-react";
import type { ImageSizePreset } from "@/data/imageSizes";
import type { ImageSizeInput } from "@/utils/imageSize";
import { useTranslation } from "@/i18n";
import { ACCENT_SELECTED_OUTLINE_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";
import { AspectRatioIcon } from "./AspectRatioIcon";
import { RangeSlider } from "./RangeSlider";

interface SizeSelectorProps {
  value: ImageSizeInput;
  dimensions: { width: number; height: number };
  presets: readonly ImageSizePreset[];
  min: number;
  max: number;
  step: number;
  className?: string;
  hint?: string;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  onPresetChange: (id: string) => void;
  onCustomSizeChange: (size: { width?: number; height?: number }) => void;
}
const SIZE_BUTTON_CLASS = "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all hover:bg-accent/50";

function SizeScaleControl({ scale, onChange }: { scale: number; onChange: (scale: number) => void }) {
  const { t } = useTranslation();
  return <div data-size-scale className="flex shrink-0 items-center gap-2" title={t("create.imageSizeSection.scaleHint")}>
    <span className="flex h-5 w-14 items-center px-1">
      <RangeSlider min={0.1} max={1} step={0.1} value={scale} onChange={onChange}
        ariaLabel={t("create.imageSizeSection.scale")} trackClassName="h-1 bg-muted-foreground/20"
        fillClassName="bg-foreground/60" thumbClassName="h-3 w-3 border-input bg-background" />
    </span>
    <span data-size-scale-value className="w-7 text-right text-[11px] tabular-nums text-muted-foreground">{scale.toFixed(1)}×</span>
  </div>;
}

function SizeSelectorHeader({ value, dimensions, scale, onScaleChange }: SizeSelectorProps) {
  const { t } = useTranslation();
  return <div className="flex items-center justify-between gap-2">
    <label className="shrink-0 text-sm font-medium">{t("create.imageSizeSection.title")}</label>
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <span className="whitespace-nowrap text-xs text-muted-foreground"><span data-size-dimensions>{dimensions.width} × {dimensions.height}</span>
        {value.mode === "custom" ? t("create.imageSizeSection.customLabel") : t("create.imageSizeSection.aspectRatioLabel", { ratio: value.aspectRatio })}</span>
      {scale !== undefined && onScaleChange && <SizeScaleControl scale={scale} onChange={onScaleChange} />}
    </div>
  </div>;
}

function SizePresetButton({ preset, selected, onClick }: { preset: ImageSizePreset; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" title={`${preset.label} · ${preset.width}×${preset.height}（${preset.note}）`}
      aria-pressed={selected} data-size-preset={preset.id} onClick={onClick}
      className={cn(SIZE_BUTTON_CLASS, INPUT_BORDER_CLASS, selected && ACCENT_SELECTED_OUTLINE_CLASS)}>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <AspectRatioIcon ratio={preset.id} className="shrink-0 text-foreground/70" /><span>{preset.label}</span>
      </span>
      <span className="truncate text-[10px] font-normal text-muted-foreground">{preset.width}×{preset.height}</span>
    </button>
  );
}

function SizePresetGrid({ value, presets, max, onPresetChange, onCustomSizeChange }: SizeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-4 gap-1">
      {presets.map((preset) => <SizePresetButton key={preset.id} preset={preset}
        selected={value.mode === "preset" && value.aspectRatio === preset.id} onClick={() => onPresetChange(preset.id)} />)}
      <button type="button" aria-pressed={value.mode === "custom"} data-size-preset="custom"
        onClick={() => onCustomSizeChange({ width: value.customWidth, height: value.customHeight })}
        className={cn(SIZE_BUTTON_CLASS, INPUT_BORDER_CLASS, value.mode === "custom" && ACCENT_SELECTED_OUTLINE_CLASS)}>
        <span className="flex items-center gap-1 whitespace-nowrap"><Ruler className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
          <span>{t("create.imageSizeSection.custom")}</span></span>
        <span className="truncate text-[10px] font-normal text-muted-foreground">≤ {max}</span>
      </button>
    </div>
  );
}

function SizeInput({ side, value, min, max, step, onChange }: {
  side: "width" | "height"; value: number; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{t(side === "width" ? "create.imageSizeSection.width" : "create.imageSizeSection.height")}</span>
      <input type="number" inputMode="numeric" min={min} max={max} step={step} value={value} data-size-dimension={side}
        aria-label={t(side === "width" ? "create.imageSizeSection.customWidth" : "create.imageSizeSection.customHeight")}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn("h-8 min-w-0 flex-1 rounded-md bg-background px-2 text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1", INPUT_BORDER_CLASS)} />
    </label>
  );
}

function SizeSelectorHint({ value, presets, min, max, step, hint }: SizeSelectorProps) {
  const { t } = useTranslation();
  const note = presets.find((preset) => preset.id === value.aspectRatio)?.note ?? t("create.imageSizeSection.presetNoteFallback");
  return <p className="text-[11px] leading-relaxed text-muted-foreground">{value.mode === "custom"
    ? t("create.imageSizeSection.customHint", { min, max, step })
    : hint ?? t("create.imageSizeSection.presetHint", { note, max })}</p>;
}

export function SizeSelector(props: SizeSelectorProps) {
  const { value, min, max, step, onCustomSizeChange } = props;
  return (
    <div data-size-selector className={cn("space-y-2", props.className)}>
      {/* 界面：右上角显示实际宽高；缩放滑条按调用方传入的比例返回选择 */}
      <SizeSelectorHeader {...props} />
      <SizePresetGrid {...props} />
      <SizeSelectorHint {...props} />
      {value.mode === "custom" && <div className="flex items-center gap-2">
        <SizeInput side="width" value={value.customWidth} min={min} max={max} step={step} onChange={(width) => onCustomSizeChange({ width })} />
        <SizeInput side="height" value={value.customHeight} min={min} max={max} step={step} onChange={(height) => onCustomSizeChange({ height })} />
      </div>}
    </div>
  );
}
