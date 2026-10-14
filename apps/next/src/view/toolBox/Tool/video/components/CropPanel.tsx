"use client";

import { Crop } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  CROP_ASPECT_OPTIONS,
  isFullFrame,
  type CropAspectId,
  type CropRect,
} from "@/utils/video/crop";

type CropPanelProps = {
  videoWidth: number;
  videoHeight: number;
  aspect: CropAspectId;
  crop: CropRect;
  onAspectChange: (aspect: CropAspectId) => void;
  onCropChange: (crop: CropRect) => void;
};

function NumberField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={2}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}

/** 视频裁剪：比例预设（居中最大裁剪）+ 自定义宽高坐标 */
export function CropPanel({
  videoWidth,
  videoHeight,
  aspect,
  crop,
  onAspectChange,
  onCropChange,
}: CropPanelProps) {
  const { t } = useTranslation();
  const fullFrame = isFullFrame(crop, videoWidth, videoHeight);
  const custom = aspect === "custom";

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-5">
      <header className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Crop className="h-4 w-4 text-emerald-600" />
          {t("toolBox.video.crop.title")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {fullFrame
            ? t("toolBox.video.crop.originalFrame")
            : `${crop.width}×${crop.height} @ (${crop.x}, ${crop.y})`}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {CROP_ASPECT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onAspectChange(option.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              aspect === option.id
                ? "bg-emerald-100 text-emerald-700"
                : "bg-muted text-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {custom && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label={t("toolBox.video.crop.width")}
            value={crop.width}
            max={videoWidth}
            onChange={(value) => onCropChange({ ...crop, width: value })}
          />
          <NumberField
            label={t("toolBox.video.crop.height")}
            value={crop.height}
            max={videoHeight}
            onChange={(value) => onCropChange({ ...crop, height: value })}
          />
          <NumberField
            label={t("toolBox.video.crop.offsetX")}
            value={crop.x}
            max={videoWidth}
            onChange={(value) => onCropChange({ ...crop, x: value })}
          />
          <NumberField
            label={t("toolBox.video.crop.offsetY")}
            value={crop.y}
            max={videoHeight}
            onChange={(value) => onCropChange({ ...crop, y: value })}
          />
        </div>
      )}

      {!fullFrame && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("toolBox.video.crop.reencodeHint")}
        </p>
      )}
    </section>
  );
}
