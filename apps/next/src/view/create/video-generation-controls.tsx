"use client";

import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { GenerationParameterControl } from "./generation-parameter-control";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { getVideoFrameCount, getVideoGenerationDefaults, getVideoDurationMax, VIDEO_GENERATION_LIMITS as LIMITS, type VideoGenerationSettings } from "@/utils/comfy/video-generation-settings";
import { AdvancedSettingsSection } from "./advanced-settings-section";

interface Props { workflowId?: string; value?: VideoGenerationSettings; disabled: boolean; onChange: (value: VideoGenerationSettings | undefined) => void }
export function VideoGenerationControls({ workflowId = "minimax", value, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const defaults = useMemo(() => getVideoGenerationDefaults(getVideoWorkflowTemplate(workflowId)), [workflowId]);
  const settings = value ?? defaults;
  const frames = getVideoFrameCount(settings);
  const actualDuration = frames / settings.fps;
  const duration = settings.frameCount === undefined ? settings.durationSeconds : Number(actualDuration.toFixed(3));
  return <AdvancedSettingsSection><fieldset disabled={disabled} data-video-generation-settings className="min-w-0 space-y-3">
    {/* 界面：高级设置中的步数、帧率、时长；帧数只在内部计算，不展示输入项 */}
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{t("create.videoSettings.title")}</span><button type="button" data-video-parameters-reset onClick={() => onChange(undefined)} className="text-xs text-muted-foreground hover:text-foreground">{t("create.videoModels.reset")}</button></div>
    {/* 界面：视频参数直接复用图片高级设置的完整参数行 */}
    <GenerationParameterControl name="steps" label={t("create.advancedSettings.steps")} hint={t("create.advancedSettings.stepsHint")} value={settings.steps} min={LIMITS.stepsMin} max={LIMITS.stepsMax} onChange={(steps) => onChange({ ...settings, steps: Math.round(steps) })} />
    <GenerationParameterControl name="fps" label={t("create.videoSettings.fps")} value={settings.fps} min={LIMITS.fpsMin} max={LIMITS.fpsMax} onChange={(fps) => onChange({ ...settings, fps: Math.round(fps), durationSeconds: Math.min(getVideoDurationMax(Math.round(fps)), Math.max(LIMITS.durationMin, duration)), frameCount: undefined })} />
    <GenerationParameterControl name="duration" label={`${t("create.videoCreatePanel.duration")} (${t("create.videoCreatePanel.durationUnit")})`} value={duration} min={Math.min(LIMITS.durationMin, duration)} max={getVideoDurationMax(settings.fps)} step={0.1} inputStep="any" onChange={(durationSeconds) => onChange({ ...settings, durationSeconds: Math.min(getVideoDurationMax(settings.fps), Math.max(LIMITS.durationMin, durationSeconds)), frameCount: undefined })} />
    <p data-video-frame-summary className="text-xs leading-relaxed text-muted-foreground">{t("create.videoSettings.actualDuration", { seconds: actualDuration.toFixed(2) })}</p>
    <p className="text-xs leading-relaxed text-muted-foreground">{t("create.videoSettings.alignment")}</p>
  </fieldset></AdvancedSettingsSection>;
}
