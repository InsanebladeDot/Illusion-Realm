/** 外观配置的校验与唯一 DOM 写点：预设转为语义 CSS 变量，字体继承到全应用，不覆盖专用等宽字体。 */
import { COLOR_PRESETS, UI_FONTS, type ColorPreset, type UiFont } from "@/types/appearance";
import { ACCENT_PALETTES, FONT_FAMILIES, SHELL_PALETTES } from "@/data/appearance";
import { applyNativeThemeSource } from "@/utils/electronBridge";
import type { ThemePreference } from "@/utils/themeResolution";

export function resolveColorPreset(value: unknown): ColorPreset {
  return COLOR_PRESETS.find(preset => preset === value) ?? "default";
}
export function resolveUiFont(value: unknown): UiFont {
  return UI_FONTS.find(font => font === value) ?? "auto";
}

const ACCENT_PROPERTIES = ["--primary", "--primary-foreground", "--ring", "--accent-stroke", "--accent-fill", "--accent-fill-foreground", "--accent-text", "--accent-soft"];

export function applyAppearanceSignals(preset: ColorPreset, font: UiFont, dark: boolean, theme?: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.colorPreset = preset;
  root.dataset.uiFont = font;
  root.style.setProperty("--app-font-family", FONT_FAMILIES[font]);
  const shell = SHELL_PALETTES[preset][dark ? "dark" : "light"];
  root.style.setProperty("--shell-background", shell);
  // 复用现有主题 IPC，同步原生最小化 / 最大化 / 关闭按钮后的底色。
  if (theme) void applyNativeThemeSource(theme, shell).catch(() => null);
  if (preset === "default") { ACCENT_PROPERTIES.forEach(key => root.style.removeProperty(key)); return; }
  const color = ACCENT_PALETTES[preset][dark ? "dark" : "light"];
  const tokens: Record<string, string> = {
    "--primary": color, "--primary-foreground": dark ? "#111827" : "#ffffff",
    "--ring": color, "--accent-stroke": color, "--accent-fill": color,
    "--accent-fill-foreground": dark ? "#111827" : "#ffffff", "--accent-text": color,
    "--accent-soft": `color-mix(in srgb, ${color} ${dark ? 16 : 10}%, var(--background))`,
  };
  Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
}
