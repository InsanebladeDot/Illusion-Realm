/** Move a complete model folder inside its configured major root; preserve series levels and reject links/overwrites. */
const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const { configuredPaths, childDirectory, isInside, validateLocalFolder } = require("./model-download-paths");
const { safeName } = require("./model-download-validation");
const { isModelFolderDownloading } = require("./model-download-manager");
const { assertFolderUnlocked, reserveFolders } = require("./model-folder-locks");
/** @typedef {import("@illusion-realm/shared").ModelCategoryRoot} Root */
/** @param {string} left @param {string} right */
function samePath(left, right) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }
/** @returns {Root[]} */
function configuredRoots() {
  const paths = configuredPaths();
  if (paths.searchPath) {
    if (!path.isAbsolute(paths.searchPath) || !fs.existsSync(paths.searchPath)) throw new Error("configuration");
    return fs.readdirSync(paths.searchPath, { withFileTypes: true }).filter((entry) => entry.isDirectory() && safeName(entry.name)).map((entry) => ({ name: entry.name, path: childDirectory(paths.searchPath, entry.name) }));
  }
  return [...new Set([paths.lorasPath, paths.checkpointPath, paths.diffusionModelsPath].filter((value) => value && path.isAbsolute(value) && fs.existsSync(value)))].map((value) => ({ name: path.basename(value), path: path.resolve(value) }));
}
/** @param {string} root @param {string} folder */
function checkedDescendant(root, folder) {
  if (!path.isAbsolute(folder) || !isInside(root, folder)) throw new Error("invalid");
  let current = root;
  for (const segment of path.relative(root, folder).split(path.sep)) current = childDirectory(current, segment);
  if (!fs.existsSync(current)) throw new Error("invalid");
  return current;
}
/** @param {string} folderPath */
function categoryTarget(folderPath) {
  const roots = configuredRoots();
  const root = roots.filter((item) => isInside(item.path, folderPath)).sort((a, b) => b.path.length - a.path.length)[0];
  if (!root) throw new Error("invalid");
  const folder = checkedDescendant(root.path, folderPath);
  validateLocalFolder(folder);
  const segments = path.relative(root.path, folder).split(path.sep);
  // A model directly in a root/category is a legacy aggregate, not an individual model folder.
  if (segments.length < 2 || (/^(anima|sdxl)$/i.test(segments[0]) && segments.length < 3)) throw new Error("layout");
  const categoryRootPath = path.dirname(path.dirname(folder));
  const categories = fs.readdirSync(categoryRootPath, { withFileTypes: true }).filter((entry) => entry.isDirectory() && safeName(entry.name)).map((entry) => entry.name).sort();
  return { rootPath: root.path, categoryRootPath, currentCategory: path.basename(path.dirname(folder)), roots, categories };
}
/** @param {string} folder */
function assertIdle(folder) {
  assertFolderUnlocked(folder);
  if (isModelFolderDownloading(folder) || fs.readdirSync(folder).some((name) => /^\.(download|logo)-.*\.part$/i.test(name))) throw new Error("busy");
}
/** Validate the entire move before any filesystem mutation. @param {import("@illusion-realm/shared").MoveModelCategoryRequest} request */
function prepareMove(request) {
    const target = categoryTarget(request.folderPath);
    if (!samePath(target.rootPath, request.targetRootPath)) throw new Error("crossRoot");
    const folder = checkedDescendant(target.rootPath, request.folderPath);
    const category = request.category.trim() || "Uncategorized";
    if (!safeName(category) || category.length > 120) throw new Error("invalid");
    const parent = childDirectory(target.categoryRootPath, category);
    const destination = childDirectory(parent, path.basename(folder));
    if (samePath(folder, destination)) { assertIdle(folder); return { folder, parent, destination }; }
    // The destination may overlap an independently configured major root; never cross that boundary.
    if (target.roots.some((root) => !samePath(root.path, target.rootPath) && (samePath(root.path, destination) || isInside(root.path, destination)))) throw new Error("crossRoot");
    assertIdle(folder);
    if (fs.existsSync(destination)) throw new Error("exists");
    return { folder, parent, destination };
}
/** @param {unknown} error */
function categoryError(error) {
  const code = error instanceof Error ? error.message : "";
  return ["configuration", "invalid", "layout", "crossRoot", "busy", "exists"].includes(code) ? code : "io";
}
/** @param {import("@illusion-realm/shared").MoveModelCategoryRequest} request */
function moveCategory(request) {
  try {
    const plan = prepareMove(request);
    if (samePath(plan.folder, plan.destination)) return plan.folder;
    fs.mkdirSync(plan.parent, { recursive: true });
    fs.renameSync(plan.folder, plan.destination);
    return plan.destination;
  } catch (error) {
    throw new Error(categoryError(error));
  }
}
/** @param {string[]} folders */
function checkedBatch(folders) {
  const unique = [...new Set(folders.map((folder) => path.resolve(folder).toLowerCase()))];
  if (unique.length !== folders.length) throw new Error("invalid");
  for (const folder of folders) {
    categoryTarget(folder); assertIdle(folder);
    if (folders.some((other) => !samePath(folder, other) && isInside(folder, other))) throw new Error("layout");
  }
}
/** @param {Extract<import("@illusion-realm/shared").LocalModelBatchRequest, {action:"move"}>} request */
function batchMove(request) {
  const plans = request.folderPaths.map((folderPath) => prepareMove({ folderPath, targetRootPath: request.targetRootPath, category: request.category }));
  if (new Set(plans.map((plan) => path.resolve(plan.destination).toLowerCase())).size !== plans.length) throw new Error("exists");
  return { items: plans.map((plan) => {
    try {
      const destinationPath = moveCategory({ folderPath: plan.folder, targetRootPath: request.targetRootPath, category: request.category });
      return { folderPath: plan.folder, destinationPath, success: true };
    } catch (error) { return { folderPath: plan.folder, success: false, error: categoryError(error) }; }
  }) };
}
/** Validate each folder again immediately before trashing; report partial failures without deleting unrelated files.
 * @param {string[]} folders @returns {Promise<import("@illusion-realm/shared").LocalModelBatchResult>} */
async function batchDelete(folders) {
  const items = [];
  const release = reserveFolders(folders);
  try {
    for (const folderPath of folders) {
      try {
        categoryTarget(folderPath);
        if (isModelFolderDownloading(folderPath) || fs.readdirSync(folderPath).some((name) => /^\.(download|logo)-.*\.part$/i.test(name))) throw new Error("busy");
        await shell.trashItem(folderPath);
        items.push({ folderPath, success: true });
      } catch (error) { items.push({ folderPath, success: false, error: categoryError(error) }); }
    }
  } finally { release(); }
  return { items };
}
/** @param {import("@illusion-realm/shared").LocalModelBatchRequest} request */
async function operateModels(request) {
  try {
    if (request.acknowledged !== true) throw new Error("invalid");
    checkedBatch(request.folderPaths);
    return request.action === "move" ? batchMove(request) : await batchDelete(request.folderPaths);
  } catch (error) { throw new Error(categoryError(error)); }
}
module.exports = { categoryTarget, moveCategory, operateModels };
