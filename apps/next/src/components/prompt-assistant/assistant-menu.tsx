"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useMediaQueryAfterHydration } from "@/hooks/useMediaQuery";
import { usePromptAssistantStore } from "@/stores/usePromptAssistantStore";
import { useToastStore } from "@/stores/useToastStore";
import { GLM_MODELS } from "@/utils/prompt-assistant";
import { useCascadePosition } from "./use-cascade-position";
interface MenuItem { id: string; label: string; description?: string; selected?: boolean; children?: MenuItem[]; action?: () => void }
interface MenuProps { anchor: RefObject<HTMLDivElement | null>; onClose: () => void; onConfigure: (mode: "connection" | "preset") => void }
export function AssistantMenu({ anchor, onClose, onConfigure }: MenuProps) {
  const { t } = useTranslation(); const compact = !useMediaQueryAfterHydration("(min-width: 720px)");
  const preferences = usePromptAssistantStore(state => state.preferences); const save = usePromptAssistantStore(state => state.save);
  const [path, setPath] = useState<string[]>([]);
  const choose = (patch: Parameters<typeof save>[0]) => { void save(patch).then(onClose).catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); };
  const items: MenuItem[] = [
    { id: "provider", label: t("create.promptAssistant.provider"), children: [
      { id: "glm", label: "GLM", selected: preferences.provider === "glm", children: GLM_MODELS.map(model => ({ id: model, label: model.toUpperCase(), selected: preferences.provider === "glm" && preferences.model === model, action: () => choose({ provider: "glm", model }) })) },
      { id: "custom", label: t("create.promptAssistant.customProvider"), selected: preferences.provider === "custom", action: () => { void save({ provider: "custom" }).then(() => onConfigure("connection")).catch(() => useToastStore.getState().show(t("create.promptAssistant.failed"))); } },
    ] },
    { id: "presets", label: t("create.promptAssistant.presets"), children: [
      { id: "translate", label: t("create.promptAssistant.translation"), description: t("create.promptAssistant.translationInstruction"), selected: preferences.presetId === "translate", action: () => choose({ presetId: "translate" }) },
      { id: "anima", label: t("create.promptAssistant.anima"), description: t("create.promptAssistant.animaInstruction"), selected: preferences.presetId === "anima", action: () => choose({ presetId: "anima" }) },
      ...preferences.presets.map(preset => ({ id: preset.id, label: preset.name, description: preset.instruction, selected: preferences.presetId === preset.id, action: () => choose({ presetId: preset.id }) })),
      { id: "add", label: t("create.promptAssistant.addPreset"), action: () => onConfigure("preset") },
    ] },
    { id: "settings", label: t("create.promptAssistant.configure"), action: () => onConfigure("connection") },
  ];
  const columns = [items]; for (const id of path) { const children = columns.at(-1)?.find(item => item.id === id)?.children; if (children) columns.push(children); }
  const { panel, capacity } = useCascadePosition(anchor, compact ? 0 : columns.length - 1);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { onClose(); anchor.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", key); };
  }, [anchor, onClose, panel]);
  const drilldown = compact || capacity === 0;
  const visible = drilldown ? [columns.at(-1)!] : [columns[0], ...columns.slice(1).slice(-capacity)];
  const skipped = columns.length - visible.length;
  return createPortal(<div ref={panel} data-prompt-assistant-menu className="fixed z-[1100] w-52 max-w-[calc(100vw-16px)] text-foreground" aria-label={t("create.promptAssistant.title")}>
    {visible.map((column, columnIndex) => <div key={columnIndex} data-assistant-column={columnIndex} role="menu" style={columnIndex ? { left: `calc(var(--assistant-cascade-offset, 208px) * ${columnIndex})`, maxHeight: "min(480px, var(--assistant-cascade-height, calc(100dvh - 64px)))" } : undefined} className={`${columnIndex ? "absolute top-0" : "relative"} max-h-[min(480px,calc(100dvh-64px))] w-full overflow-y-auto rounded-xl border border-border bg-background/95 p-1.5 shadow-lg backdrop-blur-xl`}>
      {path.length > 0 && (drilldown || skipped > 0 && columnIndex > 0) && <button type="button" className="flex w-full items-center gap-1 rounded-lg p-2 text-xs text-muted-foreground" onClick={() => setPath(path.slice(0, -1))}><ChevronLeft size={14} />{t("create.promptAssistant.back")}</button>}
      {column.map(item => { const depth = drilldown ? columns.length - 1 : columnIndex === 0 ? 0 : columnIndex + skipped; return <button type="button" key={item.id} role="menuitem" data-assistant-item={item.id} title={item.description ?? item.label} aria-haspopup={item.children ? "menu" : undefined} aria-expanded={item.children ? path[depth] === item.id : undefined} onPointerEnter={event => { if (!drilldown && event.pointerType === "mouse") setPath(item.children ? [...path.slice(0, depth), item.id] : path.slice(0, depth)); }} onClick={() => item.children ? setPath([...path.slice(0, depth), item.id]) : item.action?.()} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke ${item.selected ? "bg-muted" : ""}`}><span className="min-w-0 flex-1"><span className="block">{item.label}</span>{item.description && <span className="mt-1 line-clamp-6 block text-[10px] leading-relaxed text-muted-foreground">{item.description}</span>}</span>{item.selected && <Check size={13} className="shrink-0" />}{item.children && <ChevronRight size={13} style={{ rotate: drilldown ? undefined : "var(--assistant-cascade-arrow, 0deg)" }} className="shrink-0" />}</button>; })}
    </div>)}
  </div>, document.body);
}
