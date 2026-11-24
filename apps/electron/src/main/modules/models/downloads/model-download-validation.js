const { validSetupRequest } = require("./setup-download-catalog");
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
  if (args.length !== 1 || !validLocation(value) || !isRecord(value)) return "invalid";
  if (Object.keys(value).some(key => !["modelType", "baseModel", "modelName"].includes(key))) return "invalid";
  return value.modelName === undefined || (isString(value.modelName, 240) && value.modelName.trim()) ? null : "invalid";
}
/** 来源快照只接收已知字段和有界文本，与 shared schema 保持一致。 @param {unknown} value */
function validSource(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !["modelId", "versionId", "versionName", "creator", "trainedWords", "description", "versionDescription"].includes(key))) return false;
  if (![value.modelId, value.versionId].every((id) => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) return false;
  return isString(value.versionName, 240) && isString(value.creator, 240) && isString(value.description, 200000) && isString(value.versionDescription, 200000) &&
    Array.isArray(value.trainedWords) && value.trainedWords.length <= 256 && value.trainedWords.every((word) => isString(word, 4096));
}
/** @param {unknown[]} args */
function validateDownload(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || !validLocation(value)) return "invalid";
  const keys = ["modelType", "baseModel", "modelName", "fileName", "downloadUrl", "category", "sha256", "previewUrl", "logoDataUrl", "source", "setupId"];
  if (Object.keys(value).some((key) => !keys.includes(key))) return "invalid";
  if (!isString(value.modelName, 240) || !value.modelName.trim()) return "invalid";
  if (!isString(value.fileName, 240) || !safeName(value.fileName) || !/\.(safetensors|ckpt|pt|pth|gguf)$/i.test(value.fileName)) return "invalid";
  if (!isString(value.category, 120) || (value.category.trim() && !safeName(value.category.trim()))) return "invalid";
  if (!isString(value.sha256, 64) || !/^([a-f0-9]{64})?$/i.test(value.sha256)) return "invalid";
  if (!isString(value.downloadUrl, 4096) || (!/^https:\/\/civitai\.(red|com)\/api\/download\/models\/\d+(\?[^#]*)?$/.test(value.downloadUrl) && !validSetupRequest(value))) return "invalid";
  if (!isString(value.previewUrl, 4096) || (value.previewUrl && !/^https:\/\/([a-z0-9-]+\.)?civitai\.(com|red)\//i.test(value.previewUrl))) return "invalid";
  if (value.logoDataUrl !== undefined && (!isString(value.logoDataUrl, 28 * 1024 * 1024) || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value.logoDataUrl))) return "invalid";
  if (value.source !== undefined && !validSource(value.source)) return "invalid";
  if (isRecord(value.source) && value.source.versionId !== Number(new URL(value.downloadUrl).pathname.split("/").pop())) return "invalid";
  if (value.setupId !== undefined && !validSetupRequest(value)) return "invalid";
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
/** 文件夹创建只接受分类键和相对路径；不允许界面指定磁盘根。 @param {unknown[]} args */
function validateFolderCreate(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || Object.keys(value).some(key => !["root", "parent", "name"].includes(key))) return "invalid";
  if (!isString(value.root, 120) || !safeName(value.root.trim()) || !isString(value.name, 120) || !safeName(value.name.trim())) return "invalid";
  if (!isString(value.parent, 4096) || (value.parent && !value.parent.split("/").every(segment => segment.length <= 120 && segment === segment.trim() && safeName(segment)))) return "invalid";
  return null;
}
/** 删除只接受已确认的子目录，空路径不能指向整个模型分类。 @param {unknown[]} args */
function validateFolderDelete(args) {
  const value = args[0];
  if (args.length !== 1 || !isRecord(value) || value.acknowledged !== true) return "invalid";
  if (Object.keys(value).some(key => !["root", "folder", "acknowledged"].includes(key))) return "invalid";
  if (!isString(value.folder, 4096) || !value.folder) return "invalid";
  return validateFolderCreate([{ root: value.root, parent: value.folder, name: "folder" }]);
}
module.exports = { validateFolderDelete, validateFolderCreate, validateDownload, validateLocation, validateString, validateCategoryMove, validateModelBatch, safeName };
