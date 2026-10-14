"use client";

// 工作台面板共享停靠顺序；界面偏好独立持久化，不改变分镜文档。
import { useEffect, useState, type CSSProperties } from "react";

export type ComicWindowId = "outline" | "tools" | "side";
export type ComicWindowEdge = "left" | "right" | "bottom";
export interface WindowLayout { floating: boolean; zone: ComicWindowEdge; order: number; left: number; top: number }
export interface DockTarget { zone: ComicWindowEdge; beside?: ComicWindowId; after?: boolean }
export type WorkbenchLayouts = Record<ComicWindowId, WindowLayout>;
const STORAGE_KEY = "ir-comic-workbench-v2";
const IDS: ComicWindowId[] = ["outline", "tools", "side"];
const INITIAL: WorkbenchLayouts = {
  outline: { floating: false, zone: "left", order: 0, left: 20, top: 20 },
  tools: { floating: false, zone: "left", order: 1, left: 230, top: 40 },
  side: { floating: false, zone: "right", order: 0, left: 500, top: 20 },
};

function readLayouts(): WorkbenchLayouts {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return INITIAL;
    const result = { ...INITIAL }, records = value as Record<string, unknown>;
    for (const id of IDS) {
      const item = records[id]; if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (!["left", "right", "bottom"].includes(String(r.zone))) continue;
      const number = (key: string, fallback: number) => typeof r[key] === "number" && Number.isFinite(r[key]) ? Math.max(0, r[key]) : fallback;
      result[id] = { floating: r.floating === true, zone: r.zone as ComicWindowEdge, order: number("order", INITIAL[id].order), left: number("left", 20), top: number("top", 20) };
    }
    return result;
  } catch { return INITIAL; }
}

export function dockedIds(layouts: WorkbenchLayouts, zone: ComicWindowEdge): ComicWindowId[] {
  return IDS.filter(id => !layouts[id].floating && layouts[id].zone === zone).sort((a, b) => layouts[a].order - layouts[b].order);
}

function dockLayouts(layouts: WorkbenchLayouts, id: ComicWindowId, target: DockTarget): WorkbenchLayouts {
  const siblings = dockedIds(layouts, target.zone).filter(item => item !== id);
  const index = target.beside ? siblings.indexOf(target.beside) : -1;
  siblings.splice(index < 0 ? siblings.length : index + (target.after ? 1 : 0), 0, id);
  const next = { ...layouts };
  siblings.forEach((item, order) => { next[item] = { ...next[item], zone: target.zone, order, floating: false }; });
  return next;
}

export function windowPlacement(layouts: WorkbenchLayouts, id: ComicWindowId, toolsHeight = 94): CSSProperties {
  const layout = layouts[id], siblings = dockedIds(layouts, layout.zone), index = siblings.indexOf(id);
  if (layout.floating) return { left: layout.left, top: layout.top };
  if (layout.zone === "bottom") return { left: `${index * 100 / siblings.length}%`, bottom: 0, width: `${100 / siblings.length}%`, height: "var(--comic-bottom)" };
  const flexible = siblings.filter(item => item !== "tools").length;
  const toolHeight = siblings.includes("tools") && flexible ? `min(${toolsHeight}px, 45%)` : "0px";
  const unit = `((100% - var(--comic-bottom) - ${toolHeight}) / ${Math.max(1, flexible)})`;
  const preceding = siblings.slice(0, index), top = `calc(${preceding.filter(item => item !== "tools").length} * ${unit} + ${preceding.includes("tools") ? toolHeight : "0px"})`;
  return { [layout.zone]: 0, top, width: `var(--comic-${layout.zone})`, height: id === "tools" && flexible ? toolHeight : `calc${unit}` };
}

export default function useComicWorkbench() {
  const [layouts, setLayouts] = useState<WorkbenchLayouts>(INITIAL), [ready, setReady] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { setLayouts(readLayouts()); setReady(true); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); } catch { /* Preferences must not interrupt editing. */ }
  }, [layouts, ready]);
  const update = (id: ComicWindowId, layout: WindowLayout) => setLayouts(current => ({ ...current, [id]: layout }));
  const dock = (id: ComicWindowId, target: DockTarget) => setLayouts(current => dockLayouts(current, id, target));
  const sideWidth = (zone: ComicWindowEdge) => dockedIds(layouts, zone).length ? zone === "left" ? "216px" : "286px" : "0px";
  const style = { "--comic-left": sideWidth("left"), "--comic-right": sideWidth("right"), "--comic-bottom": dockedIds(layouts, "bottom").length ? "min(32%, 220px)" : "0px" } as CSSProperties;
  return { layouts, update, dock, style };
}
