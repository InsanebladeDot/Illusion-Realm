/**
 * 全局布局常量与复用类名（细边框、输入框描边、强调色、移动底栏高度…）。
 *
 * 怎么做：把同一套 Tailwind 类名集中导出，避免每个组件各写一份、慢慢跑偏。
 */
export const MOBILE_BOTTOM_NAV_HEIGHT = 52;

export const THIN_BORDER_CLASS =
  "border border-[#d4d4d8]/70 dark:border-[#e4e4e7]/25";

export const THIN_DIVIDER_CLASS =
  "border-[#d4d4d8]/70 dark:border-[#e4e4e7]/25";

export const INPUT_BORDER_CLASS =
  "border border-input";

export const ACCENT_TAB_ACTIVE_CLASS =
  "border-accent-stroke text-foreground dark:text-zinc-100";

export const ACCENT_SELECTED_SOFT_CLASS =
  "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";

export const ACCENT_SELECTED_OUTLINE_CLASS =
  "border-accent-stroke outline outline-1 outline-accent-stroke";

export const ACCENT_TOGGLE_ON_CLASS =
  "border border-accent-stroke text-foreground dark:text-zinc-100";

export const PRIMARY_BUTTON_CLASS =
  "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90";

export const ACCENT_CHECK_CLASS = "text-foreground dark:text-zinc-100";

export const ACCENT_FOCUS_RING_CLASS =
  "focus-visible:ring-foreground/30 dark:focus-visible:ring-zinc-100/20";

export const ACCENT_SWITCH_ON_CLASS = "bg-accent-fill";

export const ACCENT_PILL_ACTIVE_CLASS =
  "bg-accent-fill text-accent-fill-foreground hover:bg-accent-fill/90";

export const ACCENT_ICON_MUTED_BG_CLASS =
  "bg-zinc-900/10 dark:bg-zinc-100/10";

/**
 * 提示词输入框：限制最大高度、超出可滚动、隐藏滚动条（视觉更干净）。
 * - `max-h-*` 控制最高高度，内容超出后可滚动
 * - `[scrollbar-width:none]` 作用于 Firefox，`[&::-webkit-scrollbar]:hidden` 作用于 Chromium
 */
export const PROMPT_EDITOR_SCROLL_CLASS =
  "max-h-[220px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
