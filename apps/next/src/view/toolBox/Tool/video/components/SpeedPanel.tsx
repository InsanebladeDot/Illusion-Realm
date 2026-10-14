"use client";

import { Gauge } from "lucide-react";
import { useTranslation } from "@/i18n";

export const SPEED_PRESETS = [0.5, 0.75, 1, 1.5, 2, 4] as const;

type SpeedPanelProps = {
  speed: number;
  onChange: (speed: number) => void;
};

/** 视频变速：常用倍速预设（变速需要重新编码） */
export function SpeedPanel({ speed, onChange }: SpeedPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-5">
      <header className="flex items-center justify-between border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Gauge className="h-4 w-4 text-sky-700 dark:text-sky-300" />
          {t("toolBox.video.speed.title")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {speed === 1 ? t("toolBox.video.speed.originalSpeed") : `${speed}×`}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              speed === preset
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "bg-muted text-foreground hover:bg-muted"
            }`}
          >
            {preset}×
          </button>
        ))}
      </div>

      {speed !== 1 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("toolBox.video.speed.reencodeHint")}
        </p>
      )}
    </section>
  );
}
