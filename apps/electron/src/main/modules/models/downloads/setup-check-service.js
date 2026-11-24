/** 根据已保存的 models 目录和内置编号检查模型。整个流程只读，不创建下载任务。 */
const path = require("node:path");
const { configuredPaths } = require("./model-download-paths");
const { setupAsset } = require("./setup-download-catalog");
const { setupFolder } = require("./setup-download-paths");
const { inspectSetupFile } = require("./setup-download-files");
const { validateSetupArgs } = require("./setup-download-service");
const verifying = new Set();

/** 核对请求只允许内置编号与操作类型，页面传不进路径或自选的 SHA256。 @param {unknown[]} args */
function validateSetupCheckArgs(args) {
  if (args.length !== 2 || (args[1] !== "inspect" && args[1] !== "verify")) return "invalid";
  return validateSetupArgs(args.slice(0, 1));
}

/** @param {string} id @param {string} root @param {boolean} verify
 * @returns {Promise<import('@illusion-realm/shared').SetupCheckItem>} */
async function checkAsset(id, root, verify) {
  try {
    const asset = setupAsset(id);
    if (!asset) throw new Error("invalid");
    const file = path.join(setupFolder(id, false, root), asset.fileName);
    return { id, status: await inspectSetupFile(file, asset.sha256, verify) };
  } catch {
    return { id, status: "unavailable" };
  }
}

/** 批量校验串行读盘。目录切换或窗口关闭后不继续查下一项。
 * @param {Electron.WebContents} owner @param {string[]} ids @param {'inspect' | 'verify'} mode */
async function checkSetupModels(owner, ids, mode) {
  const root = configuredPaths().searchPath;
  if (!root || !path.isAbsolute(root)) throw new Error("configuration");
  const verify = mode === "verify";
  if (verify && verifying.has(owner.id)) throw new Error("io");
  if (verify) verifying.add(owner.id);
  try {
    const items = [];
    for (const id of ids) {
      if (owner.isDestroyed() || configuredPaths().searchPath !== root) throw new Error("configuration");
      items.push(await checkAsset(id, root, verify));
    }
    if (configuredPaths().searchPath !== root) throw new Error("configuration");
    return { items };
  } finally {
    if (verify) verifying.delete(owner.id);
  }
}

module.exports = { checkSetupModels, validateSetupCheckArgs };
