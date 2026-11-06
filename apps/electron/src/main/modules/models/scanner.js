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

// stat 类似查看文件的标签，只读取大小和时间，不把整本书搬进内存。
// 目录扫描已经在使用同步枚举；此处只补一次轻量文件属性读取。
// 不在比较函数内访问磁盘，否则排序会对同一文件重复读取很多次。
// 属性存到版本上，使同目录多文件保持各自准确的大小和修改日期。
// 扫描与 stat 之间文件可能被外部删除，这不是整个根目录扫描失败。
// 失败保留空属性，UI 明确按未知数据处理，不能把异常记成零字节。
// 不打印原始异常或本地路径，避免用户文件信息进入日志。
// 权限边界仍来自原扫描根，此函数不向渲染层开放任意文件读取。
// 大小使用文件字节数而不是目录占用，也不进行 MB 或 GB 的提前舍入。
// UI 若按格式化字符串排序，1 GB 可能错误排在 900 MB 之前。
// 修改时间保留毫秒精度，同一秒写入的多个版本仍可按其真实次序排列。
// 跨 IPC 只传普通数字，不传 fs.Stats 实例或依赖其原型的方法。
// 老扫描消费者只取原有字段，可选属性不会改变模型路径的识别方式。
// 旧用户文档没有这些数字时仍能恢复，手动扫描后再逐步得到属性。
// 如果 stat 遇到权限问题，不把错误文本传入渲染层或写到用户路径日志。
// catch 只覆盖该文件属性，后续同目录权重仍应继续出现在扫描结果中。
// stat 成功不等于权重合法或架构兼容，不能用它代替 ComfyUI 模型校验。
// 本次没有新增文件监视器，外部覆盖模型后仍需按原按钮重新扫描。
// 查阅属性不会触发 SHA-256，更不会以扫描为由调用外部模型网站。
// 流式哈希依然属于用户明确点击的资料补全事务，不迁移进此助手。
/** @param {string} filePath 已由扫描枚举得到的模型文件 */
function fileAttributes(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { bytes: stat.size, modifiedAt: stat.mtimeMs };
  } catch { return {}; }
}

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
        // 相同文件的属性随本轮扫描返回，不跟名称或目录分组做猜测。
        // 不修改版本 id，排序后加载和补全仍使用原来的完整文件路径。
        ...fileAttributes(fullPath),
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
