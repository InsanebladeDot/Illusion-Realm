"use client";

import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { HoverTip } from "@/components/hover-tip";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";

const GAP = 8;
const READER_WIDTH = 460;
const READER_HEIGHT = 440;
const MIN_SIDE_WIDTH = 320;
const MIN_READING_HEIGHT = 240;
const TEXT_ACTION = "shrink-0 rounded px-2 py-2 text-xs text-accent-text underline-offset-4 transition-[color,scale] hover:text-foreground hover:underline active:scale-95 active:text-foreground active:underline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none";

export interface PresetReading {
  anchor: HTMLButtonElement;
  triggerId: string;
  label: string;
  instruction: string;
  presetId: string;
  expanded?: boolean;
  progress?: number;
}

// 卡片像贴在菜单外沿的一页纸，避开已经展开的所有列。侧面不够宽，再挪到菜单上下。
function readerPosition(column: DOMRect, columns: DOMRect[], topInset: number) {
  const bottom = innerHeight - GAP;
  const height = Math.min(READER_HEIGHT, bottom - topInset);
  const width = Math.min(READER_WIDTH, innerWidth - 2 * GAP);
  const leftEdge = Math.min(...columns.map(rect => rect.left));
  const rightEdge = Math.max(...columns.map(rect => rect.right));
  const leftSpace = leftEdge - 2 * GAP;
  const rightSpace = innerWidth - rightEdge - 2 * GAP;
  if (Math.max(leftSpace, rightSpace) >= Math.min(MIN_SIDE_WIDTH, width)) {
    const opensRight = rightSpace >= width || rightSpace >= leftSpace;
    const sideWidth = Math.min(width, opensRight ? rightSpace : leftSpace);
    const left = opensRight ? rightEdge + GAP : leftEdge - GAP - sideWidth;
    const top = Math.max(topInset, Math.min(column.top, bottom - height));
    return { left, top, width: sideWidth, height };
  }
  const above = Math.min(...columns.map(rect => rect.top)) - GAP;
  const below = Math.max(...columns.map(rect => rect.bottom)) + GAP;
  const opensBelow = bottom - below >= Math.min(height, MIN_READING_HEIGHT) || bottom - below >= above - topInset;
  const available = opensBelow ? bottom - below : above - topInset;
  const fallbackHeight = Math.min(height, Math.max(MIN_READING_HEIGHT, available));
  // 窄窗口仍留够正文和操作区，空间实在不够时只遮住相邻菜单边缘。
  const top = opensBelow ? Math.min(below, bottom - fallbackHeight) : Math.max(topInset, above - fallbackHeight);
  const left = Math.max(GAP, Math.min(column.left, innerWidth - width - GAP));
  return { left, top, width, height: fallbackHeight };
}

function positionReader(card: HTMLElement, column: HTMLElement, menu: HTMLElement) {
  const bounds = [...menu.querySelectorAll(":scope > [data-assistant-column]")].map(node => node.getBoundingClientRect());
  const chrome = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--window-chrome-height")) || 0;
  applyReaderPosition(card, readerPosition(column.getBoundingClientRect(), bounds, chrome + GAP));
}

function applyReaderPosition(card: HTMLElement, bounds: { left: number; top: number; width: number; height: number }) {
  for (const [name, value] of Object.entries(bounds)) {
    card.style.setProperty(name, `${value}px`);
  }
}

