"use client";

import { useCallback, useEffect, useState } from "react";
import { useClipEditor, buildClipInputs } from "@/hooks/useClipEditor";
import { useFfmpegStatus } from "@/hooks/useFfmpegStatus";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import { openPathInExplorer } from "@/utils/electronBridge";
import {
  CROP_ASPECT_OPTIONS,
  buildCenteredCrop,
  clampCrop,
  isFullFrame,
  type CropAspectId,
  type CropRect,
} from "@/utils/video/crop";
import {
  cancelVideoEdit,
  hasOutputFolderBridge,
  onVideoProgress,
  pickOutputFile,
  pickOutputFolder,
  runVideoEdit,
} from "@/utils/video/ffmpeg";
import { joinOutputPath, normalizeOutputFileName } from "@/utils/video/outputPath";
import { formatTime } from "@/utils/video/time";
import type { ClipItem } from "@/components/videoEdit/types";
import type { VideoEditJob } from "@/types/electron-api";
import { ClipPlaylist } from "@/components/videoEdit/ClipPlaylist";
import { ExportPanel } from "@/components/videoEdit/ExportPanel";
import { FfmpegStatusBar } from "@/components/videoEdit/FfmpegStatusBar";
import { PreviewStage } from "@/components/videoEdit/PreviewStage";
import { TimelineScrubber } from "@/components/videoEdit/TimelineScrubber";
import { VideoImportZone } from "@/components/videoEdit/VideoImportZone";
import { CropPanel } from "@/view/toolBox/Tool/video/components/CropPanel";
import { SpeedPanel } from "@/view/toolBox/Tool/video/components/SpeedPanel";

const EMPTY_CROP: CropRect = { width: 0, height: 0, x: 0, y: 0 };

/** 由首段文件名推导自动生成的文件名（拼接/变速/裁剪会体现在名字里） */
function buildOutputFileName(
  clips: ClipItem[],
  speed: number,
  hasCrop: boolean
): string {
  const first = clips[0];
  const baseName = first.name.replace(/\.[^.]+$/, "");
  const suffix = [
    clips.length > 1 ? `_x${clips.length}` : "",
    speed !== 1 ? `_${speed}x` : "",
    hasCrop ? "_crop" : "",
  ].join("");
  return `${baseName}${suffix || "_edit"}.mp4`;
}

