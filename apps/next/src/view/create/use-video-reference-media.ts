"use client";

// 当前任务独享素材；批量添加一次分配空编号，切换标签不改编号，更换/移除/卸载时释放 URL。
import { useEffect, useRef, useState } from "react";
import type { PromptMediaKind } from "@/utils/prompt-media-references";
import { REFERENCE_MEDIA_LIMITS, type VideoReferenceFile } from "@/utils/comfy/video-reference-media";
import { isReferenceFile } from "@/utils/reference-file-types";
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
    return { id: `${kind}-${number}`, kind, number, file, src, name: file.name };
  };
  return { media, current, commit, release, create };
}

function availableNumbers(kind: PromptMediaKind, media: VideoReferenceFile[]) {
  return Array.from({ length: REFERENCE_MEDIA_LIMITS[kind] }, (_, index) => index + 1)
    .filter((number) => !media.some((item) => item.kind === kind && item.number === number));
}

export function useVideoReferenceMedia() {
  const state = useReferenceState();
  const select = (kind: PromptMediaKind, number: number, file: File) => {
    if (!isReferenceFile(kind, file) || number < 1 || number > REFERENCE_MEDIA_LIMITS[kind]) return;
    const previous = state.current.current.find((item) => item.kind === kind && item.number === number);
    if (previous) state.release(previous.src);
    state.commit([...state.current.current.filter((item) => item.id !== `${kind}-${number}`), state.create(kind, number, file)]);
  };
  const add = (kind: PromptMediaKind, files: File[]) => {
    const numbers = availableNumbers(kind, state.current.current);
    const accepted = files.filter((file) => isReferenceFile(kind, file)).slice(0, numbers.length);
    const additions = accepted.map((file, index) => state.create(kind, numbers[index], file));
    if (additions.length) state.commit([...state.current.current, ...additions]);
    if (files.length > additions.length) useToastStore.getState().show(t("create.videoReferences.skipped", {
      count: additions.length, skipped: files.length - additions.length, kind: t(`create.mediaReferences.${kind}`),
    }));
  };
  const remove = (id: string) => {
    const item = state.current.current.find((entry) => entry.id === id);
    if (item) state.release(item.src);
    state.commit(state.current.current.filter((entry) => entry.id !== id));
  };
  const nextNumber = (kind: PromptMediaKind) => availableNumbers(kind, state.media)[0];
  return { media: state.media, select, add, remove, nextNumber };
}
