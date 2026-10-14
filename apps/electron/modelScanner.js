const fs = require("fs");
const path = require("path");

/**
 * 扫描结果类型。刻意用本地 typedef 描述（而非 import shared 类型）：
 * 主进程是手写 CommonJS，运行期解析不到 packages/shared，本地定义可读性更好，
 * 且这里返回的是**扫描原始结果**，字段与 shared 的 LocalModel 并不完全一致。
 *
 * @typedef {object} ScannedModelVersion
 * @property {string} id 模型文件绝对路径
 * @property {string} name 不含扩展名的文件名
 * @property {string} filePath 模型文件绝对路径
 *
 * @typedef {object} ScannedModel
 * @property {string} id 版本目录绝对路径
 * @property {string} name 版本目录名
 * @property {string} filePath 版本目录绝对路径
 * @property {string | null} iconPath 目录内找到的封面图，无则为 null
 * @property {"checkpoint" | "lora" | "embedding"} type 模型类型
 * @property {ScannedModelVersion[]} versions
 */

/** @type {string[]} */
const MODEL_EXTENSIONS = [
  ".safetensors",
  ".ckpt",
  ".pt",
  ".pth",
  // diffusion_models 分类额外支持的扩展名
  ".gguf",
];
const ICON_NAMES = [
  "logo.png",
  "logo.jpg",
  "logo.webp",
  "preview.png",
  "preview.jpg",
  "preview.webp",
  "thumbnail.png",
  "cover.png",
  "icon.png",
];
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp)$/i;

/**
 * 在目录里找一个可作封面的图片（优先 logo.png，其次常见命名，最后任意图片）
 * @param {string} dirPath 目录绝对路径
 * @returns {string | null} 封面图绝对路径；找不到返回 null
 */
function findIconInDir(dirPath) {
  /** @type {import("fs").Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const fileNames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const logoPng = fileNames.find((name) => name.toLowerCase() === "logo.png");
  if (logoPng) return path.join(dirPath, logoPng);

  for (const preferredName of ICON_NAMES) {
    const match = fileNames.find(
      (name) => name.toLowerCase() === preferredName.toLowerCase()
    );
    if (match) return path.join(dirPath, match);
  }

  const fallbackImage = fileNames.find((name) => IMAGE_PATTERN.test(name));
  return fallbackImage ? path.join(dirPath, fallbackImage) : null;
}

/**
 * 递归扫描目录下的模型文件，按「所在目录（= 版本）」聚合
 * @param {string} rootDir 扫描根目录
 * @param {"checkpoint" | "lora" | "embedding"} type 模型类型
 * @returns {ScannedModel[]} 按名称排序的模型列表
 */
function scanModelsInDirectory(rootDir, type) {
  /** @type {Map<string, ScannedModelVersion[]>} */
  const folderMap = new Map();

  /**
   * @param {string} currentDir
   * @returns {void}
   */
  function walk(currentDir) {
    /** @type {import("fs").Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!MODEL_EXTENSIONS.includes(ext)) continue;

      const dirPath = currentDir;
      if (!folderMap.has(dirPath)) {
        folderMap.set(dirPath, []);
      }

      folderMap.get(dirPath)?.push({
        id: fullPath,
        name: path.basename(entry.name, ext),
        filePath: fullPath,
      });
    }
  }

  walk(rootDir);

  /** @type {ScannedModel[]} */
  const results = [];
  for (const [dirPath, versions] of folderMap) {
    if (versions.length === 0) continue;

    versions.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    results.push({
      id: dirPath,
      name: path.basename(dirPath),
      filePath: dirPath,
      iconPath: findIconInDir(dirPath),
      type,
      versions,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

module.exports = {
  scanModelsInDirectory,
  findIconInDir,
};
