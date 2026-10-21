"use client";

/** 区间编辑命令：只修改剪辑数据，不改动磁盘素材；复制保留快照，粘贴插在目标区间后。 */
import { useState, type Dispatch, type SetStateAction } from "react";
import type { ClipItem } from "@/components/videoEdit/types";
import type { VideoClipEffects } from "@/types/electron-api";
import { copyClip, pasteClip, splitClipAt } from "@/utils/video/clip-effects";

interface ClipActionsOptions {
  clips: ClipItem[];
  setClips: Dispatch<SetStateAction<ClipItem[]>>;
  activateClip: (clip: ClipItem) => void;
}

export function useVideoClipActions({ clips, setClips, activateClip }: ClipActionsOptions) {
  const [clipboard, setClipboard] = useState<ClipItem | null>(null);
  function updateEffects(id: string, effects: VideoClipEffects) {
    setClips(previous => previous.map(clip => clip.id === id ? { ...clip, effects: { ...clip.effects, ...effects } } : clip));
  }
  function copyRange(id: string) {
    const clip = clips.find(item => item.id === id);
    if (clip) setClipboard(copyClip(clip));
  }
  function pasteRange(afterId: string) {
    if (!clipboard) return;
    const index = clips.findIndex(clip => clip.id === afterId);
    if (index < 0) return;
    const added = pasteClip(clipboard);
    setClips(previous => [...previous.slice(0, index + 1), added, ...previous.slice(index + 1)]);
    activateClip(added);
  }
  function splitRange(id: string, time: number) {
    const clip = clips.find(item => item.id === id);
    if (!clip) return;
    const parts = splitClipAt(clip, time);
    if (parts.length < 2) return;
    setClips(previous => previous.flatMap(item => item.id === id ? parts : [item]));
    activateClip(parts[1]);
  }
  return { clipboard, updateEffects, copyRange, pasteRange, splitRange };
}
