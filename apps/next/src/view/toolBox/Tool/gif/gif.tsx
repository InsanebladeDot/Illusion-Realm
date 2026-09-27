"use client";

import { useCallback, useEffect, useState } from "react";
import { useClipEditor, buildClipInputs } from "@/hooks/useClipEditor";
import { useFfmpegStatus } from "@/hooks/useFfmpegStatus";
import { useIsElectronEnvironment } from "@/hooks/useIsElectronEnvironment";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useVideoToolStore } from "@/stores/useVideoToolStore";
import {
  DEFAULT_GIF_FPS,
  DEFAULT_GIF_MAX_WIDTH,
  clampGifWidth,
  gifOutputHeight,
} from "@/data/gifForm";
import { openPathInExplorer } from "@/utils/electronBridge";
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
import { GifSettingsPanel } from "@/view/toolBox/Tool/gif/components/GifSettingsPanel";

/** 由首段文件名与参数推导自动生成的文件名前缀（不含扩展名） */
function buildOutputFileName(clips: ClipItem[], fps: number, width: number): string {
  const first = clips[0];
  const baseName = first.name.replace(/\.[^.]+$/, "");
  const multi = clips.length > 1 ? `_x${clips.length}` : "";
  return `${baseName}${multi}_${fps}fps_${width}px.gif`;
}

const GIF_EXTENSION = ".gif";

