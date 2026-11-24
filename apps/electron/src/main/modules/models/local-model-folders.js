/** 本地模型库读取真实目录，空文件夹和带模型的文件夹共用同一棵树。 */
const fs = require("node:fs");
const path = require("node:path");
const { configuredPaths, childDirectory } = require("./downloads/model-download-paths");
const { safeName } = require("./downloads/model-download-validation");
const { shell } = require("electron");
const { assertFolderUnlocked, reserveFolders } = require("./model-folder-locks");
const { isModelFolderDownloading } = require("./downloads/model-download-manager");

function browseRoots() {
  const paths = configuredPaths();
  if (paths.searchPath) {
    if (!path.isAbsolute(paths.searchPath) || !fs.existsSync(paths.searchPath)) throw new Error("configuration");
    const names = fs.readdirSync(paths.searchPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && safeName(entry.name)).map(entry => entry.name);
    if (!names.some(name => name.toLowerCase() === "loras")) names.push("loras");
    return names.map(root => ({ root, folder: childDirectory(paths.searchPath, root) }));
  }
  return [
    { root: "checkpoints", folder: paths.checkpointPath },
    { root: "loras", folder: paths.lorasPath },
    { root: "diffusion_models", folder: paths.diffusionModelsPath },
  ].filter(entry => path.isAbsolute(entry.folder) && fs.existsSync(entry.folder));
}

/** 只列真目录。像浏览书架一样，只走目录层级，不打开权重文件或链接。
 * @param {string} folder @param {string} [parent] @returns {Promise<string[]>} */
async function listSubfolders(folder, parent = "") {
  const folders = [];
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !safeName(entry.name)) continue;
    const relative = parent ? parent + "/" + entry.name : entry.name;
    folders.push(relative);
    try {
      for (const child of await listSubfolders(childDirectory(folder, entry.name), relative)) folders.push(child);
    } catch (error) {
      // 外部移动目录时跳过已消失的分支，其它读取错误交给调用方处理。
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return folders;
}

async function listLocalModelFolders() {
  return Promise.all(browseRoots().map(async ({ root, folder }) => ({
    root,
    folders: fs.existsSync(folder) ? await listSubfolders(folder) : [],
  })));
}

/** 创建一级真实文件夹。只有已配置的 LoRA 根可以在首次创建时补齐。
 * @param {import('@illusion-realm/shared').CreateLocalModelFolderRequest} request */
function createLocalModelFolder(request) {
  const entry = browseRoots().find(item => item.root === request.root);
  if (!entry) throw new Error("configuration");
  const segments = request.parent ? request.parent.split("/") : [];
  const parent = segments.reduce((folder, segment) => childDirectory(folder, segment), entry.folder);
  if (!fs.existsSync(parent) && (request.parent || entry.root !== "loras")) throw new Error("invalid");
  const name = request.name.trim().replace(/\s+/g, "_");
  const folder = childDirectory(parent, name);
  assertFolderUnlocked(folder);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  try { fs.mkdirSync(folder); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") throw new Error("exists");
    throw new Error("io");
  }
  return [...segments, name].join("/");
}

/** 只回收配置根下面的真实子目录。目录整体交给系统，保留子目录和其他文件。
 * @param {import('@illusion-realm/shared').DeleteLocalModelFolderRequest} request
 * @returns {Promise<true>} */
async function deleteLocalModelFolder(request) {
  const roots = browseRoots();
  const entry = roots.find(item => item.root === request.root);
  if (!entry || !request.folder) throw new Error("invalid");
  const target = request.folder.split("/").reduce((parent, name) => childDirectory(parent, name), entry.folder);
  if (!fs.existsSync(target)) throw new Error("invalid");
  const real = fs.realpathSync(target).toLowerCase();
  // 独立配置可能互相嵌套。不能通过另一个根的子路径删除已配置的根。
  if (roots.some(({ folder }) => {
    if (!fs.existsSync(folder)) return false;
    const candidate = fs.realpathSync(folder).toLowerCase();
    return candidate === real || candidate.startsWith(real + path.sep);
  })) throw new Error("invalid");
  if ([target, real].some(folder => isModelFolderDownloading(folder, true))) throw new Error("busy");
  const release = reserveFolders([target]);
  try {
    await shell.trashItem(target);
    return true;
  } catch {
    throw new Error("io");
  } finally {
    release();
  }
}

module.exports = { listLocalModelFolders, createLocalModelFolder, deleteLocalModelFolder };
