/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const components = {
  setupChecklist: {
    checkingModels: "Checking local models; generation is temporarily unavailable…",
    generationLocked: "Required models missing — generation disabled",
    unlockNotice: "Install the files selected by this workflow to unlock generation. Use the checklist to download, or recheck after adding files manually.",
    recheckModels: "Recheck models",
    scanFailed: "Model scan failed. Check the folder and retry.",
    blockedModels: "Missing models: {names}. Complete the checklist or change your selection.",
    copyDestination: "Copy model destination path",
    copyDownloadLink: "Hover or click to copy download URL",
    copiedDestination: "Destination path copied",
    copiedLink: "Download URL copied",
    copyFailed: "Copy failed. Please retry.",
    chooseToCopy: "Choose the models folder before copying a full destination path.",
    manualSteps: "Manual installation steps",
    installedFile: "Found locally, not yet verified.",
    installedCount: "{present}/{total} found",
    verifyFile: "Verify",
    verifyAll: "Verify all",
    verifying: "Verifying…",
    ready: "Ready",
    fileMissing: "No file at the required location.",
    hashMismatch: "SHA256 does not match. Move this file before downloading, or replace it with the correct version and verify again.",
    verifyUnavailable: "Could not read the required location. Check the models folder and file permissions.",
    downloadFile: "Download",
    openDownload: "Open download page",
    allGroups: "Download all tasks",
    tasksDescription: "Choose a task. Each feature unlocks when its selected workflow files are installed.",
    dependencyType: {"model": "Main model", "lora": "LoRA", "text": "Text encoder", "vae": "VAE"},
    title: "Task checklist",
    description: "Install the required models per task. Features unlock when the selected workflow has all its files.",
    modelsFolder: "models folder",
    selectFirst: "Choose the models folder before downloading.",
    chooseModels: "Choose models folder",
    model: "Anima model",
    dependencies: "VAE and text encoder",
    workflows: "Workflows",
    fileList: "File list",
    groupProgress: "{present}/{total} complete",
    checkSize: "Up to {size} pending check",
    allSize: "Check {count} distinct files and download up to {size}. Files already in the queue are not added twice.",
    queueSummary: "{active} downloading · {queued} queued in this group",
    downloadGroup: "Download missing files",
    adding: "Checking files and adding tasks…",
    downloadAll: "Download all required files",
    fileConflict: "A filename or source record conflicts. Existing files were kept. Check and move the conflicting files before retrying.",
    unchecked: "Not checked yet. Download checks the file and its SHA256.",
    summary: "Checked {total}: {added} newly queued, {existing} existing tasks, {present} already installed, {failed} failed.",
    result: { present: "File already exists and SHA256 is verified. No download needed." },
    loading: "Loading task guides…",
    failed: "Could not load the guides. Please try again.",
    retry: "Reload guides",
    expand: "Read in full screen",
    collapse: "Exit full screen",
  },
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
    "success": "Image generated",
    "failed": "Generation failed",
    "view": "View image"
  }
} as const;
