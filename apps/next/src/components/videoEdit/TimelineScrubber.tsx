"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatTime } from "@/utils/video/time";

type TimelineScrubberProps = {
  duration: number;
  /** 起点（秒） */
  start: number;
  /** 终点（秒） */
  end: number;
  /** 当前播放位置（秒） */
  currentTime: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  /** 拖动过程中实时跳帧预览 */
  onSeek: (time: number) => void;
  disabled?: boolean;
};

type DragTarget = "in" | "out" | "playhead" | null;

/** 依据总时长选择合适的刻度间隔，目标 8–14 个刻度 */
function pickTickStep(duration: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const target = duration / 10;
  return candidates.find((step) => step >= target) ?? candidates[candidates.length - 1];
}

/**
 * PR 风格时间轴：不使用常规播放进度条，
 * 直接拖动起止标记（|）划定剪切区间；拖动过程中调用 onSeek 让视频跳到对应帧。
 */
export function TimelineScrubber({
  duration,
  start,
  end,
  currentTime,
  onStartChange,
  onEndChange,
  onSeek,
  disabled = false,
}: TimelineScrubberProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);

  const safeDuration = duration > 0 ? duration : 0;
  const pct = useCallback(
    (time: number) => (safeDuration > 0 ? (time / safeDuration) * 100 : 0),
    [safeDuration]
  );

  const timeAt = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || safeDuration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * safeDuration;
    },
    [safeDuration]
  );

  const ticks = useMemo(() => {
    if (safeDuration <= 0) return [];
    const step = pickTickStep(safeDuration);
    const list: number[] = [];
    for (let time = 0; time <= safeDuration + 1e-6; time += step) {
      list.push(Number(time.toFixed(3)));
    }
    return list;
  }, [safeDuration]);

  const beginDrag = (target: Exclude<DragTarget, null>) => (event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 某些环境下（合成事件/无活动指针）无法捕获，退化为普通拖动
    }
    setDragging(target);

    // 按下即跳到该标记所在帧
    if (target === "in") onSeek(start);
    else if (target === "out") onSeek(end);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging || disabled) return;
    const time = timeAt(event.clientX);

    if (dragging === "in") {
      const next = Math.min(time, Math.max(0, end - 0.05));
      onStartChange(next);
      onSeek(next);
      return;
    }
    if (dragging === "out") {
      const next = Math.max(time, Math.min(safeDuration, start + 0.05));
      onEndChange(next);
      onSeek(next);
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragging) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    setDragging(null);
  };

  const handleTrackPointerDown = (event: React.PointerEvent) => {
    if (disabled || dragging) return;
    const time = timeAt(event.clientX);
    onSeek(time);
  };

  const selectionWidth = Math.max(0, pct(end) - pct(start));

  return (
    <div className="select-none space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-medium text-blue-400">
          {t("toolBox.videoEdit.timeline.startLabel")} {formatTime(start, true)}
        </span>
        <span>
          {t("toolBox.videoEdit.timeline.selectionLabel")}{" "}
          {formatTime(Math.max(0, end - start), true)}
        </span>
        <span className="font-medium text-blue-400">
          {t("toolBox.videoEdit.timeline.endLabel")} {formatTime(end, true)}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`relative h-20 touch-none rounded-lg bg-gray-800 ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"
        }`}
      >
        {/* 刻度 */} 
        <div className="pointer-events-none absolute inset-0">
          {ticks.map((time) => (
            <div
              key={time}
              className="absolute top-0 h-full border-l border-white/10"
              style={{ left: `${pct(time)}%` }}
            >
              <span className="absolute bottom-1 left-1 whitespace-nowrap text-[10px] text-white/40">
                {formatTime(time)}
              </span>
            </div>
          ))}
        </div>

        {/* 区间外遮罩 */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/55"
          style={{ width: `${pct(start)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/55"
          style={{ width: `${100 - pct(end)}%` }}
        />

        {/* 选区 */}
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-blue-500/60 bg-blue-500/10"
          style={{ left: `${pct(start)}%`, width: `${selectionWidth}%` }}
        />

        {/* 播放头 */}
        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white"
          style={{ left: `${pct(currentTime)}%` }}
        >
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white" />
        </div>

        {/* 起点 | 标记 */}
        <button
          type="button"
          aria-label={t("toolBox.videoEdit.timeline.dragStart")}
          onPointerDown={beginDrag("in")}
          style={{ left: `${pct(start)}%` }}
          className={`absolute inset-y-0 z-30 -ml-2 flex w-4 cursor-ew-resize items-center justify-center ${
            dragging === "in" ? "text-white" : "text-blue-400"
          }`}
        >
          <span className="h-full w-0.5 bg-current" />
          <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded bg-blue-500 px-1 text-[10px] font-bold text-white">
            [
          </span>
        </button>

        {/* 终点 | 标记 */}
        <button
          type="button"
          aria-label={t("toolBox.videoEdit.timeline.dragEnd")}
          onPointerDown={beginDrag("out")}
          style={{ left: `${pct(end)}%` }}
          className={`absolute inset-y-0 z-30 -ml-2 flex w-4 cursor-ew-resize items-center justify-center ${
            dragging === "out" ? "text-white" : "text-blue-400"
          }`}
        >
          <span className="h-full w-0.5 bg-current" />
          <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded bg-blue-500 px-1 text-[10px] font-bold text-white">
            ]
          </span>
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        {t("toolBox.videoEdit.timeline.hintPrefix")}{" "}
        <span className="font-mono text-blue-400">[</span> /
        <span className="font-mono text-blue-400">]</span>{" "}
        {t("toolBox.videoEdit.timeline.hintSuffix")}
      </p>
    </div>
  );
}
