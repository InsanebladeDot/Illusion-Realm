/**
 * 下载目录读取 storage 中的配置文档；下载模块本身的位置不参与目标文件路径计算。
 */
/**
 * user-data：从 storage 取得主进程 JSON 文档读写能力。
 * user-data：只迁移实现位置，版本合并与默认值仍由渲染侧负责。
 * user-data：读文档时的路径解析继续委托统一根目录，不能改成模块旁的文件。
 */
/** Resolve downloads from saved settings; keep category/model folders inside their configured root. */
const fs = require("fs");
const path = require("path");
const { readUserData } = require("../../../storage/user-data");
const { safeName } = require("./model-download-validation");
const { assertFolderUnlocked } = require("../model-folder-locks");
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
function resolveModelRoot(paths, location) {
  const anima = /anima/i.test(location.baseModel);
  let root = location.modelType === "LORA" ? paths.lorasPath : anima ? paths.diffusionModelsPath : paths.checkpointPath;
  if (paths.searchPath) {
    const sub = location.modelType === "LORA" ? "loras" : location.modelType === "TextualInversion" ? "embeddings" : anima ? "diffusion_models" : "checkpoints";
    root = childDirectory(paths.searchPath, sub);
  } else if (location.modelType === "TextualInversion") { throw new Error("configuration"); }
  if (!root || !path.isAbsolute(root)) throw new Error("configuration");
  if (location.modelType === "Checkpoint" && anima && path.basename(root).toLowerCase() !== "anima") root = childDirectory(root, "Anima");
  return path.resolve(root);
}
/** 基础模型名只占一层，像把书归到对应书架。 @param {string} baseModel */
function loraFamily(baseModel) {
  const name = baseModel.trim().normalize("NFC");
  if (/^illus(?:trious)?(?:[ _-]|$)|^sdxl(?: 1\.0)?$/i.test(name)) return "SDXL";
  if (/^anima$/i.test(name)) return "Anima";
  const segment = name.replace(/[\s<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/\.+$/, "");
  return !segment ? "Uncategorized" : safeName(segment) ? segment : "Model_" + segment;
}
/** 目录已存在时沿用实际大小写，避免同一系列在不同系统分成两份。 @param {string} root @param {string} folder */
function matchingDirectory(root, folder) {
  const names = fs.existsSync(root) ? fs.readdirSync(root) : [];
  return childDirectory(root, names.includes(folder) ? folder : names.find(name => name.toLowerCase() === folder.toLowerCase()) ?? folder);
}
/** @param {Paths} paths @param {Location} location */
function resolveRoot(paths, location) {
  const root = resolveModelRoot(paths, location);
  return location.modelType === "LORA" ? matchingDirectory(root, loraFamily(location.baseModel)) : root;
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
/** @param {Location & { modelName?: string }} location */
function downloadTarget(location) {
  const rootPath = resolveRoot(configuredPaths(), location);
  const categories = fs.existsSync(rootPath) ? fs.readdirSync(rootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory() && safeName(entry.name)).map((entry) => entry.name).sort() : [];
  return { rootPath, categories, ...(location.modelName ? { modelFolderName: modelFolderName(location.modelName) } : {}) };
}
/** 路径预览和落盘共用同一个模型名，保留旧队列目录的判断依据。 @param {string} modelName */
function modelFolderName(modelName) {
  const clean = modelName.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 100).replace(/[. ]+$/, "");
  return safeName(clean) ? clean : "Model_" + clean;
}
/** @param {string} root @param {string} category @param {string} modelName @param {boolean} direct */
function modelFolderPath(root, category, modelName, direct) {
  const subfolder = category.trim();
  const parent = direct && !subfolder ? root : childDirectory(root, subfolder || "Uncategorized");
  return childDirectory(parent, modelFolderName(modelName));
}
/** @param {string} root @param {string} category @param {string} modelName @param {boolean} [direct] */
function modelFolder(root, category, modelName, direct = false) {
  const folder = modelFolderPath(root, category, modelName, direct);
  assertFolderUnlocked(folder);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}
/** 升级前的任务仍放在原目录续传，只认与请求匹配的两种旧归档路径。
 * @param {import('@illusion-realm/shared').ModelDownloadRequest} request @param {string} folder */
function matchesDownloadFolder(request, folder) {
  const paths = configuredPaths();
  const root = resolveModelRoot(paths, request);
  const lora = request.modelType === "LORA";
  const same = (/** @type {string} */ expected) => path.relative(expected, folder) === "";
  if (same(modelFolderPath(root, request.category, request.modelName, false))) return true;
  if (!lora) return false;
  const currentRoot = matchingDirectory(root, loraFamily(request.baseModel));
  if (same(modelFolderPath(currentRoot, request.category, request.modelName, true))) return true;
  const legacy = /anima/i.test(request.baseModel) ? "anima" : /sdxl|pony|illustrious/i.test(request.baseModel) ? "sdxl" : "";
  return Boolean(legacy && same(modelFolderPath(matchingDirectory(root, legacy), request.category, request.modelName, false)));
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
module.exports = { configuredPaths, resolveRoot, isInside, childDirectory, downloadTarget, modelFolder, modelFolderName, loraFamily, matchesDownloadFolder, validateLocalFolder };
