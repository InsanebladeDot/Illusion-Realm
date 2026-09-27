"use client";

/**
 * 片段编辑器（视频剪辑 / GIF 制作共用）
 *
 * 负责「导入视频 → 片段列表（顺序即处理顺序）→ 选中片段 → PR 风格起点终点剪切 → 走带预览」
 * 这一整套状态与交互；页面只保留各自特有的参数（变速/裁剪、帧率/分辨率）与导出逻辑。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import {
  hasVideoBridge,
  pickVideoFiles,
  probeVideoFile,
} from "@/utils/video/ffmpeg";
import { buildLocalFileUrl } from "@/utils/video/localFileUrl";
import {
  createClipId,
  type ClipItem,
  type ClipInput,
} from "@/components/videoEdit/types";

type UseClipEditorOptions = {
  /** 手动指定的 ffmpeg 路径（用于 ffprobe 探测元数据，可为空表示自动探测） */
  ffmpegPath: string | null;
  isDesktop: boolean;
  /** 首段（输出尺寸基准）变化时回调，例如重置裁剪框 */
  onFirstClipChange?: (clip: ClipItem) => void;
  /** 成功导入后回调，例如重置导出进度 */
  onClipsAdded?: (added: ClipItem[], wasEmpty: boolean) => void;
  /** 列表被清空时回调，例如清空导出结果 */
  onCleared?: () => void;
};

/** 片段列表 → 主进程任务输入（去掉 UI 专有字段） */
export function buildClipInputs(clips: ClipItem[]): ClipInput[] {
  return clips.map((clip) => ({
    inputPath: clip.path,
    duration: clip.duration,
    hasAudio: clip.hasAudio,
    trim: { start: clip.trim.start, end: clip.trim.end },
  }));
}

