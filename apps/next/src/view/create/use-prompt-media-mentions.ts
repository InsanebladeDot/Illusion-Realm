"use client";

// 素材补全交互：以纯文本光标位置识别 @ 查询，浮层挂到 body 避免滚动容器裁切；不读取全局素材。
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { editorSelectionOffset } from "@/utils/image-prompt-references";
import { filterPromptMedia, getMediaMentionQuery, mediaReferenceToken, type MediaMentionQuery, type PromptMediaKind, type PromptReferenceMedia } from "@/utils/prompt-media-references";
import { REFERENCE_MEDIA_KINDS } from "@/utils/comfy/video-reference-media";
import type { MediaMenuEntry, MediaMenuPosition, PromptMediaGroup } from "./prompt-media-menu";

interface MentionState extends MediaMentionQuery { position: MediaMenuPosition }
interface Props {
  ref: RefObject<HTMLDivElement | null>; media: readonly PromptReferenceMedia[]; disabled: boolean;
  replace: (start: number, end: number, text: string) => void;
  // 类型范围由任务入口传入，不根据当前是否上传过某类素材猜功能权限。
  // 视频保持三种类别，Role TTS 明确只给 audio，连空图片分类也不展示。
  // 候选数据仍由各自表单持有，不读取另一个页面的素材列表。
  kinds?: readonly PromptMediaKind[];
  // 候选来源和实际输入分开，选中时先由宿主登记依赖，再把合法编号交给原编辑器。
  groups?: readonly PromptMediaGroup[];
  resolveSelection?: (item: PromptReferenceMedia) => string | null;
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

// 类别导航与候选筛选共享同一 allowed 列表，输入搜索也不能绕过类型限制。
// 与上传格式校验不同，这里约束的是当前任务允许引用的媒体类型。
// 默认值只在入口提供，导航不维护音频专用分支或第二份键盘逻辑。
/** 分类路径只过滤候选，不写入正文；旧表单没有groups时仍按媒体类型分类。 */
function mentionEntries(state: MentionState | null, media: Props["media"], category: string | null, kinds: readonly PromptMediaKind[], groups?: Props["groups"]): { entries: MediaMenuEntry[]; label?: string } {
  const query = state?.query ?? "";
  if (groups) {
    const pathGroup = groups.find(group => query.startsWith(`/${group.path}/`));
    const selected = pathGroup ?? groups.find(group => group.id === category);
    const search = pathGroup ? query.slice(pathGroup.path.length + 2) : query;
    const candidates = selected ? selected.items : groups.flatMap(group => group.items);
    const entries: MediaMenuEntry[] = !query && !selected
      ? groups.map(group => ({ kind: "group", group, count: group.items.length }))
      : filterPromptMedia(candidates, search).map(item => ({ kind: "media", item }));
    return { entries, label: selected?.label };
  }
  const items = state ? filterPromptMedia(media, query).filter(item => query || !category || item.kind === category) : [];
  return { entries: !query && !category ? kinds.map(kind => ({ kind: "category", category: kind, count: media.filter(item => item.kind === kind).length })) : items.map(item => ({ kind: "media", item })) };
}

function useMentionNavigation(state: MentionState | null, media: Props["media"], choose: (item: PromptReferenceMedia) => void, escape: () => void, kinds: readonly PromptMediaKind[], groups?: Props["groups"]) {
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const { entries, label } = mentionEntries(state, media, category, kinds, groups);
  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));
  const back = () => { setCategory(null); setActive(0); };
  const chooseEntry = (entry: MediaMenuEntry) => {
    if (entry.kind === "category" || entry.kind === "group") { setCategory(entry.kind === "group" ? entry.group.id : entry.category); setActive(0); }
    else choose(entry.item);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" && category) { event.preventDefault(); back(); return true; }
    if (event.key === "ArrowRight" && entries[activeIndex] && entries[activeIndex].kind !== "media") { event.preventDefault(); if (entries[activeIndex]) chooseEntry(entries[activeIndex]); return true; }
    return handleMentionKey(event, entries.length, activeIndex, setActive, () => { if (entries[activeIndex]) chooseEntry(entries[activeIndex]); }, escape);
  };
  return { entries, category: groups || state?.query ? null : category as PromptMediaKind | null, groupLabel: label, back, chooseEntry, active: activeIndex, onKeyDown };
}

// 省略 kinds 的旧视频调用继续支持全部类型，不改变已有多模态行为。
// 显式限制同时作用于分类入口与搜索数据，不只是隐藏两个菜单按钮。
// 过滤生成新数组，不修改调用方的素材或稳定编号。
export function usePromptMediaMentions({ ref, media, disabled, replace, groups, resolveSelection, kinds = REFERENCE_MEDIA_KINDS }: Props) {
  const id = useId();
  const query = useMentionQuery({ ref, disabled });
  const choose = (item: PromptReferenceMedia) => {
    if (query.state) {
      const token = resolveSelection ? resolveSelection(item) : mediaReferenceToken(item);
      if (!token) { query.close(); return; }
      const suffix = ref.current?.textContent?.slice(query.state.end) ?? "";
      replace(query.state.start, query.state.end, token + (/^\s/.test(suffix) ? "" : " "));
    }
    query.close();
  };
  // 所选编号直接来自允许的当前素材，不能在这里重新编号或按文件名猜关联。
  // 插入后的正文保留 @ 写法，转换仅在只读预览和提交边界发生。
  // 素材撤销、中文输入法和浮层关闭仍沿用现有统一处理。
  const menu = useMentionNavigation(query.state, media.filter(item => kinds.includes(item.kind)), choose, query.escape, kinds, groups);
  const update = () => { menu.back(); query.update(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => Boolean(query.state && !disabled && menu.onKeyDown(event));
  return { ...menu, id, state: query.state, update, close: query.close, onKeyDown };
}