export default function VideoToolPage() {
  const { t } = useTranslation();
  const isDesktop = useIsElectronEnvironment();
  const showToast = useToastStore((state) => state.show);
  const storedOutputFolder = useVideoToolStore((state) => state.outputFolder);
  const setStoredOutputFolder = useVideoToolStore((state) => state.setOutputFolder);

  const { status, checking, ffmpegPath, redetect, pickManually } =
    useFfmpegStatus(isDesktop);

  const [speed, setSpeed] = useState(1);
  const [cropAspect, setCropAspect] = useState<CropAspectId>("source");
  const [crop, setCrop] = useState<CropRect>(EMPTY_CROP);
  const [accurateCut, setAccurateCut] = useState(false);

  /** 本次选择的输出文件夹（为空则点击开始处理时弹出保存文件对话框） */
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  /** 用户自定义的文件名（null = 用自动命名） */
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resultPath, setResultPath] = useState<string | null>(null);

  /** 把裁剪框重置为整幅画面（输出尺寸基准变化时调用） */
  const resetCropFor = useCallback((clip: ClipItem) => {
    if (clip.width <= 0 || clip.height <= 0) return;
    setCrop(clampCrop(buildCenteredCrop(clip.width, clip.height, null), clip.width, clip.height));
    setCropAspect("source");
  }, []);

  const editor = useClipEditor({
    ffmpegPath,
    isDesktop,
    onFirstClipChange: resetCropFor,
    onClipsAdded: () => {
      setProgress(0);
      setResultPath(null);
    },
    onCleared: () => {
      setResultPath(null);
      setProgress(0);
    },
  });

  const {
    clips,
    selectedClip,
    selectedIndex,
    loading,
    playing,
    playhead,
    previewUrl,
    videoRef,
    selectionDuration,
  } = editor;

  /** 输出尺寸以首段为准（拼接时会缩放对齐首段） */
  const baseWidth = clips[0]?.width ?? 0;
  const baseHeight = clips[0]?.height ?? 0;

  const hasCrop = Boolean(
    baseWidth > 0 && cropAspect !== "source" && !isFullFrame(crop, baseWidth, baseHeight)
  );

  const outputDuration = speed !== 1 ? selectionDuration / speed : selectionDuration;
  const isConcat = clips.length > 1;

  /** 自动生成的文件名（拼接段数 / 倍速 / 裁剪会体现在名字里） */
  const autoFileName = clips.length > 0 ? buildOutputFileName(clips, speed, hasCrop) : "";
  /** 输入框里的原始文件名（用户可改） */
  const rawFileName = customFileName ?? autoFileName;
  /** 实际写盘用的文件名（缺扩展名时补 .mp4） */
  const outputFileName = autoFileName
    ? normalizeOutputFileName(rawFileName, autoFileName)
    : "";
  /** 记住的默认输出文件夹（设置里保存、上次选择过的目录） */
  const effectiveOutputFolder = outputFolder || storedOutputFolder;

  /** 订阅转码进度（首个进度事件同时带回 jobId，用于取消） */
  useEffect(() => {
    return onVideoProgress((event) => {
      setJobId(event.jobId);
      setProgress(event.percent);
    });
  }, []);

  const handleAspectChange = (aspect: CropAspectId) => {
    setCropAspect(aspect);
    if (baseWidth <= 0 || baseHeight <= 0) return;
    const option = CROP_ASPECT_OPTIONS.find((item) => item.id === aspect);
    if (!option || aspect === "custom") return;
    setCrop(
      clampCrop(buildCenteredCrop(baseWidth, baseHeight, option.ratio), baseWidth, baseHeight)
    );
  };

  const handleCropChange = (next: CropRect) => {
    setCrop(baseWidth > 0 ? clampCrop(next, baseWidth, baseHeight) : next);
  };

  /** 选择输出**文件夹**（可反复更换），并记住该目录 */
  const handlePickOutputFolder = async () => {
    if (!hasOutputFolderBridge()) {
      showToast(t("toolBox.video.folderBridgeMissing"), "error");
      return;
    }
    const picked = await pickOutputFolder(t("toolBox.video.outputFolderDialogTitle"));
    if (!picked) return;
    setOutputFolder(picked);
    setStoredOutputFolder(picked);
    showToast(t("toolBox.video.outputFolderSet"), "success");
  };

  const handleRun = async () => {
    if (clips.length === 0) return;

    // 未选择文件夹 → 走系统「保存文件」对话框，自行指定单个输出文件
    let target: string | null;
    if (effectiveOutputFolder) {
      target = joinOutputPath(effectiveOutputFolder, outputFileName);
    } else {
      target = await pickOutputFile(outputFileName || autoFileName, "video");
      if (!target) return;
    }
    if (!target) return;

    setRunning(true);
    setProgress(0);
    setResultPath(null);

    const cropOptions = hasCrop ? { enabled: true, ...crop } : undefined;
    const job: VideoEditJob = isConcat
      ? {
          mode: "concat",
          clips: buildClipInputs(clips),
          outputPath: target,
          width: clips[0].width,
          height: clips[0].height,
          fps: clips[0].fps > 0 ? clips[0].fps : 25,
          speed,
          crop: cropOptions,
        }
      : {
          mode: "single",
          inputPath: clips[0].path,
          outputPath: target,
          sourceDuration: clips[0].duration,
          trim: { start: clips[0].trim.start, end: clips[0].trim.end },
          speed,
          crop: cropOptions,
          accurateCut,
        };

    try {
      const result = await runVideoEdit(job, ffmpegPath);
      setResultPath(result.outputPath);
      setProgress(100);
      showToast(
        isConcat ? t("toolBox.video.concatDone") : t("toolBox.video.processDone"),
        "success"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("toolBox.video.processFailed");
      showToast(message, "error");
    } finally {
      setRunning(false);
      setJobId(null);
    }
  };

  const handleCancel = async () => {
    if (jobId) await cancelVideoEdit(jobId);
    setRunning(false);
    setJobId(null);
    setProgress(0);
    showToast(t("toolBox.video.cancelled"));
  };

  const handleOpenResult = async () => {
    if (resultPath) await openPathInExplorer(resultPath);
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-gray-900">{t("toolBox.video.title")}</h2>
        <p className="mt-1 text-gray-500">{t("toolBox.video.description")}</p>
      </header>

      <FfmpegStatusBar
        status={status}
        checking={checking}
        isDesktop={isDesktop}
        onPickManually={() => void pickManually()}
        onRedetect={() => void redetect()}
      />

      <VideoImportZone
        clipCount={clips.length}
        loading={loading}
        isDesktop={isDesktop}
        onPick={() => void editor.importClips()}
      />

      {clips.length > 0 && (
        <>
          <ClipPlaylist
            clips={clips}
            selectedId={selectedClip?.id ?? null}
            disabled={running}
            onSelect={editor.selectClip}
            onReorder={editor.reorderClips}
            onRemove={editor.removeClip}
          />

          <PreviewStage
            clipLabel={selectedClip?.name ?? ""}
            clipIndex={selectedIndex}
            clipTotal={clips.length}
            previewUrl={previewUrl}
            videoRef={videoRef}
            playing={playing}
            currentTime={playhead}
            duration={selectedClip?.duration ?? 0}
            trim={selectedClip?.trim ?? { start: 0, end: 0 }}
            disabled={running || !selectedClip}
            onTogglePlay={editor.togglePlay}
            onSkip={editor.skip}
            onFrameStep={editor.frameStep}
            onSetStart={editor.setStartFromPlayhead}
            onSetEnd={editor.setEndFromPlayhead}
            onSeek={editor.seek}
            onTimeUpdate={editor.reportTime}
            onSeeked={editor.handleSeeked}
            onPlayingChange={editor.setPlaying}
          />

          {selectedClip && (
            <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
              <header className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-base font-semibold text-gray-900">
                  {t("toolBox.video.trimSection")}
                  <span className="ml-2 truncate text-xs font-normal text-gray-500">
                    {/* i18n: 拼装点待收口到 toolBox.video 的 helper */}
{t("toolBox.video.segmentPrefix")} {selectedIndex + 1}{" "}
                    {t("toolBox.video.segmentMiddle")} {selectedClip.name}
                  </span>
                </h3>
              </header>
              <TimelineScrubber
                duration={selectedClip.duration}
                start={selectedClip.trim.start}
                end={selectedClip.trim.end}
                currentTime={playhead}
                onStartChange={(value) => editor.setTrim(value, selectedClip.trim.end)}
                onEndChange={(value) => editor.setTrim(selectedClip.trim.start, value)}
                onSeek={editor.seek}
                disabled={running}
              />
            </section>
          )}

          <SpeedPanel speed={speed} onChange={setSpeed} />

          <CropPanel
            videoWidth={baseWidth}
            videoHeight={baseHeight}
            aspect={cropAspect}
            crop={crop}
            onAspectChange={handleAspectChange}
            onCropChange={handleCropChange}
          />

          <ExportPanel
            outputFolder={effectiveOutputFolder}
            outputFileName={rawFileName}
            resolvedFileName={outputFileName}
            fileNameCustomized={customFileName !== null}
            onFileNameChange={setCustomFileName}
            onResetFileName={() => setCustomFileName(null)}
            running={running}
            progress={progress}
            isDesktop={isDesktop}
            resultPath={resultPath}
            hint={
              isConcat
                ? t("toolBox.video.concatHint", { count: clips.length })
                : undefined
            }
            extra={
              isConcat ? undefined : (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-gray-50 p-3">
                  <input
                    type="checkbox"
                    checked={accurateCut}
                    onChange={(event) => setAccurateCut(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">
                      {t("toolBox.video.accurateCut")}
                    </span>
                    <br />
                    {t("toolBox.video.accurateCutHint")}
                  </span>
                </label>
              )
            }
            onPickFolder={() => void handlePickOutputFolder()}
            onRun={() => void handleRun()}
            onCancel={() => void handleCancel()}
            onOpenResult={() => void handleOpenResult()}
          />

          <p className="text-xs text-gray-500">
            {/* i18n: 拼装点待收口到 toolBox.video 的 helper */}
{t("toolBox.video.durationPrefix")} {clips.length}{" "}
            {t("toolBox.video.durationMiddle")} {formatTime(outputDuration, true)}
            {isConcat
              ? t("toolBox.video.concatDurationNote", {
                  width: baseWidth,
                  height: baseHeight,
                })
              : speed === 1 && !hasCrop && !accurateCut
                ? t("toolBox.video.losslessNote")
                : t("toolBox.video.reencodeNote")}
            {t("toolBox.video.overwriteNote")}
          </p>
        </>
      )}
    </div>
  );
}
