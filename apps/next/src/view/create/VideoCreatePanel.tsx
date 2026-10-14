"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  DEFAULT_VIDEO_WORKFLOW_ID,
  VIDEO_WORKFLOW_LIMITS,
  getVideoWorkflowById,
  isMinimaxWorkflow,
} from "@/data/videoForm";
import { RangeSlider } from "@/view/create/RangeSlider";
import { VideoWorkflowSelect } from "@/view/create/VideoWorkflowSelect";
import { useComfyVideoGenerate } from "@/hooks/useComfyVideoGenerate";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import {
  PRIMARY_BUTTON_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";
import { VideoModelSettings } from "./video-model-settings";
import { VideoModelSelect } from "./video-model-select";
import type { VideoModelOverrides } from "@/utils/comfy/video-workflow-models";
import { getVideoLoras, type VideoLora } from "@/utils/comfy/video-workflow-loras";
import { getVideoWorkflowTemplate } from "@/utils/comfy/videoWorkflow";
import { VideoLoraSelect } from "./video-lora-select";
import { VideoGenerationControls } from "./video-generation-controls";
import type { VideoGenerationSettings } from "@/utils/comfy/video-generation-settings";
import type { VideoResolutionSettings } from "@/utils/comfy/video-resolution";
import { VideoResolutionControls } from "./video-resolution-controls";
import { VideoFrameInputs } from "./video-frame-inputs";
import { ImageReferencePrompt } from "./image-reference-prompt";
import { normalizeImageReferences } from "@/utils/image-prompt-references";
import type { PromptReferenceMedia } from "@/utils/prompt-media-references";
import { normalizeVideoReferences, orderedReferences } from "@/utils/comfy/video-reference-media";
import { useVideoReferenceMedia } from "./use-video-reference-media";
import { VideoReferenceInputs } from "./video-reference-inputs";

function useStartImage() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const setFromFile = (next: File) => {
    setFile(next);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
  };

  const clear = () => {
    setFile(null);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  return { file, url, setFromFile, clear };
}

export function VideoCreatePanel() {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.show);
  const { generating, videoUrl, generate } = useComfyVideoGenerate();

  const [workflowId, setWorkflowId] = useState(DEFAULT_VIDEO_WORKFLOW_ID);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const prompt = prompts[workflowId] ?? "";
  const setPrompt = (value: string) => setPrompts((current) => ({ ...current, [workflowId]: value }));
  const [duration, setDuration] = useState<number>(
    VIDEO_WORKFLOW_LIMITS.defaultDuration
  );
  const startImage = useStartImage();
  const lastImage = useStartImage();
  const [bothFrames, setBothFrames] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, VideoResolutionSettings | undefined>>({});
  const resolution = resolutions[workflowId];
  const references = useVideoReferenceMedia();
  const isReference = workflowId === "minimax-reference";
  const isMinimax = isMinimaxWorkflow(workflowId);
  const referenceImages = useMemo(() => isReference
    ? Array.from({ length: 9 }, (_, index) => references.media.find((item) => item.kind === "image" && item.number === index + 1)?.src ?? null)
    : [startImage.url, bothFrames ? lastImage.url : null], [isReference, references.media, startImage.url, lastImage.url, bothFrames]);
  // 当前任务只有首尾帧：按固定编号提供候选；共用输入框也能接收视频、音频数据。
  const referenceMedia = useMemo<PromptReferenceMedia[]>(() => isReference ? orderedReferences(references.media) : referenceImages.flatMap((src, index) => src ? [{
    id: `image-${index + 1}`, kind: "image" as const, number: index + 1, src,
    name: (index === 0 ? startImage.file : lastImage.file)?.name ?? `image${index + 1}`,
    label: t(index === 0 ? "create.videoSettings.firstFrame" : "create.videoSettings.lastFrame"),
  }] : []), [isReference, references.media, referenceImages, startImage.file, lastImage.file, t]);
  const [overridesByWorkflow, setOverridesByWorkflow] = useState<Record<string, VideoModelOverrides>>({});
  const modelOverrides = overridesByWorkflow[workflowId] ?? {};
  const [lorasByWorkflow, setLorasByWorkflow] = useState<Record<string, VideoLora[] | undefined>>({});
  const loras = lorasByWorkflow[workflowId];
  const [settingsByWorkflow, setSettingsByWorkflow] = useState<Record<string, VideoGenerationSettings | undefined>>({});
  const generationSettings = settingsByWorkflow[workflowId];

  const workflow = useMemo(
    () => getVideoWorkflowById(workflowId) ?? getVideoWorkflowById(DEFAULT_VIDEO_WORKFLOW_ID)!,
    [workflowId]
  );

  const { durationMax, durationMin } = VIDEO_WORKFLOW_LIMITS;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!prompt.trim()) {
      showToast(t("create.videoCreatePanel.promptRequired"));
      return;
    }
    if (!isReference && !startImage.file) {
      showToast(t("create.videoCreatePanel.startImageRequired"));
      return;
    }
    if (workflow.requiresDuration && (duration < durationMin || duration > durationMax)) {
      showToast(
        t("create.videoCreatePanel.durationRange", {
          min: durationMin,
          max: durationMax,
        })
      );
      return;
    }

    try {
      const normalized = normalizeImageReferences(prompt.trim(), referenceImages.map(Boolean));
      if (!isReference && normalized.missing) { showToast(t("create.videoSettings.referenceUnavailable", { number: normalized.missing })); return; }
      const normalizedPrompt = isMinimax ? normalizeVideoReferences(prompt.trim(), referenceMedia) : prompt.trim();
      const result = await generate({
        workflowId: workflow.id,
        prompt: normalizedPrompt,
        durationSeconds: workflow.requiresDuration ? duration : undefined,
        imageFile: isReference ? null : startImage.file,
        referenceMedia: isReference ? references.media : undefined,
        lastImageFile: workflow.id === "minimax" && bothFrames ? lastImage.file : null,
        modelOverrides,
        loras,
        generationSettings: isMinimax ? generationSettings : undefined,
        resolution: isMinimax ? resolution : undefined,
      });
      showToast(
        result.savedPaths.length > 0
          ? t("create.videoCreatePanel.generatedSaved", {
              count: result.savedPaths.length,
            })
          : t("create.videoCreatePanel.generatedUnsaved")
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("create.videoCreatePanel.generateFailed");
      showToast(message);
    }
  };

  return (
    <form
      data-video-create-panel
      className="flex min-h-0 flex-1 flex-col lg:h-full lg:flex lg:flex-col"
      onSubmit={handleSubmit}
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        <div className="space-y-2 px-2 pt-2 sm:px-3 sm:pt-3">
          <VideoWorkflowSelect value={workflowId} onChange={setWorkflowId} />
          {/* 界面：「模型」封面入口，与图片生成复用；工作流决定可选模型系列 */}
          <VideoModelSelect key={workflowId} workflowId={workflowId} overrides={modelOverrides} onChange={(value) => setOverridesByWorkflow((current) => ({ ...current, [workflowId]: value }))} disabled={generating} />
        </div>
        {/* 界面：模型加载设置，默认使用当前工作流中的 UNet / CLIP / VAE */}
        <VideoLoraSelect key={`loras-${workflowId}`} workflowId={workflowId} value={loras} disabled={generating} onChange={(value) => setLorasByWorkflow((current) => ({ ...current, [workflowId]: typeof value === "function" ? value(current[workflowId] ?? getVideoLoras(getVideoWorkflowTemplate(workflowId))) : value }))} />
        <VideoModelSettings key={workflowId} workflowId={workflowId} overrides={modelOverrides} disabled={generating} onChange={(value) => setOverridesByWorkflow((current) => ({ ...current, [workflowId]: value }))} onReset={() => { setOverridesByWorkflow((current) => ({ ...current, [workflowId]: {} })); setLorasByWorkflow((current) => ({ ...current, [workflowId]: undefined })); }} />

        {workflow.requiresDuration && (
          <div className="space-y-3 px-2 py-2 sm:px-3 sm:py-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold">
                  {t("create.videoCreatePanel.duration")}
                </label>
                <span className="text-sm text-muted-foreground">
                  {duration}
                  {t("create.videoCreatePanel.durationUnit")}
                </span>
              </div>
              <RangeSlider
                min={durationMin}
                max={durationMax}
                step={1}
                value={duration}
                onChange={setDuration}
                trackClassName="bg-zinc-200 dark:bg-zinc-700"
                fillClassName="bg-accent-fill"
                thumbClassName="border-accent-fill bg-accent-fill"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("create.videoCreatePanel.durationLimitPrefix")} {durationMax}{" "}
                {t("create.videoCreatePanel.durationLimitSuffix")}
              </p>
            </div>
          </div>
        )}

        <div
          className={cn(
            "border-t px-2 pb-0 pt-2 sm:px-3 sm:pt-3",
            THIN_DIVIDER_CLASS
          )}
        >
          {/* 界面：仅首帧占一格；首尾帧模式为同一行的两个上传位置 */}
          {isReference ? <VideoReferenceInputs references={references} disabled={generating} /> : <VideoFrameInputs first={startImage} last={lastImage} both={bothFrames} onModeChange={setBothFrames} disabled={generating} supportsLast={workflow.id === "minimax"} />}
        </div>

        <div className="relative space-y-4 px-2 py-2 sm:px-3 sm:py-3">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              {t("create.videoCreatePanel.prompt")}
              <button
                type="button"
                className="text-muted-foreground hover:text-primary"
                aria-label={t("create.videoCreatePanel.promptHint")}
              >
                <Info className="h-4 w-4" />
              </button>
            </label>
            {/* 界面：图片引用只装饰文字，点击使用图库原有预览 */}
            <ImageReferencePrompt value={prompt} onChange={setPrompt} images={referenceImages} media={referenceMedia} disabled={generating} />
          </div>

          {/* 界面：Minimax 的生成参数，默认读取工作流；与图片高级设置共用输入控件 */}
          {isMinimax && <><VideoResolutionControls workflowId={workflowId} value={resolution} onChange={(value) => setResolutions((current) => ({ ...current, [workflowId]: value }))} disabled={generating} /><VideoGenerationControls key={workflowId} workflowId={workflowId} value={generationSettings} onChange={(value) => setSettingsByWorkflow((current) => ({ ...current, [workflowId]: value }))} disabled={generating} /></>}
          {videoUrl && (
            <div
              className={cn(
                "overflow-hidden rounded-xl",
                THIN_BORDER_CLASS
              )}
            >
              <video src={videoUrl} controls className="h-auto w-full">
                <track kind="captions" />
              </video>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "z-10 shrink-0 bg-background p-2 sm:p-3 md:border-t lg:sticky lg:bottom-0 lg:mt-auto",
          THIN_DIVIDER_CLASS,
          "max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
        )}
      >
        <button
          type="submit"
          disabled={generating}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold shadow transition-colors active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:h-14",
            PRIMARY_BUTTON_CLASS
          )}
        >
          {generating ? t("create.progress.generating") : t("create.generateButton.label")}
        </button>
      </div>
    </form>
  );
}
