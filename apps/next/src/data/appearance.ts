import type { ColorPreset } from "@/types/appearance";

interface AccentPalette { light: string; dark: string; swatch: string }

// 外壳底色独立于内容表面：head、nav 和页面留白始终同色，作品区域保持中性。
export const SHELL_PALETTES: Record<ColorPreset, { light: string; dark: string }> = {
  default: { light: "#f4f4f5", dark: "#1c1c1c" },
  sand: { light: "#f2e6d8", dark: "#382e26" },
  rose: { light: "#f7e3e9", dark: "#3a2830" },
  teal: { light: "#deefeb", dark: "#213732" },
  sunset: { light: "#f7e4d8", dark: "#3d2c26" },
  forest: { light: "#e4eddf", dark: "#29362a" },
  ocean: { light: "#e1ecf8", dark: "#243347" },
  graphite: { light: "#e6eaf0", dark: "#2c333e" },
};

// 同一预设分别提供明暗模式的可读强调色；预览渐变只用于色卡，不作为文字背景。
export const ACCENT_PALETTES: Record<ColorPreset, AccentPalette> = {
  default: { light: "#171717", dark: "#d4d4d8", swatch: "linear-gradient(135deg, #e4e4e7, #71717a)" },
  sand: { light: "#93613d", dark: "#e0b58d", swatch: "linear-gradient(135deg, #f4e5d3, #cb926d)" },
  rose: { light: "#be305b", dark: "#f5a0b6", swatch: "linear-gradient(135deg, #e94e78, #ffb6c6)" },
  teal: { light: "#05635f", dark: "#67d7c6", swatch: "linear-gradient(135deg, #32c9b7, #087f78)" },
  sunset: { light: "#9f311b", dark: "#ffa586", swatch: "linear-gradient(135deg, #e05b40, #ffc08b)" },
  forest: { light: "#347052", dark: "#8fcea5", swatch: "linear-gradient(135deg, #8eb39b, #346a51)" },
  ocean: { light: "#2563b9", dark: "#8fbcff", swatch: "linear-gradient(135deg, #6bb9ed, #2563b9)" },
  graphite: { light: "#475569", dark: "#b7c7d9", swatch: "linear-gradient(135deg, #a8b8c8, #394759)" },
};

export const FONT_FAMILIES = {
  auto: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
  sans: 'Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
  serif: 'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif',
} as const;
