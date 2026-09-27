/**
 * English catalogue — keys must stay identical to `zh-CN/settings.ts`
 * (enforced by `Record<Locale, Messages>` at typecheck time).
 *
 * Translation status: translated. Two things to watch when editing:
 *  1. Interpolation placeholders (`{time}` / `{count}` / `{name}`) must survive verbatim.
 *  2. A few entries are **fragments** concatenated in JSX (e.g. `models.countPrefix` +
 *     count + `models.countMiddle`). Keep them as fragments that read naturally in order —
 *     they are not standalone sentences.
 */
export const settings = {
  "theme": {
    "system": "System",
    "light": "Light",
    "dark": "Dark"
  },
  "page": {
    "title": "Settings",
    "description": "Configure local model paths. The app scans those folders for Checkpoint and LoRA models.",
    "browserNotice": "You are in a browser environment. Folder picking and model scanning require the Electron desktop app."
  },
  "electron": {
    "selectFolder": "Pick a local folder in the Electron desktop app",
    "selectPath": "Pick a path in the Electron desktop app",
    "scanModels": "Scan local models in the Electron desktop app",
    "openFolder": "Open folders in the Electron desktop app"
  },
  "pathSection": {
    "title": "Path configuration",
    "descriptionPrefix": "Pick a folder to read its path automatically; nested folder structures are supported (e.g.",
    "empty": "No folder selected",
    "placeholder": "Use the button on the right to pick a local folder",
    "openFolder": "Open folder"
  },
  "outputSection": {
    "title": "Generated output",
    "description": "Generated images are saved to a local folder automatically."
  },
  "outputPath": {
    "updated": "Output folder updated",
    "reset": "Restored the default output folder",
    "unresolved": "Could not resolve the output folder",
    "openFailed": "Failed to open the folder",
    "defaultHint": "Using the default path (next to the app folder)",
    "chooseFolder": "Choose folder",
    "openInExplorer": "Open in File Explorer"
  },
  "userDataSection": {
    "title": "User data",
    "description": "Settings, profile and quick phrases are stored in a single JSON file."
  },
  "userDataPath": {
    "updated": "User data path updated — restart the app for it to take effect",
    "reset": "Restored the default user data path",
    "defaultHint": "Using the default path (user/illusion-realm.json next to the app folder)",
    "chooseFolder": "Choose directory"
  },
  "defaultPathLoading": "Loading the default path…",
  "resetDefault": "Reset to default",
  "comfySection": {
    "description": "Connects to a local ComfyUI service for image generation (default 127.0.0.1:8188).",
    "address": "Service address",
    "hint": "Make sure ComfyUI is running. In browser dev mode requests go through the Next.js proxy; in Electron they go straight through the main process, which avoids WebSocket 403 CORS issues."
  },
  "models": {
    "title": "Local models",
    "countPrefix": "Total ",
    "countMiddle": " models (Checkpoint ",
    "lastScanned": " · Last scanned {time}",
    "rescan": "Rescan",
    "scanDone": "Local model scan finished",
    "scanning": "Scanning local models…",
    "empty": "No models found yet — configure the path and click “Rescan”",
    "badge": "Model",
    "sourcePrefix": "Source: ",
    "removeFromCategory": "Remove from this category",
    "customSuffix": " (custom)",
    "addModels": "Add models in bulk",
    "otherCategory": "Other"
  },
  "newCategory": {
    "title": "New custom category",
    "description": "After creating it you can add model files in bulk.",
    "namePlaceholder": "Category name",
    "invalid": "Category name is invalid or already exists",
    "created": "Category created",
    "create": "Create"
  },
  "addModels": {
    "titlePrefix": "Add models in bulk to “",
    "description": "Models already assigned to another custom category are not listed here.",
    "empty": "No models available to add (all are already assigned)",
    "selectedPrefix": "Selected ",
    "selectedSuffix": "",
    "added": "Added {count} model(s) to “{name}”",
    "noneSelected": "No models selected",
    "add": "Add"
  }
} as const;
