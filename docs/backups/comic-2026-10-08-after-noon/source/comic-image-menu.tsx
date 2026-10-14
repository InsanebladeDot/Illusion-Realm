"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Droplets, ImagePlus, RotateCcw, Trash2, Wrench } from "lucide-react";
import { useTranslation } from "@/i18n";

interface ImageMenuProps {
  x: number; y: number; removed: boolean; onReplace: () => void; onRemove: () => void;
  onRestore: () => void; onBlur: () => void; onClose: () => void;
}

function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")].filter(button => button.getBoundingClientRect().width);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
  event.preventDefault(); buttons[next]?.focus();
}

function menuPlacement(x: number, y: number) {
  const width = window.innerWidth, height = window.innerHeight;
  const position = { left: Math.max(4, Math.min(x, width - 180)), top: Math.max(4, Math.min(y, height - 220)) };
  const submenuClass = position.left + 356 < width ? "absolute left-full top-0" : position.left >= 180 ? "absolute right-full top-0" : "relative !w-full";
  return { position, submenuClass };
}

export default function ComicImageMenu({ x, y, removed, onReplace, onRemove, onRestore, onBlur, onClose }: ImageMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const { position, submenuClass } = menuPlacement(x, y);
  const buttonClass = "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-muted focus:bg-muted disabled:opacity-40";
  const run = (action: () => void) => { action(); onClose(); };
  return createPortal(<div ref={ref} data-image-context-menu role="menu" aria-label={t("toolBox.comic.imageTools.title")} className="fixed z-[70] w-44 rounded-md border border-border bg-background p-1 shadow-xl" style={position} onPointerDown={event => event.stopPropagation()} onKeyDown={navigateMenu}>
    <button role="menuitem" type="button" onClick={() => run(onReplace)} className={buttonClass}><ImagePlus size={15} />{t("toolBox.comic.imageTools.replace")}</button>
    <div className="relative" onPointerEnter={() => setToolsOpen(true)} onPointerLeave={() => setToolsOpen(false)}>
      <button role="menuitem" type="button" data-image-tools-menu aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(true)} onKeyDown={event => { if (event.key === "ArrowRight") { event.preventDefault(); setToolsOpen(true); } }} className={buttonClass}><Wrench size={15} />{t("toolBox.comic.imageTools.menu")}<ChevronRight size={14} className="ml-auto" /></button>
      {toolsOpen && <div role="menu" data-image-tools-submenu className={`w-44 rounded-md border border-border bg-background p-1 shadow-xl ${submenuClass}`}>
        <button role="menuitem" type="button" disabled={removed} onClick={() => run(onBlur)} className={buttonClass}><Droplets size={15} />{t("toolBox.comic.imageTools.blur")}</button>
        <button role="menuitem" type="button" onClick={() => run(onRestore)} className={buttonClass}><RotateCcw size={15} />{t("toolBox.comic.imageTools.restore")}</button>
      </div>}
    </div>
    <button role="menuitem" type="button" disabled={removed} onClick={() => run(onRemove)} className={`${buttonClass} text-rose-600 dark:text-rose-400`}><Trash2 size={15} />{t("toolBox.comic.imageTools.remove")}</button>
  </div>, document.body);
}