/** 跟踪已经渲染的菜单列，窗口变窄或滚动时仍按真实边界重排。 */
function useReaderPosition(ref: RefObject<HTMLElement | null>, anchor: HTMLButtonElement, expanded: boolean) {
  useLayoutEffect(() => {
    if (expanded) return;
    const card = ref.current;
    const column = anchor.closest<HTMLElement>("[data-assistant-column]");
    const menu = column?.parentElement;
    if (!card || !column || !menu) return;
    const update = () => {
      const currentColumn = column.isConnected ? column : menu.querySelector<HTMLElement>("[data-assistant-column]");
      if (currentColumn) positionReader(card, currentColumn, menu);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(menu);
    observer.observe(column);
    // 根列换边或改为逐级菜单时，外框大小可能相同，也要更新阅读卡位置。
    const mutations = new MutationObserver(update);
    mutations.observe(menu, { attributes: true, attributeFilter: ["style"], childList: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, expanded, ref]);
}

/** 放大时用主区真实边界，侧栏开合后阅读页会跟着调整。 */
function useMainReaderPosition(ref: RefObject<HTMLElement | null>, expanded: boolean) {
  useLayoutEffect(() => {
    if (!expanded) return;
    const card = ref.current;
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    if (!card || !main) return;
    const update = () => {
      const { left, top, width, height } = main.getBoundingClientRect();
      applyReaderPosition(card, { left, top, width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    window.addEventListener("resize", update);
    // 像给原页面盖上一页纸：编辑器保留挂载，放大期间不能误点或用 Tab 进入。
    const page = main.firstElementChild;
    const wasInert = page instanceof HTMLElement && page.inert;
    if (page instanceof HTMLElement) page.inert = true;
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      if (page instanceof HTMLElement) page.inert = wasInert;
    };
  }, [expanded, ref]);
}

export function PresetViewButton({ label, readerId, expandedTrigger, onView }: {
  label: string;
  readerId: string;
  expandedTrigger?: string;
  onView: (anchor: HTMLButtonElement, triggerId: string) => void;
}) {
  const { t } = useTranslation();
  const triggerId = useId();
  const expanded = expandedTrigger === triggerId;
  return <button id={triggerId} type="button" role="menuitem" data-preset-view aria-haspopup="dialog" aria-expanded={expanded}
    aria-controls={expanded ? readerId : undefined} aria-label={t("create.promptAssistant.viewPresetLabel", { preset: label })}
    className={TEXT_ACTION} onClick={event => onView(event.currentTarget, triggerId)}>{t("create.promptAssistant.viewPreset")}</button>;
}

export function PresetReader({ id, reading, onClose, onUse, onToggleSize }: {
  id: string; reading: PresetReading; onClose: () => void; onUse: () => void; onToggleSize: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const expanded = !!reading.expanded;
  const sizeLabel = t(expanded ? "create.promptAssistant.restorePresetReader" : "create.promptAssistant.expandPresetReader");
  useReaderPosition(ref, reading.anchor, expanded);
  useMainReaderPosition(ref, expanded);
  useLayoutEffect(() => { text.current?.focus({ preventScroll: true }); }, [reading.anchor]);
  useLayoutEffect(() => {
    const body = text.current;
    if (body && reading.progress !== undefined) body.scrollTop = reading.progress * (body.scrollHeight - body.clientHeight);
  }, [expanded, reading.progress]);
  const copy = async () => {
    const ok = await copyText(reading.instruction);
    useToastStore.getState().show(t(ok ? "create.promptAssistant.copied" : "common.copyFailed"));
  };
  return <section ref={ref} id={id} role="dialog" aria-labelledby={`${id}-title`} data-preset-reader data-preset-reader-expanded={expanded || undefined}
    className={`fixed flex flex-col overflow-hidden border border-border bg-background text-foreground ${expanded ? "rounded-[8px]" : "rounded-xl shadow-lg"}`}>
    {/* 预设正文卡片：只滚动文字，关闭、复制和使用留在原位。 */}
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1.5">
      <h2 id={`${id}-title`} className="text-sm font-semibold">{reading.label}</h2>
      <HoverTip asChild layer="window" label={sizeLabel}>
        <button type="button" data-preset-reader-size aria-label={sizeLabel} aria-pressed={expanded} onClick={onToggleSize}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-[background-color,scale] hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none">
          {expanded ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        </button>
      </HoverTip>
    </header>
    <div key={reading.presetId} ref={text} tabIndex={0} data-preset-reader-text
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <div className={`whitespace-pre-wrap break-words ${expanded ? "mx-auto max-w-[78ch] py-3" : ""}`}>{reading.instruction}</div>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2">
      <button type="button" data-preset-reader-close className={`${TEXT_ACTION} mr-auto`} onClick={onClose}>{t("common.close")}</button>
      <button type="button" data-preset-reader-copy className={TEXT_ACTION} onClick={() => void copy()}>{t("create.promptAssistant.copyPresetText")}</button>
      <button type="button" data-preset-reader-use className="rounded-lg border border-accent-stroke bg-accent-soft px-3 py-2 text-xs font-medium text-accent-text transition-[background-color,scale] hover:bg-muted active:scale-95 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none" onClick={onUse}>{t("create.promptAssistant.usePreset")}</button>
    </footer>
  </section>;
}
