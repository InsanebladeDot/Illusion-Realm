// 模型扫描按目录聚合版本；排序资料只取文件 stat，不读取模型张量。
// 结果仍由原扫描通道返回，可选字段不会改变创建页按版本加载的路径。
// 目录被外部改动时保留可识别文件，缺失 stat 的项目由界面放到排序末尾。
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
 * @property {number} [bytes] 当前版本的实际文件字节数
 * @property {number} [modifiedAt] 文件修改时间的毫秒时间戳
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

// stat 像查看书脊标签：只取大小和时间，不读模型内容，也不在排序中重复访问磁盘。
// 文件被移走或无权读取时保留未知属性，不把整批扫描清空或误记为零字节。
/** @param {string} filePath 已由扫描枚举得到的模型文件 */
async function fileAttributes(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return { bytes: stat.size, modifiedAt: stat.mtimeMs };
  } catch { return {}; }
}

/**
 * 在目录里找一个可作封面的图片（优先 logo.png，其次常见命名，最后任意图片）
 * @param {string} dirPath 目录绝对路径
 * @param {import("fs").Dirent[]} [knownEntries] 扫描刚取得的目录条目，避免再次枚举
 * @returns {string | null} 封面图绝对路径；找不到返回 null
 */
function findIconInDir(dirPath, knownEntries) {
  /** @type {import("fs").Dirent[]} */
  let entries;
  try {
    entries = knownEntries ?? fs.readdirSync(dirPath, { withFileTypes: true });
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

// 按目录顺序异步扫描，不并发打开大量句柄；同一次枚举也供封面选择使用。
// 子目录读失败只跳过这一支，符号链接不跟随，刷新时重新读取而不沿用旧缓存。
/** @param {string} currentDir @param {ScannedModel['type']} type @param {ScannedModel[]} results */
async function scanDirectory(currentDir, type, results) {
  let entries;
  try { entries = await fs.promises.readdir(currentDir, { withFileTypes: true }); }
  catch { return; }
  const versions = /** @type {ScannedModelVersion[]} */ ([]);
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) { await scanDirectory(fullPath, type, results); continue; }
    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !MODEL_EXTENSIONS.includes(ext)) continue;
    versions.push({ id: fullPath, name: path.basename(entry.name, ext), filePath: fullPath, ...await fileAttributes(fullPath) });
  }
  if (!versions.length) return;
  versions.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  results.push({ id: currentDir, name: path.basename(currentDir), filePath: currentDir, iconPath: findIconInDir(currentDir, entries), type, versions });
}

// 只合并正在进行的相同根和类型扫描，完成或失败后移除，下一次刷新重新读盘。
/** @type {Map<string, Promise<ScannedModel[]>>} */
const scans = new Map();

/** @param {string} rootDir @param {ScannedModel['type']} type @returns {Promise<ScannedModel[]>} */
async function scanModelsInDirectory(rootDir, type) {
  // 去重键保留大小写，返回的共享快照勿原地排序；展示层需要重排时先复制。
  const key = JSON.stringify([path.resolve(rootDir), type]);
  const pending = scans.get(key);
  if (pending) return pending;
  const results = /** @type {ScannedModel[]} */ ([]);
  const task = scanDirectory(rootDir, type, results).then(() => results.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
  scans.set(key, task);
  try { return await task; }
  finally { scans.delete(key); }
}

module.exports = {
  scanModelsInDirectory,
  findIconInDir,
};
