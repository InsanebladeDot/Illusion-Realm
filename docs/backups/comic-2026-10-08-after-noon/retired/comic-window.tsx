"use client";

import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Pin } from "lucide-react";
import { useTranslation } from "@/i18n";
import useComicWindow from "./use-comic-window";
import type { ComicWindowId, DockTarget, WindowLayout } from "./use-comic-workbench";

interface ComicWindowProps {
  id: ComicWindowId; title: string; layout: WindowLayout; placement: CSSProperties; hostRef: RefObject<HTMLDivElement | null>;
  update: (layout: WindowLayout) => void; dock: (target: DockTarget) => void; children: ReactNode; compactVisible?: boolean;
}

function SnapPreview({ target, host }: { target: DockTarget; host: HTMLDivElement }) {
  const other = target.beside ? host.querySelector<HTMLElement>(`[data-comic-window="${target.beside}"]`) : null;
  const r = other?.getBoundingClientRect(), h = host.getBoundingClientRect();
  const style: CSSProperties = r ? target.zone === "bottom"
    ? { left: r.left - h.left + (target.after ? r.width / 2 : 0), top: r.top - h.top, width: r.width / 2, height: r.height }
    : { left: r.left - h.left, top: r.top - h.top + (target.after ? r.height / 2 : 0), width: r.width, height: r.height / 2 }
    : target.zone === "bottom" ? { left: 0, right: 0, bottom: 0, height: "30%" } : { [target.zone]: 0, top: 0, bottom: 0, width: 216 };
  return createPortal(<div data-comic-snap-preview={target.zone} className="comic-snap-preview" style={style} />, host);
}

export default function ComicWindow({ id, title, layout, placement, hostRef, update, dock, children, compactVisible = true }: ComicWindowProps) {
  const { t } = useTranslation(), panelRef = useRef<HTMLDivElement>(null);
  const gesture = useComicWindow({ id, layout, hostRef, panelRef, update, dock });
  return <div ref={panelRef} tabIndex={-1} data-comic-window={id} data-window-floating={layout.floating} data-window-zone={layout.zone}
    data-window-armed={gesture.armed} className={`comic-window comic-window-${id} ${layout.floating ? "comic-window-floating" : "comic-window-docked"} ${compactVisible ? "" : "comic-window-inactive"}`}
    style={placement} onPointerDown={gesture.start} onPointerMove={gesture.move} onPointerUp={gesture.end} onPointerCancel={gesture.cancel} onLostPointerCapture={gesture.cancel}>
    {/* 界面：仅浮动状态显示窗口标题和固定按钮。固定面板使用内容自身的标题。 */}
    {layout.floating && <div data-comic-drag-surface data-drag-comic-window={id} className="comic-window-heading" title={t("toolBox.comic.windows.move", { name: title })}>
      <GripVertical size={14} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
      <button type="button" data-toggle-comic-window={id} onClick={() => dock({ zone: layout.zone })} title={t("toolBox.comic.windows.attach")} aria-label={t("toolBox.comic.windows.attach")} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"><Pin size={14} /></button>
    </div>}
    <div className="comic-window-content">{children}</div>
    {gesture.preview && <SnapPreview target={gesture.preview.target} host={gesture.preview.host} />}
  </div>;
}
