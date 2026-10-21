"use client";

/** 原片预览共用区间效果：浏览器负责正放变速/音量，倒放用有界定时跳帧，真实音频效果由 FFmpeg 导出。 */
import { useEffect, type RefObject } from "react";
import type { ClipItem } from "@/components/videoEdit/types";
import { getClipEffects } from "@/utils/video/clip-effects";

interface ClipPreviewOptions {
  clip: ClipItem | null; videoRef: RefObject<HTMLVideoElement | null>; playing: boolean;
  setPlaying: (value: boolean) => void; seek: (time: number) => void;
}

export function useVideoClipPreview({ clip, videoRef, playing, setPlaying, seek }: ClipPreviewOptions) {
  const { speed, volume, muted, reverse } = getClipEffects(clip);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => { video.playbackRate = speed; video.volume = Math.min(1, volume); video.muted = muted || reverse; };
    apply(); video.addEventListener("loadedmetadata", apply);
    return () => video.removeEventListener("loadedmetadata", apply);
  }, [clip?.path, videoRef, speed, volume, muted, reverse]);
  useEffect(() => {
    if (!clip || !reverse || !playing) return;
    const start = clip.trim.start;
    const timer = setInterval(() => {
      // seek 尚未完成时等待下一拍，避免把起始跳转误判成已倒放到头。
      if (videoRef.current?.seeking) return;
      const time = videoRef.current?.currentTime ?? start;
      if (time <= start + 0.001) { setPlaying(false); return; }
      seek(Math.max(start, time - speed * 0.08));
    }, 80);
    return () => clearInterval(timer);
  }, [clip, reverse, playing, speed, videoRef, setPlaying, seek]);
}
