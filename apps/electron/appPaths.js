const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * 工作区根目录（dev）：从当前文件向上找到含 pnpm-workspace.yaml 的目录，
 * 兜底为 apps/electron 的父级再上一级（monorepo 结构：<root>/apps/electron/src?/file.js）。
 *
 * 迁移到 monorepo 前，工作区根就是项目根；保持同一返回值可以让
 * 默认输出目录（「<root> Output」）与 user/illusion-realm.json 停留在原位置，
 * 不会因为目录层级变化而让老用户的既有数据"消失"。
 *
 * @param {string} startDir 起始目录（通常是 __dirname）
 * @returns {string} 工作区根的绝对路径
 */
function findWorkspaceRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：apps/electron/<file> → 工作区根
  return path.resolve(startDir, "..", "..");
}

/** 非打包（开发）模式下的应用根目录，等价于迁移前 app.getAppPath() 的值 */
const DEV_APP_ROOT = findWorkspaceRoot(__dirname);

/**
 * 应用根目录：打包后为 exe 所在目录，开发时为工作区根
 * @returns {string}
 */
function getAppRootDir() {
  if (!app.isPackaged) {
    return DEV_APP_ROOT;
  }
  return path.dirname(app.getPath("exe"));
}

module.exports = { getAppRootDir, findWorkspaceRoot, DEV_APP_ROOT };
