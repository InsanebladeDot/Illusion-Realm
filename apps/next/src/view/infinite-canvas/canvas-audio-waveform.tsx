"use client";

/** 波形使用现有 FFmpeg 峰值，拖动只预览位置，松手后才让播放器跳转。 */
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import WaveSurfer from "wavesurfer.js";
import { useMediaPlaybackTime } from "@/hooks/use-media-playback-time";
import { useTranslation } from "@/i18n";
import { useSourceWaveform } from "@/view/toolBox/Tool/video/editor/source-waveform";
import type { VideoWaveformResult } from "@illusion-realm/shared";

interface Props {
  player: RefObject<HTMLMediaElement | null>;
  sourcePath: string;
  duration: number;
  time: number;
  ready: boolean;
  onSeek: (time: number) => void;
}

interface WaveformDrag {
  pointerId: number;
  target: number;
}

export function CanvasAudioWaveform({ player, sourcePath, duration, time, ready, onSeek }: Props) {
  const { t } = useTranslation();
  const playbackTime = useMediaPlaybackTime(player, true, time);
  const [drag, setDrag] = useState<WaveformDrag | null>(null);
  // 松手可能紧跟最后一次 input，ref 让提交直接读到最新的位置。
  const activeDrag = useRef<WaveformDrag | null>(null);
  const value = Math.min(drag?.target ?? playbackTime, duration);
  const progress = duration ? Math.max(0, value / duration) : 0;
  const waveform = useSourceWaveform(sourcePath);

  function begin(event: PointerEvent<HTMLInputElement>) {
    if (event.button !== 0 || !event.isPrimary || activeDrag.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { pointerId: event.pointerId, target: value };
    activeDrag.current = next;
    setDrag(next);
  }

  function change(target: number) {
    const current = activeDrag.current;
    // 方向键仍立即定位。拖动像在尺子上移动标记，确认前播放器继续使用原位置。
    if (!current) { onSeek(target); return; }
    const next = { ...current, target };
    activeDrag.current = next;
    setDrag(next);
  }

  function finish(event: PointerEvent<HTMLInputElement>, commit: boolean) {
    const current = activeDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    activeDrag.current = null;
    setDrag(null);
    // 取消手势或失去捕获时丢掉草稿，下一次拖动会重新从真实进度开始。
    if (commit && ready) onSeek(current.target);
  }

  return <div className="hy-audio-wave nodrag nopan nowheel" data-canvas-media-control>
    {/* 节点音频区：像固定刻度尺，整段波形保持原位，每帧只移动已播放的标记。 */}
    {waveform?.result ? <WaveSurferDisplay key={sourcePath} waveform={waveform.result} progress={progress} /> :
      <span className="absolute inset-0 grid place-items-center text-xs" role="status">
        {t(waveform?.status === "error" ? "toolBox.editorUi.waveformError" : "toolBox.editorUi.waveformLoading")}
      </span>}
    <input
      type="range"
      aria-label={t("canvas.audioSeek")}
      min={0}
      max={duration}
      step={.01}
      value={value}
      disabled={!ready || !duration}
      onChange={event => change(event.currentTarget.valueAsNumber)}
      onPointerDown={begin}
      onPointerUp={event => finish(event, true)}
      onPointerCancel={event => finish(event, false)}
      onLostPointerCapture={event => finish(event, false)}
    />
  </div>;
}

function useWaveSurferDisplay(waveform: VideoWaveformResult) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<WaveSurfer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (!container.current) return;
    // 复用主进程生成的峰值。WaveSurfer 只负责绘图，不读音频 URL 或接管播放器。
    const wave = WaveSurfer.create({
      container: container.current,
      height: 76, interact: false,
      waveColor: "#8791a1", progressColor: "#cb9650", cursorColor: "#dba45c",
      barWidth: 2, barGap: 1, barRadius: 1,
    });
    instance.current = wave;
    let active = true;
    void wave.load("", [Float32Array.from(waveform.peaks)], waveform.duration).then(
      () => { if (active) setState("ready"); },
      () => { if (active) setState("error"); },
    );
    return () => {
      active = false;
      instance.current = null;
      wave.destroy();
    };
  }, [waveform]);
  return { container, instance, state };
}

function WaveSurferDisplay({ waveform, progress }: { waveform: VideoWaveformResult; progress: number }) {
  const { t } = useTranslation();
  const { container, instance, state } = useWaveSurferDisplay(waveform);
  useEffect(() => {
    if (state === "ready") instance.current?.getRenderer().renderProgress(progress);
  }, [instance, progress, state]);
  return <>
    <div ref={container} className="pointer-events-none" data-canvas-wavesurfer={state} aria-hidden />
    {state === "error" && <span className="absolute inset-0 grid place-items-center text-xs" role="status">{t("toolBox.editorUi.waveformError")}</span>}
  </>;
}
