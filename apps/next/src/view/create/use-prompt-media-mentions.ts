"use client";

// 素材补全交互：以纯文本光标位置识别 @ 查询，浮层挂到 body 避免滚动容器裁切；不读取全局素材。
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { editorSelectionOffset } from "@/utils/image-prompt-references";
import { filterPromptMedia, getMediaMentionQuery, mediaReferenceToken, type MediaMentionQuery, type PromptMediaKind, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import { REFERENCE_MEDIA_KINDS } from "@/utils/comfy/video-reference-media";
import type { MediaMenuEntry, MediaMenuPosition } from "./prompt-media-menu";

interface MentionState extends MediaMentionQuery { position: MediaMenuPosition }
interface Props {
  ref: RefObject<HTMLDivElement | null>; media: readonly PromptReferenceMedia[]; disabled: boolean;
  replace: (start: number, end: number, text: string) => void;
}
function menuPosition(root: HTMLElement): MediaMenuPosition {
  const range = window.getSelection()?.getRangeAt(0);
  const bounds = root.getBoundingClientRect();
  const rect = range?.getBoundingClientRect();
  const caret = rect?.height ? rect : bounds;
  const width = Math.min(288, window.innerWidth - 16);
  const below = window.innerHeight - caret.bottom - 14;
  const above = caret.top - 44;
  const flip = below < 160 && above > below;
  const maxHeight = Math.max(48, Math.min(260, flip ? above : below));
  return { width, maxHeight, left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)),
    top: Math.max(40, flip ? caret.top - 6 : caret.bottom + 6), transform: flip ? "translateY(-100%)" : undefined };
}
function useMentionDismiss(ref: Props["ref"], close: () => void) {
  useEffect(() => {
    const onOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && (ref.current?.contains(target) || target.closest("[data-prompt-media-menu]"))) return;
      close();
    };
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest("[data-prompt-media-menu]"))) close();
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", onOutside); document.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", close); };
  }, [ref, close]);
}
function handleMentionKey(event: KeyboardEvent<HTMLDivElement>, count: number, active: number, setActive: (index: number) => void, choose: () => void, close: () => void) {
  if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return false;
  if (!count && event.key !== "Escape") return false;
  event.preventDefault();
  if (event.key === "Escape") close();
  else if (event.key === "ArrowDown" || event.key === "ArrowUp") setActive((active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
  else choose();
  return true;
}
/** 查询状态与分类导航分开：移动光标只重算查询，分类点击不改提示词。 */
function useMentionQuery({ ref, disabled }: Pick<Props, "ref" | "disabled">) {
  const [state, setState] = useState<MentionState | null>(null);
  const ignored = useRef("");
  const close = useCallback(() => { setState(null); }, []);
  useMentionDismiss(ref, close);
  const update = () => {
    const root = ref.current, offset = root ? editorSelectionOffset(root) : null;
    const selection = window.getSelection();
    const query = root && offset !== null && selection?.isCollapsed && !disabled ? getMediaMentionQuery(root.textContent ?? "", offset) : null;
    if (!root || !query) { ignored.current = ""; close(); return; }
    if (ignored.current === JSON.stringify(query)) { close(); return; }
    ignored.current = "";
    setState({ ...query, position: menuPosition(root) });
  };
  const escape = () => { ignored.current = JSON.stringify(state && { start: state.start, end: state.end, query: state.query }); close(); };
  return { state, close, update, escape };
}

function useMentionNavigation(state: MentionState | null, media: Props["media"], choose: (item: PromptReferenceMedia) => void, escape: () => void) {
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState<PromptMediaKind | null>(null);
  const searching = Boolean(state?.query);
  const items = state ? filterPromptMedia(media, state.query).filter((item) => searching || !category || item.kind === category) : [];
  const entries: MediaMenuEntry[] = !searching && !category
    ? REFERENCE_MEDIA_KINDS.map((kind) => ({ kind: "category", category: kind, count: media.filter((item) => item.kind === kind).length }))
    : items.map((item) => ({ kind: "media", item }));
  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));
  const back = () => { setCategory(null); setActive(0); };
  const chooseEntry = (entry: MediaMenuEntry) => {
    if (entry.kind === "category") { setCategory(entry.category); setActive(0); }
    else choose(entry.item);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && category) { event.preventDefault(); back(); return true; }
    if (event.key === "ArrowRight" && entries[activeIndex]?.kind === "category") { event.preventDefault(); chooseEntry(entries[activeIndex]); return true; }
    return handleMentionKey(event, entries.length, activeIndex, setActive, () => { if (entries[activeIndex]) chooseEntry(entries[activeIndex]); }, escape);
  };
  return { entries, category: searching ? null : category, back, chooseEntry, active: activeIndex, onKeyDown };
}

export function usePromptMediaMentions({ ref, media, disabled, replace }: Props) {
  const id = useId();
  const query = useMentionQuery({ ref, disabled });
  const choose = (item: PromptReferenceMedia) => {
    if (query.state) {
      const suffix = ref.current?.textContent?.slice(query.state.end) ?? "";
      replace(query.state.start, query.state.end, mediaReferenceToken(item) + (/^\s/.test(suffix) ? "" : " "));
    }
    query.close();
  };
  const menu = useMentionNavigation(query.state, media, choose, query.escape);
  const update = () => { menu.back(); query.update(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => Boolean(query.state && !disabled && menu.onKeyDown(event));
  return { ...menu, id, state: query.state, update, close: query.close, onKeyDown };
}
