const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * 工作区根目录（dev）：从当前文件向上找到含 pnpm-workspace.yaml 的目录，
 * 无标记时按此模块的固定源码位置兜底，不依赖调用方传入目录的深度。
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
  // core 位于 apps/electron/src/main/core；用户数据的默认根不能随模块分类漂移。
  // 显式使用模块目录，避免测试或调用方传入任意 startDir 时得到另一棵数据树。
  // 打包态 getAppRootDir 使用 exe 目录，不会消费这个开发态兜底。
  return path.resolve(__dirname, "../../../../..");
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
