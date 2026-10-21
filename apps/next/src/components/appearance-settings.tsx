"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { COLOR_PRESETS, UI_FONTS } from "@/types/appearance";
import { ACCENT_PALETTES, FONT_FAMILIES } from "@/data/appearance";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { AVAILABLE_THEME_PREFERENCES, type ThemePreference } from "@/utils/themeResolution";
import { cn } from "@/utils/cn";
import { startThemeRippleTransition } from "@/utils/themeTransition";

const CHOICE = "group relative min-w-0 rounded-xl border border-border p-1 text-left transition-colors hover:border-accent-stroke focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function SelectionMark({ active }: { active: boolean }) {
  return active ? <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-fill text-accent-fill-foreground ring-2 ring-background"><Check size={12} aria-hidden="true" /></span> : null;
}

function AppearanceSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <fieldset className="min-w-0 space-y-2"><legend className="mb-1 text-xs font-semibold">{title}</legend>{hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}{children}</fieldset>;
}

function ThemePreview({ mode }: { mode: ThemePreference }) {
  const Icon = { system: Monitor, light: Sun, dark: Moon }[mode];
  return <div aria-hidden="true" className={cn("relative flex h-16 overflow-hidden rounded-lg border border-black/10", mode === "dark" ? "bg-zinc-900" : mode === "system" ? "bg-gradient-to-r from-zinc-100 to-zinc-800" : "bg-zinc-100")}>
    <div className={cn("flex w-[20%] flex-col gap-1.5 p-1.5", mode === "dark" ? "bg-zinc-800" : "bg-zinc-400/10")}>
      <span className="h-2 w-2 rounded-full bg-zinc-400/50" />{[0, 1, 2].map(n => <span key={n} className="h-0.5 rounded-full bg-zinc-400/50" />)}
    </div>
    <div className="flex flex-1 items-center justify-center p-2"><div className="relative h-full w-full overflow-hidden rounded-sm bg-gradient-to-b from-orange-200 via-rose-200 to-sky-800"><span className="absolute right-1/4 top-1/4 h-2 w-2 rounded-full bg-amber-50 shadow-[0_0_8px_3px_#fff5c4]" /><span className="absolute -bottom-3 -left-2 h-6 w-[120%] -rotate-6 rounded-[50%] bg-slate-700/70" /></div></div>
    <Icon size={12} className="absolute right-1 top-1 text-zinc-500" />
  </div>;
}

export function ThemeChoices() {
  const { t } = useTranslation();
  const selected = useSettingsStore(state => state.theme);
  function choose(preference: ThemePreference, button: HTMLButtonElement) {
    if (selected === preference) return;
    const rect = button.getBoundingClientRect();
    startThemeRippleTransition({ preference, origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, apply: () => useSettingsStore.getState().setTheme(preference) });
  }
  return <AppearanceSection title={t("settings.appearance.theme")}><div className="grid grid-cols-3 gap-2">{AVAILABLE_THEME_PREFERENCES.map(mode => <button key={mode} type="button" data-theme-option={mode} aria-pressed={selected === mode} onClick={event => choose(mode, event.currentTarget)} className={cn(CHOICE, selected === mode && "border-accent-stroke ring-1 ring-accent-stroke")}><ThemePreview mode={mode} /><span className="block px-1 pb-0.5 pt-1.5 text-center text-[11px]">{t(`settings.theme.${mode}`)}</span><SelectionMark active={selected === mode} /></button>)}</div></AppearanceSection>;
}

export function ColorChoices() {
  const { t } = useTranslation();
  const selected = useSettingsStore(state => state.colorPreset);
  return <AppearanceSection title={t("settings.appearance.colorsTitle")} hint={t("settings.appearance.colorsHint")}><div className="grid grid-cols-4 gap-2">{COLOR_PRESETS.map(preset => <button key={preset} type="button" data-color-preset={preset} aria-pressed={selected === preset} onClick={() => useSettingsStore.getState().setColorPreset(preset)} className={cn(CHOICE, selected === preset && "border-accent-stroke ring-1 ring-accent-stroke")}><span aria-hidden="true" className="block h-8 rounded-lg" style={{ background: ACCENT_PALETTES[preset].swatch }} /><span className="block truncate px-0.5 pb-0.5 pt-1.5 text-center text-[10px]" title={t(`settings.appearance.colors.${preset}`)}>{t(`settings.appearance.colors.${preset}`)}</span><SelectionMark active={selected === preset} /></button>)}</div></AppearanceSection>;
}

export function FontChoices() {
  const { t } = useTranslation();
  const selected = useSettingsStore(state => state.uiFont);
  return <AppearanceSection title={t("settings.appearance.font")} hint={t("settings.appearance.fontHint")}><div className="grid grid-cols-3 gap-2">{UI_FONTS.map(font => <button key={font} type="button" data-ui-font={font} aria-pressed={selected === font} onClick={() => useSettingsStore.getState().setUiFont(font)} className={cn(CHOICE, selected === font && "border-accent-stroke ring-1 ring-accent-stroke")}><span aria-hidden="true" className="block py-1 text-center text-xl" style={{ fontFamily: FONT_FAMILIES[font] }}>Aa</span><span className="block pb-0.5 text-center text-[11px]">{t(`settings.appearance.fonts.${font}`)}</span><SelectionMark active={selected === font} /></button>)}</div></AppearanceSection>;
}
