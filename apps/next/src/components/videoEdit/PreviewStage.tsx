"use client";

import type { RefObject } from "react";
import {
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatTime } from "@/utils/video/time";

type PreviewStageProps = {
  /** 当前片段名称（用于提示正在编辑哪一个片段） */
  clipLabel: string;
  clipIndex: number;
  clipTotal: number;
  previewUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  /** 当前播放位置（秒） */
  currentTime: number;
  duration: number;
  /** 该片段的剪切区间 */
  trim: { start: number; end: number };
  disabled?: boolean;
  onTogglePlay: () => void;
  /** ±1 秒；负数为后退 */
  onSkip: (deltaSeconds: number) => void;
  onFrameStep: (frames: number) => void;
  /** 把播放头位置设为起点 */
  onSetStart: () => void;
  /** 把播放头位置设为终点 */
  onSetEnd: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: (time: number) => void;
  /** seek 完成回调：拖动时用它接续下一个跳帧目标，保证画面连续刷新 */
  onSeeked: () => void;
  onPlayingChange: (playing: boolean) => void;
};

function TransportButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * 预览区：不使用浏览器原生播放条（避免与起点/终点标记冲突），
 * 只提供播放/逐帧/±1 秒等基础走带按钮，配合时间轴上的 [ ] 标记使用。
 */
export function PreviewStage({
  clipLabel,
  clipIndex,
  clipTotal,
  previewUrl,
  videoRef,
  playing,
  currentTime,
  duration,
  trim,
  disabled = false,
  onTogglePlay,
  onSkip,
  onFrameStep,
  onSetStart,
  onSetEnd,
  onSeek,
  onTimeUpdate,
  onSeeked,
  onPlayingChange,
}: PreviewStageProps) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="min-w-0 truncate text-xs text-white/70" title={clipLabel}>
          {clipTotal > 1 && (
            <span className="mr-2 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/80">
              {clipIndex + 1}/{clipTotal}
            </span>
          )}
          {clipLabel}
        </span>
        <span className="shrink-0 font-mono text-xs text-white/70">
          {formatTime(currentTime, true)} / {formatTime(duration, true)}
        </span>
      </div>

      {previewUrl ? (
        <video
          ref={videoRef}
          src={previewUrl}
          className="mx-auto max-h-[420px] w-full cursor-pointer bg-black"
          onClick={onTogglePlay}
          onLoadedMetadata={() => {
            // 打开片段时定位到选区起点（走统一的 seek 串行化逻辑）
            onSeek(trim.start);
          }}
          onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
          onPlay={() => onPlayingChange(true)}
          onPause={() => onPlayingChange(false)}
          onEnded={() => onPlayingChange(false)}
          onSeeked={onSeeked}
        >
          <track kind="captions" />
        </video>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-white/50">
          {t("toolBox.videoEdit.preview.empty")}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1 px-3 py-2">
        <TransportButton
          label={t("toolBox.videoEdit.preview.backOneSecond")}
          disabled={disabled}
          onClick={() => onSkip(-1)}
        >
          <SkipBack className="h-4 w-4" />
        </TransportButton>
        <TransportButton
          label={t("toolBox.videoEdit.preview.backOneFrame")}
          disabled={disabled}
          onClick={() => onFrameStep(-1)}
        >
          <StepBack className="h-4 w-4" />
        </TransportButton>
        <button
          type="button"
          title={
            playing
              ? t("toolBox.videoEdit.preview.pause")
              : t("toolBox.videoEdit.preview.play")
          }
          aria-label={
            playing
              ? t("toolBox.videoEdit.preview.pause")
              : t("toolBox.videoEdit.preview.play")
          }
          disabled={disabled}
          onClick={onTogglePlay}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 transition-colors hover:bg-white/85 disabled:opacity-40"
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" />
          )}
        </button>
        <TransportButton
          label={t("toolBox.videoEdit.preview.forwardOneFrame")}
          disabled={disabled}
          onClick={() => onFrameStep(1)}
        >
          <StepForward className="h-4 w-4" />
        </TransportButton>
        <TransportButton
          label={t("toolBox.videoEdit.preview.forwardOneSecond")}
          disabled={disabled}
          onClick={() => onSkip(1)}
        >
          <SkipForward className="h-4 w-4" />
        </TransportButton>

        <span className="mx-2 h-6 w-px bg-white/15" />

        <button
          type="button"
          disabled={disabled}
          onClick={onSetStart}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
        >
          <span className="font-mono text-sm">[</span>
          {t("toolBox.videoEdit.preview.setStart")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onSetEnd}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-40"
        >
          <span className="font-mono text-sm">]</span>
          {t("toolBox.videoEdit.preview.setEnd")}
        </button>
        <span className="ml-2 inline-flex items-center gap-1 font-mono text-[11px] text-white/50">
          <Scissors className="h-3 w-3" />
          {formatTime(trim.start, true)} → {formatTime(trim.end, true)}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSeek(trim.start)}
          className="ml-auto rounded-lg px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {t("toolBox.videoEdit.preview.backToStart")}
        </button>
      </div>
    </section>
  );
}
