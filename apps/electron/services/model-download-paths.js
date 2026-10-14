/** Resolve downloads from saved settings; keep category/model folders inside their configured root. */
const fs = require("fs");
const path = require("path");
const { readUserData } = require("../userData");
const { safeName } = require("./model-download-validation");
const { assertFolderUnlocked } = require("./model-folder-locks");
/** @typedef {import("@illusion-realm/shared").ModelDownloadLocation} Location */
/** @typedef {import("@illusion-realm/shared").SettingsPaths} Paths */
/** @returns {Paths} */
function configuredPaths() {
  const settings = readUserData().data?.settings;
  if (!settings || typeof settings !== "object" || !("paths" in settings)) throw new Error("configuration");
  if (!settings.paths || typeof settings.paths !== "object") throw new Error("configuration");
  const raw = /** @type {Record<string, unknown>} */ (settings.paths);
  const get = (/** @type {string} */ key) => key in raw && typeof raw[key] === "string" ? raw[key].trim() : "";
  return { searchPath: get("searchPath"), checkpointPath: get("checkpointPath"), lorasPath: get("lorasPath"), diffusionModelsPath: get("diffusionModelsPath") };
}
/** @param {Paths} paths @param {Location} location */
function resolveRoot(paths, location) {
  const anima = /anima/i.test(location.baseModel);
  let root = location.modelType === "LORA" ? paths.lorasPath : anima ? paths.diffusionModelsPath : paths.checkpointPath;
  if (paths.searchPath) {
    const sub = location.modelType === "LORA" ? "loras" : location.modelType === "TextualInversion" ? "embeddings" : anima ? "diffusion_models" : "checkpoints";
    root = childDirectory(paths.searchPath, sub);
  } else if (location.modelType === "TextualInversion") { throw new Error("configuration"); }
  if (!root || !path.isAbsolute(root)) throw new Error("configuration");
  if (location.modelType === "Checkpoint" && anima && path.basename(root).toLowerCase() !== "anima") root = childDirectory(root, "Anima");
  if (location.modelType === "LORA") {
    const series = anima ? "anima" : /sdxl|pony|illustrious/i.test(location.baseModel) ? "sdxl" : "";
    const existing = series && fs.existsSync(path.join(root, series));
    if (existing) root = childDirectory(root, series);
  }
  return path.resolve(root);
}
/** @param {string} root @param {string} target */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
}
/** Reject linked child directories, including junctions; the user-selected root may itself be a link.
 * @param {string} root @param {string} name */
function childDirectory(root, name) {
  if (!path.isAbsolute(root) || !safeName(name)) throw new Error("invalid");
  const child = path.join(root, name);
  if (fs.existsSync(child)) {
    if (fs.lstatSync(child).isSymbolicLink() || !fs.statSync(child).isDirectory()) throw new Error("invalid");
    if (!isInside(fs.realpathSync(root), fs.realpathSync(child))) throw new Error("invalid");
  }
  return child;
}
/** @param {Location} location */
function downloadTarget(location) {
  const rootPath = resolveRoot(configuredPaths(), location);
  const categories = fs.existsSync(rootPath) ? fs.readdirSync(rootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory() && safeName(entry.name)).map((entry) => entry.name).sort() : [];
  return { rootPath, categories };
}
/** @param {string} root @param {string} category @param {string} modelName */
function modelFolder(root, category, modelName) {
  const clean = modelName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 100).replace(/[. ]+$/, "");
  const folder = childDirectory(childDirectory(root, category.trim() || "Uncategorized"), safeName(clean) ? clean : "Model_" + clean);
  assertFolderUnlocked(folder);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}
/** @param {string} folder */
function validateLocalFolder(folder) {
  const paths = configuredPaths();
  const roots = paths.searchPath ? [paths.searchPath] : [paths.lorasPath, paths.checkpointPath, paths.diffusionModelsPath];
  if (!path.isAbsolute(folder) || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("invalid");
  const real = fs.realpathSync(folder);
  const root = roots.find((value) => value && fs.existsSync(value) && (path.resolve(value) === path.resolve(folder) || isInside(path.resolve(value), path.resolve(folder))) && (fs.realpathSync(value) === real || isInside(fs.realpathSync(value), real)));
  if (!root || !fs.readdirSync(folder).some((name) => /\.(safetensors|ckpt|pt|pth|gguf)$/i.test(name) && fs.lstatSync(path.join(folder, name)).isFile())) throw new Error("invalid");
  return real;
}
module.exports = { configuredPaths, resolveRoot, isInside, childDirectory, downloadTarget, modelFolder, validateLocalFolder };
