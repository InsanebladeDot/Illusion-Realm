/** Validate native model-download inputs with the same rules as the shared schemas. */
const MODEL_TYPES = ["LORA", "Checkpoint", "TextualInversion"];
const UNSAFE_NAME = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED_NAME = /^(\.{1,2}|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {unknown} value @param {number} max @returns {value is string} */
function isString(value, max) { return typeof value === "string" && value.length <= max; }
/** @param {string} name */
function safeName(name) { return !!name && !UNSAFE_NAME.test(name) && !RESERVED_NAME.test(name) && !/[. ]$/.test(name); }
/** @param {unknown} value */
function validLocation(value) {
  return isRecord(value) && typeof value.modelType === "string" && MODEL_TYPES.includes(value.modelType) && isString(value.baseModel, 120);
}
/** @param {unknown[]} args */
function validateLocation(args) {
  const value = args[0];
  return args.length === 1 && validLocation(value) && isRecord(value) && Object.keys(value).every((key) => ["modelType", "baseModel"].includes(key)) ? null : "invalid";
}
/** @param {unknown[]} args */
function validateDownload(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || !validLocation(value)) return "invalid";
  const keys = ["modelType", "baseModel", "modelName", "fileName", "downloadUrl", "category", "sha256", "previewUrl", "logoDataUrl"];
  if (Object.keys(value).some((key) => !keys.includes(key))) return "invalid";
  if (!isString(value.modelName, 240) || !value.modelName.trim()) return "invalid";
  if (!isString(value.fileName, 240) || !safeName(value.fileName) || !/\.(safetensors|ckpt|pt|pth|gguf)$/i.test(value.fileName)) return "invalid";
  if (!isString(value.category, 120) || (value.category.trim() && !safeName(value.category.trim()))) return "invalid";
  if (!isString(value.sha256, 64) || !/^([a-f0-9]{64})?$/i.test(value.sha256)) return "invalid";
  if (!isString(value.downloadUrl, 4096) || !/^https:\/\/civitai\.(red|com)\/api\/download\/models\/\d+(\?[^#]*)?$/.test(value.downloadUrl)) return "invalid";
  if (!isString(value.previewUrl, 4096) || (value.previewUrl && !/^https:\/\/([a-z0-9-]+\.)?civitai\.(com|red)\//i.test(value.previewUrl))) return "invalid";
  if (value.logoDataUrl !== undefined && (!isString(value.logoDataUrl, 28 * 1024 * 1024) || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value.logoDataUrl))) return "invalid";
  return null;
}
/** @param {unknown[]} args */
function validateString(args) { return args.length === 1 && isString(args[0], 4096) && args[0] ? null : "invalid"; }
/** @param {unknown[]} args */
function validateCategoryMove(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || Object.keys(value).some((key) => !["folderPath", "targetRootPath", "category"].includes(key))) return "invalid";
  return isString(value.folderPath, 4096) && !!value.folderPath && isString(value.targetRootPath, 4096) && !!value.targetRootPath && isString(value.category, 120) && (!value.category.trim() || safeName(value.category.trim())) ? null : "invalid";
}
/** @param {unknown[]} args */
function validateModelBatch(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || value.acknowledged !== true) return "invalid";
  if (!Array.isArray(value.folderPaths) || !value.folderPaths.length || value.folderPaths.length > 200 || value.folderPaths.some((folder) => !isString(folder, 4096) || !folder)) return "invalid";
  const keys = value.action === "move" ? ["action", "folderPaths", "acknowledged", "targetRootPath", "category"] : ["action", "folderPaths", "acknowledged"];
  if (Object.keys(value).some((key) => !keys.includes(key))) return "invalid";
  if (value.action === "delete") return null;
  if (value.action !== "move") return "invalid";
  return validateCategoryMove([{ folderPath: value.folderPaths[0], targetRootPath: value.targetRootPath, category: value.category }]);
}
module.exports = { validateDownload, validateLocation, validateString, validateCategoryMove, validateModelBatch, safeName };
