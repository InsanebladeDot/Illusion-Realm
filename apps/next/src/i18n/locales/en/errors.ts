/**
 * English catalogue — **结构与 zh-CN 完全一致**（由 apps/next/scripts/mirror-locale.mjs 生成）。
 *
 * 现状：值仍与 zh-CN 相同（镜像），翻译按命名空间增量推进。
 * 未翻译数量由 apps/next/scripts/check-i18n-en.mjs 的 ratchet 盯着（只减不增），
 * 因此「翻了哪些」是可以机检的数字，不靠人记。
 */
export const errors = {
  "desktopOnly": {
    "createFolder": "Create folders in the Electron desktop app",
    "deleteFolder": "Delete folders in the Electron desktop app",
    "deleteImages": "Delete images in the Electron desktop app",
    "saveImageAs": "Save images in the Electron desktop app",
    "renameImage": "Rename images in the Electron desktop app",
    "addImages": "Add images in the Electron desktop app",
    "characters": "The character library is only available in the Electron desktop app",
    "videoEditing": "Video editing is only available in the Electron desktop app",
    "readLocalImage": "Cannot read local images — use the Electron desktop app",
    "bridgeMissing": "Delete is unavailable because the feature did not load — fully quit Electron and restart the app"
  },
  "sdImage": {
    "unsupportedFormat": "Unsupported image format"
  },
  "comfy": {
    "desktopOnly": "{feature} requires the Electron desktop app (browser mode no longer proxies the API)",
    "featureImageUpload": "ComfyUI image upload",
    "featureImageGenerate": "ComfyUI image generation",
    "featureVideoGenerate": "ComfyUI video generation",
    "featureModelLists": "ComfyUI model lists"
  },
  "videoWorkflow": {
    "unknownWorkflow": "Unknown video workflow: {workflowId}"
  },
  "imageWorkflow": {
    "missingOutputNode": "Image workflow ({series}) has no output node: add SaveImage or PreviewImage to the matching JSON under src/data/comfy/imageWorkflower/ and wire it to the VAE-decoded image",
    "unknownSeries": "Unknown image workflow series: {series}",
    "missingSampler": "Workflow has no KSampler node: {series}"
  },
  "buildGenerateParams": {
    "nonDiffusionModel": "The selected file cannot be used as a diffusion model (it lives under upscale_models / vae / clip): {filePath}\nPick a model under {target} in the Model dialog",
    "modelOutsideSeries": "The selected model is not inside the current series folder: {filePath}\n{seriesHint}",
    "animaSeriesOnly": "The Anima series only uses models under {root}",
    "sdxlSeriesOnly": "The SDXL series only uses models under {root}"
  },
  "metadataConsistency": {
    "passed": "✓ All {count} images share the same metadata structure",
    "inconsistent": "Found {count} inconsistent fields"
  },
  "generationKind": {
    "text2imgShort": "Text → Image",
    "text2imgDescription": "Generate an image from text",
    "img2imgShort": "Image → Image",
    "img2imgDescription": "Generate from a reference image"
  },
  "negativePreset": {
    "defaultName": "My negative preset"
  },
  "localModelCategory": {
    "uncategorized": "Other"
  }
} as const;
