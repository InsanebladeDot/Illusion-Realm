"use client";

/** 首帧尺寸只决定视频卡片的默认外形；手动尺寸仍由原缩放控件保存、撤销和恢复。 */
import { useCallback, useState, type CSSProperties } from "react";
import type { CanvasData } from "./canvas-model";

interface FrameSize { path: string; width: number; height: number }

export function useVideoCardSize(data: CanvasData) {
  const path = data.media?.kind === "video" || data.media?.kind === "image" ? data.media.path : undefined;
  const [frame, setFrame] = useState<FrameSize>();
  const onDimensions = useCallback((width: number, height: number) => {
    if (!path || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    // 像先按照片比例选相框：每个来源只取首次尺寸，播放中的分辨率变化不推着卡片跳动。
    setFrame(current => current?.path === path ? current : { path, width, height });
  }, [path]);
  const automatic = data.media?.kind === "video" && !!path && frame?.path === path && !data.card;
  const width = frame ? Math.min(502, Math.round(900 * frame.width / frame.height)) : 502;
  const style: CSSProperties | undefined = automatic && frame ? {
    "--canvas-auto-video-width": `${width}px`,
    "--canvas-auto-video-height": `${Math.round(width * frame.height / frame.width)}px`,
  } as CSSProperties : undefined;
  return { automatic, style, onDimensions, frame: frame?.path === path ? frame : undefined };
}
