"use client";

// 弹出层：从顶栏外观图标下方展开，沿用统一外观选项组件，不遮挡创作页面。
import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ColorChoices, FontChoices, ThemeChoices } from "@/components/appearance-settings";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";

interface AppearanceDialogProps { onClose: () => void; anchor: RefObject<HTMLButtonElement | null> }

function usePopoverPosition(anchor: AppearanceDialogProps["anchor"]): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(480, Math.max(0, innerWidth - 16));
      const left = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8));
      const top = rect.bottom + 8;
      setStyle({ left, top, width, maxHeight: Math.max(0, innerHeight - top - 8), visibility: "visible" });
    };
    update();
    addEventListener("resize", update); addEventListener("scroll", update, true);
    return () => { removeEventListener("resize", update); removeEventListener("scroll", update, true); };
  }, [anchor]);
  return style;
}

function useAppearanceFocus({ onClose, anchor }: AppearanceDialogProps) {
  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('[data-theme-dialog][role="dialog"]');
    if (!dialog) return;
    const trigger = anchor.current;
    dialog.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input,select,[tabindex='0']"));
      const first = items[0], last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !dialog.contains(event.target) && !trigger?.contains(event.target)) onClose(); };
    document.addEventListener("keydown", keyDown, true); document.addEventListener("pointerdown", outside, true);
    return () => { document.removeEventListener("keydown", keyDown, true); document.removeEventListener("pointerdown", outside, true); trigger?.focus({ preventScroll: true }); };
  }, [anchor, onClose]);
}

function resetAppearance() {
  const settings = useSettingsStore.getState();
  settings.setTheme("system"); settings.setColorPreset("default"); settings.setUiFont("auto");
}

export function AppearanceDialog(props: AppearanceDialogProps) {
  const { t } = useTranslation();
  const style = usePopoverPosition(props.anchor);
  useAppearanceFocus(props);
  return createPortal(<div id="appearance-popover" data-theme-dialog role="dialog" aria-labelledby="appearance-title" style={style} className="fixed z-[1101] flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background text-foreground shadow-2xl shadow-black/20 outline-none">
    {/* 界面：外观浮层固定标题，所有选项在图标下方滚动，无全屏遮罩。 */}
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5"><h2 id="appearance-title" className="text-sm font-semibold">{t("settings.appearance.title")}</h2><button type="button" aria-label={t("common.close")} onClick={props.onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke"><X className="h-4 w-4" /></button></div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]"><div data-theme-dialog-content className="space-y-5"><ThemeChoices /><ColorChoices /><FontChoices /></div></div>
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5"><button type="button" data-appearance-reset onClick={resetAppearance} className="text-xs text-muted-foreground hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stroke">{t("settings.appearance.reset")}</button><span className="text-[10px] text-muted-foreground">{t("settings.appearance.autoSave")}</span></div>
  </div>, document.body);
}
