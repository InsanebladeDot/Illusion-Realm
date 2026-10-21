"use client";

/** 界面：「重新按帧导出视频」。主区与快捷功能复用相同控件，只通过参数执行任务。 */
import { useTranslation } from "@/i18n";

const FRAME_RATES = [5, 10, 15, 20, 24, 25, 30, 50, 60, 90, 120];
export interface VideoReframeControlsProps {
  fps: number;
  disabled: boolean;
  running: boolean;
  onFpsChange: (fps: number) => void;
  onRun: () => void;
  onCancel: () => void;
}

export function VideoReframeControls(props: VideoReframeControlsProps) {
  const { t } = useTranslation();
  return <div className="space-y-3" data-video-reframe-controls>
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
      {t("toolBox.video.reframe.fps")}
      <select aria-label={t("toolBox.video.reframe.fps")} value={props.fps} disabled={props.disabled}
        onChange={(event) => props.onFpsChange(Number(event.target.value))}
        className="h-9 rounded-lg border border-border bg-background px-3 text-foreground outline-none focus:border-primary disabled:opacity-40">
        {FRAME_RATES.map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}
      </select>
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("toolBox.video.reframe.hint")}</p>
    <button type="button" disabled={props.disabled && !props.running} onClick={props.running ? props.onCancel : props.onRun}
      data-testid="video-reframe-run" className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
      {props.running ? t("common.cancel") : t("toolBox.video.reframe.title")}
    </button>
  </div>;
}
