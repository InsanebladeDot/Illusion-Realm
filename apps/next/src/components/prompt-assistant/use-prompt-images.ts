"use client";

/** 转译图片按输入框隔离；借用的资源只记排除项，自己上传的临时地址负责回收。 */
import { useEffect, useRef, useState } from "react";
import { AGENT_IMAGE_MAX_COUNT } from "@illusion-realm/shared";
import { t } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
export interface PromptImage { id: string; name: string; src: string }
interface ImageDraft { contextId: string; enabled: boolean; uploads: PromptImage[]; excluded: string[] }

function sourceName(src: string, index: number) {
  try {
    const url = new URL(src);
    if (url.protocol === "data:" || url.protocol === "blob:") return t("create.promptAssistant.imageName", { index: index + 1 });
    const path = url.searchParams.get("path") ?? decodeURIComponent(url.pathname);
    return path.split(/[\\/]/).at(-1) || t("create.promptAssistant.imageName", { index: index + 1 });
  } catch {
    return t("create.promptAssistant.imageName", { index: index + 1 });
  }
}

export function usePromptImages(contextId: string, sources?: readonly string[], allowed = true) {
  const [draft, setDraft] = useState<ImageDraft>({ contextId, enabled: false, uploads: [], excluded: [] });
  // 换对象只重置图片，不卸载工具栏，原分类的待确认译文仍可找回。
  if (draft.contextId !== contextId) setDraft({ contextId, enabled: false, uploads: [], excluded: [] });
  // 换成文本型号时关闭识图开关，但保留附件草稿，切回视觉型号仍可重新启用。
  if (!allowed && draft.enabled) setDraft(current => ({ ...current, enabled: false }));
  const input = useRef<HTMLInputElement>(null);
  const owned = useRef<PromptImage[]>([]);
  useEffect(() => {
    return () => { owned.current.forEach(image => URL.revokeObjectURL(image.src)); owned.current = []; };
  }, [contextId]);
  const borrowed = (sources ?? []).map((src, index) => ({ id: `${index}:${src}`, src, name: sourceName(src, index) }))
    .filter(image => !draft.excluded.includes(image.id));
  const add = (files: FileList | null) => { if (allowed) addUploads(files, borrowed.length, owned, setDraft); };
  const remove = (id: string) => {
    const upload = owned.current.find(image => image.id === id);
    if (upload) URL.revokeObjectURL(upload.src);
    owned.current = owned.current.filter(image => image.id !== id);
    // 像从本次寄送清单中划掉附件：不删除原件，也不改变画布连线。
    setDraft(current => ({ ...current, uploads: current.uploads.filter(image => image.id !== id), excluded: [...current.excluded, id] }));
  };
  const items = [...borrowed, ...draft.uploads];
  return { enabled: allowed && draft.enabled, toggle: () => { if (allowed) setDraft(current => ({ ...current, enabled: !current.enabled })); },
    items, remove, add, input, open: () => { if (allowed) input.current?.click(); }, sources: items.map(image => image.src) };
}

/** 连续选图也读取最新地址清单，避免第二次选择绕过数量上限；取消选图不改变草稿。 */
function addUploads(files: FileList | null, borrowedCount: number, owned: { current: PromptImage[] }, setDraft: (update: (current: ImageDraft) => ImageDraft) => void) {
  if (!files?.length) return;
  if (files.length + owned.current.length + borrowedCount > AGENT_IMAGE_MAX_COUNT) {
    useToastStore.getState().show(t("create.promptAssistant.imagesLimit"));
    return;
  }
  const added = Array.from(files).map(file => {
    const src = URL.createObjectURL(file);
    return { id: src, name: file.name, src };
  });
  owned.current = [...owned.current, ...added];
  const uploads = owned.current;
  setDraft(current => ({ ...current, uploads }));
}
