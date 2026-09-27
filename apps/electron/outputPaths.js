const fs = require("fs");
const path = require("path");
const { getAppRootDir } = require("./appPaths");

const OUTPUT_SUFFIX = " Output";

/**
 * 默认输出目录：与软件安装目录同级的「{软件目录名} Output」文件夹
 * @returns {string}
 */
function getDefaultOutputPath() {
  const appRoot = getAppRootDir();
  const parentDir = path.dirname(appRoot);
  const folderName = `${path.basename(appRoot)}${OUTPUT_SUFFIX}`;
  return path.join(parentDir, folderName);
}

/**
 * 解析输出目录：用户未指定时回落到默认路径
 * @param {string | null | undefined} customPath 用户在设置里填写的输出路径
 * @returns {string}
 */
function resolveOutputPath(customPath) {
  const trimmed = typeof customPath === "string" ? customPath.trim() : "";
  return trimmed || getDefaultOutputPath();
}

/**
 * 确保目录存在（递归创建）
 * @param {string} dirPath 目标目录
 * @returns {string} 原样返回 dirPath，便于链式使用
 */
function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * 避免覆盖已存在的导出文件：`a.mp4` → `a (2).mp4` → `a (3).mp4` …
 * （导出改为「选择文件夹 + 自动命名」后，同名文件会自动让位而不是静默覆盖）
 *
 * @param {string} filePath 期望的输出文件路径
 * @returns {string} 可安全写入的路径（无冲突时即为入参）
 */
function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(dir, `${base} (${index})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  return path.join(dir, `${base} (${Date.now()})${ext}`);
}

module.exports = {
  getDefaultOutputPath,
  resolveOutputPath,
  ensureDirectory,
  ensureUniqueFilePath,
};
