/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const components = {
  "imagePreviewOverlay": {
    "label": "Image preview",
    "close": "Close preview",
    "previous": "Previous",
    "next": "Next",
    "zoomOut": "Zoom out",
    "zoomIn": "Zoom in",
    "resetZoom": "Reset zoom",
    "triggerLabel": "Click to view full size"
  },
  "presetShell": {
    "creatingFor": "New preset for {group}",
    "backToList": "Back to preset list",
    "nameLabel": "Preset name",
    "namePlaceholder": "My custom preset",
    "create": "Create preset",
    "defaultBadge": "Default",
    "deleteLabel": "Delete preset {name}",
    "addCustom": "Add custom preset",
    "saveChanges": "Save changes",
    "empty": "No presets yet"
  },
  "documentDialog": {
    "confirm": "Got it"
  },
  "resourceCoverImage": {
    "empty": "No cover"
  },
  "simpleNumberCombobox": {
    "expandPresets": "Show preset frame rates",
    "recommended": "Recommended"
  },
  "generationNotice": {
    "generating": "Generating{dots}",
    "success": "Image generated",
    "failed": "Generation failed",
    "view": "View image"
  }
} as const;