export default function GifConverterPage() {
  const { t } = useTranslation();
  const isDesktop = useIsElectronEnvironment();
  const showToast = useToastStore((state) => state.show);
  const storedOutputFolder = useVideoToolStore((state) => state.outputFolder);
  const setStoredOutputFolder = useVideoToolStore((state) => state.setOutputFolder);

  const { status, checking, ffmpegPath, redetect, pickManually } =
    useFfmpegStatus(isDesktop);

  const [fps, setFps] = useState<number>(DEFAULT_GIF_FPS);
  /** 输出宽度；0 表示尚未根据首段初始化 */
  const [gifWidth, setGifWidth] = useState(0);

  /** 本次选择的输出文件夹（为空则点击开始处理时弹出保存文件对话框） */
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  /** 用户自定义的文件名（null = 用自动命名） */
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resultPath, setResultPath] = useState<string | null>(null);

  /** 首段（比例基准）变化时初始化/夹取输出宽度 */
  const handleFirstClipChange = useCallback((clip: ClipItem) => {
    setGifWidth((prev) =>
      prev > 0
        ? clampGifWidth(prev, clip.width)
        : clampGifWidth(Math.min(clip.width, DEFAULT_GIF_MAX_WIDTH), clip.width)
    );
  }, []);

  const editor = useClipEditor({
    ffmpegPath,
    isDesktop,
    onFirstClipChange: handleFirstClipChange,
    onClipsAdded: () => {
      setProgress(0);
      setResultPath(null);
    },
    onCleared: () => {
      setResultPath(null);
      setProgress(0);
      setGifWidth(0);
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

  const sourceWidth = clips[0]?.width ?? 0;
  const sourceHeight = clips[0]?.height ?? 0;
  const outputWidth = gifWidth > 0 ? gifWidth : clampGifWidth(sourceWidth, sourceWidth);
  const outputHeight = gifOutputHeight(outputWidth, sourceWidth, sourceHeight);

  /** 自动生成的文件名（段数 / 帧率 / 宽度会体现在名字里） */
  const autoFileName = clips.length > 0 ? buildOutputFileName(clips, fps, outputWidth) : "";
  /** 输入框只编辑前缀名（扩展名固定为 .gif，以固定后缀展示） */
  const autoNamePrefix = autoFileName.replace(/\.gif$/i, "");
  const rawNamePrefix = customFileName ?? autoNamePrefix;
  /** 实际写盘用的文件名（强制 .gif） */
  const outputFileName = autoFileName
    ? normalizeOutputFileName(rawNamePrefix, autoFileName, GIF_EXTENSION)
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

  /** 选择输出**文件夹**（可反复更换），并记住该目录 */
  const handlePickOutputFolder = async () => {
    if (!hasOutputFolderBridge()) {
      showToast(t("toolBox.gif.folderBridgeMissing"), "error");
      return;
    }
    const picked = await pickOutputFolder(t("toolBox.gif.outputFolderDialogTitle"));
    if (!picked) return;
    setOutputFolder(picked);
    setStoredOutputFolder(picked);
    showToast(t("toolBox.gif.outputFolderSet"), "success");
  };

  const handleRun = async () => {
    if (clips.length === 0) return;

    // 未选择文件夹 → 走系统「保存文件」对话框，自行指定单个输出文件
    let target: string | null;
    if (effectiveOutputFolder) {
      target = joinOutputPath(effectiveOutputFolder, outputFileName);
    } else {
      target = await pickOutputFile(outputFileName || autoFileName, "gif");
      if (!target) return;
    }
    if (!target) return;

    setRunning(true);
    setProgress(0);
    setResultPath(null);

    const job: VideoEditJob = {
      mode: "gif",
      clips: buildClipInputs(clips),
      outputPath: target,
      width: sourceWidth,
      height: sourceHeight,
      gif: { fps, width: outputWidth, loop: true },
    };

    try {
      const result = await runVideoEdit(job, ffmpegPath);
      setResultPath(result.outputPath);
      setProgress(100);
      showToast(t("toolBox.gif.done"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("toolBox.gif.makeFailed");
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
    showToast(t("toolBox.gif.cancelled"));
  };

  const handleOpenResult = async () => {
    if (resultPath) await openPathInExplorer(resultPath);
  };

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-2xl font-bold text-gray-900">{t("toolBox.gif.title")}</h2>
        <p className="mt-1 text-gray-500">
          {t("toolBox.gif.description")}
        </p>
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
                  {t("toolBox.gif.trimSection")}
                  <span className="ml-2 truncate text-xs font-normal text-gray-500">
                    {/* i18n: 拼装点待收口到 toolBox.gif 的 helper */}
{t("toolBox.gif.segmentPrefix")} {selectedIndex + 1}{" "}
                    {t("toolBox.gif.segmentMiddle")} {selectedClip.name}
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

          <GifSettingsPanel
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            fps={fps}
            width={outputWidth}
            duration={selectionDuration}
            onFpsChange={setFps}
            onWidthChange={(value) => setGifWidth(clampGifWidth(value, sourceWidth))}
          />

          <ExportPanel
            outputFolder={effectiveOutputFolder}
            outputFileName={rawNamePrefix}
            fileNameSuffix={GIF_EXTENSION}
            fileNameCustomized={customFileName !== null}
            onFileNameChange={setCustomFileName}
            onResetFileName={() => setCustomFileName(null)}
            running={running}
            progress={progress}
            isDesktop={isDesktop}
            resultPath={resultPath}
            heading={t("toolBox.gif.exportHeading")}
            hint={`${fps} FPS · ${outputWidth}×${outputHeight}${
              clips.length > 1
                ? t("toolBox.gif.concatSegments", { count: clips.length })
                : ""
            }`}
            runningLabel={t("toolBox.gif.runningLabel")}
            onPickFolder={() => void handlePickOutputFolder()}
            onRun={() => void handleRun()}
            onCancel={() => void handleCancel()}
            onOpenResult={() => void handleOpenResult()}
          />

          <p className="text-xs text-gray-500">
            {/* i18n: 拼装点待收口到 toolBox.gif 的 helper */}
{t("toolBox.gif.durationPrefix")} {clips.length}{" "}
            {t("toolBox.gif.durationMiddle")} {formatTime(selectionDuration, true)}
            {t("toolBox.gif.approxPrefix")}{" "}
            {Math.max(1, Math.round(selectionDuration * fps))}{" "}
            {t("toolBox.gif.frameNote")}
          </p>
        </>
      )}
    </div>
  );
}
