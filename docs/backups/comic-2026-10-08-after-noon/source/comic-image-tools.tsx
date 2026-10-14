"use client";

import { useEffect, useRef } from "react";
import { Droplets, ImagePlus, Maximize2, PanelLeft, PanelRight, PanelsTopLeft, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { ComicWindowEdge } from "./use-comic-workbench";
type ToolMode = ComicWindowEdge | "floating";

export interface ImageEffects { blur: number; imageRemoved: boolean }
interface ImageToolsProps {
  mode: ToolMode; onDock: (mode: ToolMode) => void; effects: ImageEffects; title: string; open: boolean; onOpen: () => void; onClose: () => void;
  onReplace: () => void; onChange: (patch: Partial<ImageEffects>) => void;
}

function DockMenu({ mode, onDock }: Pick<ImageToolsProps, "mode" | "onDock">) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const options = [{ mode: "left", Icon: PanelLeft }, { mode: "right", Icon: PanelRight }, { mode: "bottom", Icon: PanelsTopLeft }, { mode: "floating", Icon: Maximize2 }] as const;
  const alignment = "right-0 bottom-full";
  return <details ref={ref} data-tool-dock-menu className="relative" onKeyDown={event => { if (event.key === "Escape") { ref.current?.removeAttribute("open"); ref.current?.querySelector("summary")?.focus(); } }}>
    <summary title={t("toolBox.comic.imageTools.docking")} aria-label={t("toolBox.comic.imageTools.docking")} className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden"><Settings2 size={15} /></summary>
    <div className={`absolute z-50 w-40 rounded-md border border-border bg-background p-1 shadow-lg ${alignment}`}>
      {options.map(({ mode: option, Icon }) => <button key={option} data-tool-dock={option} type="button" aria-pressed={mode === option} onClick={() => { onDock(option); ref.current?.removeAttribute("open"); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted"><Icon size={15} />{t(`toolBox.comic.imageTools.dock.${option}`)}</button>)}
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
    <input id="comic-image-blur" data-image-blur type="range" min={0} max={40} step={1} value={effects.blur} disabled={effects.imageRemoved} onChange={event => onChange({ blur: Number(event.target.value) })} className="block w-full accent-emerald-700" />
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

export default function ComicImageTools(props: ImageToolsProps) {
  const { t } = useTranslation();
  return <div data-image-tools data-tool-dock-mode={props.mode} className="bg-background">
    {/* 界面：固定图片工具使用原操作区留白长按，不添加窗口标题。 */}
    <div data-comic-drag-surface data-dock-heading="tools" title={t("toolBox.comic.windows.move", { name: t("toolBox.comic.imageTools.title") })} className="comic-tool-drag-surface flex min-h-8 items-center justify-end px-1">
      <DockMenu mode={props.mode} onDock={props.onDock} />
    </div>
    <ImageActions {...props} rail={false} />
    {props.open && <BlurSettings {...props} />}
  </div>;
}
