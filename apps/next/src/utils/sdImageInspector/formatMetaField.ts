/** Format metadata for viewing only; keep the original fields used by remix and export intact. */
import type { SdImageMetaField } from "@/types/sdImageMeta";

export function formatMetaFieldJson(field: SdImageMetaField): string | null {
  try {
    return JSON.stringify(JSON.parse(field.value), null, 2) ?? null;
  } catch {
    if (field.json == null) return null;
    try { return JSON.stringify(field.json, null, 2) ?? null; }
    catch { return null; }
  }
}
