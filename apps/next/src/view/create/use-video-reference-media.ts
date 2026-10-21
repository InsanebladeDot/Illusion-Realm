"use client";

// 当前任务独享素材；混合导入自动分类并分配空编号，更换/移除/卸载时释放 URL。
import { useEffect, useRef, useState } from "react";
import type { PromptMediaKind } from "@/utils/prompt-media-references";
import type { VideoReferenceFile } from "@/utils/comfy/video-reference-media";
import { isReferenceFile, referenceFileKind } from "@/utils/reference-file-types";
import { videoFirstFrame } from "@/utils/video-first-frame";
import { useToastStore } from "@/stores/useToastStore";
import { t } from "@/i18n";

function useReferenceState() {
  const [media, setMedia] = useState<VideoReferenceFile[]>([]);
  const current = useRef(media);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const activeUrls = urls.current;
    return () => { for (const url of activeUrls) URL.revokeObjectURL(url); activeUrls.clear(); };
  }, []);
  const commit = (next: VideoReferenceFile[]) => { current.current = next; setMedia(next); };
  const release = (src: string) => { URL.revokeObjectURL(src); urls.current.delete(src); };
  const create = (kind: PromptMediaKind, number: number, file: File): VideoReferenceFile => {
    const src = URL.createObjectURL(file); urls.current.add(src);
    if (kind === "video") void videoFirstFrame(src).then((thumbnail) => {
      // 旧封面晚到时不能覆盖新文件，卸载后也不能再提交状态。
      if (thumbnail && urls.current.has(src)) commit(current.current.map((item) => item.src === src ? { ...item, thumbnail } : item));
    }).catch(() => undefined);
    return { id: `${kind}-${number}`, kind, number, file, src, name: file.name };
  };
  return { media, current, commit, release, create };
}

/** 一批文件只扫描一次现有编号；按类型填补空位并向后递增，没有预设数量上限。 */
function referenceNumberAllocator(media: readonly VideoReferenceFile[]) {
  const used = { image: new Set<number>(), video: new Set<number>(), audio: new Set<number>() };
  const next = { image: 1, video: 1, audio: 1 };
  for (const item of media) used[item.kind].add(item.number);
  return (kind: PromptMediaKind) => {
    while (used[kind].has(next[kind])) next[kind]++;
    const number = next[kind]++;
    used[kind].add(number);
    return number;
  };
}

function addReferenceFiles(state: ReturnType<typeof useReferenceState>, files: File[]) {
  const next = [...state.current.current];
  const allocate = referenceNumberAllocator(next);
  let count = 0;
  for (const file of files) {
    const kind = referenceFileKind(file);
    if (!kind) continue;
    next.push(state.create(kind, allocate(kind), file)); count++;
  }
  if (count) state.commit(next);
  if (files.length > count) useToastStore.getState().show(t("create.videoReferences.mixedSkipped", {
    count, skipped: files.length - count,
  }));
}

export function useVideoReferenceMedia() {
  const state = useReferenceState();
  const select = (kind: PromptMediaKind, number: number, file: File) => {
    if (!isReferenceFile(kind, file) || !Number.isSafeInteger(number) || number < 1) return;
    const previous = state.current.current.find((item) => item.kind === kind && item.number === number);
    if (previous) state.release(previous.src);
    state.commit([...state.current.current.filter((item) => item.id !== `${kind}-${number}`), state.create(kind, number, file)]);
  };
  const remove = (id: string) => {
    const item = state.current.current.find((entry) => entry.id === id);
    if (item) state.release(item.src);
    state.commit(state.current.current.filter((entry) => entry.id !== id));
  };
  return { media: state.media, select, addFiles: (files: File[]) => addReferenceFiles(state, files), remove };
}
