"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  DEFAULT_VIDEO_WORKFLOW_ID,
  VIDEO_WORKFLOW_LIMITS,
  getVideoWorkflowById,
} from "@/data/videoForm";
import { RangeSlider } from "@/view/create/RangeSlider";
import { VideoImageUpload } from "@/view/create/VideoImageUpload";
import { VideoWorkflowSelect } from "@/view/create/VideoWorkflowSelect";
import { useComfyVideoGenerate } from "@/hooks/useComfyVideoGenerate";
import { useToastStore } from "@/stores/useToastStore";
import { useTranslation } from "@/i18n";
import {
  INPUT_BORDER_CLASS,
  PRIMARY_BUTTON_CLASS,
  PROMPT_EDITOR_SCROLL_CLASS,
  THIN_BORDER_CLASS,
  THIN_DIVIDER_CLASS,
} from "@/utils/layout";
import { cn } from "@/utils/cn";

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
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<number>(
    VIDEO_WORKFLOW_LIMITS.defaultDuration
  );
  const startImage = useStartImage();

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
    if (!startImage.file) {
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
      const result = await generate({
        workflowId: workflow.id,
        prompt: prompt.trim(),
        durationSeconds: workflow.requiresDuration ? duration : undefined,
        imageFile: startImage.file,
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
      className="flex min-h-0 flex-1 flex-col lg:h-full lg:flex lg:flex-col"
      onSubmit={handleSubmit}
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        <div className="px-2 pt-2 sm:px-3 sm:pt-3">
          <VideoWorkflowSelect value={workflowId} onChange={setWorkflowId} />
        </div>

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
          <VideoImageUpload
            label={t("create.videoCreatePanel.startImage")}
            required
            imageUrl={startImage.url}
            onSelect={startImage.setFromFile}
            onRemove={startImage.clear}
          />
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
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              name="prompt"
              placeholder={t("create.videoCreatePanel.promptPlaceholder")}
              className={cn(
                "flex min-h-[60px] w-full resize-none rounded-md bg-transparent px-3 py-2 text-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                PROMPT_EDITOR_SCROLL_CLASS,
                INPUT_BORDER_CLASS
              )}
            />
          </div>

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
