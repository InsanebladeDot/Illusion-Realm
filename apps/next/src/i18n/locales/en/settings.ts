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
  "categories": {
    "label": "Settings categories",
    "all": "All",
    "tools": "Toolbox",
    "image": "Image processing",
    "video": "Video processing",
    "models": "Model plugins",
    "keys": "API keys",
    "videoTitle": "Video processing settings",
    "videoDescription": "Use the video toolbox for video editing, equal-duration splitting and frame export."
  },
  promptKeys: {
    title: "Prompt assistant",
    description: "GLM, proxies, Agent and Civitai each use their own platform key. Saving configures local storage; it does not validate API access.",
    glmHint: "Use an API key from the Zhipu open platform (bigmodel.cn), with the open.bigmodel.cn endpoint.",
    saveConnection: "Save connection settings",
    saveFirst: "Save the endpoint and model before entering its API key. Each endpoint requires its own key.",
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
  "agentSection": {
    "title": "Agent",
    "description": "The model key used by Agent chats. It stays on this machine, is encrypted by the main process, never goes into the user-data document and is never handed back to the UI.",
    "keyLabel": "API Key",
    "keyPlaceholder": "sk-...",
    "setup": {
      "website": "SiliconFlow website",
      "title": "Registration and API setup",
      "register": "Open the SiliconFlow website, select Log in, and follow the website instructions to register or sign in.",
      "createKey": "Open API Keys in the console and select Create API Key.",
      "copyKey": "Copy the API key you created.",
      "saveKey": "Return to this app, paste the key into the API Key field below and select Save. You can then use the Agent page.",
    },
    "reveal": "Show key",
    "hide": "Hide key",
    "save": "Save",
    "clear": "Clear",
    "saved": "API key saved",
    "cleared": "API key cleared",
    "empty": "API key cannot be empty",
    "statusConfigured": "Configured (ends with {tail})",
    "statusFromEnv": "Provided by .env / environment (ends with {tail})",
    "statusMissing": "Not configured — you need to set one here before asking the Agent anything",
    "envHint": "The .env in the repo root is for development testing only; fill it in here for everyday use.",
    "plainWarning": "This system offers no encryption, so the key can only be stored locally as plain base64 — keep that file from leaving this machine."
  },
  "civitai": {
    "title": "Civitai download authorization",
    "subtitle": "Used for model files that require a signed-in account. The key stays on this machine and is stored by the main process.",
    "description": "Create an API Key in your Civitai account. Downloads carry the authorization automatically; the key is not sent after a redirect to the model CDN.",
    "openAccount": "Open Civitai account settings",
    "steps": "How to get one: sign in → Security & Apps → Add API Key",
    "configured": "Configured (ends with {tail})",
    "missing": "No API key configured; some model downloads may require authorization",
    "placeholder": "Paste Civitai API Key",
    "show": "Show key",
    "hide": "Hide key",
    "save": "Save",
    "clear": "Clear",
    "saved": "Civitai API key saved",
    "cleared": "Civitai API key cleared",
    "saveFailed": "Failed to save or clear the Civitai API key",
    "plainWarning": "This system cannot provide encrypted storage, so the key is saved locally in plain form. Do not share that file.",
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
