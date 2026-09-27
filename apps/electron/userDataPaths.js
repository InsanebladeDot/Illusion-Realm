const fs = require("fs");
const path = require("path");
const { getAppRootDir } = require("./appPaths");

const USER_DIR_NAME = "user";
const DEFAULT_USER_DATA_FILE = "illusion-realm.json";

/**
 * 默认用户数据文件路径：与软件目录同级的 user/illusion-realm.json
 * @returns {string}
 */
function getDefaultUserDataPath() {
  const parentDir = path.dirname(getAppRootDir());
  return path.join(parentDir, USER_DIR_NAME, DEFAULT_USER_DATA_FILE);
}

/**
 * 解析用户数据文件路径：传入目录则追加默认文件名，传入 .json 则原样使用
 * @param {string | null | undefined} customPath 用户配置的路径
 * @returns {string} 用户数据文件的绝对路径
 */
function resolveUserDataPath(customPath) {
  const trimmed = typeof customPath === "string" ? customPath.trim() : "";
  if (!trimmed) {
    return getDefaultUserDataPath();
  }

  const normalized = path.resolve(trimmed);
  if (path.extname(normalized).toLowerCase() === ".json") {
    return normalized;
  }

  return path.join(normalized, DEFAULT_USER_DATA_FILE);
}

/**
 * 确保目标文件的父目录存在
 * @param {string} filePath 目标文件路径
 * @returns {string} 原样返回 filePath，便于链式使用
 */
function ensureUserDataDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

module.exports = {
  getDefaultUserDataPath,
  resolveUserDataPath,
  ensureUserDataDirectory,
  DEFAULT_USER_DATA_FILE,
};
