/** 固定依赖按工作流分目录，根必须来自用户已保存的 models 配置。 */
const fs = require("node:fs"), path = require("node:path");
const { configuredPaths, childDirectory } = require("./model-download-paths");
const { setupAsset } = require("./setup-download-catalog");

/** 每一层都检查链接；只在明确开始任务时建目录，恢复校验不创建文件夹。
 * @param {string} id @param {boolean} [create] @param {string} [root] */
function setupFolder(id, create = false, root = configuredPaths().searchPath) {
  const asset = setupAsset(id);
  if (!asset) throw new Error("invalid");
  if (!root || !path.isAbsolute(root) || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("configuration");
  let folder = path.resolve(root);
  for (const segment of asset.relativePath.split("/").slice(0, -1)) {
    folder = childDirectory(folder, segment);
    if (create) fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
}

module.exports = { setupFolder };