export function useClipEditor({
  ffmpegPath,
  isDesktop,
  onFirstClipChange,
  onClipsAdded,
  onCleared,
}: UseClipEditorOptions) {
  const showToast = useToastStore((state) => state.show);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [clips, setClips] = useState<ClipItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 回调放进 ref，避免调用方传入内联函数导致所有回调每帧重建
  const callbacksRef = useRef({ onFirstClipChange, onClipsAdded, onCleared });
  useEffect(() => {
    callbacksRef.current = { onFirstClipChange, onClipsAdded, onCleared };
  });

  const selectedIndex = useMemo(() => {
    const index = clips.findIndex((clip) => clip.id === selectedId);
    return index >= 0 ? index : 0;
  }, [clips, selectedId]);
  const selectedClip = clips[selectedIndex] ?? null;

  const previewUrl = useMemo(
    () => buildLocalFileUrl(selectedClip?.path ?? null),
    [selectedClip?.path]
  );

  /**
   * 拖动时间轴时的跳帧是「一次只允许一个 seek 在途」的：
   * 浏览器（Chromium）在 seeking 状态下再赋 currentTime 只是更换目标，
   * 以 60Hz 连续赋值会让任何一个 seek 都来不及完成，画面就一直停在旧帧，
   * 直到用户松手才跳到最后一帧。这里改成：在途时只记下最新目标，
   * 上一个 seek 完成（seeked）后立刻接续，画面即可随拖动连续刷新。
   */
  const pendingSeekRef = useRef<number | null>(null);
  const lastSeekAtRef = useRef(0);

  /** seek 卡住超过该时长（某些编码/平台不回调 seeked）则强制换目标，避免死等 */
  const SEEK_STALL_MS = 1200;

  const flushSeek = useCallback((time: number) => {
    const element = videoRef.current;
    if (!element) return;

    const stalled = Date.now() - lastSeekAtRef.current > SEEK_STALL_MS;
    if (element.seeking && !stalled) {
      pendingSeekRef.current = time;
      return;
    }

    pendingSeekRef.current = null;
    lastSeekAtRef.current = Date.now();
    try {
      element.currentTime = time;
    } catch {
      // 元数据尚未就绪时忽略
    }
  }, []);

  /** seek 完成：若拖动期间还有更新过目标，立即接续到最新位置 */
  const handleSeeked = useCallback(() => {
    const element = videoRef.current;
    if (element) setPlayhead(element.currentTime);
    const pending = pendingSeekRef.current;
    if (pending != null) {
      pendingSeekRef.current = null;
      flushSeek(pending);
    }
  }, [flushSeek]);

  /** 把播放头移动到指定秒数（同时驱动预览画面跳帧） */
  const seek = useCallback(
    (time: number) => {
      const max = selectedClip?.duration ?? 0;
      const clamped = Math.max(0, Math.min(Math.max(0, max - 0.001), time));
      setPlayhead(clamped);
      flushSeek(clamped);
    },
    [flushSeek, selectedClip?.duration]
  );

  /** 播放到终点自动停止并回到起点，便于反复预览选区 */
  const reportTime = useCallback(
    (time: number) => {
      setPlayhead(time);
      if (!playing || !selectedClip) return;
      if (time >= selectedClip.trim.end - 0.02) {
        videoRef.current?.pause();
        seek(selectedClip.trim.start);
      }
    },
    [playing, seek, selectedClip]
  );

  /** 导入视频：支持一次多选，逐个探测元数据后追加到列表末尾 */
  const importClips = useCallback(async () => {
    if (!isDesktop) {
      showToast(t("toolBox.videoEdit.clipEditor.desktopOnly"), "error");
      return;
    }
    if (!hasVideoBridge()) {
      showToast(t("toolBox.videoEdit.clipEditor.bridgeMissing"), "error");
      return;
    }

    const picked = await pickVideoFiles();
    if (picked.length === 0) return;

    setLoading(true);
    const added: ClipItem[] = [];
    let failed = 0;
    try {
      for (const filePath of picked) {
        try {
          const info = await probeVideoFile(filePath, ffmpegPath);
          added.push({
            id: createClipId(),
            name: info.fileName,
            path: info.path,
            duration: info.duration,
            width: info.width,
            height: info.height,
            fps: info.fps,
            hasAudio: info.hasAudio,
            size: info.size,
            trim: { start: 0, end: info.duration },
          });
        } catch {
          failed += 1;
        }
      }

      if (added.length > 0) {
        const wasEmpty = clips.length === 0;
        if (wasEmpty) callbacksRef.current.onFirstClipChange?.(added[0]);
        setClips((prev) => [...prev, ...added]);
        setSelectedId((prev) => prev ?? added[0].id);
        callbacksRef.current.onClipsAdded?.(added, wasEmpty);
        showToast(
          t("toolBox.videoEdit.clipEditor.clipsAdded", { count: added.length }),
          "success"
        );
      }
      if (failed > 0) {
        showToast(
          t("toolBox.videoEdit.clipEditor.readFailed", { count: failed }),
          "error"
        );
      }
    } finally {
      setLoading(false);
    }
  }, [clips.length, ffmpegPath, isDesktop, showToast]);

  const selectClip = useCallback((id: string) => {
    setSelectedId(id);
    setPlaying(false);
    setPlayhead(0);
  }, []);

  const removeClip = useCallback(
    (id: string) => {
      const next = clips.filter((clip) => clip.id !== id);
      setClips(next);

      if (next.length === 0) {
        setSelectedId(null);
        callbacksRef.current.onCleared?.();
        return;
      }
      // 首段被移除时输出尺寸基准随之改变
      if (id === clips[0].id) callbacksRef.current.onFirstClipChange?.(next[0]);
      if (id === selectedId) setSelectedId(next[0].id);
    },
    [clips, selectedId]
  );

  /** 拖拽调整顺序：顺序即处理顺序；首段变化时需要更新尺寸基准 */
  const reorderClips = useCallback(
    (next: ClipItem[]) => {
      if (next.length > 0 && next[0].id !== clips[0]?.id) {
        callbacksRef.current.onFirstClipChange?.(next[0]);
      }
      setClips(next);
    },
    [clips]
  );

  /** 更新当前选中片段的剪切区间 */
  const setTrim = useCallback(
    (start: number, end: number) => {
      if (!selectedClip) return;
      const id = selectedClip.id;
      setClips((prev) =>
        prev.map((clip) => (clip.id === id ? { ...clip, trim: { start, end } } : clip))
      );
    },
    [selectedClip]
  );

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      // 播放头在选区之外时从起点开始
      if (
        selectedClip &&
        (element.currentTime < selectedClip.trim.start ||
          element.currentTime >= selectedClip.trim.end - 0.02)
      ) {
        element.currentTime = selectedClip.trim.start;
      }
      void element.play();
    } else {
      element.pause();
    }
  }, [selectedClip]);

  const skip = useCallback(
    (deltaSeconds: number) => {
      videoRef.current?.pause();
      seek((videoRef.current?.currentTime ?? playhead) + deltaSeconds);
    },
    [playhead, seek]
  );

  const frameStep = useCallback(
    (frames: number) => {
      const element = videoRef.current;
      element?.pause();
      const frameDuration = selectedClip && selectedClip.fps > 0 ? 1 / selectedClip.fps : 1 / 25;
      seek((element?.currentTime ?? playhead) + frames * frameDuration);
    },
    [playhead, seek, selectedClip]
  );

  const setStartFromPlayhead = useCallback(() => {
    if (!selectedClip) return;
    setTrim(Math.min(playhead, Math.max(0, selectedClip.trim.end - 0.1)), selectedClip.trim.end);
  }, [playhead, selectedClip, setTrim]);

  const setEndFromPlayhead = useCallback(() => {
    if (!selectedClip) return;
    setTrim(selectedClip.trim.start, Math.max(playhead, selectedClip.trim.start + 0.1));
  }, [playhead, selectedClip, setTrim]);

  /** 全部片段选区时长之和（用于预计输出时长） */
  const selectionDuration = clips.reduce(
    (total, clip) => total + Math.max(0, clip.trim.end - clip.trim.start),
    0
  );

  /** 切换片段时清掉上一次残留的待跳转目标 */
  useEffect(() => {
    pendingSeekRef.current = null;
    lastSeekAtRef.current = 0;
  }, [selectedClip?.path]);

  return {
    clips,
    selectedClip,
    selectedIndex,
    loading,
    playing,
    playhead,
    previewUrl,
    videoRef,
    selectionDuration,
    importClips,
    selectClip,
    removeClip,
    reorderClips,
    setTrim,
    seek,
    handleSeeked,
    reportTime,
    togglePlay,
    skip,
    frameStep,
    setStartFromPlayhead,
    setEndFromPlayhead,
    setPlaying,
  };
}
