/**
 * English catalogue — keys must stay identical to `zh-CN/common.ts`
 * (enforced by `Record<Locale, Messages>` at typecheck time).
 *
 * Translation status: translated. Interpolation placeholders (`{label}`) must be
 * preserved verbatim — `interpolate()` looks them up by name.
 */
export const common = {
  "cancel": "Cancel",
  "confirm": "Confirm",
  "save": "Save",
  "delete": "Delete",
  "copy": "Copy",
  "close": "Close",
  "loading": "Loading…",
  "notImplemented": "{label} is not available yet",
  "copyFailed": "Copy failed",
  "localeNameSelf": "English"
} as const;
