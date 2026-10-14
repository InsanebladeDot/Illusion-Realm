/**
 * English catalogue — keys must stay identical to `zh-CN/nav.ts`
 * (enforced by `Record<Locale, Messages>` at typecheck time).
 *
 * Translation status: translated (see apps/next/scripts/check-i18n-en.mjs).
 * When adding a nav entry, add it to zh-CN **and** here — the ratchet only
 * allows untranslated growth for *new* keys, never for regressions.
 */
export const nav = {
  "agent": "Agent",
  "home": "Home",
  "create": "Create",
  "inspect": "Inspect",
  "cartoon": "Comic Dialog",
  "comic": "Comic Storyboard",
  "tags": "Tags",
  "profile": "Profile",
  "updates": "Updates",
  "settings": "Settings",
  "language": "Language",
  "toolBox": "Toolbox",
  "theme": "Theme",
  "sidebar": {
    "collapse": "Collapse sidebar",
    "expand": "Expand sidebar"
  },
  "mobile": {
    "menu": "Menu",
    "explore": "Explore",
    "history": "History",
    "notifications": "Notifications",
    "you": "You"
  }
} as const;
