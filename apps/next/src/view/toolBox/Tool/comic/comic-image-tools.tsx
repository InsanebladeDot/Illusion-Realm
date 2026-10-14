"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Droplets, GripVertical, ImagePlus, Maximize2, PanelLeft, PanelRight, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { ComicToolDock } from "./use-comic-tool-dock";

export interface ImageEffects { blur: number; imageRemoved: boolean }
interface ImageToolsProps {
  dock: ComicToolDock; effects: ImageEffects; title: string; open: boolean; onOpen: () => void; onClose: () => void;
  onReplace: () => void; onChange: (patch: Partial<ImageEffects>) => void;
}

function DockMenu({ dock, rail }: { dock: ComicToolDock; rail: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const options = [{ mode: "left", Icon: PanelLeft }, { mode: "right", Icon: PanelRight }, { mode: "floating", Icon: Maximize2 }] as const;
  const alignment = rail ? dock.layout.mode === "left" ? "left-full top-0" : "right-full top-0" : "right-0 top-full";
  return <details ref={ref} data-tool-dock-menu className="relative" onKeyDown={event => { if (event.key === "Escape") { ref.current?.removeAttribute("open"); ref.current?.querySelector("summary")?.focus(); } }}>
    <summary title={t("toolBox.comic.imageTools.docking")} aria-label={t("toolBox.comic.imageTools.docking")} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"><Settings2 size={15} /></summary>
    <div className={`absolute z-50 w-40 rounded-md border border-border bg-background p-1 shadow-lg ${alignment}`}>
      {options.map(({ mode, Icon }) => <button key={mode} data-tool-dock={mode} type="button" aria-pressed={dock.layout.mode === mode} onClick={() => { dock.dock(mode); ref.current?.removeAttribute("open"); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted"><Icon size={15} />{t(`toolBox.comic.imageTools.dock.${mode}`)}</button>)}
    </div>
  </details>;
}

function BlurSettings({ effects, onChange, onClose }: Pick<ImageToolsProps, "effects" | "onChange" | "onClose">) {
  const { t } = useTranslation();
  return <div data-image-blur-panel className="border-t border-border p-2">
    <div className="mb-1 flex items-center justify-between gap-1 text-xs">
      <label htmlFor="comic-image-blur">{t("toolBox.comic.imageTools.blur")}</label><output className="tabular-nums">{effects.blur} px</output>
      <button type="button" title={t("toolBox.comic.imageTools.collapse")} aria-label={t("toolBox.comic.imageTools.collapse")} onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"><X size={14} /></button>
    </div>
    <input id="comic-image-blur" data-image-blur type="range" min={0} max={40} step={1} value={effects.blur} disabled={effects.imageRemoved} onChange={event => onChange({ blur: Number(event.target.value) })} className="block w-full accent-primary" />
  </div>;
}

function ImageActions({ effects, open, onOpen, onClose, onReplace, onChange, rail }: ImageToolsProps & { rail: boolean }) {
  const { t } = useTranslation();
  const actions = [
    { key: "replace", Icon: ImagePlus, run: onReplace, disabled: false },
    { key: "blur", Icon: Droplets, run: open ? onClose : onOpen, disabled: effects.imageRemoved },
    { key: "remove", Icon: Trash2, run: () => onChange({ imageRemoved: true }), disabled: effects.imageRemoved },
    { key: "restore", Icon: RotateCcw, run: () => onChange({ imageRemoved: false, blur: 0 }), disabled: !effects.imageRemoved && !effects.blur },
  ] as const;
  return <div role="toolbar" aria-label={t("toolBox.comic.imageTools.title")} aria-orientation={rail ? "vertical" : "horizontal"} className={`flex items-center justify-center gap-1 p-1 ${rail ? "flex-col border-t border-border" : ""}`}>
    {actions.map(({ key, Icon, run, disabled }) => <button key={key} type="button" data-image-action={key} title={t(`toolBox.comic.imageTools.${key}`)} aria-label={t(`toolBox.comic.imageTools.${key}`)} aria-pressed={key === "blur" ? open : undefined} disabled={disabled} onClick={run} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-muted disabled:opacity-30 ${key === "remove" ? "text-rose-600 dark:text-rose-400" : key === "blur" && open ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}><Icon size={16} /></button>)}
  </div>;
}

function ToolHeader({ dock, title, rail, onClose }: Pick<ImageToolsProps, "dock" | "title" | "onClose"> & { rail: boolean }) {
  const { t } = useTranslation();
  const collapseLabel = t(dock.layout.collapsed ? "toolBox.comic.imageTools.expand" : "toolBox.comic.imageTools.fold");
  return <div className={`flex items-center gap-1 p-1 ${rail ? "flex-col" : ""}`}>
    <button type="button" data-drag-image-tools title={t("toolBox.comic.imageTools.move")} aria-label={t("toolBox.comic.imageTools.move")} onPointerDown={dock.start} onPointerMove={dock.move} onPointerUp={dock.end} onPointerCancel={dock.cancel} onLostPointerCapture={dock.cancel} className="flex h-8 w-6 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground active:cursor-grabbing"><GripVertical size={16} /></button>
    <span title={title} className={`${rail ? "hidden" : "min-w-0 flex-1 truncate"} text-[11px] text-muted-foreground`}>{title}</span>
    <DockMenu dock={dock} rail={rail} />
    <button type="button" data-collapse-image-tools title={collapseLabel} aria-label={collapseLabel} aria-pressed={dock.layout.collapsed} onClick={() => { dock.toggleCollapsed(); onClose(); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted">{dock.layout.collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
  </div>;
}

export default function ComicImageTools(props: ImageToolsProps) {
  const { dock, open } = props;
  const floating = dock.layout.mode === "floating", rail = !floating && dock.compact;
  const position = floating ? dock.position : { [dock.layout.mode]: 0, top: 0, bottom: 42 };
  const settingsClass = rail ? `absolute top-[48px] z-40 w-[184px] rounded-md border border-border bg-background shadow-lg ${dock.layout.mode === "left" ? "left-full" : "right-full"}` : "bg-background";
  return <div data-image-tools data-tool-dock-mode={dock.layout.mode} data-tool-collapsed={dock.layout.collapsed} data-tool-compact={rail} className={`absolute z-40 border-border bg-background ${floating ? "w-[216px] max-w-[calc(100%-16px)] rounded-md border shadow-lg" : rail ? "w-12 border-x" : "w-[216px] border-x"}`} style={position}>
    <ToolHeader dock={dock} title={props.title} rail={rail} onClose={props.onClose} />
    <ImageActions {...props} rail={rail} />
    {open && <div className={settingsClass}><BlurSettings {...props} /></div>}
  </div>;
}
