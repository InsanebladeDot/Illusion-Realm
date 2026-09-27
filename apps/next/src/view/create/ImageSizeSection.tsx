"use client";

import { useMemo } from "react";
import { Ruler } from "lucide-react";
import { IMAGE_SIZE_PRESETS } from "@/data/imageSizes";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useTranslation } from "@/i18n";
import {
  IMAGE_SIZE_MAX,
  IMAGE_SIZE_MIN,
  IMAGE_SIZE_STEP,
  resolveImageDimensions,
} from "@/utils/imageSize";
import { AspectRatioIcon } from "@/view/create/AspectRatioIcon";
import { ACCENT_SELECTED_OUTLINE_CLASS, INPUT_BORDER_CLASS } from "@/utils/layout";
import { cn } from "@/utils/cn";

/** 数字输入：夹取到 64–1500，并对齐 8 像素 */
function SizeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={IMAGE_SIZE_MIN}
        max={IMAGE_SIZE_MAX}
        step={IMAGE_SIZE_STEP}
        value={value}
        aria-label={
          label === t("create.imageSizeSection.width")
            ? t("create.imageSizeSection.customWidth")
            : t("create.imageSizeSection.customHeight")
        }
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md bg-background px-2 text-center text-sm shadow-none focus-visible:outline-none focus-visible:ring-1",
          INPUT_BORDER_CLASS
        )}
      />
    </label>
  );
}

export function ImageSizeSection() {
  const { t } = useTranslation();
  const sizeMode = useCreateFormStore((state) => state.sizeMode);
  const aspectRatio = useCreateFormStore((state) => state.aspectRatio);
  const customWidth = useCreateFormStore((state) => state.customWidth);
  const customHeight = useCreateFormStore((state) => state.customHeight);
  const setAspectRatio = useCreateFormStore((state) => state.setAspectRatio);
  const setCustomSize = useCreateFormStore((state) => state.setCustomSize);

  const { width, height } = useMemo(
    () =>
      resolveImageDimensions({
        mode: sizeMode,
        aspectRatio,
        customWidth,
        customHeight,
      }),
    [sizeMode, aspectRatio, customWidth, customHeight]
  );

  const activePreset = IMAGE_SIZE_PRESETS.find(
    (preset) => preset.id === aspectRatio
  );

  return (
    <div className="hidden space-y-2 md:block">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">
          {t("create.imageSizeSection.title")}
        </label>
        <span className="text-xs text-muted-foreground">
          {width} × {height}
          {sizeMode === "custom"
            ? t("create.imageSizeSection.customLabel")
            : t("create.imageSizeSection.aspectRatioLabel", {
                ratio: aspectRatio,
              })}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {IMAGE_SIZE_PRESETS.map((preset) => {
          const selected = sizeMode === "preset" && aspectRatio === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={`${preset.label} · ${preset.width}×${preset.height}（${preset.note}）`}
              aria-pressed={selected}
              data-size-preset={preset.id}
              onClick={() => setAspectRatio(preset.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all hover:bg-accent/50",
                INPUT_BORDER_CLASS,
                selected && ACCENT_SELECTED_OUTLINE_CLASS
              )}
            >
              <span className="flex items-center gap-1 whitespace-nowrap">
                <AspectRatioIcon ratio={preset.id} className="shrink-0 text-foreground/70" />
                <span>{preset.label}</span>
              </span>
              <span className="truncate text-[10px] font-normal text-muted-foreground">
                {preset.width}×{preset.height}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          aria-pressed={sizeMode === "custom"}
          data-size-preset="custom"
          onClick={() => setCustomSize({ width: customWidth, height: customHeight })}
          className={cn(
            "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-all hover:bg-accent/50",
            INPUT_BORDER_CLASS,
            sizeMode === "custom" && ACCENT_SELECTED_OUTLINE_CLASS
          )}
        >
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Ruler className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
            <span>{t("create.imageSizeSection.custom")}</span>
          </span>
          <span className="truncate text-[10px] font-normal text-muted-foreground">
            ≤ {IMAGE_SIZE_MAX}
          </span>
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {sizeMode === "custom"
          ? t("create.imageSizeSection.customHint", {
              min: IMAGE_SIZE_MIN,
              max: IMAGE_SIZE_MAX,
              step: IMAGE_SIZE_STEP,
            })
          : t("create.imageSizeSection.presetHint", {
              note:
                activePreset?.note ??
                t("create.imageSizeSection.presetNoteFallback"),
              max: IMAGE_SIZE_MAX,
            })}
      </p>

      {sizeMode === "custom" && (
        <div className="flex items-center gap-2">
          <SizeInput
            label={t("create.imageSizeSection.width")}
            value={customWidth}
            onChange={(value) => setCustomSize({ width: value })}
          />
          <SizeInput
            label={t("create.imageSizeSection.height")}
            value={customHeight}
            onChange={(value) => setCustomSize({ height: value })}
          />
        </div>
      )}
    </div>
  );
}
