"use client";

import { Gauge, Info, Scaling } from "lucide-react";
import { useTranslation } from "@/i18n";
import { SimpleNumberCombobox } from "@/components/SimpleNumberCombobox";
import {
  GIF_FPS_MAX,
  GIF_FPS_MIN,
  GIF_FPS_OPTIONS,
  GIF_MIN_WIDTH,
  GIF_SIZE_WARNING_FPS,
  GIF_SIZE_WARNING_WIDTH,
  GIF_WIDTH_STEP,
  RECOMMENDED_GIF_FPS,
  gifOutputHeight,
} from "@/data/gifForm";

type GifSettingsPanelProps = {
  /** 源视频尺寸（取首段，作为缩放上限与比例基准） */
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
  width: number;
  /** 选区时长（秒），用于估算帧数 */
  duration: number;
  onFpsChange: (fps: number) => void;
  onWidthChange: (width: number) => void;
};

/** GIF 参数：帧率下拉（推荐 20） + 等比缩放宽度滑块（不超过源分辨率） */
export function GifSettingsPanel({
  sourceWidth,
  sourceHeight,
  fps,
  width,
  duration,
  onFpsChange,
  onWidthChange,
}: GifSettingsPanelProps) {
  const { t } = useTranslation();
  const maxWidth = Math.max(GIF_MIN_WIDTH, sourceWidth || GIF_MIN_WIDTH);
  const outputHeight = gifOutputHeight(width, sourceWidth || width, sourceHeight || width);
  const scalePercent = sourceWidth > 0 ? Math.round((width / sourceWidth) * 100) : 100;
  const estimatedFrames = Math.max(1, Math.round(duration * fps));
  const sizeWarning =
    fps >= GIF_SIZE_WARNING_FPS && width >= GIF_SIZE_WARNING_WIDTH;

  return (
    <section className="space-y-5 rounded-xl border border-border bg-background p-5">
      <header className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Gauge className="h-4 w-4 text-sky-700 dark:text-sky-300" />
          {t("toolBox.gif.settings.title")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {width}×{outputHeight} · {fps} FPS
        </span>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-medium text-foreground">
          <span>{t("toolBox.gif.settings.frameRateLabel")}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t("toolBox.gif.settings.recommendedPrefix")} {RECOMMENDED_GIF_FPS}{" "}
            {t("toolBox.gif.settings.maxPrefix")} {GIF_FPS_MAX}
          </span>
        </div>
        <SimpleNumberCombobox
          value={fps}
          options={GIF_FPS_OPTIONS}
          recommended={RECOMMENDED_GIF_FPS}
          min={GIF_FPS_MIN}
          max={GIF_FPS_MAX}
          unit={t("toolBox.gif.settings.unitFps")}
          ariaLabel={t("toolBox.gif.settings.fpsAriaLabel")}
          onChange={onFpsChange}
        />
        <p className="text-xs text-muted-foreground">
          {t("toolBox.gif.settings.customHintPrefix")}
          {GIF_FPS_MAX}
          {t("toolBox.gif.settings.customHintSuffix")}{" "}
          {estimatedFrames}{" "}
          {t("toolBox.gif.settings.frameUnitSuffix")}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-medium text-foreground">
          <span className="flex items-center gap-2">
            <Scaling className="h-4 w-4 text-emerald-600" />
            {t("toolBox.gif.settings.resolutionLabel")}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {width} × {outputHeight}（{scalePercent}%）
          </span>
        </div>
        <input
          type="range"
          min={GIF_MIN_WIDTH}
          max={maxWidth}
          step={GIF_WIDTH_STEP}
          value={width}
          onChange={(event) => onWidthChange(Number(event.target.value))}
          aria-label={t("toolBox.gif.settings.widthAriaLabel")}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-blue-600"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{GIF_MIN_WIDTH}px</span>
          <span>{t("toolBox.gif.settings.maxWidthPrefix")} {sourceWidth || "—"}px）</span>
        </div>
      </div>

      {sizeWarning && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("toolBox.gif.settings.sizeWarning")}
        </p>
      )}
    </section>
  );
}
