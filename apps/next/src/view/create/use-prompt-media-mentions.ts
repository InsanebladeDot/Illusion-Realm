"use client";

// 素材补全交互：以纯文本光标位置识别 @ 查询，浮层挂到 body 避免滚动容器裁切；不读取全局素材。
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { editorSelectionOffset } from "@/utils/image-prompt-references";
import { filterPromptMedia, getMediaMentionQuery, mediaReferenceToken, type MediaMentionQuery, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import type { MediaMenuPosition } from "./prompt-media-menu";

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
export function usePromptMediaMentions({ ref, media, disabled, replace }: Props) {
  const [state, setState] = useState<MentionState | null>(null);
  const [active, setActive] = useState(0);
  const ignored = useRef("");
  const id = useId();
  const close = useCallback(() => { setState(null); }, []);
  useMentionDismiss(ref, close);
  const update = () => {
    const root = ref.current, offset = root ? editorSelectionOffset(root) : null;
    const selection = window.getSelection();
    const query = root && offset !== null && selection?.isCollapsed && !disabled ? getMediaMentionQuery(root.textContent ?? "", offset) : null;
    if (!root || !query) { ignored.current = ""; close(); return; }
    if (ignored.current === JSON.stringify(query)) { close(); return; }
    ignored.current = "";
    setState({ ...query, position: menuPosition(root) }); setActive(0);
  };
  const items = state ? filterPromptMedia(media, state.query) : [];
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));
  const choose = (item: PromptReferenceMedia) => {
    if (state) { const suffix = ref.current?.textContent?.slice(state.end) ?? ""; replace(state.start, state.end, mediaReferenceToken(item) + (/^\s/.test(suffix) ? "" : " ")); }
    close();
  };
  const escape = () => { ignored.current = JSON.stringify(state && { start: state.start, end: state.end, query: state.query }); close(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => Boolean(state && !disabled && handleMentionKey(event, items.length, activeIndex, setActive, () => { if (items[activeIndex]) choose(items[activeIndex]); }, escape));
  return { id, state, items, active: activeIndex, update, close, choose, onKeyDown };
}
