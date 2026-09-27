const fs = require("fs");
const {
  getDefaultUserDataPath,
  resolveUserDataPath,
  ensureUserDataDirectory,
} = require("./userDataPaths");

/**
 * 主进程只做 JSON 读写与路径解析，不掌握 schema 细节，因此产物类型用宽泛形状描述。
 * 默认值 / 合并 / 迁移全部由渲染进程负责（types/userData.ts + userDataDocument.ts）。
 *
 * @typedef {Record<string, unknown>} UserDataPayload
 * @typedef {{ filePath: string, data: UserDataPayload | null, isNew: boolean }} UserDataReadResult
 */

/**
 * 读取并解析 JSON 文件
 * @param {string} filePath
 * @returns {UserDataPayload | null} 不存在或解析失败返回 null
 */
function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 写入 JSON（自动建目录，带结尾换行）
 * @param {string} filePath
 * @param {UserDataPayload} data
 * @returns {void}
 */
function writeJsonFile(filePath, data) {
  ensureUserDataDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * 读取用户数据：优先用户配置的路径，回落到默认路径
 * @param {string | null} [customPath] 渲染进程传入的自定义路径
 * @returns {UserDataReadResult}
 */
function readUserData(customPath) {
  const defaultPath = getDefaultUserDataPath();
  const defaultExists = fs.existsSync(defaultPath);
  const defaultDoc = readJsonFile(defaultPath);
  const defaultSettings = /** @type {{ userDataPath?: unknown } | undefined} */ (
    defaultDoc?.settings
  );
  const seededPath =
    customPath ||
    (typeof defaultSettings?.userDataPath === "string" ? defaultSettings.userDataPath : "") ||
    (typeof defaultDoc?.userDataPath === "string" ? defaultDoc.userDataPath : "");
  const configuredPath = resolveUserDataPath(seededPath);

  if (configuredPath === defaultPath) {
    return {
      filePath: defaultPath,
      data: defaultDoc,
      isNew: !defaultExists,
    };
  }

  const customExists = fs.existsSync(configuredPath);
  const customDoc = readJsonFile(configuredPath);
  if (customDoc) {
    return {
      filePath: configuredPath,
      data: customDoc,
      isNew: !customExists,
    };
  }

  if (defaultDoc) {
    return {
      filePath: defaultPath,
      data: defaultDoc,
      isNew: false,
    };
  }

  // 自定义路径文件尚不存在：仅回传路径种子，由渲染侧合并出完整文档
  return {
    filePath: configuredPath,
    data: {
      userDataPath: configuredPath,
      settings: { userDataPath: configuredPath },
    },
    isNew: !customExists && !defaultExists,
  };
}

/**
 * 写入用户数据到其自身声明的路径
 * @param {UserDataPayload} data
 * @returns {{ filePath: string, data: UserDataPayload }}
 */
function writeUserData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("无效的用户数据");
  }

  const settings = /** @type {{ userDataPath?: unknown } | undefined} */ (data.settings);
  const seededPath =
    (typeof settings?.userDataPath === "string" ? settings.userDataPath : "") ||
    (typeof data.userDataPath === "string" ? data.userDataPath : "");
  const targetPath = resolveUserDataPath(seededPath);
  writeJsonFile(targetPath, data);
  return { filePath: targetPath, data };
}

module.exports = {
  readUserData,
  writeUserData,
  getDefaultUserDataPath,
};
