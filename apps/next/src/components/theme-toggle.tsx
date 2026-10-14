"use client";

import { useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { startThemeRippleTransition } from "@/utils/themeTransition";

export function ThemeToggle() {
  const { t } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  function toggle() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const rect = button.current?.getBoundingClientRect();
    startThemeRippleTransition({ preference: next, origin: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null, apply: () => setTheme(next) });
  }
  return <button ref={button} data-toolbox-theme type="button" aria-label={t("toolBox.head.themeToggle")} title={t("toolBox.head.themeToggle")} onClick={toggle} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>;
}
