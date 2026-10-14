"use client";

/** 视频侧边快捷浮窗：宽屏停靠右侧，窄屏通过固钉展开；复用主题、视口和窗口栏高度。 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Camera, FolderOpen, SlidersHorizontal, X, Zap } from "lucide-react";
import type { ClipItem } from "./types";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSidebarStore } from "@/stores/useSidebarStore";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "@/data/navigation";
import { useTranslation } from "@/i18n";
import { buildEqualSplitRanges, getMaxSplitParts } from "@/utils/video/equal-split";
import { formatTime } from "@/utils/video/time";

interface SplitState { running: boolean; progress: number; completed: string[]; resultFolder: string | null; total: number }
interface VideoQuickToolsProps {
  clip: ClipItem | null;
  busy: boolean;
  isDesktop: boolean;
  outputFolder: string | null;
  split: SplitState;
  onSplit: (parts: number) => void;
  onCancel: () => void;
  onPickFolder: () => void;
  onOpenFolder: () => void;
  onExportFrame: () => void;
}

function SplitRangePreview({ duration, parts, fps }: { duration: number; parts: number; fps: number }) {
  const { t } = useTranslation();
  const ranges = buildEqualSplitRanges(duration, parts, fps);
  return <ol className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-2 text-xs">
    {ranges.map((range, index) => <li key={index} className="flex justify-between gap-2 px-1 py-1">
      <span className="text-muted-foreground">{t("toolBox.video.rangeLabel", { index: index + 1 })}</span>
      <span className="font-mono text-foreground">{formatTime(range.start, true)} → {formatTime(range.end, true)}</span>
    </li>)}
  </ol>;
}

interface QuickControlsProps extends VideoQuickToolsProps {
  partsText: string;
  onPartsChange: (text: string) => void;
  tab: "split" | "frame";
  onTabChange: (tab: "split" | "frame") => void;
}

function SplitOutputControls(props: QuickControlsProps & { valid: boolean; parts: number }) {
  const { t } = useTranslation();
  return <>
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={props.outputFolder || undefined}>{props.outputFolder || t("toolBox.video.quick.pickOnExport")}</span>
      <button type="button" disabled={props.busy || !props.isDesktop} onClick={props.onPickFolder} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t("toolBox.videoEdit.exportPanel.pickFolder")}><FolderOpen size={16} /></button>
    </div>
    {props.split.running && <div role="status" className="space-y-2 text-xs text-muted-foreground">
      <p>{t("toolBox.video.quick.progress", { count: props.split.completed.length, total: props.split.total })} · {props.split.progress}%</p>
      <progress max={100} value={props.split.progress} className="h-2 w-full accent-primary" />
    </div>}
    {props.split.completed.length > 0 && !props.split.running && <div className="flex items-center justify-between gap-2 text-xs">
      <span>{t("toolBox.video.quick.saved", { count: props.split.completed.length })}</span>
      <button type="button" onClick={props.onOpenFolder} className="text-primary hover:underline">{t("toolBox.videoEdit.exportPanel.openFolder")}</button>
    </div>}
    <button type="button" onClick={props.split.running ? props.onCancel : () => props.onSplit(props.parts)}
      disabled={!props.split.running && (!props.valid || props.busy || !props.isDesktop)} data-testid="video-split-run"
      className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
      {props.split.running ? t("common.cancel") : t("toolBox.video.quick.exportParts", { count: props.valid ? props.parts : 0 })}
    </button>
  </>;
}

function SplitControls(props: QuickControlsProps) {
  const { t } = useTranslation();
  const parts = Number(props.partsText);
  const maxParts = getMaxSplitParts(props.clip?.duration ?? 0, props.clip?.fps ?? 25);
  const valid = Boolean(props.clip && buildEqualSplitRanges(props.clip.duration, parts, props.clip.fps).length);
  return <div className="space-y-4">
    <div><h3 className="text-sm font-semibold">{t("toolBox.video.quick.equalSplit")}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("toolBox.video.quick.description")}</p></div>
    <div className="rounded-lg border border-border p-3 text-xs">
      <p className="truncate font-medium" title={props.clip?.name}>{props.clip?.name || t("toolBox.video.quick.noVideo")}</p>
      {props.clip && <p className="mt-1 font-mono text-muted-foreground">{formatTime(props.clip.duration, true)}</p>}
    </div>
    <label className="flex items-center justify-between gap-3 text-xs font-medium">
      {t("toolBox.video.quick.parts")}
      <input aria-label={t("toolBox.video.quick.parts")} type="number" min={2} max={maxParts} step={1}
        value={props.partsText} disabled={props.busy || !props.clip} onChange={(event) => props.onPartsChange(event.target.value)}
        className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-foreground outline-none focus:border-primary disabled:opacity-40" />
    </label>
    {!valid && props.clip && <p role="alert" className="text-xs text-destructive">{t("toolBox.video.quick.invalidParts", { max: maxParts })}</p>}
    {valid && props.clip && <><p className="text-xs text-primary">{t("toolBox.video.quick.partDuration", { time: formatTime(props.clip.duration / parts, true) })}</p>
      <SplitRangePreview duration={props.clip.duration} parts={parts} fps={props.clip.fps} /></>}
    <p className="text-xs leading-relaxed text-muted-foreground">{t("toolBox.video.quick.frameHint")}</p>
    <SplitOutputControls {...props} valid={valid} parts={parts} />
  </div>;
}

function QuickToolsContent(props: QuickControlsProps & { onClose: () => void }) {
  const { t } = useTranslation();
  return <aside data-video-quick-panel className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-lg">
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <span className="text-sm font-semibold">{t("toolBox.video.quick.title")}</span>
      <button type="button" onClick={props.onClose} aria-label={t("common.close")} className="rounded p-1 text-muted-foreground hover:bg-muted"><X size={16} /></button>
    </header>
    <div role="tablist" aria-label={t("toolBox.video.quick.title")} className="m-3 flex rounded-lg bg-muted/50 p-1">
      {(["split", "frame"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={props.tab === key} onClick={() => props.onTabChange(key)}
        className={`flex-1 rounded-md px-2 py-2 text-xs ${props.tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
        {key === "split" ? t("toolBox.video.quick.equalSplit") : t("toolBox.video.exportFrame")}</button>)}
    </div>
    <div role="tabpanel" className="min-h-0 overflow-y-auto px-4 pb-4">
      <div hidden={props.tab !== "split"}><SplitControls {...props} /></div>
      {props.tab === "frame" && <div className="space-y-4"><p className="text-xs leading-relaxed text-muted-foreground">{t("toolBox.video.exportFrameHint")}</p>
        <button type="button" disabled={props.busy || !props.clip || !props.isDesktop} onClick={props.onExportFrame}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm text-primary-foreground disabled:opacity-40"><Camera size={16} />{t("toolBox.video.exportFrame")}</button></div>}
    </div>
  </aside>;
}

export function VideoQuickTools(props: VideoQuickToolsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [partsText, setPartsText] = useState("2");
  const [tab, setTab] = useState<"split" | "frame">("split");
  const wide = useMediaQuery("(min-width: 1280px)");
  const desktopNav = useMediaQuery("(min-width: 768px)");
  const hydrated = useIsHydrated();
  const expanded = useSidebarStore((state) => state.expanded);
  const navWidth = desktopNav ? (expanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED) : 0;
  const rail = <div role="toolbar" aria-label={t("toolBox.video.quick.switch")} className="flex flex-col gap-1 rounded-xl border border-border bg-background/95 p-1 shadow-md backdrop-blur">
    <button type="button" aria-label={t("toolBox.video.quick.editor")} title={t("toolBox.video.quick.editor")} onClick={() => setOpen(false)}
      className={`rounded-lg p-2 ${!open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><SlidersHorizontal size={17} /></button>
    <button type="button" aria-label={t("toolBox.video.quick.title")} title={t("toolBox.video.quick.title")} aria-expanded={open} onClick={() => setOpen((value) => !value)}
      className={`rounded-lg p-2 ${open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}><Zap size={17} /></button>
  </div>;
  if (!hydrated) return null;
  const content = <QuickToolsContent {...props} partsText={partsText} onPartsChange={setPartsText} tab={tab} onTabChange={setTab} onClose={() => setOpen(false)} />;
  if (wide) return <div className={`sticky top-0 self-start ${open ? "w-[320px]" : "w-11"}`} style={{ height: open ? "calc(100dvh - var(--window-chrome-height,0px) - 110px)" : undefined }}>
    {open ? content : rail}</div>;
  return createPortal(<div className="pointer-events-none fixed right-3 z-40 flex items-start gap-2"
    style={{ top: "calc(var(--window-chrome-height,0px) + 80px)", bottom: 76, maxWidth: `calc(100vw - ${navWidth + 24}px)` }}>
    {open && <div className="pointer-events-auto h-full min-w-0 flex-1" style={{ width: 320 }}>{content}</div>}
    <div className="pointer-events-auto shrink-0">{rail}</div>
  </div>, document.body);
}
